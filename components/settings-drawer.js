"use client";
import { useEffect, useState } from "react";
import { StatusDot } from "./status-dot";
import { IconX, IconCheck, IconAlert } from "./icons";

export const PROVIDERS = [
  {
    id: "gemini",
    name: "Google Gemini",
    badge: "Multimodal",
    placeholder: "AIzaSy...",
    link: "https://aistudio.google.com/app/apikey",
    linkLabel: "aistudio.google.com",
    models: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"],
    hint: "Google's ultra-fast multimodal model with native image understanding.",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    badge: "Vision API",
    placeholder: "sk-...",
    link: "https://platform.deepseek.com/api_keys",
    linkLabel: "platform.deepseek.com",
    models: ["deepseek-flash", "deepseek-chat"],
    hint: "DeepSeek V4 vision multimodal format for deep microstock metadata analysis.",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    badge: "Pixtral Vision",
    placeholder: "...",
    link: "https://console.mistral.ai/api-keys",
    linkLabel: "console.mistral.ai",
    models: ["pixtral-12b-2409", "pixtral-large-latest"],
    hint: "Mistral Pixtral multimodal model specialized in visual reasoning.",
  },
];

const STATUS_MAP = {
  connected: { status: "done", label: "Connected" },
  invalid: { status: "error", label: "Invalid key" },
  testing: { status: "processing", label: "Testing connection..." },
  "not-set": { status: "pending", label: "Not configured" },
};

export function SettingsDrawer({
  activeProvider = "gemini",
  onChangeProvider,
  apiKeys = {},
  onChangeApiKey,
  keyStatuses = {},
  testFeedback = {},
  onSave,
  onTest,
  onClear,
  onClose,
}) {
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const currentProviderConfig = PROVIDERS.find((p) => p.id === activeProvider) || PROVIDERS[0];
  const currentKey = apiKeys[activeProvider] || "";
  const currentStatus = keyStatuses[activeProvider] || "not-set";
  const currentFeedback = testFeedback[activeProvider] || null;

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
            AI Provider &amp; API Settings
          </h3>
          <button className="btn btn--subtle btn--icon btn--sm" onClick={onClose} aria-label="Close settings">
            <IconX width={15} height={15} />
          </button>
        </div>

        <div className="drawer__body">
          <div>
            <label className="field__label" style={{ display: "block", marginBottom: 8 }}>
              Select AI Engine
            </label>
            <div className="provider-toggle">
              {PROVIDERS.map((p) => {
                const isSelected = p.id === activeProvider;
                const pStatus = keyStatuses[p.id] || "not-set";
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`provider-btn${isSelected ? " provider-btn--active" : ""}`}
                    onClick={() => onChangeProvider(p.id)}
                  >
                    <span>{p.name}</span>
                    <span className="provider-btn__badge">
                      {pStatus === "connected" ? "● Connected" : p.badge}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <label htmlFor="api-key-input" className="field__label">
                {currentProviderConfig.name} API Key
              </label>
              {currentKey && (
                <button
                  type="button"
                  className="btn btn--subtle btn--sm"
                  style={{ height: 20, fontSize: 11, padding: "0 4px" }}
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              )}
            </div>
            <input
              id="api-key-input"
              className="input"
              type={showKey ? "text" : "password"}
              value={currentKey}
              onChange={(e) => onChangeApiKey(activeProvider, e.target.value)}
              placeholder={currentProviderConfig.placeholder}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <p className="drawer__text">
            {currentProviderConfig.hint} Get your key from{" "}
            <a href={currentProviderConfig.link} target="_blank" rel="noreferrer">
              {currentProviderConfig.linkLabel}
            </a>
            . Keys are stored locally in your browser and never logged.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>Fallback models:</span>
            {currentProviderConfig.models.map((m) => (
              <span key={m} className="drawer__model-tag">
                {m}
              </span>
            ))}
          </div>

          <div className="drawer__row">
            <button className="btn btn--primary" onClick={() => onSave(activeProvider)}>
              Save key
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => onTest(activeProvider)}
              disabled={!currentKey || currentStatus === "testing"}
            >
              Test connection
            </button>
            <button
              className="btn btn--subtle"
              onClick={() => onClear(activeProvider)}
              disabled={!currentKey}
            >
              Clear
            </button>
          </div>

          <div className="drawer__status">
            <span>Connection Status</span>
            <StatusDot
              status={(STATUS_MAP[currentStatus] ?? STATUS_MAP["not-set"]).status}
              label={(STATUS_MAP[currentStatus] ?? STATUS_MAP["not-set"]).label}
              pill
            />
          </div>

          {currentFeedback && (
            <div
              className={`notice ${currentFeedback.ok ? "notice--done" : "notice--error"}`}
              style={{
                background: currentFeedback.ok ? "var(--teal-soft)" : "var(--red-soft)",
                color: currentFeedback.ok ? "var(--teal)" : "var(--red)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 12px",
                fontSize: 12.5,
              }}
            >
              {currentFeedback.ok ? (
                <IconCheck width={14} height={14} style={{ flexShrink: 0, marginTop: 1 }} />
              ) : (
                <IconAlert width={14} height={14} style={{ flexShrink: 0, marginTop: 1 }} />
              )}
              <div className="notice__body">{currentFeedback.message}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
