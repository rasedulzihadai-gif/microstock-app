"use client";
import { useState, useEffect } from "react";
import { StatusDot } from "./status-dot";
import { IconAlert, IconCheck, IconCopy, IconRefresh, IconX } from "./icons";

export const PLATFORM_TABS = [
  { key: "adobe_stock", label: "Adobe Stock" },
  { key: "shutterstock", label: "Shutterstock" },
  { key: "istock_getty", label: "iStock / Getty" },
  { key: "freepik_vecteezy", label: "Freepik / Vecteezy" },
];

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable in insecure contexts; fail silently.
    }
  }

  return (
    <button className="btn btn--subtle btn--sm" onClick={copy} aria-label={`Copy ${label}`}>
      {copied ? <IconCheck width={13} height={13} /> : <IconCopy width={13} height={13} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function KeywordChip({ text, onRemove }) {
  return (
    <span className="chip">
      {text}
      <button className="chip__remove" onClick={onRemove} aria-label={`Remove ${text}`}>
        <IconX width={11} height={11} />
      </button>
    </span>
  );
}

export function Inspector({ item, index, activeTab, onTabChange, onRetry, onRemoveKeyword }) {
  const platform = item.result?.platforms?.[activeTab];

  return (
    <div className="inspector" key={index}>
      <header className="inspector__header">
        <img className="inspector__preview" src={item.previewUrl} alt={item.filename} />
        <div className="inspector__meta">
          <div className="inspector__title-row">
            <h2 className="inspector__filename">{item.filename}</h2>
            <StatusDot status={item.status} pill />
          </div>

          {item.status === "error" && (
            <div className="notice notice--error" role="alert">
              <IconAlert width={15} height={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <div className="notice__body">{item.error}</div>
              <button className="btn btn--ghost btn--sm" onClick={onRetry}>
                <IconRefresh width={13} height={13} />
                Retry
              </button>
            </div>
          )}

          {item.status === "processing" && (
            <div className="skeleton" aria-live="polite" aria-label="Analyzing image">
              <div className="skeleton__bar" style={{ width: "70%" }} />
              <div className="skeleton__bar" style={{ width: "45%" }} />
              <div className="skeleton__bar" style={{ width: "58%" }} />
            </div>
          )}

          {item.status === "pending" && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>
              Queued. Press <strong style={{ color: "var(--text)", fontWeight: 500 }}>Generate</strong> to analyze this image.
            </p>
          )}

          {item.status === "done" && (
            <div className="inspector__actions">
              <button className="btn btn--ghost btn--sm" onClick={onRetry}>
                <IconRefresh width={13} height={13} />
                Regenerate
              </button>
            </div>
          )}
        </div>
      </header>

      {item.result && (
        <>
          <nav className="tabs" aria-label="Platform">
            {PLATFORM_TABS.map((t) => (
              <button
                key={t.key}
                className={`tab${activeTab === t.key ? " tab--active" : ""}`}
                onClick={() => onTabChange(t.key)}
                aria-selected={activeTab === t.key}
                role="tab"
              >
                {t.label}
              </button>
            ))}
          </nav>

          <section className="field">
            <div className="field__head">
              <span className="field__label">Title</span>
              <CopyButton text={platform?.title ?? ""} label="title" />
            </div>
            <div className="field__box">{platform?.title}</div>
          </section>

          <section className="field">
            <div className="field__head">
              <span className="field__label">
                Keywords <span>{platform?.keywords.length ?? 0}</span>
              </span>
              <CopyButton text={(platform?.keywords ?? []).join(", ")} label="keywords" />
            </div>
            <div className="chips">
              {platform?.keywords.map((kw, i) => (
                <KeywordChip key={`${kw}-${i}`} text={kw} onRemove={() => onRemoveKeyword(index, activeTab, i)} />
              ))}
            </div>
          </section>

          {item.result.flags?.length > 0 && (
            <div className="notice notice--warn">
              <IconAlert width={15} height={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <div className="notice__body">{item.result.flags.join(", ")}</div>
            </div>
          )}

          {item.result._meta?.fellBack && (
            <p className="notice notice--muted" style={{ margin: 0 }}>
              Primary model was busy — answered by {item.result._meta.modelUsed} instead.
            </p>
          )}
        </>
      )}
    </div>
  );
}
