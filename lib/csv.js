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
    const title = meta.title.replace(/,/g, "").slice(0, 70);
    rows.push([it.filename, title, meta.keywords.slice(0, 50).join(", "), "", ""]);
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

// Freepik does NOT accept a comma-separated CSV. Per their own support
// article "How to create a .csv file" (support.freepik.com →
// magnific.com/ai/contributors/how-to-create-a-csv-file), their format is:
//   - fields separated by a semicolon (;) — a comma-separated file fails to
//     parse on upload (this was the bug)
//   - keywords inside the Keywords field separated by commas, no spaces
//   - every field wrapped in single quotes
//   - no header row
//   - column order: File name; Title; Keywords; Prompt (AI only); Model (AI only)
//   - title max 100 chars, keywords min 5 / max 50
//   - AI-generated content must carry the `_ai_generated` keyword
// Their canonical example row:
//   'beautiful-sunset.jpg';'Beautiful sunset';'sunset,sun,summer,beach,mountain'
function csvEscapeFreepik(value) {
  const s = String(value ?? "");
  // Doubling an embedded single quote is the same escaping convention as
  // doubling double quotes in standard CSV.
  return `'${s.replace(/'/g, "''")}'`;
}

function toFreepikCsv(rows) {
  return rows.map((row) => row.map(csvEscapeFreepik).join(";")).join("\r\n");
}

export const FREEPIK_MAX_KEYWORDS = 50;
export const FREEPIK_MAX_TITLE = 100;

export function buildFreepikCsv(items, { aiGenerated = false } = {}) {
  const rows = [];
  for (const it of items) {
    const meta = it.result.platforms.freepik_vecteezy;
    const title = String(meta.title ?? "").slice(0, FREEPIK_MAX_TITLE);
    const seen = new Set();
    const keywords = [];
    for (const k of meta.keywords ?? []) {
      const kw = String(k).trim();
      if (!kw) continue;
      if (seen.has(kw.toLowerCase())) continue;
      seen.add(kw.toLowerCase());
      keywords.push(kw);
    }
    // `_ai_generated` takes one of the 50 keyword slots on Freepik.
    const wantsAiTag = aiGenerated && !seen.has("_ai_generated");
    const capped = keywords.slice(0, FREEPIK_MAX_KEYWORDS - (wantsAiTag ? 1 : 0));
    if (wantsAiTag) capped.push("_ai_generated");
    rows.push([it.filename, title, capped.join(",")]);
  }
  return toFreepikCsv(rows);
}

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
