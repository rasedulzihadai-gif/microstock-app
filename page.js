"use client";
import { useState, useEffect, useRef } from "react";
import { buildAdobeStockCsv, buildShutterstockCsv, buildFreepikCsv, buildIstockGettyCsv, downloadCsv } from "../lib/csv";

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

function StatusDot({ status }) {
  const color =
    status === "done" ? "var(--teal)" :
    status === "error" ? "var(--red)" :
    status === "processing" ? "var(--amber)" : "var(--text-faint)";
  const label =
    status === "done" ? "Ready" :
    status === "error" ? "Failed" :
    status === "processing" ? "Working" : "Queued";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)" }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: color,
        boxShadow: status === "processing" ? `0 0 0 3px ${color}22` : "none",
      }} />
      {label}
    </span>
  );
}

function KeywordChip({ text, onRemove }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontFamily: "var(--font-mono)", fontSize: 12,
      background: "var(--panel-raised)", border: "1px solid var(--border)",
      borderRadius: 4, padding: "4px 8px", color: "var(--text)",
    }}>
      {text}
      <button
        onClick={onRemove}
        aria-label={`Remove ${text}`}
        style={{
          background: "none", border: "none", color: "var(--text-faint)",
          cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0,
        }}
      >
        ×
      </button>
    </span>
  );
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
    const newItems = Array.from(fileList).map((file) => ({
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

  // Revoke object URLs when the component unmounts, to avoid leaking memory
  // over a long batch session.
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
    };
  }, []);

  async function processOne(index) {
    // Clear any previous error the instant a new attempt starts —
    // fixes the "stale error stays visible after a later success" bug.
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
    else if (platform === "freepik_vecteezy") { csv = buildFreepikCsv(doneItems); name = "freepik.csv"; }
    else if (platform === "istock_getty") { csv = buildIstockGettyCsv(doneItems); name = "istock_getty.csv"; }
    else { csv = ""; name = `${platform}.csv`; }
    downloadCsv(csv, name);
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside style={{
        width: 220, borderRight: "1px solid var(--border-soft)",
        display: "flex", flexDirection: "column", flexShrink: 0,
      }}>
        <div style={{ padding: "18px 16px 12px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600, letterSpacing: -0.2 }}>
            Lightbox
          </div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
            microstock metadata
          </div>
        </div>

        <div style={{ padding: "0 12px 12px" }}>
          <button onClick={() => fileInputRef.current.click()} style={ghostBtn}>
            + Add images
          </button>
          <input
            ref={fileInputRef} type="file" multiple accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
          {items.length === 0 && (
            <div style={{ padding: "24px 12px", color: "var(--text-faint)", fontSize: 12.5, lineHeight: 1.6 }}>
              No images yet. Add a few to start generating metadata.
            </div>
          )}
          {items.map((it, idx) => (
            <button
              key={idx}
              onClick={() => { setActiveIndex(idx); setActiveTab("adobe_stock"); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "8px", marginBottom: 4, borderRadius: 6,
                background: activeIndex === idx ? "var(--panel-raised)" : "transparent",
                border: activeIndex === idx ? "1px solid var(--border)" : "1px solid transparent",
                cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{
                width: 34, height: 34, borderRadius: 4, background: "var(--panel-raised)",
                flexShrink: 0, overflow: "hidden",
              }}>
                <img
                  src={it.previewUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {it.filename}
                </div>
                <StatusDot status={it.status} />
              </span>
            </button>
          ))}
        </div>

        <div style={{ padding: 12, borderTop: "1px solid var(--border-soft)" }}>
          <button
            onClick={runBatch}
            disabled={running || items.length === 0}
            style={{ ...primaryBtn, width: "100%", opacity: running || items.length === 0 ? 0.5 : 1 }}
          >
            {running ? "Generating…" : "Generate all"}
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 24px", borderBottom: "1px solid var(--border-soft)",
        }}>
          <input
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Optional context — e.g. corporate, wedding, nature/travel"
            style={contextInput}
          />
          <button onClick={() => setShowSettings(true)} style={{ ...ghostBtn, marginLeft: 12, whiteSpace: "nowrap" }}>
            <span style={{
              display: "inline-block", width: 6, height: 6, borderRadius: "50%",
              background: keyStatus === "connected" ? "var(--teal)" : "var(--text-faint)",
              marginRight: 6,
            }} />
            Settings
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {!active && (
            <div style={{
              height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", color: "var(--text-faint)",
            }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--text-dim)", marginBottom: 6 }}>
                Nothing selected
              </div>
              <div style={{ fontSize: 13 }}>Add images on the left, then pick one to inspect.</div>
            </div>
          )}

          {active && (
            <div key={activeIndex} style={{ animation: "rise-in 0.25s ease" }}>
              <div style={{ display: "flex", gap: 16 }}>
                <img
                  src={active.previewUrl}
                  alt={active.filename}
                  style={{
                    width: 160, height: 160, objectFit: "cover", borderRadius: 8,
                    border: "1px solid var(--border-soft)", flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: 0, wordBreak: "break-word" }}>
                      {active.filename}
                    </h2>
                    <StatusDot status={active.status} />
                  </div>

              {active.status === "error" && (
                <div style={{
                  marginTop: 12, padding: 12, borderRadius: 8,
                  background: "#2a1a18", border: "1px solid #4a2b26", color: "var(--red)", fontSize: 13,
                }}>
                  {active.error}
                  <button onClick={() => processOne(activeIndex)} style={{ ...ghostBtn, marginLeft: 12, padding: "4px 10px" }}>
                    Retry
                  </button>
                </div>
              )}

              {active.status === "processing" && (
                <div style={{ marginTop: 20, color: "var(--text-dim)", fontSize: 13 }}>Analyzing image…</div>
              )}
                </div>
              </div>

              {active.result && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
                    {PLATFORM_TABS.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        style={activeTab === t.key ? tabActive : tabInactive}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ marginBottom: 18 }}>
                    <label style={sectionLabel}>Title</label>
                    <div style={{ ...fieldBox, fontFamily: "var(--font-display)", fontSize: 15 }}>
                      {active.result.platforms[activeTab]?.title}
                    </div>
                  </div>

                  <div>
                    <label style={sectionLabel}>
                      Keywords ({active.result.platforms[activeTab]?.keywords.length})
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {active.result.platforms[activeTab]?.keywords.map((kw, i) => (
                        <KeywordChip key={`${kw}-${i}`} text={kw} onRemove={() => removeKeyword(activeIndex, activeTab, i)} />
                      ))}
                    </div>
                  </div>

                  {active.result.flags?.length > 0 && (
                    <div style={{ marginTop: 18, fontSize: 12.5, color: "var(--amber)" }}>
                      ⚠ {active.result.flags.join(", ")}
                    </div>
                  )}

                  {active.result._meta?.fellBack && (
                    <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--text-faint)" }}>
                      Primary model was busy — answered by {active.result._meta.modelUsed} instead.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {doneItems.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border-soft)", padding: "12px 24px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--text-faint)", marginRight: 4 }}>
                Export {doneItems.length} ready:
              </span>
              <button onClick={() => exportCsv("adobe_stock")} style={ghostBtn}>Adobe Stock CSV</button>
              <button onClick={() => exportCsv("shutterstock")} style={ghostBtn}>Shutterstock CSV</button>
              <button onClick={() => exportCsv("istock_getty")} style={ghostBtn}>iStock CSV</button>
              <button onClick={() => exportCsv("freepik_vecteezy")} style={ghostBtn}>Freepik CSV</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
              Note: iStock/Getty validates keywords against their own controlled vocabulary — review that CSV in their submission tool before final upload.
            </div>
          </div>
        )}
      </main>

      {showSettings && (
        <div
          onClick={() => setShowSettings(false)}
          style={{ position: "fixed", inset: 0, background: "#00000066", zIndex: 10 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", right: 0, top: 0, bottom: 0, width: 360,
              background: "var(--panel)", borderLeft: "1px solid var(--border)",
              padding: 24, animation: "rise-in 0.2s ease",
            }}
          >
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginTop: 0 }}>Gemini API key</h3>
            <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
              Get a key at aistudio.google.com/app/apikey. Stored only in this browser — never saved on our servers.
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              style={contextInput}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button onClick={saveKey} style={primaryBtn}>Save</button>
              <button onClick={testConnection} style={ghostBtn}>Test connection</button>
              <button onClick={clearKey} style={ghostBtn}>Clear</button>
            </div>
            <div style={{ marginTop: 10, fontSize: 12.5 }}>
              Status:{" "}
              <StatusDot status={
                keyStatus === "connected" ? "done" :
                keyStatus === "invalid" ? "error" :
                keyStatus === "testing" ? "processing" : "pending"
              } />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ghostBtn = {
  background: "transparent", color: "var(--text-dim)", border: "1px solid var(--border)",
  borderRadius: 6, padding: "7px 12px", cursor: "pointer", fontSize: 12.5,
};
const primaryBtn = {
  background: "var(--amber)", color: "#1a1206", border: "none",
  borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600,
};
const tabActive = {
  background: "var(--panel-raised)", color: "var(--text)", border: "1px solid var(--border)",
  borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12.5,
};
const tabInactive = { ...tabActive, background: "transparent", color: "var(--text-dim)", border: "1px solid transparent" };
const sectionLabel = { fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 0.4 };
const fieldBox = {
  marginTop: 6, padding: "10px 12px", background: "var(--panel)",
  border: "1px solid var(--border-soft)", borderRadius: 6,
};
const contextInput = {
  flex: 1, padding: "9px 12px", background: "var(--bg)",
  border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)",
  fontSize: 13,
};
