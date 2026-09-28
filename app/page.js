"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  buildAdobeStockCsv,
  buildShutterstockCsv,
  buildFreepikCsv,
  buildIstockGettyCsv,
  buildGenericCsv,
  downloadCsv,
} from "../lib/csv";
import { Sidebar } from "../components/sidebar";
import { Inspector } from "../components/inspector";
import { SettingsDrawer } from "../components/settings-drawer";
import { ExportBar } from "../components/export-bar";
import { Dropzone } from "../components/dropzone";
import { IconSettings, IconSparkles } from "../components/icons";

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

export default function Home() {
  const [activeProvider, setActiveProvider] = useState("gemini");
  const [apiKeys, setApiKeys] = useState({
    gemini: "",
    deepseek: "",
    mistral: "",
    openrouter: "",
    agnes: "",
  });
  const [keyStatuses, setKeyStatuses] = useState({
    gemini: "not-set",
    deepseek: "not-set",
    mistral: "not-set",
    openrouter: "not-set",
    agnes: "not-set",
  });
  const [testFeedback, setTestFeedback] = useState({
    gemini: null,
    deepseek: null,
    mistral: null,
    openrouter: null,
    agnes: null,
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
    const savedPlatform = localStorage.getItem("mstock_target_platform") || "adobe_stock";
    setTargetPlatform(savedPlatform);
    setActiveTab(savedPlatform);

    const loadedKeys = {
      gemini: geminiKey,
      deepseek: deepseekKey,
      mistral: mistralKey,
      openrouter: openrouterKey,
      agnes: agnesKey,
    };
    setApiKeys(loadedKeys);

    setKeyStatuses({
      gemini: geminiKey ? "connected" : "not-set",
      deepseek: deepseekKey ? "connected" : "not-set",
      mistral: mistralKey ? "connected" : "not-set",
      openrouter: openrouterKey ? "connected" : "not-set",
      agnes: agnesKey ? "connected" : "not-set",
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

  function handleSaveKey(providerId) {
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
    if (!key) return;

    setKeyStatuses((prev) => ({ ...prev, [providerId]: "testing" }));
    setTestFeedback((prev) => ({ ...prev, [providerId]: null }));

    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, apiKey: key }),
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
    const newItems = files.map((file) => ({
      filename: file.name,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "pending",
      result: null,
      error: null,
    }));
    setItems((prev) => {
      const merged = [...prev, ...newItems];
      if (activeIndex === null && merged.length > 0) setActiveIndex(prev.length);
      return merged;
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
    if (!currentKey) {
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
          "X-Provider-Key": currentKey,
        },
        body: JSON.stringify({
          provider: activeProvider,
          apiKey: currentKey,
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
    if (!currentKey) {
      setShowSettings(true);
      return;
    }

    setRunning(true);
    const concurrency = 3;
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
          setActiveTab(items[idx]?.targetPlatform || targetPlatform);
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
              setActiveTab(platform);
              localStorage.setItem("mstock_target_platform", platform);
            }}
          >
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
            Settings ({activeProvider === "agnes" ? "Agnes AI" : activeProvider === "openrouter" ? "OpenRouter" : activeProvider === "mistral" ? "Mistral" : activeProvider === "deepseek" ? "DeepSeek" : "Gemini"})
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
