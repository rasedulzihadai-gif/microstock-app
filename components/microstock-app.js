"use client";
import { startTransition, useState, useEffect, useRef, useCallback } from "react";
import {
  buildAdobeStockCsv,
  buildShutterstockCsv,
  buildFreepikCsv,
  buildIstockGettyCsv,
  buildGenericCsv,
  downloadCsv,
} from "../lib/csv";
import { Sidebar } from "./sidebar";
import { Inspector } from "./inspector";
import { SettingsDrawer } from "./settings-drawer";
import { ExportBar } from "./export-bar";
import { Dropzone } from "./dropzone";
import { IconSettings, IconSparkles } from "./icons";

const DEFAULT_OLLAMA_CONFIG = {
  baseUrl: "http://127.0.0.1:11434",
  model: "llama3.2-vision",
};
const DEFAULT_OLLAMA_CLOUD_MODEL = "gemma4:31b";

const PROVIDER_LABELS = {
  gemini: "Gemini",
  deepseek: "DeepSeek",
  mistral: "Mistral",
  openrouter: "OpenRouter",
  agnes: "Agnes AI",
  ollama: "Ollama Local",
  ollama_cloud: "Ollama Cloud",
};

const ALL_PLATFORMS_KEY = "all_platforms";
const DEFAULT_PLATFORM_TAB = "adobe_stock";
let queueItemSequence = 0;

function createQueueItemId() {
  queueItemSequence += 1;
  return globalThis.crypto?.randomUUID?.() || `queue-item-${Date.now()}-${queueItemSequence}`;
}

function getResultPlatformTab(item, fallbackPlatform = DEFAULT_PLATFORM_TAB) {
  const available = Object.keys(item?.result?.platforms || {});
  if (available.includes(item?.targetPlatform)) return item.targetPlatform;
  if (available.includes(fallbackPlatform)) return fallbackPlatform;
  return available[0] || DEFAULT_PLATFORM_TAB;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resizeImage(file, maxDim = 1400) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => resolve(new File([blob], file.name, { type: "image/jpeg" })),
          "image/jpeg",
          0.88
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function MicrostockApp() {
  const [activeProvider, setActiveProvider] = useState("gemini");
  const [apiKeys, setApiKeys] = useState({
    gemini: "",
    deepseek: "",
    mistral: "",
    openrouter: "",
    agnes: "",
    ollama: "",
    ollama_cloud: "",
  });
  const [keyStatuses, setKeyStatuses] = useState({
    gemini: "not-set",
    deepseek: "not-set",
    mistral: "not-set",
    openrouter: "not-set",
    agnes: "not-set",
    ollama: "not-set",
    ollama_cloud: "not-set",
  });
  const [ollamaConfig, setOllamaConfig] = useState(DEFAULT_OLLAMA_CONFIG);
  const [ollamaCloudModel, setOllamaCloudModel] = useState(DEFAULT_OLLAMA_CLOUD_MODEL);
  const [testFeedback, setTestFeedback] = useState({
    gemini: null,
    deepseek: null,
    mistral: null,
    openrouter: null,
    agnes: null,
    ollama: null,
    ollama_cloud: null,
  });

  const [showSettings, setShowSettings] = useState(false);
  const [context, setContext] = useState("");
  const [items, setItems] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [activeTab, setActiveTab] = useState("adobe_stock");
  const [targetPlatform, setTargetPlatform] = useState("adobe_stock");
  const [running, setRunning] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Load saved provider & keys from localStorage on mount
  useEffect(() => {
    const savedProvider = localStorage.getItem("mstock_active_provider") || "gemini";
    setActiveProvider(savedProvider);

    const geminiKey = localStorage.getItem("mstock_key_gemini") || localStorage.getItem("mstock_gemini_key") || "";
    const deepseekKey = localStorage.getItem("mstock_key_deepseek") || "";
    const mistralKey = localStorage.getItem("mstock_key_mistral") || "";
    const openrouterKey = localStorage.getItem("mstock_key_openrouter") || "";
    const agnesKey = localStorage.getItem("mstock_key_agnes") || "";
    const ollamaCloudKey = localStorage.getItem("mstock_key_ollama_cloud") || "";
    const savedOllamaBaseUrl = localStorage.getItem("mstock_ollama_base_url") || DEFAULT_OLLAMA_CONFIG.baseUrl;
    const savedOllamaModel = localStorage.getItem("mstock_ollama_model") || DEFAULT_OLLAMA_CONFIG.model;
    const savedOllamaCloudModel = localStorage.getItem("mstock_ollama_cloud_model") || DEFAULT_OLLAMA_CLOUD_MODEL;
    const savedPlatform = localStorage.getItem("mstock_target_platform") || DEFAULT_PLATFORM_TAB;
    setTargetPlatform(savedPlatform);
    setActiveTab(savedPlatform === ALL_PLATFORMS_KEY ? DEFAULT_PLATFORM_TAB : savedPlatform);

    const loadedKeys = {
      gemini: geminiKey,
      deepseek: deepseekKey,
      mistral: mistralKey,
      openrouter: openrouterKey,
      agnes: agnesKey,
      ollama: "",
      ollama_cloud: ollamaCloudKey,
    };
    setApiKeys(loadedKeys);
    setOllamaConfig({ baseUrl: savedOllamaBaseUrl, model: savedOllamaModel });
    setOllamaCloudModel(savedOllamaCloudModel);

    setKeyStatuses({
      gemini: geminiKey ? "connected" : "not-set",
      deepseek: deepseekKey ? "connected" : "not-set",
      mistral: mistralKey ? "connected" : "not-set",
      openrouter: openrouterKey ? "connected" : "not-set",
      agnes: agnesKey ? "connected" : "not-set",
      ollama: "not-set",
      ollama_cloud: ollamaCloudKey && savedOllamaCloudModel ? "connected" : "not-set",
    });
  }, []);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
    };
  }, []);

  function handleProviderChange(providerId) {
    setActiveProvider(providerId);
    localStorage.setItem("mstock_active_provider", providerId);
  }

  function handleApiKeyChange(providerId, value) {
    setApiKeys((prev) => ({ ...prev, [providerId]: value }));
    setTestFeedback((prev) => ({ ...prev, [providerId]: null }));
  }

  function handleOllamaConfigChange(nextConfig) {
    setOllamaConfig({
      baseUrl: nextConfig.baseUrl ?? "",
      model: nextConfig.model ?? "",
    });
    setTestFeedback((prev) => ({ ...prev, ollama: null }));
  }

  function handleOllamaCloudModelChange(model) {
    setOllamaCloudModel(model);
    setTestFeedback((prev) => ({ ...prev, ollama_cloud: null }));
  }

  function handleSaveKey(providerId) {
    if (providerId === "ollama") {
      const baseUrl = ollamaConfig.baseUrl.trim();
      const model = ollamaConfig.model.trim();
      localStorage.setItem("mstock_ollama_base_url", baseUrl);
      localStorage.setItem("mstock_ollama_model", model);
      setKeyStatuses((prev) => ({ ...prev, ollama: baseUrl && model ? "connected" : "not-set" }));
      setTestFeedback((prev) => ({
        ...prev,
        ollama: baseUrl && model ? { ok: true, message: "Ollama settings saved locally." } : null,
      }));
      return;
    }

    if (providerId === "ollama_cloud") {
      const key = apiKeys.ollama_cloud?.trim() || "";
      const model = ollamaCloudModel.trim();
      localStorage.setItem("mstock_key_ollama_cloud", key);
      localStorage.setItem("mstock_ollama_cloud_model", model);
      setKeyStatuses((prev) => ({
        ...prev,
        ollama_cloud: key && model ? "connected" : "not-set",
      }));
      setTestFeedback((prev) => ({
        ...prev,
        ollama_cloud: key && model ? { ok: true, message: "Ollama Cloud settings saved locally." } : null,
      }));
      return;
    }

    const key = apiKeys[providerId]?.trim() || "";
    localStorage.setItem(`mstock_key_${providerId}`, key);
    if (providerId === "gemini") {
      localStorage.setItem("mstock_gemini_key", key);
    }
    setKeyStatuses((prev) => ({
      ...prev,
      [providerId]: key ? "connected" : "not-set",
    }));
    setTestFeedback((prev) => ({
      ...prev,
      [providerId]: key ? { ok: true, message: "Key saved locally." } : null,
    }));
  }

  function handleClearKey(providerId) {
    if (providerId === "ollama") {
      localStorage.removeItem("mstock_ollama_base_url");
      localStorage.removeItem("mstock_ollama_model");
      setOllamaConfig(DEFAULT_OLLAMA_CONFIG);
      setKeyStatuses((prev) => ({ ...prev, ollama: "not-set" }));
      setTestFeedback((prev) => ({ ...prev, ollama: null }));
      return;
    }

    if (providerId === "ollama_cloud") {
      localStorage.removeItem("mstock_key_ollama_cloud");
      localStorage.removeItem("mstock_ollama_cloud_model");
      setApiKeys((prev) => ({ ...prev, ollama_cloud: "" }));
      setOllamaCloudModel(DEFAULT_OLLAMA_CLOUD_MODEL);
      setKeyStatuses((prev) => ({ ...prev, ollama_cloud: "not-set" }));
      setTestFeedback((prev) => ({ ...prev, ollama_cloud: null }));
      return;
    }

    localStorage.removeItem(`mstock_key_${providerId}`);
    if (providerId === "gemini") {
      localStorage.removeItem("mstock_gemini_key");
    }
    setApiKeys((prev) => ({ ...prev, [providerId]: "" }));
    setKeyStatuses((prev) => ({ ...prev, [providerId]: "not-set" }));
    setTestFeedback((prev) => ({ ...prev, [providerId]: null }));
  }

  async function handleTestConnection(providerId) {
    const key = apiKeys[providerId]?.trim();
    const isOllama = providerId === "ollama";
    const isOllamaCloud = providerId === "ollama_cloud";
    const baseUrl = ollamaConfig.baseUrl.trim();
    const model = isOllamaCloud ? ollamaCloudModel.trim() : ollamaConfig.model.trim();
    if (isOllama ? !baseUrl || !model : isOllamaCloud ? !key || !model : !key) return;

    setKeyStatuses((prev) => ({ ...prev, [providerId]: "testing" }));
    setTestFeedback((prev) => ({ ...prev, [providerId]: null }));

    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isOllama
            ? { provider: providerId, ollamaBaseUrl: baseUrl, ollamaModel: model }
            : isOllamaCloud
              ? { provider: providerId, apiKey: key, ollamaModel: model }
              : { provider: providerId, apiKey: key }
        ),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setKeyStatuses((prev) => ({ ...prev, [providerId]: "connected" }));
        setTestFeedback((prev) => ({
          ...prev,
          [providerId]: { ok: true, message: data.message || "Connection succeeded!" },
        }));
      } else {
        setKeyStatuses((prev) => ({ ...prev, [providerId]: "invalid" }));
        setTestFeedback((prev) => ({
          ...prev,
          [providerId]: { ok: false, message: data.error || "Connection test failed." },
        }));
      }
    } catch (err) {
      setKeyStatuses((prev) => ({ ...prev, [providerId]: "invalid" }));
      setTestFeedback((prev) => ({
        ...prev,
        [providerId]: { ok: false, message: `Network error: ${String(err.message || err)}` },
      }));
    }
  }

  function handleFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;

    // Object URLs are lightweight and thumbnails are virtualized in the queue,
    // so dropping a large folder does not trigger hundreds of image decodes.
    const newItems = files.map((file) => ({
      id: createQueueItemId(),
      filename: file.name,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "pending",
      result: null,
      error: null,
    }));

    // Keep the file-picker interaction responsive when a large batch is added.
    startTransition(() => {
      setItems((prev) => {
        const merged = [...prev, ...newItems];
        if (activeIndex === null && merged.length > 0) setActiveIndex(prev.length);
        return merged;
      });
    });
  }

  function removeItem(index) {
    setItems((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((_, i) => i !== index);
      setActiveIndex((cur) => {
        if (cur === null) return null;
        if (next.length === 0) return null;
        if (cur === index) return Math.min(index, next.length - 1);
        return cur > index ? cur - 1 : cur;
      });
      return next;
    });
  }

  async function processOne(index) {
    const currentKey = apiKeys[activeProvider]?.trim();
    const isOllama = activeProvider === "ollama";
    const isOllamaCloud = activeProvider === "ollama_cloud";
    const ollamaBaseUrl = ollamaConfig.baseUrl.trim();
    const ollamaModel = (isOllamaCloud ? ollamaCloudModel : ollamaConfig.model).trim();
    if (isOllama ? !ollamaBaseUrl || !ollamaModel : isOllamaCloud ? !currentKey || !ollamaModel : !currentKey) {
      setShowSettings(true);
      return;
    }

    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], status: "processing", error: null };
      return copy;
    });

    try {
      const resized = await resizeImage(itemsRef.current[index].file);
      const base64 = await fileToBase64(resized);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Provider": activeProvider,
          ...(isOllama
            ? {
              "X-Ollama-Base-Url": ollamaBaseUrl,
              "X-Ollama-Model": ollamaModel,
            }
            : isOllamaCloud
              ? {
                "X-Provider-Key": currentKey,
                "X-Ollama-Model": ollamaModel,
              }
              : { "X-Provider-Key": currentKey }),
        },
        body: JSON.stringify({
          provider: activeProvider,
          ...(isOllama
            ? { ollamaBaseUrl, ollamaModel }
            : isOllamaCloud
              ? { apiKey: currentKey, ollamaModel }
              : { apiKey: currentKey }),
          imageBase64: base64,
          mimeType: "image/jpeg",
          context,
          targetPlatform,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setItems((prev) => {
        const copy = [...prev];
        copy[index] = { ...copy[index], status: "done", result: data, targetPlatform, error: null };
        return copy;
      });
    } catch (err) {
      setItems((prev) => {
        const copy = [...prev];
        copy[index] = { ...copy[index], status: "error", error: String(err.message || err) };
        return copy;
      });
    }
  }

  async function runBatch() {
    const currentKey = apiKeys[activeProvider]?.trim();
    const isOllama = activeProvider === "ollama";
    const isOllamaCloud = activeProvider === "ollama_cloud";
    const ollamaReady = Boolean(ollamaConfig.baseUrl.trim() && ollamaConfig.model.trim());
    const ollamaCloudReady = Boolean(currentKey && ollamaCloudModel.trim());
    if (isOllama ? !ollamaReady : isOllamaCloud ? !ollamaCloudReady : !currentKey) {
      setShowSettings(true);
      return;
    }

    setRunning(true);
    // Resizing several large photos at once can freeze the browser. Two workers
    // balance throughput with responsiveness, especially on laptops.
    const concurrency = Math.max(1, Math.min(2, Math.floor((navigator.hardwareConcurrency || 4) / 2)));
    let cursor = 0;
    const pending = items
      .map((it, idx) => ({ it, idx }))
      .filter((x) => x.it.status === "pending" || x.it.status === "error");

    async function runner() {
      while (cursor < pending.length) {
        const { idx } = pending[cursor++];
        await processOne(idx);
      }
    }
    await Promise.all(Array.from({ length: concurrency }, runner));
    setRunning(false);
  }

  function removeKeyword(itemIndex, platformKey, keywordIndex) {
    setItems((prev) => {
      const copy = [...prev];
      const platforms = { ...copy[itemIndex].result.platforms };
      const list = [...platforms[platformKey].keywords];
      list.splice(keywordIndex, 1);
      platforms[platformKey] = { ...platforms[platformKey], keywords: list };
      copy[itemIndex] = { ...copy[itemIndex], result: { ...copy[itemIndex].result, platforms } };
      return copy;
    });
  }

  const doneItems = items.filter((it) => it.status === "done");
  const active = activeIndex !== null ? items[activeIndex] : null;

  function exportCsv(platform) {
    let csv, name;
    const platformItems = doneItems.filter((item) => item.result?.platforms?.[platform]);
    if (platform === "adobe_stock") {
      csv = buildAdobeStockCsv(platformItems);
      name = "adobe_stock.csv";
    } else if (platform === "shutterstock") {
      csv = buildShutterstockCsv(platformItems);
      name = "shutterstock.csv";
    } else if (platform === "freepik_vecteezy") {
      csv = buildFreepikCsv(platformItems, { aiGenerated });
      name = "freepik.csv";
    } else if (platform === "istock_getty") {
      csv = buildIstockGettyCsv(platformItems);
      name = "istock_getty.csv";
    } else {
      csv = buildGenericCsv(platformItems, platform);
      name = `${platform}.csv`;
    }
    downloadCsv(csv, name);
  }

  const openPicker = () => fileInputRef.current?.click();
  const closeSettings = useCallback(() => setShowSettings(false), []);

  function onDragOver(e) {
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  }

  function onDragLeave(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOver(false);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  }

  const currentStatus = keyStatuses[activeProvider] || "not-set";

  return (
    <div className="app">
      <Sidebar
        items={items}
        activeIndex={activeIndex}
        running={running}
        doneCount={doneItems.length}
        onAddClick={openPicker}
        onSelect={(idx) => {
          setActiveIndex(idx);
          setActiveTab(getResultPlatformTab(items[idx], targetPlatform));
        }}
        onRemove={removeItem}
        onRunBatch={runBatch}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <main className="main" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        <header className="topbar">
          <select
            className="input"
            style={{ width: 175, flexShrink: 0 }}
            value={targetPlatform}
            aria-label="Target marketplace"
            disabled={running}
            onChange={(e) => {
              const platform = e.target.value;
              setTargetPlatform(platform);
              setActiveTab(platform === ALL_PLATFORMS_KEY ? DEFAULT_PLATFORM_TAB : platform);
              localStorage.setItem("mstock_target_platform", platform);
            }}
          >
            <option value="all_platforms">All platforms</option>
            <option value="adobe_stock">Adobe Stock only</option>
            <option value="shutterstock">Shutterstock only</option>
            <option value="freepik_vecteezy">Freepik only</option>
            <option value="istock_getty">iStock / Getty only</option>
          </select>
          <div className="input-wrap">
            <span className="input-wrap__icon">
              <IconSparkles width={14} height={14} />
            </span>
            <input
              className="input"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Optional SEO context / niche hint — e.g. corporate teamwork, sustainable eco energy, travel lifestyle"
              aria-label="Generation context"
            />
          </div>
          <button className="btn btn--ghost" onClick={() => setShowSettings(true)}>
            <span
              className={`status status--${currentStatus === "connected" ? "done" : "pending"}`}
              style={{ gap: 0 }}
            >
              <span className="status__dot" />
            </span>
            <IconSettings width={14} height={14} />
            Settings ({PROVIDER_LABELS[activeProvider] || "Gemini"})
          </button>
        </header>

        <div className="content">
          <div className="content__inner" style={{ height: active ? "auto" : "100%" }}>
            {!active && <Dropzone isOver={dragOver} hasItems={items.length > 0} onBrowse={openPicker} />}

            {active && (
              <Inspector
                item={active}
                index={activeIndex}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onRetry={() => processOne(activeIndex)}
                onRemoveKeyword={removeKeyword}
              />
            )}
          </div>
        </div>

        {doneItems.length > 0 && (
          <ExportBar
            count={doneItems.length}
            onExport={exportCsv}
            aiGenerated={aiGenerated}
            onToggleAiGenerated={setAiGenerated}
            availablePlatforms={[...new Set(doneItems.flatMap((item) => Object.keys(item.result?.platforms || {})))]}
          />
        )}
      </main>

      {showSettings && (
        <SettingsDrawer
          activeProvider={activeProvider}
          onChangeProvider={handleProviderChange}
          apiKeys={apiKeys}
          onChangeApiKey={handleApiKeyChange}
          ollamaConfig={ollamaConfig}
          onChangeOllamaConfig={handleOllamaConfigChange}
          ollamaCloudModel={ollamaCloudModel}
          onChangeOllamaCloudModel={handleOllamaCloudModelChange}
          keyStatuses={keyStatuses}
          testFeedback={testFeedback}
          onSave={handleSaveKey}
          onTest={handleTestConnection}
          onClear={handleClearKey}
          onClose={closeSettings}
        />
      )}
    </div>
  );
}
