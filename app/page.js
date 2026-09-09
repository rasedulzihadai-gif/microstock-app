"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { buildAdobeStockCsv, buildShutterstockCsv, buildGenericCsv, downloadCsv } from "../lib/csv";
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
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [keyStatus, setKeyStatus] = useState("not-set");
  const [context, setContext] = useState("");
  const [items, setItems] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [activeTab, setActiveTab] = useState("adobe_stock");
  const [running, setRunning] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const saved = localStorage.getItem("mstock_gemini_key");
    if (saved) {
      setApiKey(saved);
      setKeyStatus("connected");
    }
  }, []);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
    };
  }, []);

  function saveKey() {
    localStorage.setItem("mstock_gemini_key", apiKey);
    setKeyStatus(apiKey ? "connected" : "not-set");
  }

  function clearKey() {
    localStorage.removeItem("mstock_gemini_key");
    setApiKey("");
    setKeyStatus("not-set");
  }

  async function testConnection() {
    setKeyStatus("testing");
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      setKeyStatus(res.ok ? "connected" : "invalid");
    } catch {
      setKeyStatus("invalid");
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
        headers: { "Content-Type": "application/json", "X-Provider-Key": apiKey },
        body: JSON.stringify({ imageBase64: base64, mimeType: "image/jpeg", context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setItems((prev) => {
        const copy = [...prev];
        copy[index] = { ...copy[index], status: "done", result: data, error: null };
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
    if (!apiKey) {
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
    if (platform === "adobe_stock") { csv = buildAdobeStockCsv(doneItems); name = "adobe_stock.csv"; }
    else if (platform === "shutterstock") { csv = buildShutterstockCsv(doneItems); name = "shutterstock.csv"; }
    else { csv = buildGenericCsv(doneItems, platform); name = `${platform}.csv`; }
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

  return (
    <div className="app">
      <Sidebar
        items={items}
        activeIndex={activeIndex}
        running={running}
        doneCount={doneItems.length}
        onAddClick={openPicker}
        onSelect={(idx) => { setActiveIndex(idx); setActiveTab("adobe_stock"); }}
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
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
      />

      <main className="main" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        <header className="topbar">
          <div className="input-wrap">
            <span className="input-wrap__icon">
              <IconSparkles width={14} height={14} />
            </span>
            <input
              className="input"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Optional context for every image — e.g. corporate, wedding, nature/travel"
              aria-label="Generation context"
            />
          </div>
          <button className="btn btn--ghost" onClick={() => setShowSettings(true)}>
            <span
              className={`status status--${keyStatus === "connected" ? "done" : "pending"}`}
              style={{ gap: 0 }}
            >
              <span className="status__dot" />
            </span>
            <IconSettings width={14} height={14} />
            Settings
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
          />
        )}
      </main>

      {showSettings && (
        <SettingsDrawer
          apiKey={apiKey}
          keyStatus={keyStatus}
          onChangeKey={setApiKey}
          onSave={saveKey}
          onTest={testConnection}
          onClear={clearKey}
          onClose={closeSettings}
        />
      )}
    </div>
  );
}
