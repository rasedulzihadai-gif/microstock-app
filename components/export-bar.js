"use client";
import { IconDownload } from "./icons";

const EXPORTS = [
  { key: "adobe_stock", label: "Adobe Stock" },
  { key: "shutterstock", label: "Shutterstock" },
  { key: "istock_getty", label: "iStock" },
  { key: "freepik_vecteezy", label: "Freepik" },
];

export function ExportBar({ count, onExport }) {
  return (
    <footer className="exportbar">
      <span className="exportbar__label">
        <IconDownload width={14} height={14} />
        Export <strong>{count}</strong> ready as CSV
      </span>
      {EXPORTS.map((e) => (
        <button key={e.key} className="btn btn--ghost btn--sm" onClick={() => onExport(e.key)}>
          {e.label}
        </button>
      ))}
    </footer>
  );
}
