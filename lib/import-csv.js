const OPTIONAL_COLUMNS = ["title", "tags", "is_ai", "ai_prompt", "ai_model", "people_count"];

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const source = String(text).replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"' && value.length === 0) {
      quoted = true;
    } else if (char === delimiter) {
      row.push(value);
      value = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function detectDelimiter(text) {
  const firstLine = String(text).replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] || "";
  const candidates = [",", ";", "\t"];
  return candidates.reduce((best, candidate) => {
    const count = firstLine.split(candidate).length - 1;
    return count > best.count ? { delimiter: candidate, count } : best;
  }, { delimiter: ",", count: 0 }).delimiter;
}

function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function parseMetadataCsv(text) {
  const rows = parseDelimited(text, detectDelimiter(text));
  if (!rows.length) return { error: "This CSV is empty. Add a header row and at least one filename." };

  const headers = rows[0].map(normalizeHeader);
  const filenameIndex = headers.findIndex((header) => ["filename", "file_name", "file"].includes(header));
  if (filenameIndex === -1) {
    return { error: "The first row must be the header. Missing required column: filename." };
  }

  const columns = Object.fromEntries(
    OPTIONAL_COLUMNS.map((name) => [name, headers.findIndex((header) => header === name)])
  );
  const records = rows.slice(1).map((cells, index) => {
    const get = (column) => columns[column] < 0 ? "" : String(cells[columns[column]] ?? "").trim();
    return {
      rowNumber: index + 2,
      filename: String(cells[filenameIndex] ?? "").trim(),
      title: get("title"),
      tags: get("tags"),
      is_ai: get("is_ai"),
      ai_prompt: get("ai_prompt"),
      ai_model: get("ai_model"),
      people_count: get("people_count"),
    };
  }).filter((record) => record.filename);

  if (!records.length) return { error: "No filenames were found under the filename column." };
  return { records, headers, missingOptional: OPTIONAL_COLUMNS.filter((name) => columns[name] < 0) };
}

export function splitTags(value) {
  return String(value ?? "")
    .split(/[;,|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function buildMetadataCsvTemplate() {
  return "filename;title;tags;is_ai;ai_prompt;ai_model;people_count\r\n";
}
