// Turns vector / document sources (Adobe Illustrator .ai, .eps, .pdf, .svg) into
// a raster preview the vision model can actually look at.
//
// A modern .ai file is a PDF container with Illustrator's private (PGF) data
// inside, so the embedded PDF rendition is the best preview available and is
// rendered with pdf.js. When that PDF is missing (Illustrator 8 and earlier, or
// "Create PDF Compatible File" turned off) the file still usually carries one of
// three built-in thumbnails, which are decoded here as fallbacks:
//   * an XMP `xmpGImg:image` JPEG (Illustrator CS+)
//   * a `%AI<n>_Thumbnail:` palette/RLE bitmap (Illustrator 7-10, EPS)
//   * a TIFF preview inside the DOS EPS binary header (.eps)
// Everything runs locally in the browser: the source file never leaves the tab.

import { vectorFormatFor, vectorFormatLabel } from "./file-types";

const PDF_WORKER_PATH = "/pdfjs/pdf.worker.min.mjs";
const STANDARD_FONTS_PATH = "/pdfjs/standard_fonts/";
const CMAP_PATH = "/pdfjs/cmaps/";

export const DEFAULT_PREVIEW_MAX_DIM = 1400;

// Illustrator files with embedded rasters get huge; reading one into memory is
// only safe up to a point.
const MAX_SOURCE_BYTES = 200 * 1024 * 1024;
const RENDER_TIMEOUT_MS = 45000;
// How much of the file is decoded as text when hunting for embedded thumbnails.
const TEXT_HEAD_BYTES = 4 * 1024 * 1024;
const TEXT_TAIL_BYTES = 2 * 1024 * 1024;
// Vector artwork is rendered on white because stock previews (and JPEG, which a
// vision model receives) have no alpha channel.
const BACKGROUND = "#ffffff";

/* ------------------------------------------------------------------------- */
/* pdf.js loading                                                            */
/* ------------------------------------------------------------------------- */

let pdfjsPromise = null;

/** Is the worker asset that scripts/sync-pdfjs-assets.mjs copies into /public? */
async function isWorkerAssetAvailable() {
  try {
    const res = await fetch(PDF_WORKER_PATH, { method: "HEAD", cache: "force-cache" });
    return res.ok;
  } catch {
    return false;
  }
}

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      // pdf.js latches onto the first worker setup it attempts, so decide where
      // the parser will run *before* the module is used rather than retrying.
      const workerAvailable = await isWorkerAssetAvailable();
      if (!workerAvailable) {
        // Slower, but keeps .ai uploads working when the static worker is not
        // deployed: pdf.js then parses on the main thread from this bundle.
        const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
        globalThis.pdfjsWorker = workerModule;
      }
      const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
      mod.GlobalWorkerOptions.workerSrc = workerAvailable ? PDF_WORKER_PATH : "";
      return mod;
    })().catch((err) => {
      pdfjsPromise = null;
      throw new Error(`The PDF renderer could not be loaded (${err?.message || err}).`);
    });
  }
  return pdfjsPromise;
}

/* ------------------------------------------------------------------------- */
/* Small helpers                                                             */
/* ------------------------------------------------------------------------- */

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not create a canvas to render the preview.");
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function canvasToJpeg(canvas, quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The browser could not encode the preview image."))),
      "image/jpeg",
      quality
    );
  });
}

function latin1(bytes) {
  // Chunked because String.fromCharCode(...hugeArray) blows the call stack.
  const CHUNK = 0x8000;
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return out;
}

function looksLikePdf(bytes) {
  const head = latin1(bytes.subarray(0, Math.min(bytes.length, 1024)));
  return head.includes("%PDF");
}

/** Header + trailer text, where Illustrator keeps its metadata and thumbnails. */
function sampleText(bytes) {
  const head = latin1(bytes.subarray(0, Math.min(bytes.length, TEXT_HEAD_BYTES)));
  if (bytes.length <= TEXT_HEAD_BYTES) return head;
  const tailStart = Math.max(TEXT_HEAD_BYTES, bytes.length - TEXT_TAIL_BYTES);
  return `${head}\n${latin1(bytes.subarray(tailStart))}`;
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Fit a decoded thumbnail into a canvas at an honest, modest scale. */
function drawSourceToCanvas(source, width, height, maxDim) {
  const fit = Math.min(maxDim / width, maxDim / height);
  // Never upscale a 128px thumbnail into a fake 1400px "preview" — a little
  // enlargement helps the model, a lot of it just adds mush.
  const scale = Math.max(0.05, Math.min(fit, 2.5));
  const { canvas, ctx } = createCanvas(width * scale, height * scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/* ------------------------------------------------------------------------- */
/* PDF rendition                                                             */
/* ------------------------------------------------------------------------- */

async function renderPdfFirstPage(bytes, maxDim) {
  const pdfjs = await loadPdfjs();

  const doc = await pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    standardFontDataUrl: STANDARD_FONTS_PATH,
    cMapUrl: CMAP_PATH,
    cMapPacked: true,
    useSystemFonts: true,
  }).promise;

  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.max(0.02, Math.min(maxDim / base.width, maxDim / base.height, 8));
    const viewport = page.getViewport({ scale });
    const { canvas, ctx } = createCanvas(viewport.width, viewport.height);
    await page.render({ canvasContext: ctx, viewport, background: BACKGROUND }).promise;

    let meta = {};
    try {
      const { info } = await doc.getMetadata();
      meta = {
        producer: info?.Producer || null,
        creator: info?.Creator || null,
        title: info?.Title || null,
      };
    } catch {
      // Metadata is a nice-to-have; never fail a render over it.
    }

    return {
      blob: await canvasToJpeg(canvas),
      width: canvas.width,
      height: canvas.height,
      pages: doc.numPages,
      meta,
    };
  } finally {
    try {
      await doc.destroy();
    } catch {
      // ignore
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Embedded thumbnail: %AI<n>_Thumbnail (Illustrator 7-10 / EPS)              */
/* ------------------------------------------------------------------------- */

function decodeRle(input, expectedLength) {
  const out = new Uint8Array(expectedLength);
  let read = 0;
  let write = 0;
  while (read < input.length && write < expectedLength) {
    const value = input[read++];
    if (value !== 0xfd) {
      out[write++] = value;
      continue;
    }
    if (read >= input.length) break;
    const count = input[read++];
    if (count === 0xfd) {
      out[write++] = 0xfd;
      continue;
    }
    if (read >= input.length) break;
    const fill = input[read++];
    const run = Math.min(count, expectedLength - write);
    out.fill(fill, write, write + run);
    write += run;
  }
  return out;
}

function decodeAiThumbnail(text) {
  const header = /%AI\d+_Thumbnail:\s*(\d+)\s+(\d+)\s+(\d+)/.exec(text);
  if (!header) return null;

  const width = Number(header[1]);
  const height = Number(header[2]);
  const bpp = Number(header[3]);
  if (!width || !height || (bpp !== 8 && bpp !== 24)) return null;
  if (width * height > 40_000_000) return null;

  const afterHeader = text.slice(header.index + header[0].length);
  // The marker line may read "%%BeginData: <n> Hex Bytes"; drop the whole line
  // so stray letters ("Bytes" contains hex digits b and e) never leak into the
  // payload.
  const begin = /%%BeginData:[^\r\n]*/.exec(afterHeader);
  if (!begin) return null;

  let body = afterHeader.slice(begin.index + begin[0].length);
  const endIndex = body.indexOf("%%EndData");
  if (endIndex !== -1) body = body.slice(0, endIndex);

  // Every data line is prefixed with '%' so PostScript treats it as a comment.
  const hex = body
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*%/, "").trim())
    .join("")
    .replace(/[^0-9a-fA-F]/g, "");

  const raw = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < raw.length; i += 1) raw[i] = parseInt(hex.substr(i * 2, 2), 16);

  const palette = bpp === 8 ? raw.subarray(0, 768) : null;
  const payload = bpp === 8 ? raw.subarray(768) : raw;
  if (!payload.length) return null;

  const expected = bpp === 8 ? width * height : width * height * 3;
  const isRle = payload[0] === 0x52 && payload[1] === 0x4c && payload[2] === 0x45;
  const pixels = isRle ? decodeRle(payload.subarray(3), expected) : payload.subarray(0, expected);

  const image = new ImageData(width, height);
  const data = image.data;
  for (let i = 0; i < width * height; i += 1) {
    if (bpp === 8) {
      const index = pixels[i] || 0;
      data[i * 4] = palette[index * 3];
      data[i * 4 + 1] = palette[index * 3 + 1];
      data[i * 4 + 2] = palette[index * 3 + 2];
    } else {
      data[i * 4] = pixels[i * 3] || 0;
      data[i * 4 + 1] = pixels[i * 3 + 1] || 0;
      data[i * 4 + 2] = pixels[i * 3 + 2] || 0;
    }
    data[i * 4 + 3] = 255;
  }
  return { width, height, image };
}

/* ------------------------------------------------------------------------- */
/* Embedded thumbnail: XMP JPEG (Illustrator CS and later)                   */
/* ------------------------------------------------------------------------- */

function decodeXmpThumbnail(text) {
  const marker = text.indexOf("xmpGImg:image");
  if (marker === -1) return null;

  let rest = text.slice(marker + "xmpGImg:image".length, marker + "xmpGImg:image".length + 6_000_000);
  rest = rest.replace(/^\s*(?:="|>|=|:)/, "");
  // Base64 never contains '"' or '<', which are the only terminators in XMP.
  const end = rest.search(/["<]/);
  if (end === -1) return null;

  const base64 = rest.slice(0, end).replace(/\s+/g, "");
  if (base64.length < 200) return null;

  let bytes;
  try {
    bytes = base64ToBytes(base64);
  } catch {
    return null;
  }
  // Verify the payload really is a JPEG before handing it to the decoder.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  return new Blob([bytes], { type: "image/jpeg" });
}

/* ------------------------------------------------------------------------- */
/* Embedded thumbnail: TIFF inside the DOS EPS binary header (.eps)          */
/* ------------------------------------------------------------------------- */

function extractEpsTiff(bytes) {
  if (bytes.length < 32) return null;
  const isDosEps =
    bytes[0] === 0xc5 && bytes[1] === 0xd0 && bytes[2] === 0xd3 && bytes[3] === 0xc6;
  if (!isDosEps) return null;

  for (const littleEndian of [true, false]) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const offset = view.getUint32(20, littleEndian);
    const length = view.getUint32(24, littleEndian);
    if (!offset || !length || offset + length > bytes.length) continue;
    const tiff = bytes.subarray(offset, offset + length);
    if (tiff[0] === 0x49 || tiff[0] === 0x4d) return tiff;
  }
  return null;
}

/**
 * Minimal TIFF reader for the uncompressed / PackBits RGB and palette previews
 * that Illustrator and EPS writers embed. Anything more exotic throws and the
 * caller falls back to another thumbnail source.
 */
function decodeTiffPreview(tiff) {
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const order = String.fromCharCode(tiff[0], tiff[1]);
  const little = order === "II";
  if (!little && order !== "MM") throw new Error("Unsupported TIFF byte order.");
  if (view.getUint16(2, little) !== 42) throw new Error("Unsupported TIFF header.");

  let ifdOffset = view.getUint32(4, little);
  if (!ifdOffset || ifdOffset + 2 > tiff.length) throw new Error("Empty TIFF directory.");

  const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 };
  const entryCount = view.getUint16(ifdOffset, little);
  const tags = new Map();

  for (let i = 0; i < entryCount; i += 1) {
    const entry = ifdOffset + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const count = view.getUint32(entry + 4, little);
    const size = (typeSize[type] || 0) * count;
    if (!size) continue;

    const readValue = (index) => {
      const base = size <= 4 ? entry + 8 : view.getUint32(entry + 8, little);
      const at = base + index * (typeSize[type] || 1);
      if (at < 0 || at + 2 > tiff.length) return 0;
      if (type === 3) return view.getUint16(at, little);
      if (type === 4) return view.getUint32(at, little);
      if (type === 1) return tiff[at];
      return 0;
    };

    const values = new Array(Math.min(count, 8192));
    for (let v = 0; v < values.length; v += 1) values[v] = readValue(v);
    tags.set(tag, values);
  }

  const first = (tag, fallback = 0) => (tags.get(tag)?.[0] ?? fallback);
  const width = first(256);
  const height = first(257);
  const compression = first(259, 1);
  const photometric = first(262, 2);
  const samplesPerPixel = first(277, 1);
  const rowsPerStrip = first(278, height);
  const planar = first(284, 1);
  const bits = tags.get(258) || [8];

  if (!width || !height) throw new Error("TIFF preview has no dimensions.");
  if (width * height > 40_000_000) throw new Error("TIFF preview is too large.");
  if (planar !== 1) throw new Error("Planar TIFF previews are not supported.");
  if (bits.some((bit) => bit !== 8)) throw new Error("Only 8-bit TIFF previews are supported.");
  if (compression !== 1 && compression !== 32773) throw new Error("Compressed TIFF preview is not supported.");
  if (photometric !== 1 && photometric !== 2 && photometric !== 3) {
    throw new Error("Unsupported TIFF colour model.");
  }

  const stripOffsets = tags.get(273) || [];
  const stripCounts = tags.get(279) || [];
  if (!stripOffsets.length) throw new Error("TIFF preview has no strips.");

  const bytesPerRow = width * samplesPerPixel;
  const raw = new Uint8Array(bytesPerRow * height);

  let target = 0;
  for (let s = 0; s < stripOffsets.length; s += 1) {
    const start = stripOffsets[s];
    const byteCount = stripCounts[s] ?? bytesPerRow * rowsPerStrip;
    const end = Math.min(start + byteCount, tiff.length);
    if (start < 0 || start >= end) continue;
    const strip = tiff.subarray(start, end);

    if (compression === 1) {
      raw.set(strip.subarray(0, Math.min(strip.length, raw.length - target)), target);
      target += Math.min(strip.length, raw.length - target);
    } else {
      // PackBits
      let read = 0;
      while (read < strip.length && target < raw.length) {
        const header = strip[read++];
        if (header < 128) {
          const count = header + 1;
          for (let i = 0; i < count && read < strip.length && target < raw.length; i += 1) {
            raw[target++] = strip[read++];
          }
        } else if (header > 128) {
          const count = 257 - header;
          const value = strip[read++] ?? 0;
          for (let i = 0; i < count && target < raw.length; i += 1) raw[target++] = value;
        }
      }
    }
    if (target >= raw.length) break;
  }

  const colorMap = tags.get(320) || [];
  const image = new ImageData(width, height);
  const data = image.data;
  for (let i = 0; i < width * height; i += 1) {
    const source = i * samplesPerPixel;
    let r;
    let g;
    let b;
    if (photometric === 2 && samplesPerPixel >= 3) {
      r = raw[source];
      g = raw[source + 1];
      b = raw[source + 2];
    } else if (photometric === 3 && colorMap.length >= 768) {
      const index = raw[source];
      r = colorMap[index] >> 8;
      g = colorMap[index + 256] >> 8;
      b = colorMap[index + 512] >> 8;
    } else {
      r = raw[source];
      g = raw[source];
      b = raw[source];
    }
    data[i * 4] = r || 0;
    data[i * 4 + 1] = g || 0;
    data[i * 4 + 2] = b || 0;
    data[i * 4 + 3] = 255;
  }
  return { width, height, image };
}

/* ------------------------------------------------------------------------- */
/* SVG                                                                       */
/* ------------------------------------------------------------------------- */

async function readSvgText(file) {
  if (vectorFormatFor(file) !== "svgz" && !file.name.toLowerCase().endsWith(".svgz")) {
    return file.text();
  }
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot unpack .svgz files. Re-save as plain .svg and try again.");
  }
  const stream = file.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function renderSvgPreview(file, maxDim) {
  const text = await readSvgText(file);
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (!doc || doc.querySelector("parsererror") || doc.documentElement?.nodeName !== "svg") {
    throw new Error(`${file.name} is not a valid SVG document.`);
  }

  const svg = doc.documentElement;
  const viewBox = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  let width = parseFloat(svg.getAttribute("width"));
  let height = parseFloat(svg.getAttribute("height"));

  if (!(width > 0) || !(height > 0)) {
    if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
      width = viewBox[2];
      height = viewBox[3];
    } else {
      width = 1200;
      height = 1200;
    }
  }

  // Browsers refuse to rasterise an SVG without intrinsic dimensions.
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  const serialized = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml" }));

  try {
    const image = await withTimeout(
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`${file.name} could not be drawn — it may reference external files.`));
        img.src = url;
      }),
      RENDER_TIMEOUT_MS,
      `${file.name} took too long to draw.`
    );

    const canvas = drawSourceToCanvas(
      image,
      image.naturalWidth || width,
      image.naturalHeight || height,
      maxDim
    );
    return {
      blob: await canvasToJpeg(canvas),
      width: canvas.width,
      height: canvas.height,
      pages: 1,
      format: vectorFormatFor(file) || "svg",
      method: "svg",
      notes: [],
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ------------------------------------------------------------------------- */
/* Public API                                                                */
/* ------------------------------------------------------------------------- */

function extractionErrorMessage(file) {
  return `No preview could be read from ${file.name}. Illustrator stores artwork as vector data, so this app reads the embedded PDF or built-in thumbnail. Re-save the file in Illustrator with “Create PDF Compatible File” turned on, or add a JPG/PNG export of the artboard instead.`;
}

/**
 * Renders the first page of a vector/document source into a JPEG preview.
 * Resolves with { blob, width, height, format, method, pages, notes, meta }.
 */
export async function renderVectorPreview(file, options = {}) {
  const maxDim = options.maxDim || DEFAULT_PREVIEW_MAX_DIM;
  const format = vectorFormatFor(file);
  const label = vectorFormatLabel(format);

  if (!file) throw new Error("No file was provided.");
  if (format === "svg" || format === "svgz") return renderSvgPreview(file, maxDim);
  if (file.size === 0) throw new Error(`${file.name} is empty.`);
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(
      `${file.name} is ${Math.round(file.size / (1024 * 1024))} MB — too large to preview in the browser. Upload a copy under 200 MB or add a JPG preview instead.`
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const notes = [];

  // Best case: the embedded PDF rendition renders the real artwork at any size.
  if (looksLikePdf(bytes)) {
    try {
      const rendered = await withTimeout(
        renderPdfFirstPage(bytes.slice(), maxDim),
        RENDER_TIMEOUT_MS,
        `Reading the embedded PDF in ${file.name} took too long. The file may be unusually complex — try a JPG preview instead.`
      );
      if (rendered.pages > 1) {
        notes.push(
          `This ${label} file contains ${rendered.pages} artboards/pages; the preview and metadata describe the first one.`
        );
      }
      return {
        blob: rendered.blob,
        width: rendered.width,
        height: rendered.height,
        format,
        method: "pdf",
        pages: rendered.pages,
        meta: rendered.meta,
        notes,
      };
    } catch (err) {
      if (format === "pdf") {
        throw new Error(
          `The PDF could not be rendered (${String(err?.message || err)}). If it is password protected, remove the password or add a JPG preview instead.`
        );
      }
      notes.push(
        `The embedded PDF preview could not be rendered (${String(err?.message || err)}), so the file's built-in thumbnail was used.`
      );
    }
  }

  const text = sampleText(bytes);

  const candidates = [];
  const xmpBlob = decodeXmpThumbnail(text);
  if (xmpBlob) candidates.push({ source: "xmp", blob: xmpBlob });
  const aiThumb = decodeAiThumbnail(text);
  if (aiThumb) candidates.push({ source: "ai-thumbnail", image: aiThumb });
  const tiff = extractEpsTiff(bytes);
  if (tiff) {
    try {
      candidates.push({ source: "eps-tiff", image: decodeTiffPreview(tiff) });
    } catch {
      // A broken TIFF preview must not hide the other candidates.
    }
  }

  for (const candidate of candidates) {
    try {
      let drawable;
      let width;
      let height;
      if (candidate.blob) {
        drawable = await createImageBitmap(candidate.blob);
        width = drawable.width;
        height = drawable.height;
      } else {
        const { image } = candidate.image;
        const temp = document.createElement("canvas");
        temp.width = image.width;
        temp.height = image.height;
        const tempCtx = temp.getContext("2d");
        if (!tempCtx) continue;
        tempCtx.putImageData(image, 0, 0);
        drawable = temp;
        width = image.width;
        height = image.height;
      }
      if (!width || !height) continue;

      const canvas = drawSourceToCanvas(drawable, width, height, maxDim);
      notes.push(
        `Illustrator keeps only a small built-in preview in this file, so the ${width}×${height}px thumbnail was enlarged for analysis. Re-save with “Create PDF Compatible File” for a full-resolution preview.`
      );
      return {
        blob: await canvasToJpeg(canvas),
        width: canvas.width,
        height: canvas.height,
        format,
        method: candidate.source,
        pages: null,
        meta: { producer: null, creator: null, title: null },
        notes,
      };
    } catch {
      // try the next candidate
    }
  }

  throw new Error(extractionErrorMessage(file));
}

/** Human readable description of how a preview was produced. */
export function describePreviewMethod(method) {
  switch (method) {
    case "pdf":
      return "rendered from the embedded PDF";
    case "xmp":
      return "built-in XMP thumbnail";
    case "ai-thumbnail":
      return "built-in Illustrator thumbnail";
    case "eps-tiff":
      return "EPS TIFF preview";
    case "svg":
      return "rendered from SVG";
    default:
      return "rendered preview";
  }
}
