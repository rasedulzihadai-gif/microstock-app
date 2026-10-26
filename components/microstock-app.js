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
import {
  ACCEPTED_FORMATS_HINT,
  isSupportedSourceFile,
  vectorFormatFor,
  vectorFormatLabel,
} from "../lib/file-types";
import { renderVectorPreview } from "../lib/vector-preview";
import { IconAlert, IconRefresh, IconSettings, IconSparkles, IconX } from "./icons";

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

// A file that never fires load or error (corrupt data, unsupported codec)
// would otherwise leave the queue stuck on "Working" forever.
const IMAGE_DECODE_TIMEOUT_MS = 20000;
const UNSUPPORTED_IMAGE_HINT =
  "Formats such as TIFF, RAW or PSD cannot be read by the browser — convert the file to JPG, PNG or WEBP, or add the Illustrator (.ai), PDF or SVG source instead.";
// Resolution the vector artwork is rasterised at: enough detail for the vision
// model and a crisp inspector thumbnail without ballooning the request.
const VECTOR_PREVIEW_MAX_DIM = 1400;
// Rasterising a 40 MB .ai file is real CPU work, so previews are prepared two
// at a time rather than all at once.
const VECTOR_PREVIEW_CONCURRENCY = 2;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error(`Could not read ${file.name}. The file may be corrupted or was moved.`));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscales an image to JPEG for analysis. Always settles: unreadable files,
 * decode errors, canvas failures and stalls all reject with a message the user
 * can act on, instead of hanging the batch.
 */
function resizeImage(file, maxDim = 1400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    let settled = false;

    const timer = setTimeout(() => {
      fail(`Timed out while reading ${file.name}. The file may be corrupt or in a format the browser cannot decode. ${UNSUPPORTED_IMAGE_HINT}`);
    }, IMAGE_DECODE_TIMEOUT_MS);

    function finish(error, blob) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(new Error(error));
      else resolve(new File([blob], file.name, { type: "image/jpeg" }));
    }

    function fail(message) {
      finish(message);
    }

    reader.onerror = () => fail(`Could not read ${file.name}. The file may be corrupted or was moved.`);
    reader.onload = (e) => {
      img.onerror = () => fail(`Could not decode ${file.name} in this browser. ${UNSUPPORTED_IMAGE_HINT}`);
      img.onload = () => {
        try {
          let { width, height } = img;
          if (!width || !height) {
            fail(`Could not read the dimensions of ${file.name}. ${UNSUPPORTED_IMAGE_HINT}`);
            return;
          }
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            fail(`Could not prepare ${file.name} for analysis in this browser.`);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                fail(`Could not compress ${file.name}. The image may be too large to process — try a smaller copy.`);
                return;
              }
              finish(null, blob);
            },
            "image/jpeg",
            0.88
          );
        } catch (err) {
          fail(`Could not process ${file.name}: ${String(err?.message || err)}`);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Turns a bare HTTP status into a message that tells the user what to do. */
function describeHttpError(status) {
  if (status === 401 || status === 403) return "The AI provider rejected this API key. Check it in Settings and test the connection.";
  if (status === 404) return "The AI provider could not find that model. Pick a different model in Settings.";
  if (status === 413) return "This image is too large to upload. Export a smaller copy and try again.";
  if (status === 429) return "The AI provider rate limit was reached. Wait a moment, then generate again.";
  if (status >= 500) return `The generation service failed (HTTP ${status}). Try again in a moment.`;
  return `Generation failed (HTTP ${status}).`;
}

export default function MicrostockApp() {
  const [activeProvider, setActiveProvider] = useState("gemini");
  const [apiKeys, setApiKeys] = useState({
    gemini: "",
    deepseek: "",
    mistral: "",
    openrouter: "",
    agnes: "",
    chutes: "",
    huggingface: "",
    llm7: "",
    ollama: "",
    ollama_cloud: "",
  });
  const [keyStatuses, setKeyStatuses] = useState({
    gemini: "not-set",
    deepseek: "not-set",
    mistral: "not-set",
    openrouter: "not-set",
    agnes: "not-set",
    chutes: "not-set",
    huggingface: "not-set",
    llm7: "not-set",
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
    chutes: null,
    huggingface: null,
    llm7: null,
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
  const [fileNotice, setFileNotice] = useState(null);
  const fileInputRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // Adobe Illustrator / EPS / PDF / SVG files are rasterised before analysis.
  // The rendered JPEG and its metadata are cached per queue item so a retry or
  // a batch run never renders the same artwork twice.
  const preparedRef = useRef(new Map());
  const prepareQueueRef = useRef([]);
  const prepareWorkersRef = useRef(0);
  // A tiny SVG can render before React has committed the queue row it belongs
  // to. Those patches wait here and are applied as soon as the row exists.
  const pendingPatchesRef = useRef(new Map());
  // Files removed from the queue should not finish a render the user no longer
  // wants; the id is remembered so an in-flight job can bail out.
  const removedIdsRef = useRef(new Set());

  // A full reload clears the in-memory image queue and any generated metadata.
  // Let the browser warn before that work is discarded; reloading /app will
  // still return to this workspace rather than the landing page.
  useEffect(() => {
    if (items.length === 0 && !running && !context.trim()) return undefined;

    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [items.length, running, context]);

  // Load saved provider & keys from localStorage on mount
  useEffect(() => {
    const savedProvider = localStorage.getItem("mstock_active_provider") || "gemini";
    setActiveProvider(savedProvider);

    const geminiKey = localStorage.getItem("mstock_key_gemini") || localStorage.getItem("mstock_gemini_key") || "";
    const deepseekKey = localStorage.getItem("mstock_key_deepseek") || "";
    const mistralKey = localStorage.getItem("mstock_key_mistral") || "";
    const openrouterKey = localStorage.getItem("mstock_key_openrouter") || "";
    const agnesKey = localStorage.getItem("mstock_key_agnes") || "";
    const chutesKey = localStorage.getItem("mstock_key_chutes") || "";
    const huggingfaceKey = localStorage.getItem("mstock_key_huggingface") || "";
    const llm7Key = localStorage.getItem("mstock_key_llm7") || "";
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
      chutes: chutesKey,
      huggingface: huggingfaceKey,
      llm7: llm7Key,
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
      chutes: chutesKey ? "connected" : "not-set",
      huggingface: huggingfaceKey ? "connected" : "not-set",
      llm7: llm7Key ? "connected" : "not-set",
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
    // LLM7.io works anonymously (key defaults to "unused" server-side), so it's exempt.
    if (isOllama ? !baseUrl || !model : isOllamaCloud ? !key || !model : (!key && providerId !== "llm7")) return;

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

  /**
   * Queues a vector source for rasterisation. Returns a promise that resolves
   * with { file, preview } — the JPEG the AI model analyzes plus the details of
   * how it was produced. Repeated calls for the same item share one render.
   */
  function prepareVectorItem(item) {
    const existing = preparedRef.current.get(item.id);
    if (existing?.promise) return existing.promise;

    let resolveJob;
    let rejectJob;
    const promise = new Promise((resolve, reject) => {
      resolveJob = resolve;
      rejectJob = reject;
    });
    // Nobody may ever await this promise (the user can remove the file or never
    // press Generate), so keep the rejection from surfacing as an unhandled one.
    promise.catch(() => {});

    preparedRef.current.set(item.id, { promise });
    prepareQueueRef.current.push({ item, resolve: resolveJob, reject: rejectJob });
    runPrepareQueue();
    return promise;
  }

  function runPrepareQueue() {
    while (prepareWorkersRef.current < VECTOR_PREVIEW_CONCURRENCY && prepareQueueRef.current.length > 0) {
      const job = prepareQueueRef.current.shift();
      prepareWorkersRef.current += 1;

      const isGone = () => removedIdsRef.current.has(job.item.id);

      (async () => {
        try {
          if (isGone()) throw new Error("This file was removed from the queue.");
          const preview = await renderVectorPreview(job.item.file, { maxDim: VECTOR_PREVIEW_MAX_DIM });
          const analysisFile = new File(
            [preview.blob],
            `${job.item.filename.replace(/\.[^.]+$/, "") || job.item.filename}.jpg`,
            { type: "image/jpeg" }
          );
          const previewUrl = URL.createObjectURL(preview.blob);
          if (isGone()) {
            // The row disappeared while the artwork was rendering.
            URL.revokeObjectURL(previewUrl);
            job.reject(new Error("This file was removed from the queue."));
            return;
          }
          const entry = preparedRef.current.get(job.item.id);

          preparedRef.current.set(job.item.id, {
            promise: entry?.promise,
            file: analysisFile,
            preview,
          });
          updateItem(job.item.id, {
            previewUrl,
            previewState: "ready",
            previewError: null,
            sourceMeta: {
              method: preview.method,
              pages: preview.pages ?? null,
              width: preview.width,
              height: preview.height,
              notes: preview.notes || [],
              meta: preview.meta || null,
            },
          });
          job.resolve({ file: analysisFile, preview });
        } catch (err) {
          const message = String(err?.message || err);
          if (!isGone()) {
            const entry = preparedRef.current.get(job.item.id);
            preparedRef.current.set(job.item.id, { promise: entry?.promise, error: message });
            updateItem(job.item.id, { previewState: "failed", previewError: message });
          }
          job.reject(new Error(message));
        } finally {
          prepareWorkersRef.current -= 1;
          runPrepareQueue();
        }
      })();
    }
  }

  /** The JPEG handed to the vision model: resized raster, or rendered vector. */
  async function analysisFileFor(itemId, item) {
    if (item.kind !== "vector") return resizeImage(item.file);

    const entry = preparedRef.current.get(itemId);
    if (entry?.file) return entry.file;
    // A failed render is retried on demand (Regenerate / Generate again).
    if (entry?.error) preparedRef.current.delete(itemId);

    const { file } = await prepareVectorItem(item);
    return file;
  }

  function handleFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;

    const files = incoming.filter(isSupportedSourceFile);
    const skipped = incoming.filter((file) => !isSupportedSourceFile(file));

    // Never drop files without saying so: an unsupported format used to look
    // like a dead drop area.
    setFileNotice(
      skipped.length
        ? `Skipped ${skipped.length} file${skipped.length > 1 ? "s" : ""} that ${skipped.length > 1 ? "are" : "is"} not supported: ${skipped
          .slice(0, 4)
          .map((file) => file.name)
          .join(", ")}${skipped.length > 4 ? ` +${skipped.length - 4} more` : ""}. Add ${ACCEPTED_FORMATS_HINT} files instead.`
        : null
    );

    if (files.length === 0) return;

    // Object URLs are lightweight and thumbnails are virtualized in the queue,
    // so dropping a large folder does not trigger hundreds of image decodes.
    // Vector sources have no browser-decodable bitmap: their thumbnail appears
    // once the artwork has been rendered.
    const newItems = files.map((file) => {
      const format = vectorFormatFor(file);
      const kind = format ? "vector" : "raster";
      return {
        id: createQueueItemId(),
        filename: file.name,
        file,
        kind,
        format: format || null,
        previewUrl: kind === "raster" ? URL.createObjectURL(file) : null,
        previewState: kind === "raster" ? "ready" : "loading",
        previewError: null,
        sourceMeta: null,
        status: "pending",
        result: null,
        error: null,
      };
    });

    const shouldFocusFirstItem = activeIndex === null;
    const firstNewIndex = itemsRef.current.length;

    // Keep the file-picker interaction responsive when a large batch is added.
    startTransition(() => {
      setItems((prev) => [...prev, ...newItems]);
    });
    // Selection lives outside the updater above: updaters must stay pure so
    // React can call them again during a re-render.
    if (shouldFocusFirstItem) setActiveIndex(firstNewIndex);

    // Render vector previews immediately instead of waiting for Generate, so the
    // artboard is visible while the user is still reviewing the queue.
    newItems.filter((it) => it.kind === "vector").forEach((it) => prepareVectorItem(it));
  }

  function removeItem(index) {
    setItems((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      if (target?.id) {
        preparedRef.current.delete(target.id);
        removedIdsRef.current.add(target.id);
      }
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

  /**
   * Patches a queue item by id. Indices shift whenever a file is added or
   * removed, so a batch started seconds ago must never write through a stale
   * index — that used to attach one image's metadata to another image.
   */
  function updateItem(itemId, patch) {
    if (!itemsRef.current.some((it) => it.id === itemId)) {
      pendingPatchesRef.current.set(itemId, { ...(pendingPatchesRef.current.get(itemId) || {}), ...patch });
      return;
    }
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  }

  // Flush patches that were produced before their queue row was rendered.
  useEffect(() => {
    if (pendingPatchesRef.current.size === 0) return;
    const patches = pendingPatchesRef.current;
    pendingPatchesRef.current = new Map();
    setItems((prev) =>
      prev.map((it) => (patches.has(it.id) ? { ...it, ...patches.get(it.id) } : it))
    );
  }, [items]);

  async function processOne(itemId) {
    const target = itemsRef.current.find((it) => it.id === itemId);
    if (!target) return; // Removed from the queue while it was waiting.

    const currentKey = apiKeys[activeProvider]?.trim();
    const isOllama = activeProvider === "ollama";
    const isOllamaCloud = activeProvider === "ollama_cloud";
    const ollamaBaseUrl = ollamaConfig.baseUrl.trim();
    const ollamaModel = (isOllamaCloud ? ollamaCloudModel : ollamaConfig.model).trim();
    // LLM7.io works anonymously (key defaults to "unused" server-side), so it's exempt.
    if (isOllama ? !ollamaBaseUrl || !ollamaModel : isOllamaCloud ? !currentKey || !ollamaModel : (!currentKey && activeProvider !== "llm7")) {
      setShowSettings(true);
      return;
    }

    updateItem(itemId, { status: "processing", error: null });

    try {
      // Raster images are downscaled here; Illustrator/PDF/SVG sources arrive as
      // an already-rendered JPEG produced by the preparation queue.
      const analysisFile = await analysisFileFor(itemId, target);
      const base64 = await fileToBase64(analysisFile);
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
          // Tells the model whether it is looking at a photograph or at the
          // rasterised first page of a vector/document source.
          source:
            target.kind === "vector"
              ? {
                kind: "vector",
                format: target.format,
                label: vectorFormatLabel(target.format),
                previewMethod: target.sourceMeta?.method || null,
                pages: target.sourceMeta?.pages ?? null,
              }
              : { kind: "raster" },
        }),
      });

      // A crashed or timed-out function can answer with an HTML/plain-text
      // error page, so never assume the body is JSON.
      const rawBody = await res.text();
      let data = null;
      try {
        data = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        data = null;
      }

      if (!res.ok || !data || typeof data !== "object") {
        throw new Error(data?.error || describeHttpError(res.status));
      }

      updateItem(itemId, { status: "done", result: data, targetPlatform, error: null });
    } catch (err) {
      updateItem(itemId, { status: "error", error: String(err?.message || err) });
    }
  }

  async function runBatch() {
    const currentKey = apiKeys[activeProvider]?.trim();
    const isOllama = activeProvider === "ollama";
    const isOllamaCloud = activeProvider === "ollama_cloud";
    const ollamaReady = Boolean(ollamaConfig.baseUrl.trim() && ollamaConfig.model.trim());
    const ollamaCloudReady = Boolean(currentKey && ollamaCloudModel.trim());
    // LLM7.io works anonymously (key defaults to "unused" server-side), so it's exempt.
    if (isOllama ? !ollamaReady : isOllamaCloud ? !ollamaCloudReady : (!currentKey && activeProvider !== "llm7")) {
      setShowSettings(true);
      return;
    }

    setRunning(true);
    // Resizing several large photos at once can freeze the browser. Two workers
    // balance throughput with responsiveness, especially on laptops.
    const concurrency = Math.max(1, Math.min(2, Math.floor((navigator.hardwareConcurrency || 4) / 2)));
    let cursor = 0;
    const pendingIds = items
      .filter((it) => it.status === "pending" || it.status === "error")
      .map((it) => it.id);

    async function runner() {
      while (cursor < pendingIds.length) {
        const id = pendingIds[cursor++];
        await processOne(id);
      }
    }

    try {
      await Promise.all(Array.from({ length: concurrency }, runner));
    } finally {
      // Whatever happens to a single image, the queue must never stay locked
      // on "Generating…".
      setRunning(false);
    }
  }

  function removeKeyword(itemId, platformKey, keywordIndex) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId || !it.result?.platforms?.[platformKey]) return it;
        const keywords = it.result.platforms[platformKey].keywords.filter((_, i) => i !== keywordIndex);
        return {
          ...it,
          result: {
            ...it.result,
            platforms: {
              ...it.result.platforms,
              [platformKey]: { ...it.result.platforms[platformKey], keywords },
            },
          },
        };
      })
    );
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
        accept="image/*,.ai,.ait,.pdf,.svg,.eps,.epsf,.ps"
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
          <button
            type="button"
            className="btn btn--ghost topbar__refresh"
            onClick={() => window.location.reload()}
            aria-label="Refresh workspace"
            title="Refresh workspace"
          >
            <IconRefresh width={14} height={14} />
            <span>Refresh</span>
          </button>
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
          {fileNotice && (
            <div className="notice notice--warn content__notice" role="status">
              <IconAlert width={15} height={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <div className="notice__body">{fileNotice}</div>
              <button
                className="btn btn--subtle btn--icon btn--sm"
                onClick={() => setFileNotice(null)}
                aria-label="Dismiss file notice"
              >
                <IconX width={13} height={13} />
              </button>
            </div>
          )}

          <div className="content__inner" style={{ height: active ? "auto" : "100%" }}>
            {!active && <Dropzone isOver={dragOver} hasItems={items.length > 0} onBrowse={openPicker} />}

            {active && (
              <Inspector
                item={active}
                index={activeIndex}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onRetry={() => processOne(active.id)}
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
