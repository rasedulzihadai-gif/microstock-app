"use client";
import { useEffect } from "react";
import { StatusDot } from "./status-dot";
import { IconX } from "./icons";

const STATUS_MAP = {
  connected: { status: "done", label: "Connected" },
  invalid: { status: "error", label: "Invalid key" },
  testing: { status: "processing", label: "Testing" },
  "not-set": { status: "pending", label: "Not set" },
};

export function SettingsDrawer({ apiKey, keyStatus, onChangeKey, onSave, onTest, onClear, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer__head">
          <h3 id="settings-title" className="drawer__title">
            Settings
          </h3>
          <button className="btn btn--subtle btn--icon btn--sm" onClick={onClose} aria-label="Close settings">
            <IconX width={15} height={15} />
          </button>
        </div>

        <div className="drawer__body">
          <div>
            <label htmlFor="gemini-key" className="field__label" style={{ display: "block", marginBottom: 8 }}>
              Gemini API key
            </label>
            <input
              id="gemini-key"
              className="input"
              type="password"
              value={apiKey}
              onChange={(e) => onChangeKey(e.target.value)}
              placeholder="AIza..."
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <p className="drawer__text">
            Get a key at{" "}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
              aistudio.google.com
            </a>
            . It&apos;s stored only in this browser and sent directly with each request — never saved on our servers.
          </p>

          <div className="drawer__row">
            <button className="btn btn--primary" onClick={onSave}>
              Save key
            </button>
            <button className="btn btn--ghost" onClick={onTest} disabled={!apiKey || keyStatus === "testing"}>
              Test connection
            </button>
            <button className="btn btn--subtle" onClick={onClear} disabled={!apiKey}>
              Clear
            </button>
          </div>

          <div className="drawer__status">
            <span>Connection</span>
            <StatusDot
              status={(STATUS_MAP[keyStatus] ?? STATUS_MAP["not-set"]).status}
              label={(STATUS_MAP[keyStatus] ?? STATUS_MAP["not-set"]).label}
              pill
            />
          </div>
        </div>
      </div>
    </div>
  );
}
