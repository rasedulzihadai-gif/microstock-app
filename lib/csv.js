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

// Freepik metadata CSV: a header followed by semicolon-separated plain values.
// Quotes, semicolons and line breaks cannot be represented in this format.
function csvEscapeFreepik(value) {
  return String(value ?? "")
    .replace(/[;\r\n]+/g, " ")
    .replace(/"/g, "")
    .trim();
}

function toFreepikCsv(rows) {
  return rows.map((row) => row.map(csvEscapeFreepik).join(";")).join("\r\n");
}

export const FREEPIK_MAX_KEYWORDS = 50;
export const FREEPIK_MAX_TITLE = MAGNIFIC_MAX_TITLE;

export function buildFreepikCsv(items, { aiGenerated = false } = {}) {
  const rows = [["filename", "title", "tags", "is_ai", "ai_prompt", "ai_model", "people_count"]];
  for (const it of items) {
    const meta = it.result.platforms.freepik_vecteezy;
    const title = enforceTitleRules(meta.title, "freepik_vecteezy").slice(0, FREEPIK_MAX_TITLE);
    const seen = new Set();
    const keywords = [];
    for (const k of meta.keywords ?? []) {
      const kw = csvEscapeFreepik(k).replace(/,/g, " ").trim();
      if (!kw || seen.has(kw.toLowerCase())) continue;
      seen.add(kw.toLowerCase());
      keywords.push(kw);
    }
    const imported = it.importedMetadata || {};
    const importedAi = String(imported.is_ai || "").trim().toLowerCase();
    const isAi = /^(yes|true|1)$/.test(importedAi) ? "yes"
      : /^(no|false|0)$/.test(importedAi) ? "no"
      : aiGenerated ? "yes" : "no";
    rows.push([
      it.filename, title, keywords.slice(0, FREEPIK_MAX_KEYWORDS).join(","),
      isAi, imported.ai_prompt || "", imported.ai_model || "", "",
    ]);
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
