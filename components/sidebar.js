"use client";
import { StatusDot } from "./status-dot";
import { IconPlus, IconSparkles, IconX } from "./icons";

export function Sidebar({
  items,
  activeIndex,
  running,
  doneCount,
  onAddClick,
  onSelect,
  onRemove,
  onRunBatch,
}) {
  const pendingCount = items.filter((it) => it.status === "pending" || it.status === "error").length;

  return (
    <aside className="sidebar" aria-label="Image queue">
      <div className="sidebar__brand">
        <span className="brand-mark brand-mark--logo">
          <img src="/icon-192.png" alt="Lightbox" />
        </span>
        <div>
          <div className="brand-name">Lightbox</div>
          <div className="brand-sub">Microstock metadata</div>
        </div>
      </div>

      <div className="sidebar__actions">
        <button className="btn btn--ghost btn--block" onClick={onAddClick}>
          <IconPlus width={14} height={14} />
          Add images
        </button>
      </div>

      <div className="sidebar__list" role="list">
        {items.length === 0 && (
          <p style={{ padding: "20px 10px", color: "var(--text-faint)", fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
            Your queue is empty. Add images or drop them on the canvas to get started.
          </p>
        )}
        {items.map((it, idx) => (
          <div key={idx} role="listitem" style={{ position: "relative" }}>
            <button
              className={`file-item${activeIndex === idx ? " file-item--active" : ""}`}
              onClick={() => onSelect(idx)}
              aria-current={activeIndex === idx ? "true" : undefined}
            >
              <span className="file-item__thumb">
                <img src={it.previewUrl} alt="" />
              </span>
              <span className="file-item__body">
                <span className="file-item__name">{it.filename}</span>
                <StatusDot status={it.status} />
              </span>
            </button>
            <button
              className="btn btn--subtle btn--icon btn--sm file-item__remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(idx);
              }}
              disabled={it.status === "processing"}
              aria-label={`Remove ${it.filename}`}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 24, height: 24 }}
            >
              <IconX width={13} height={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="sidebar__footer">
        {items.length > 0 && (
          <div className="sidebar__count">
            <span>
              <strong>{doneCount}</strong> of {items.length} ready
            </span>
            {pendingCount > 0 && <span>{pendingCount} queued</span>}
          </div>
        )}
        <button
          className="btn btn--primary btn--block"
          onClick={onRunBatch}
          disabled={running || pendingCount === 0}
        >
          <IconSparkles width={14} height={14} />
          {running ? "Generating…" : pendingCount > 0 ? `Generate ${pendingCount}` : "Generate all"}
        </button>
      </div>
    </aside>
  );
}
