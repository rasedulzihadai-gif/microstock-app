"use client";
import { useEffect, useRef, useState } from "react";
import { StatusDot } from "./status-dot";
import { IconPlus, IconSparkles, IconX } from "./icons";
import { vectorFormatBadge, vectorFormatLabel } from "../lib/file-types";

const QUEUE_ROW_HEIGHT = 56;
const QUEUE_OVERSCAN = 6;

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
  const listRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const pendingCount = items.filter((it) => it.status === "pending" || it.status === "error").length;

  useEffect(() => {
    const node = listRef.current;
    if (!node) return undefined;

    const updateHeight = () => setViewportHeight(node.clientHeight);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Keep the selected file visible while preserving a small, stable DOM even
  // when a contributor adds hundreds or thousands of images to the queue.
  useEffect(() => {
    const node = listRef.current;
    if (!node || activeIndex === null) return;
    const rowTop = activeIndex * QUEUE_ROW_HEIGHT;
    const rowBottom = rowTop + QUEUE_ROW_HEIGHT;
    if (rowTop < node.scrollTop || rowBottom > node.scrollTop + node.clientHeight) {
      node.scrollTop = Math.max(0, rowTop - QUEUE_ROW_HEIGHT * 2);
    }
  }, [activeIndex]);

  const firstVisible = Math.max(0, Math.floor(scrollTop / QUEUE_ROW_HEIGHT) - QUEUE_OVERSCAN);
  const lastVisible = Math.min(
    items.length,
    Math.ceil((scrollTop + viewportHeight) / QUEUE_ROW_HEIGHT) + QUEUE_OVERSCAN
  );
  const visibleItems = items.slice(firstVisible, lastVisible);

  return (
    <aside className="sidebar" aria-label="File queue">
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
          Add files
        </button>
      </div>

      <div
        ref={listRef}
        className="sidebar__list"
        role="list"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        {items.length === 0 && (
          <p style={{ padding: "20px 10px", color: "var(--text-faint)", fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
            Your queue is empty. Add photos, Illustrator files, PDFs or SVGs to get started.
          </p>
        )}

        {items.length > 0 && (
          <div className="sidebar__virtual-space" style={{ height: items.length * QUEUE_ROW_HEIGHT }}>
            {visibleItems.map((it, offset) => {
              const idx = firstVisible + offset;
              return (
                <div
                  key={it.id || `${it.filename}-${idx}`}
                  role="listitem"
                  aria-posinset={idx + 1}
                  aria-setsize={items.length}
                  className="sidebar__virtual-row"
                  style={{ transform: `translateY(${idx * QUEUE_ROW_HEIGHT}px)` }}
                >
                  <button
                    className={`file-item${activeIndex === idx ? " file-item--active" : ""}`}
                    onClick={() => onSelect(idx)}
                    aria-current={activeIndex === idx ? "true" : undefined}
                  >
                    <span className="file-item__thumb">
                      {it.previewUrl ? (
                        <img src={it.previewUrl} alt="" loading="lazy" decoding="async" />
                      ) : (
                        // Illustrator/PDF/SVG files have no bitmap until they are
                        // rendered; show the format instead of a broken image.
                        <span
                          className={`file-item__thumb-badge${it.previewState === "failed" ? " file-item__thumb-badge--failed" : ""}`}
                          title={
                            it.kind === "vector"
                              ? `${vectorFormatLabel(it.format)}${it.previewState === "loading" ? " — rendering preview…" : ""}`
                              : undefined
                          }
                        >
                          {it.kind === "vector" ? vectorFormatBadge(it.format) : "IMG"}
                        </span>
                      )}
                    </span>
                    <span className="file-item__body">
                      <span className="file-item__name">{it.filename}</span>
                      {it.kind === "vector" && it.status === "pending" && it.previewState === "loading" ? (
                        <span className="file-item__hint">Rendering preview…</span>
                      ) : (
                        <StatusDot status={it.status} />
                      )}
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
                  >
                    <IconX width={13} height={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
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
