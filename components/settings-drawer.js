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
  {
    id: "openrouter",
    name: "OpenRouter",
    badge: "Multi-model Vision",
    placeholder: "sk-or-v1-...",
    link: "https://openrouter.ai/settings/keys",
    linkLabel: "openrouter.ai",
    models: ["google/gemini-2.5-flash", "openai/gpt-4.1-mini", "qwen/qwen2.5-vl-72b-instruct"],
    hint: "Use one OpenRouter key with an automatic fallback across vision-capable models.",
  },
  {
    id: "agnes",
    name: "Agnes AI",
    badge: "Multimodal",
    placeholder: "sk-...",
    link: "https://platform.agnes-ai.com/",
    linkLabel: "platform.agnes-ai.com",
    models: ["agnes-3.0-flash", "agnes-2.5-pro", "agnes-2.5-flash"],
    hint: "Agnes AI's OpenAI-compatible multimodal API for image understanding and metadata generation.",
  },
  {
    id: "chutes",
    name: "Chutes.ai",
    badge: "TEE Vision",
    placeholder: "cpk_...",
    link: "https://chutes.ai/app/settings/api-keys",
    linkLabel: "chutes.ai/app/settings/api-keys",
    models: ["Qwen/Qwen3.6-27B-TEE", "google/gemma-4-31B-turbo-TEE", "moonshotai/Kimi-K2.6-TEE"],
    hint: "Chutes.ai's decentralized, confidential-compute inference network with OpenAI-compatible vision models.",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    badge: "Inference Providers",
    placeholder: "hf_...",
    link: "https://huggingface.co/settings/tokens",
    linkLabel: "huggingface.co/settings/tokens",
    models: [
      "Qwen/Qwen2.5-VL-32B-Instruct",
      "meta-llama/Llama-3.2-11B-Vision-Instruct",
      "Qwen/Qwen2.5-VL-7B-Instruct",
    ],
    hint: "Route through Hugging Face's Inference Providers router with a single token across many hosted vision models.",
  },
  {
    id: "llm7",
    name: "LLM7.io",
    badge: "Free tier",
    placeholder: "unused (or your llm7.io token)",
    link: "https://token.llm7.io",
    linkLabel: "token.llm7.io",
    models: ["gpt-5.5", "gemini-3.1-flash-lite", "claude-sonnet-4-5"],
    hint: "LLM7.io's free, OpenAI-compatible gateway. Works anonymously with the key “unused”, or register a free token for higher rate limits.",
  },
  {
    id: "ollama",
    name: "Ollama Local",
    badge: "Local vision",
    link: "https://ollama.com/download",
    linkLabel: "ollama.com",
    models: ["llama3.2-vision", "llava", "qwen2.5vl"],
    hint: "Run a vision model through your own Ollama server. Native Ollama does not require an API key.",
  },
  {
    id: "ollama_cloud",
    name: "Ollama Cloud",
    badge: "Hosted vision",
    placeholder: "Ollama API key",
    link: "https://ollama.com/settings/keys",
    linkLabel: "ollama.com/settings/keys",
    models: ["gemma4:31b", "glm-5.3-flash", "kimi-k3", "mistral-large-3"],
    hint: "Use Ollama's hosted vision models directly—no Ollama install or model download required.",
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
  ollamaConfig = {},
  onChangeOllamaConfig,
  ollamaCloudModel = "",
  onChangeOllamaCloudModel,
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

  useEffect(() => setShowKey(false), [activeProvider]);

  const currentProviderConfig = PROVIDERS.find((p) => p.id === activeProvider) || PROVIDERS[0];
  const isOllama = activeProvider === "ollama";
  const isOllamaCloud = activeProvider === "ollama_cloud";
  const isOllamaProvider = isOllama || isOllamaCloud;
  const currentKey = apiKeys[activeProvider] || "";
  const currentStatus = keyStatuses[activeProvider] || "not-set";
  const currentFeedback = testFeedback[activeProvider] || null;
  const ollamaReady = Boolean(ollamaConfig.baseUrl?.trim() && ollamaConfig.model?.trim());
  const ollamaCloudReady = Boolean(currentKey.trim() && ollamaCloudModel.trim());
  const currentProviderReady = isOllama
    ? ollamaReady
    : isOllamaCloud
      ? ollamaCloudReady
      : activeProvider === "llm7"
        ? true // LLM7.io works anonymously with the key "unused".
        : Boolean(currentKey);
  const statusInfo = isOllamaProvider && currentStatus === "invalid"
    ? { status: "error", label: "Connection failed" }
    : (STATUS_MAP[currentStatus] ?? STATUS_MAP["not-set"]);

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

          {isOllama ? (
            <>
              <div>
                <label htmlFor="ollama-url-input" className="field__label" style={{ display: "block", marginBottom: 8 }}>
                  Ollama server URL
                </label>
                <input
                  id="ollama-url-input"
                  className="input"
                  type="url"
                  value={ollamaConfig.baseUrl || ""}
                  onChange={(e) => onChangeOllamaConfig({ ...ollamaConfig, baseUrl: e.target.value })}
                  placeholder="http://127.0.0.1:11434"
                  autoComplete="url"
                  spellCheck={false}
                />
              </div>

              <div>
                <label htmlFor="ollama-model-input" className="field__label" style={{ display: "block", marginBottom: 8 }}>
                  Installed vision model
                </label>
                <input
                  id="ollama-model-input"
                  className="input"
                  value={ollamaConfig.model || ""}
                  onChange={(e) => onChangeOllamaConfig({ ...ollamaConfig, model: e.target.value })}
                  placeholder="llama3.2-vision"
                  list="ollama-vision-models"
                  autoComplete="off"
                  spellCheck={false}
                />
                <datalist id="ollama-vision-models">
                  {currentProviderConfig.models.map((model) => <option key={model} value={model} />)}
                </datalist>
              </div>
            </>
          ) : (
            <>
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

              {isOllamaCloud && (
                <div>
                  <label htmlFor="ollama-cloud-model-input" className="field__label" style={{ display: "block", marginBottom: 8 }}>
                    Cloud vision model
                  </label>
                  <input
                    id="ollama-cloud-model-input"
                    className="input"
                    value={ollamaCloudModel}
                    onChange={(e) => onChangeOllamaCloudModel(e.target.value)}
                    placeholder="gemma4:31b"
                    list="ollama-cloud-vision-models"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <datalist id="ollama-cloud-vision-models">
                    {currentProviderConfig.models.map((model) => <option key={model} value={model} />)}
                  </datalist>
                </div>
              )}
            </>
          )}

          <p className="drawer__text">
            {currentProviderConfig.hint}{" "}
            <a href={currentProviderConfig.link} target="_blank" rel="noreferrer">
              {isOllama ? "Install Ollama" : currentProviderConfig.linkLabel}
            </a>
            {isOllama ? (
              <> and run <code>ollama pull {ollamaConfig.model || "llama3.2-vision"}</code>. For a deployed app, use an Ollama URL reachable from the app server rather than your browser’s localhost.</>
            ) : isOllamaCloud ? (
              <>. Use the API model name (for example, <code>gemma4:31b</code>), not the CLI’s <code>:cloud</code> alias. Your key is stored locally in your browser and never logged.</>
            ) : (
              <>. Keys are stored locally in your browser and never logged.</>
            )}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
              {isOllamaProvider ? "Suggested vision models:" : "Fallback models:"}
            </span>
            {currentProviderConfig.models.map((m) => (
              <span key={m} className="drawer__model-tag">
                {m}
              </span>
            ))}
          </div>

          <div className="drawer__row">
            <button className="btn btn--primary" onClick={() => onSave(activeProvider)}>
              {isOllamaProvider ? "Save settings" : "Save key"}
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => onTest(activeProvider)}
              disabled={!currentProviderReady || currentStatus === "testing"}
            >
              Test connection
            </button>
            <button
              className="btn btn--subtle"
              onClick={() => onClear(activeProvider)}
              disabled={!isOllamaProvider && !currentKey}
            >
              {isOllamaProvider ? "Reset" : "Clear"}
            </button>
          </div>

          <div className="drawer__status">
            <span>Connection Status</span>
            <StatusDot
              status={statusInfo.status}
              label={statusInfo.label}
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
