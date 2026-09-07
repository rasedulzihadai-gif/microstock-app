"use client";
import { useState, useEffect, useRef } from "react";
import { buildAdobeStockCsv, buildShutterstockCsv, buildGenericCsv, downloadCsv } from "../lib/csv";

const PLATFORM_TABS = [
  { key: "adobe_stock", label: "Adobe Stock" },
  { key: "shutterstock", label: "Shutterstock" },
  { key: "istock_getty", label: "iStock / Getty" },
  { key: "freepik_vecteezy", label: "Freepik / Vecteezy" },
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Resize large images client-side before sending, for speed + smaller payload
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
          (blob) => {
            const resizedFile = new File([blob], file.name, { type: "image/jpeg" });
            resolve(resizedFile);
          },
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
  const [keyStatus, setKeyStatus] = useState("Not set");
  const [context, setContext] = useState("");
  const [items, setItems] = useState([]); // {filename, file, status, result, error}
  const [activeTab, setActiveTab] = useState("adobe_stock");
  const [running, setRunning] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("mstock_gemini_key");
    if (saved) {
      setApiKey(saved);
      setKeyStatus("Connected");
    }
  }, []);

  function saveKey() {
    localStorage.setItem("mstock_gemini_key", apiKey);
    setKeyStatus(apiKey ? "Connected" : "Not set");
    setShowSettings(false);
  }

  function clearKey() {
    localStorage.removeItem("mstock_gemini_key");
    setApiKey("");
    setKeyStatus("Not set");
  }

  async function testConnection() {
    setKeyStatus("Testing...");
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      setKeyStatus(res.ok ? "Connected" : "Invalid key");
    } catch {
      setKeyStatus("Invalid key");
    }
  }

  function handleFiles(fileList) {
    const newItems = Array.from(fileList).map((file) => ({
      filename: file.name,
      file,
      status: "pending",
      result: null,
      error: null,
    }));
    setItems((prev) => [...prev, ...newItems]);
  }

  async function processOne(item, index) {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], status: "processing" };
      return copy;
    });
    try {
      const resized = await resizeImage(item.file);
      const base64 = await fileToBase64(resized);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Provider-Key": apiKey },
        body: JSON.stringify({ imageBase64: base64, mimeType: "image/jpeg", context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setItems((prev) => {
        const copy = [...prev];
        copy[index] = { ...copy[index], status: "done", result: data };
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
        const { it, idx } = pending[cursor++];
        await processOne(it, idx);
      }
    }
    await Promise.all(Array.from({ length: concurrency }, runner));
    setRunning(false);
  }

  const doneItems = items.filter((it) => it.status === "done");

  function exportCsv(platform) {
    let csv, name;
    if (platform === "adobe_stock") {
      csv = buildAdobeStockCsv(doneItems);
      name = "adobe_stock.csv";
    } else if (platform === "shutterstock") {
      csv = buildShutterstockCsv(doneItems);
      name = "shutterstock.csv";
    } else {
      csv = buildGenericCsv(doneItems, platform);
      name = `${platform}.csv`;
    }
    downloadCsv(csv, name);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22 }}>Microstock Metadata Generator</h1>
        <button onClick={() => setShowSettings(true)} style={btnStyle}>
          ⚙ Settings ({keyStatus})
        </button>
      </div>

      {showSettings && (
        <div style={panelStyle}>
          <h3>Gemini API Key</h3>
          <p style={{ fontSize: 13, opacity: 0.7 }}>
            Get it from aistudio.google.com/app/apikey. Stored only in your browser.
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIza..."
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={saveKey} style={btnStyle}>Save</button>
            <button onClick={testConnection} style={btnStyle}>Test Connection</button>
            <button onClick={clearKey} style={btnStyle}>Clear</button>
            <button onClick={() => setShowSettings(false)} style={btnStyle}>Close</button>
          </div>
        </div>
      )}

      <div style={panelStyle}>
        <label style={{ fontSize: 13, opacity: 0.8 }}>Optional context/theme (helps accuracy)</label>
        <input
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder='e.g. "corporate", "wedding", "nature/travel"'
          style={inputStyle}
        />
      </div>

      <div style={panelStyle}>
        <input
          type="file"
          multiple
          accept="image/*"
          ref={fileInputRef}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div style={{ marginTop: 12 }}>
          <button onClick={runBatch} disabled={running || items.length === 0} style={primaryBtnStyle}>
            {running ? "Generating..." : `Generate for ${items.length} image(s)`}
          </button>
        </div>
      </div>

      <div>
        {items.map((it, idx) => (
          <div key={idx} style={panelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{it.filename}</strong>
              <span style={{ opacity: 0.7 }}>{it.status}</span>
            </div>
            {it.error && <p style={{ color: "#f87171" }}>{it.error}</p>}
            {it.result && (
              <div>
                <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
                  {PLATFORM_TABS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setActiveTab(t.key)}
                      style={activeTab === t.key ? activeTabStyle : tabStyle}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <p><b>Title:</b> {it.result.platforms[activeTab]?.title}</p>
                <p><b>Keywords ({it.result.platforms[activeTab]?.keywords.length}):</b> {it.result.platforms[activeTab]?.keywords.join(", ")}</p>
                {it.result.flags?.length > 0 && (
                  <p style={{ color: "#fbbf24" }}>⚠ {it.result.flags.join(", ")}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {doneItems.length > 0 && (
        <div style={panelStyle}>
          <h3>Export CSV</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => exportCsv("adobe_stock")} style={btnStyle}>Adobe Stock CSV</button>
            <button onClick={() => exportCsv("shutterstock")} style={btnStyle}>Shutterstock CSV</button>
            <button onClick={() => exportCsv("istock_getty")} style={btnStyle}>iStock CSV</button>
            <button onClick={() => exportCsv("freepik_vecteezy")} style={btnStyle}>Freepik CSV</button>
          </div>
        </div>
      )}
    </div>
  );
}

const panelStyle = {
  background: "#161b26",
  border: "1px solid #262c3a",
  borderRadius: 10,
  padding: 16,
  marginTop: 16,
};
const btnStyle = {
  background: "#1f2634",
  color: "#e6e6e6",
  border: "1px solid #333c4d",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
};
const primaryBtnStyle = { ...btnStyle, background: "#f97316", border: "none", color: "#111" };
const inputStyle = {
  width: "100%",
  padding: 10,
  marginTop: 6,
  background: "#0b0e14",
  border: "1px solid #333c4d",
  borderRadius: 8,
  color: "#e6e6e6",
};
const tabStyle = { ...btnStyle, padding: "6px 10px", fontSize: 13 };
const activeTabStyle = { ...tabStyle, background: "#f97316", color: "#111", border: "none" };
