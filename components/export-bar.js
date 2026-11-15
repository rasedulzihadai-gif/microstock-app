"use client";
import { IconDownload } from "./icons";

const EXPORTS = [
  { key: "adobe_stock", label: "Adobe Stock" },
  { key: "shutterstock", label: "Shutterstock" },
  { key: "istock_getty", label: "iStock" },
  { key: "freepik_vecteezy", label: "Magnific" },
];

export function ExportBar({ count, onExport, aiGenerated, onToggleAiGenerated, availablePlatforms = [] }) {
  return (
    <footer className="exportbar">
      <span className="exportbar__label">
        <IconDownload width={14} height={14} />
        Export <strong>{count}</strong> ready as CSV
      </span>
      {EXPORTS.filter((e) => availablePlatforms.includes(e.key)).map((e) => (
        <button key={e.key} className="btn btn--ghost btn--sm" onClick={() => onExport(e.key)}>
          {e.label}
        </button>
      ))}
      <label
        className="exportbar__ai-toggle"
        title="Sets is_ai to yes in the Freepik CSV for items without an imported AI setting. Imported per-file settings take precedence."
      >
        <input
          type="checkbox"
          checked={aiGenerated}
          onChange={(e) => onToggleAiGenerated(e.target.checked)}
        />
        AI-generated
      </label>
    </footer>
  );
}
