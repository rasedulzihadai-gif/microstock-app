"use client";
import { useMemo, useRef, useState } from "react";
import { buildMetadataCsvTemplate, parseMetadataCsv } from "../lib/import-csv";
import { IconX } from "./icons";

export function ImportMetadataDialog({ items, onImport, onClose }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [records, setRecords] = useState(null);
  const [parsedFile, setParsedFile] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [imported, setImported] = useState(false);

  const matched = useMemo(() => {
    if (!records) return [];
    const byName = new Map(items.map((item) => [item.filename.toLowerCase(), item]));
    return records.map((record) => ({ ...record, item: byName.get(record.filename.toLowerCase()) || null }));
  }, [items, records]);
  const matchCount = matched.filter((record) => record.item).length;

  async function loadFile(file) {
    if (!file) return;
    setFileName(file.name);
    setRecords(null);
    setParsedFile(null);
    setError("");
    setImported(false);
    try {
      const parsed = parseMetadataCsv(await file.text());
      if (parsed.error) setError(parsed.error);
      else {
        setRecords(parsed.records);
        setParsedFile({ layout: parsed.layout });
      }
    } catch {
      setError("We couldn't read this file. Please choose a valid CSV and try again.");
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([buildMetadataCsvTemplate()], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "lightbox-metadata-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function applyImport() {
    onImport(matched.filter((record) => record.item));
    setImported(true);
  }

  return (
    <div className="csv-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="csv-modal" role="dialog" aria-modal="true" aria-labelledby="csv-modal-title">
        <header className="csv-modal__header">
          <h2 id="csv-modal-title">Import metadata from CSV</h2>
          <button className="btn btn--subtle btn--icon btn--sm" onClick={onClose} aria-label="Close CSV import"><IconX width={15} height={15} /></button>
        </header>

        <div className="csv-modal__steps" aria-label="Import progress">
          {["Choose file", "Check", "Import"].map((step, index) => {
            const activeStep = imported ? 2 : records ? 1 : 0;
            return <div key={step} className={`csv-modal__step${index <= activeStep ? " is-active" : ""}`}><span />{step}</div>;
          })}
        </div>

        {!records && !imported && (
          <>
            <p className="csv-modal__intro">Add titles, keywords and AI details to your pending uploads in one go. Each row matches an upload by its file name.</p>
            <div
              className={`csv-dropzone${dragging ? " is-dragging" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files?.[0]); }}
            >
              <span className="csv-dropzone__file" aria-hidden="true">▤</span>
              <strong>{fileName || "Drop your CSV here"}</strong>
              <button className="btn btn--primary" onClick={() => inputRef.current?.click()}>Choose CSV file</button>
              <input ref={inputRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => { loadFile(event.target.files?.[0]); event.target.value = ""; }} />
            </div>
            {error && <p className="csv-modal__error" role="alert">{error}</p>}
            <details className="csv-modal__help">
              <summary>What the CSV needs</summary>
              <ul>
                <li>Semicolons or commas between columns, with the header row first.</li>
                <li><strong>filename</strong> is required; title, tags, is_ai, ai_prompt and ai_model are optional. people_count is accepted and ignored for now.</li>
                <li>Column names are flexible: <strong>filename</strong> or <strong>File name</strong>, <strong>tags</strong> or <strong>Keywords</strong>, <strong>ai_prompt</strong> or <strong>Prompt</strong>, <strong>ai_model</strong> or <strong>Model</strong>.</li>
                <li>A Magnific CSV without a header row is read in Magnific order: filename; title; keywords; prompt; model.</li>
                <li>An empty cell leaves that field as it is.</li>
              </ul>
            </details>
            <div className="csv-modal__links">
              <button className="btn btn--ghost btn--sm" onClick={downloadTemplate}>↓ &nbsp;Download template</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowFormat((value) => !value)}>CSV format</button>
            </div>
            {showFormat && <p className="csv-modal__format">filename;title;tags;is_ai;ai_prompt;ai_model;people_count</p>}
          </>
        )}

        {records && !imported && (
          <>
            <p className="csv-modal__intro">Found {records.length} row{records.length === 1 ? "" : "s"} in <strong>{fileName}</strong>. {matchCount} match{matchCount === 1 ? "es" : ""} a file in your upload queue.</p>
            {parsedFile?.layout === "magnific" && (
              <p className="csv-modal__format">No header row found, so this file was read in Magnific order: filename; title; keywords; prompt; model</p>
            )}
            {matchCount === 0 ? <p className="csv-modal__error" role="alert">No filenames in this CSV match files in your queue. Add the matching uploads first, then select this CSV again.</p> : (
              <div className="csv-preview" role="region" aria-label="CSV rows to import">
                {matched.slice(0, 8).map((record) => <div key={`${record.rowNumber}-${record.filename}`} className="csv-preview__row"><span className={record.item ? "csv-preview__matched" : "csv-preview__unmatched"}>{record.item ? "✓" : "–"}</span><strong>{record.filename}</strong><span>{record.item ? "Matched" : "Not in queue"}</span></div>)}
                {matched.length > 8 && <p className="csv-preview__more">and {matched.length - 8} more rows</p>}
              </div>
            )}
            <div className="csv-modal__links">
              <button className="btn btn--ghost btn--sm" onClick={() => { setRecords(null); setParsedFile(null); setError(""); }}>Choose another file</button>
              <button className="btn btn--primary" disabled={matchCount === 0} onClick={applyImport}>Import {matchCount} matched file{matchCount === 1 ? "" : "s"}</button>
            </div>
          </>
        )}

        {imported && <div className="csv-modal__success" role="status"><strong>Metadata imported.</strong><span>Your matching uploads have been updated.</span></div>}

        <footer className="csv-modal__footer"><button className="btn btn--ghost btn--sm" onClick={onClose}>{imported ? "Done" : "Cancel"}</button></footer>
      </section>
    </div>
  );
}
