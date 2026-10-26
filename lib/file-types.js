// Shared file classification for the upload queue.
//
// The queue accepts two very different families of files:
//   1. Raster images (JPG/PNG/WEBP/...) that the browser can decode directly.
//   2. Vector / document sources (Adobe Illustrator .ai, EPS, PDF, SVG) that
//      must first be rendered into a raster preview before a vision model can
//      look at them.
// Browsers report inconsistent (or no) MIME types for these files, especially
// on drag-and-drop, so the extension is the primary signal.

export const RASTER_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "avif",
  "heic",
  "heif",
];

// Illustrator, its template variant (.ait), EPS/PostScript and PDF all share
// the same "render the first page, then analyze it" pipeline.
export const VECTOR_EXTENSIONS = ["ai", "ait", "pdf", "eps", "epsf", "ps", "svg", "svgz"];

const VECTOR_MIME_TYPES = new Set([
  "application/illustrator",
  "application/postscript",
  "application/eps",
  "application/x-eps",
  "image/eps",
  "image/x-eps",
  "application/pdf",
  "image/svg+xml",
  "application/x-illustrator",
]);

const VECTOR_LABELS = {
  ai: "Adobe Illustrator",
  ait: "Adobe Illustrator template",
  pdf: "PDF",
  eps: "EPS",
  epsf: "EPS",
  ps: "PostScript",
  svg: "SVG",
  svgz: "SVG",
};

// Short badge text for the queue thumbnails.
const VECTOR_BADGES = {
  ai: "AI",
  ait: "AI",
  pdf: "PDF",
  eps: "EPS",
  epsf: "EPS",
  ps: "PS",
  svg: "SVG",
  svgz: "SVG",
};

export function fileExtension(name) {
  const parts = String(name || "").split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

/** Returns the normalised vector extension (e.g. "ai") or null for rasters. */
export function vectorFormatFor(file) {
  const ext = fileExtension(file?.name);
  if (VECTOR_EXTENSIONS.includes(ext)) return ext;
  const type = String(file?.type || "").toLowerCase();
  if (VECTOR_MIME_TYPES.has(type)) {
    // Map MIME-only reports onto the extension we can handle.
    if (type === "application/illustrator" || type === "application/x-illustrator") return "ai";
    if (type === "application/pdf") return "pdf";
    if (type === "image/svg+xml") return "svg";
    return "eps";
  }
  return null;
}

export function isVectorSourceFile(file) {
  return Boolean(vectorFormatFor(file));
}

export function vectorFormatLabel(format) {
  return VECTOR_LABELS[String(format || "").toLowerCase()] || "Vector";
}

export function vectorFormatBadge(format) {
  return VECTOR_BADGES[String(format || "").toLowerCase()] || "VEC";
}

/**
 * A file is accepted when it is a vector/document source we can render, or a
 * raster image the browser can decode. Files with no MIME type (common with
 * drag-and-drop and some cloud drives) are matched on extension instead.
 */
export function isSupportedSourceFile(file) {
  if (isVectorSourceFile(file)) return true;
  const type = String(file?.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  return !type && RASTER_EXTENSIONS.includes(fileExtension(file?.name));
}

/** Human readable hint used in the "skipped files" notice. */
export const ACCEPTED_FORMATS_HINT = "JPG, PNG, WEBP, Adobe Illustrator (.ai), PDF or SVG";
