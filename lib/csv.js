import { enforceTitleRules, MAGNIFIC_MAX_TITLE } from "./enforce-rules";

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

// Adobe Stock: Filename, Title, Keywords, Category, Releases
export function buildAdobeStockCsv(items) {
  const header = ["Filename", "Title", "Keywords", "Category", "Releases"];
  const rows = [header];
  for (const it of items) {
    const meta = it.result.platforms.adobe_stock;
    const title = meta.title.replace(/,/g, "").slice(0, 200);
    rows.push([it.filename, title, meta.keywords.slice(0, 49).join(", "), "", ""]);
  }
  return toCsv(rows);
}

// Shutterstock: Filename, Description, Keywords, Categories, Illustration, Mature content, Editorial
export function buildShutterstockCsv(items) {
  const header = [
    "Filename",
    "Description",
    "Keywords",
    "Categories",
    "Illustration",
    "Mature content",
    "Editorial",
  ];
  const rows = [header];
  for (const it of items) {
    const meta = it.result.platforms.shutterstock;
    rows.push([
      it.filename,
      meta.title,
      meta.keywords.slice(0, 50).join(", "),
      "",
      "No",
      "No",
      "No",
    ]);
  }
  return toCsv(rows);
}

// iStock / Getty Images: Filename, Title, Description, Keywords, Country
export function buildIstockGettyCsv(items) {
  const header = ["Filename", "Title", "Description", "Keywords", "Country"];
  const rows = [header];
  for (const it of items) {
    const meta = it.result.platforms.istock_getty;
    rows.push([
      it.filename,
      meta.title,
      it.result.description || meta.title,
      meta.keywords.slice(0, 30).join(", "),
      "",
    ]);
  }
  return toCsv(rows);
}

// Magnific CSV specification (Magnific is Freepik's new brand name — same
// company, same bulk-upload and title-limit spec):
// - Semicolon (;) delimited
// - Fields are plain values (do not wrap them in single quotes)
// - Keywords separated by commas (no spaces)
// - No header row
// - Columns: File name; Title; Keywords
// - AI generated tag '_ai_generated' when enabled
//
// Freepik treats the first and last keyword as part of the value when the
// keywords field is wrapped in single quotes, so quote characters must not be
// added around the field. Keep values on one line and protect the delimiter.
function csvEscapeFreepik(value) {
  return String(value ?? "")
    .replace(/[;\r\n]+/g, " ")
    .trim();
}

function toFreepikCsv(rows) {
  return rows.map((row) => row.map(csvEscapeFreepik).join(";")).join("\r\n");
}

export const FREEPIK_MAX_KEYWORDS = 50;
// Magnific truncates titles past 100 characters, so cap them at the source.
export const FREEPIK_MAX_TITLE = MAGNIFIC_MAX_TITLE;

export function buildFreepikCsv(items, { aiGenerated = false } = {}) {
  const rows = [];
  for (const it of items) {
    const meta = it.result.platforms.freepik_vecteezy;
    const title = enforceTitleRules(meta.title, "freepik_vecteezy").slice(0, FREEPIK_MAX_TITLE);
    const seen = new Set();
    const keywords = [];
    for (const k of meta.keywords ?? []) {
      const kw = String(k).trim();
      if (!kw) continue;
      if (seen.has(kw.toLowerCase())) continue;
      seen.add(kw.toLowerCase());
      keywords.push(kw);
    }
    // `_ai_generated` takes one of the 50 keyword slots on Magnific.
    const wantsAiTag = aiGenerated && !seen.has("_ai_generated");
    const capped = keywords.slice(0, FREEPIK_MAX_KEYWORDS - (wantsAiTag ? 1 : 0));
    if (wantsAiTag) capped.push("_ai_generated");
    rows.push([it.filename, title, capped.join(",")]);
  }
  return toFreepikCsv(rows);
}

// Magnific is the current brand name; the Freepik names stay as aliases.
export const buildMagnificCsv = buildFreepikCsv;
export const MAGNIFIC_MAX_KEYWORDS = FREEPIK_MAX_KEYWORDS;

export function buildGenericCsv(items, platformKey) {
  const header = ["Filename", "Title", "Keywords"];
  const rows = [header];
  for (const it of items) {
    const meta = it.result.platforms[platformKey];
    rows.push([it.filename, meta.title, meta.keywords.join(", ")]);
  }
  return toCsv(rows);
}

export function downloadCsv(csvString, filename) {
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
