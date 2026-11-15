// Reads metadata CSVs from any of the tools a contributor is likely to have
// lying around: this app's own export, Magnific's (ex-Freepik) documented
// "File name; Title; Keywords; Prompt; Model" file, and the headerless
// semicolon variant that older Freepik bulk uploads used.
//
// The rule is simple: never lose a column we understand, and never reject a
// file just because the header names differ from ours.

const REQUIRED_COLUMN = "filename";
const OPTIONAL_COLUMNS = ["title", "tags", "is_ai", "ai_prompt", "ai_model", "people_count"];

// Accepted header names per field, in priority order (the canonical name
// always wins). Header cells are normalised first, so "File name",
// "file-name" and "FILE NAME" all become "file_name".
const COLUMN_ALIASES = {
  filename: ["filename", "file_name", "file", "filepath", "file_path", "asset", "asset_name", "image", "image_name"],
  title: ["title", "headline", "caption", "description"],
  tags: ["tags", "keywords", "keyword", "tag", "keywords_list"],
  is_ai: ["is_ai", "ai", "ai_generated", "is_ai_generated", "generated_with_ai", "artificial_intelligence"],
  ai_prompt: ["ai_prompt", "prompt", "generation_prompt"],
  ai_model: ["ai_model", "model", "ai_tool", "generator"],
  people_count: ["people_count", "people", "person_count"],
};

// Magnific's CSV has no header in the wild; columns are positional:
// File name; Title; Keywords; Prompt; Model
const IMPLICIT_MAGNIFIC_COLUMNS = ["filename", "title", "tags", "ai_prompt", "ai_model"];

export const MAGNIFIC_CSV_COLUMNS = ["filename", "title", "tags", "is_ai", "ai_prompt", "ai_model", "people_count"];

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

/**
 * Picks the delimiter that splits the first rows consistently. Counting
 * characters is not enough: a semicolon file whose titles and keyword lists
 * contain commas ties on raw counts, and the old code then guessed "comma".
 */
function detectDelimiter(text) {
  const lines = String(text)
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim() !== "")
    .slice(0, 20);
  if (!lines.length) return ";";

  let best = { delimiter: ";", ratio: 0, columns: 1 };
  for (const delimiter of [";", ",", "\t"]) {
    const counts = lines.map((line) => (parseDelimited(line, delimiter)[0] || []).length);
    const columns = counts[0];
    if (columns < 2) continue;
    const ratio = counts.filter((count) => count === columns).length / counts.length;
    if (ratio > best.ratio || (ratio === best.ratio && columns > best.columns)) {
      best = { delimiter, ratio, columns };
    }
  }
  return best.delimiter;
}

function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

// Older Freepik exports wrapped every field in single quotes; strip only
// quotes that wrap the whole cell so apostrophes inside a word survive.
function cleanCell(value) {
  let text = String(value ?? "").trim();
  if (text.length > 1 && text.startsWith("'") && text.endsWith("'")) text = text.slice(1, -1).trim();
  return text;
}

// A CSV row from another tool may carry "./robot.eps" or "/uploads/robot.eps".
function cleanFilename(value) {
  const text = cleanCell(value).replace(/\\/g, "/");
  return text.split("/").pop().trim();
}

const FILE_NAME_PATTERN = /\.[a-z0-9]{2,5}$/i;

function looksLikeFilename(value) {
  const text = cleanCell(value);
  return text.length > 0 && !/\s/.test(text) && FILE_NAME_PATTERN.test(text);
}

function resolveColumn(headers, field) {
  const aliases = COLUMN_ALIASES[field] || [];
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index !== -1) return index;
  }
  return -1;
}

export function parseMetadataCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = parseDelimited(text, delimiter);
  if (!rows.length) return { error: "This CSV is empty. Add a header row and at least one filename." };

  const headerCells = rows[0];
  const headers = headerCells.map(normalizeHeader);

  let columns = {};
  for (const field of [REQUIRED_COLUMN, ...OPTIONAL_COLUMNS]) columns[field] = resolveColumn(headers, field);

  let layout = "header";
  let dataRows = rows.slice(1);
  let rowOffset = 2;

  if (columns.filename === -1) {
    // No recognisable header: accept Magnific's headerless positional layout
    // instead of failing the whole file.
    const headerless = looksLikeFilename(headerCells[0]) && rows.every((cells) => looksLikeFilename(cells[0]));
    if (!headerless) {
      return {
        error:
          `The first row must be the header. Missing columns: ${REQUIRED_COLUMN}. ` +
          "Start the file with filename (or File name), then title, tags/keywords, ai_prompt and ai_model.",
      };
    }
    layout = "magnific";
    dataRows = rows;
    rowOffset = 1;
    const columnCount = Math.max(...rows.map((cells) => cells.length));
    columns = { title: -1, tags: -1, is_ai: -1, ai_prompt: -1, ai_model: -1, people_count: -1 };
    IMPLICIT_MAGNIFIC_COLUMNS.forEach((field, index) => {
      if (index < columnCount) columns[field] = index;
    });
    columns.filename = 0;
  } else if (!dataRows.some((cells) => cleanFilename(cells[columns.filename]))) {
    return { error: "No filenames were found under the filename column." };
  }

  const records = dataRows
    .map((cells, index) => {
      const get = (field) => (columns[field] < 0 ? "" : cleanCell(cells[columns[field]]));
      return {
        rowNumber: index + rowOffset,
        filename: cleanFilename(cells[columns.filename]),
        title: get("title"),
        tags: get("tags"),
        is_ai: get("is_ai"),
        ai_prompt: get("ai_prompt"),
        ai_model: get("ai_model"),
        people_count: get("people_count"),
      };
    })
    .filter((record) => record.filename);

  if (!records.length) return { error: "No filenames were found under the filename column." };

  return {
    records,
    headers,
    layout,
    delimiter,
    // Which extra fields the file simply does not carry.
    missingOptional: OPTIONAL_COLUMNS.filter((field) => columns[field] < 0),
  };
}

export function splitTags(value) {
  return String(value ?? "")
    .split(/[;,|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function buildMetadataCsvTemplate() {
  return `${MAGNIFIC_CSV_COLUMNS.join(";")}\r\n`;
}
