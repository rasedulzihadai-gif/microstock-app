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
