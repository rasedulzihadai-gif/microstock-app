function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

// Adobe Stock (helpx.adobe.com — "CSV requirements for Adobe Stock", "Organize
// with CSV files"): Filename, Title, Keywords, Category, Releases. Required
// columns are Filename, Title, Keywords. Adobe also caps a single CSV at
// 5,000 rows and 1MB — batch above that into multiple files if you ever
// scale up that far.
//
// IMPORTANT: Adobe caps Filename at 30 characters, and the CSV filename
// must match the uploaded file's name exactly — so a long name can't be
// silently shortened here without breaking that match. getAdobeFilenameWarnings()
// below flags any offenders so the UI can tell the user to rename the
// actual file (not just the CSV row) before uploading.
export function buildAdobeStockCsv(items) {
  const header = ["Filename", "Title", "Keywords", "Category", "Releases"];
  const rows = [header];
  for (const it of items) {
    const meta = it.result.platforms.adobe_stock;
    const title = meta.title.replace(/,/g, "").slice(0, 70);
    rows.push([it.filename, title, meta.keywords.slice(0, 50).join(", "), "", ""]);
  }
  return toCsv(rows);
}

export function getAdobeFilenameWarnings(items) {
  return items
    .map((it) => it.filename)
    .filter((name) => name.length > 30);
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

// Freepik official bulk-CSV spec, re-verified directly against their live
// support article (support.freepik.com / magnific.com "How to create a
// csv file"): semicolon-delimited, and — this is the part that was wrong
// before — every field wrapped in SINGLE quotes, not double quotes. Their
// own example row is literally:
//   'beautiful-sunset.jpg';'Beautiful sunset';'sunset,sun,summer,beach,mountain'
// Keywords stay comma-joined INSIDE that single-quoted keywords field.
// No header row in their examples, so we don't emit one either.
function csvEscapeFreepik(value) {
  const s = String(value ?? "");
  // Double up any embedded single quote, the same escaping convention as
  // doubling double-quotes in standard CSV.
  return `'${s.replace(/'/g, "''")}'`;
}

function toFreepikCsv(rows) {
  return rows.map((row) => row.map(csvEscapeFreepik).join(";")).join("\r\n");
}

export function buildFreepikCsv(items) {
  const rows = [];
  for (const it of items) {
    const meta = it.result.platforms.freepik_vecteezy;
    rows.push([it.filename, meta.title, meta.keywords.join(",")]);
  }
  return toFreepikCsv(rows);
}

// iStock / Getty Images (via Getty's ESP CSV import + third-party tools
// like DeepMeta/PixTagger that document the same columns): File name,
// Created date, Title, Description, Country, Brief code, Keywords.
//
// IMPORTANT CAVEAT: Getty validates keywords against their own "controlled
// vocabulary" — a fixed, curated term list. Free-form AI keywords that
// aren't in that vocabulary can be rejected or flagged even when every
// column here is correctly formatted. Treat this CSV as a strong first
// draft to review/adjust inside Getty's own submission tool, not a
// guaranteed one-click import the way Adobe/Shutterstock/Freepik are.
export function buildIstockGettyCsv(items) {
  const header = ["File name", "Created date", "Title", "Description", "Country", "Brief code", "Keywords"];
  const rows = [header];
  for (const it of items) {
    const meta = it.result.platforms.istock_getty;
    rows.push([
      it.filename,
      "",
      meta.title,
      it.result.description || meta.title,
      "",
      "",
      meta.keywords.slice(0, 50).join(", "),
    ]);
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
