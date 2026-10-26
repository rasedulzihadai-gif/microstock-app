import {
  ALL_PLATFORMS_KEY,
  PLATFORM_KEYS,
  buildPlatformPrompt,
  FALLBACK_REMINDER,
  isSupportedTargetPlatform,
} from "../../../lib/prompt";
import { enforceOutputRules } from "../../../lib/enforce-rules";
import {
  DEFAULT_OLLAMA_CLOUD_MODEL,
  DEFAULT_OLLAMA_MODEL,
  OLLAMA_CLOUD_BASE_URL,
  getOllamaApiUrl,
  normalizeOllamaBaseUrl,
} from "../../../lib/ollama";

export const maxDuration = 60;

// A model can answer with technically valid JSON while leaving the metadata
// empty ({} , {"platforms":{}} , blank strings). Accepting that would hand the
// contributor silently blank titles, zero keywords and empty CSV rows, so each
// requested marketplace block has to carry at least a real title and a handful
// of keywords before a response counts as a success. The bar is deliberately
// low: it exists to reject broken output, not to second-guess a complete answer
// and spend another paid API call on it.
const MIN_TITLE_LENGTH = 15;
const MIN_KEYWORDS = 5;

const PROVIDER_FALLBACK_CHAINS = {
  gemini: [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-3.1-flash-lite",
  ],
  deepseek: [
    "deepseek-flash",
    "deepseek-chat",
    "deepseek-v4-flash-vision-exp",
  ],
  mistral: [
    "pixtral-12b-2409",
    "pixtral-large-latest",
    "pixtral-12b",
  ],
  openrouter: [
    "google/gemini-2.5-flash",
    "openai/gpt-4.1-mini",
    "qwen/qwen2.5-vl-72b-instruct",
  ],
  agnes: [
    "agnes-3.0-flash",
    "agnes-2.5-pro",
    "agnes-2.5-flash",
  ],
  chutes: [
    "Qwen/Qwen3.6-27B-TEE",
    "google/gemma-4-31B-turbo-TEE",
    "moonshotai/Kimi-K2.6-TEE",
  ],
  huggingface: [
    "Qwen/Qwen2.5-VL-32B-Instruct",
    "meta-llama/Llama-3.2-11B-Vision-Instruct",
    "Qwen/Qwen2.5-VL-7B-Instruct",
  ],
  llm7: [
    "gpt-5.5",
    "gemini-3.1-flash-lite",
    "claude-sonnet-4-5",
  ],
  // Ollama starts with the model selected in Settings, then automatically
  // tries the vision-capable fallbacks below when that model is unavailable.
  ollama: ["llama3.2-vision", "qwen2.5vl:7b", "gemma3:4b", "llava:latest"],
  ollama_cloud: ["gemma4:31b", "qwen3-vl:32b", "llama3.2-vision"],
};

async function callGemini(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: userText },
            { inline_data: { mime_type: mimeType || "image/jpeg", data: imageBase64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.35 },
    }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function callDeepSeek(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64) {
  const url = "https://api.deepseek.com/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.35,
    }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function callOpenRouter(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://microstock-metadata.app",
      "X-Title": "Microstock Metadata App",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}` } },
        ] },
      ],
      response_format: { type: "json_object" },
      temperature: 0.35,
    }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function callChutes(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64) {
  const res = await fetch("https://llm.chutes.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      temperature: 0.35,
      max_tokens: 4096,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function callHuggingFace(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64) {
  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      temperature: 0.35,
      max_tokens: 4096,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function callLLM7(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64) {
  const res = await fetch("https://api.llm7.io/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // LLM7.io accepts the literal string "unused" for anonymous, lower-rate access.
      Authorization: `Bearer ${apiKey || "unused"}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      temperature: 0.35,
      max_tokens: 4096,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function callAgnes(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64) {
  const res = await fetch("https://apihub.agnes-ai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}` } },
          ],
        },
      ],
      temperature: 0.35,
      max_tokens: 4096,
    }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function callOllama(modelId, baseUrl, systemPrompt, userText, imageBase64, apiKey = "") {
  const res = await fetch(getOllamaApiUrl(baseUrl, "/api/chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: modelId,
      stream: false,
      // Ollama's JSON mode helps keep the result parseable while the prompt
      // specifies the schema and still works with vision-capable local models.
      format: "json",
      options: { temperature: 0.35 },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: userText,
          // The native Ollama API expects raw base64 image data, not a data URL.
          images: [imageBase64],
        },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function callMistral(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64) {
  const url = "https://api.mistral.ai/v1/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.35,
    }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

/**
 * The browser sends a JPEG either of the photo itself or of a rendered vector
 * document. Without this note a model happily describes a rasterised Illustrator
 * artboard as "a photograph", which is a relevance error on every marketplace.
 */
function buildSourceHint(source) {
  if (!source || typeof source !== "object" || source.kind !== "vector") return "";

  const label = String(source.label || "vector").slice(0, 40);
  const details = [];
  if (source.previewMethod === "pdf") {
    details.push("The preview is rendered from the file's embedded PDF, so it reflects the artwork accurately.");
  } else if (source.previewMethod) {
    details.push("The preview comes from the file's built-in thumbnail, so softness, missing fonts or compression artifacts are rendering limits rather than design choices.");
  }
  if (Number(source.pages) > 1) {
    details.push(`The document holds ${Number(source.pages)} artboards/pages; describe only the first one.`);
  }

  return [
    `Source file: an Adobe ${label} vector document, not a camera photograph.`,
    "Describe the artwork as vector art, illustration, background, template, pattern or design as appropriate; never call it a photo, photograph, shot or capture.",
    ...details,
  ].join(" ");
}

function extractResponseText(provider, data) {
  if (provider === "gemini") {
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
  if (provider === "ollama" || provider === "ollama_cloud") {
    return data?.message?.content || "";
  }
  return data?.choices?.[0]?.message?.content || "";
}

function cleanJsonText(raw) {
  if (!raw) return "";
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return text.trim();
}

/** The marketplace blocks a response must contain for the requested target. */
function requestedPlatformKeys(targetPlatform) {
  return targetPlatform === ALL_PLATFORMS_KEY ? PLATFORM_KEYS : [targetPlatform];
}

function isBlockUsable(block) {
  return Boolean(
    block
    && String(block.title || "").trim().length >= MIN_TITLE_LENGTH
    && Array.isArray(block.keywords)
    && block.keywords.length >= MIN_KEYWORDS
  );
}

/**
 * Reports which requested marketplace blocks are missing or too thin to be
 * worth exporting. Empty array means the response is complete.
 */
function findMetadataGaps(enforced, platformKeys) {
  const gaps = [];
  for (const key of platformKeys) {
    const block = enforced?.platforms?.[key];
    if (!block || !String(block.title || "").trim()) {
      gaps.push(`${key}: no title`);
      continue;
    }
    if (String(block.title).trim().length < MIN_TITLE_LENGTH) {
      gaps.push(`${key}: title too short`);
      continue;
    }
    const count = Array.isArray(block.keywords) ? block.keywords.length : 0;
    if (count < MIN_KEYWORDS) {
      gaps.push(`${key}: ${count} of ${MIN_KEYWORDS} keywords`);
    }
  }
  return gaps;
}

/** Human-readable note shown in the app when only part of the data is usable. */
function partialWarning(gaps) {
  const names = gaps.map((gap) => gap.split(":")[0]).join(", ");
  return `Incomplete metadata for ${names}. Regenerate this image, or add titles and keywords by hand before exporting.`;
}

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const headerProvider = req.headers.get("x-provider");
  const headerKey = req.headers.get("x-provider-key");
  const headerOllamaBaseUrl = req.headers.get("x-ollama-base-url");
  const headerOllamaModel = req.headers.get("x-ollama-model");

  let provider = (headerProvider || body.provider || "gemini").toLowerCase();
  if (!PROVIDER_FALLBACK_CHAINS[provider]) {
    provider = "gemini";
  }

  const apiKey = String(headerKey || body.apiKey || "").trim();
  const isLocalOllama = provider === "ollama";
  const isOllamaCloud = provider === "ollama_cloud";
  let ollamaBaseUrl;
  let ollamaModel;

  if (isLocalOllama || isOllamaCloud) {
    if (isLocalOllama) {
      try {
        ollamaBaseUrl = normalizeOllamaBaseUrl(headerOllamaBaseUrl || body.ollamaBaseUrl);
      } catch (err) {
        return Response.json({ error: String(err.message || err) }, { status: 400 });
      }
    } else {
      // Keep direct cloud requests pinned to Ollama's official host. Unlike
      // local Ollama, this provider always requires bearer authentication.
      ollamaBaseUrl = OLLAMA_CLOUD_BASE_URL;
      if (!apiKey) {
        return Response.json(
          { error: "Missing API key. Add your Ollama Cloud API key in Settings first." },
          { status: 400 }
        );
      }
    }

    const defaultModel = isOllamaCloud ? DEFAULT_OLLAMA_CLOUD_MODEL : DEFAULT_OLLAMA_MODEL;
    ollamaModel = String(headerOllamaModel || body.ollamaModel || defaultModel).trim();
    if (!ollamaModel) {
      return Response.json(
        { error: `Choose an Ollama ${isOllamaCloud ? "Cloud " : ""}vision model in Settings first.` },
        { status: 400 }
      );
    }
  } else if (!apiKey && provider !== "llm7") {
    // LLM7.io supports anonymous access with the literal key "unused", so it is
    // exempt from this requirement (see the fallback default in callLLM7).
    const providerName = provider === "agnes"
      ? "Agnes AI"
      : provider === "openrouter"
        ? "OpenRouter"
        : provider === "mistral"
          ? "Mistral"
          : provider === "deepseek"
            ? "DeepSeek"
            : provider === "chutes"
              ? "Chutes.ai"
              : provider === "huggingface"
                ? "Hugging Face"
                : "Gemini";
    return Response.json(
      { error: `Missing API key. Add your ${providerName} API key in Settings first.` },
      { status: 400 }
    );
  }

  const { imageBase64, mimeType, context, source } = body;
  const targetPlatform = isSupportedTargetPlatform(body.targetPlatform) ? body.targetPlatform : "adobe_stock";
  const systemPrompt = buildPlatformPrompt(targetPlatform);
  if (!imageBase64) {
    return Response.json({ error: "No image provided." }, { status: 400 });
  }

  const sourceHint = buildSourceHint(source);
  const baseUserText = [sourceHint, context ? `Context / Theme hint: ${context}.` : "", "Now analyze this image for stock photography SEO metadata."]
    .filter(Boolean)
    .join(" ");

  // Always put the user's choice first, but do not stop at a dead model.
  // This is especially useful for Ollama, where a model can be configured in
  // the UI but not actually pulled on the machine/account yet.
  const configuredFallbacks = PROVIDER_FALLBACK_CHAINS[provider] || PROVIDER_FALLBACK_CHAINS.gemini;
  const fallbackChain = [...new Set(
    (isLocalOllama || isOllamaCloud ? [ollamaModel, ...configuredFallbacks] : configuredFallbacks)
      .map((model) => String(model || "").trim())
      .filter(Boolean)
  )];
  const platformKeys = requestedPlatformKeys(targetPlatform);
  let lastError = null;
  let lastStatus = 500;
  // Best "usable but incomplete" answer seen so far — returned only when every
  // model in the chain falls short, so one thin block never discards the rest.
  let bestPartial = null;

  for (let i = 0; i < fallbackChain.length; i++) {
    const modelId = fallbackChain[i];
    const userText = i === 0 ? baseUserText : `${baseUserText}\n${FALLBACK_REMINDER}`;

    try {
      let callResult;
      if (provider === "deepseek") {
        callResult = await callDeepSeek(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64);
      } else if (provider === "mistral") {
        callResult = await callMistral(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64);
      } else if (provider === "openrouter") {
        callResult = await callOpenRouter(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64);
      } else if (provider === "agnes") {
        callResult = await callAgnes(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64);
      } else if (provider === "chutes") {
        callResult = await callChutes(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64);
      } else if (provider === "huggingface") {
        callResult = await callHuggingFace(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64);
      } else if (provider === "llm7") {
        callResult = await callLLM7(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64);
      } else if (isLocalOllama || isOllamaCloud) {
        callResult = await callOllama(
          modelId,
          ollamaBaseUrl,
          systemPrompt,
          userText,
          imageBase64,
          isOllamaCloud ? apiKey : ""
        );
      } else {
        callResult = await callGemini(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64);
      }

      const { ok, status, data } = callResult;

      if (!ok) {
        lastError = data?.error?.message || (typeof data?.error === "string" ? data.error : null) || data?.message || `${modelId} request failed (status ${status}).`;
        lastStatus = status === 400 && !isLocalOllama && !isOllamaCloud ? 401 : status;
        // A provider may report an unavailable/invalid model as 400, 404, or
        // 401 rather than a transient 5xx. Keep swiping through the configured
        // model chain for every platform; only return after all candidates fail.
        continue;
      }

      const rawText = extractResponseText(provider, data);
      const cleaned = cleanJsonText(rawText);

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        // Attempt substring JSON extraction if extra text wraps JSON
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
          } catch {
            lastError = "Model returned invalid JSON format.";
            lastStatus = 502;
            continue;
          }
        } else {
          lastError = "Model returned non-JSON response.";
          lastStatus = 502;
          continue;
        }
      }

      const enforced = enforceOutputRules(parsed, targetPlatform);
      const gaps = findMetadataGaps(enforced, platformKeys);

      if (gaps.length === 0) {
        return Response.json({
          ...enforced,
          _meta: {
            provider,
            modelUsed: modelId,
            fellBack: i > 0,
          },
        });
      }

      const usableCount = platformKeys.filter((key) => isBlockUsable(enforced.platforms?.[key])).length;
      if (usableCount > 0 && (!bestPartial || usableCount > bestPartial.usableCount)) {
        bestPartial = { enforced, gaps, usableCount, modelId, fellBack: i > 0 };
      }

      lastError = `${modelId} returned incomplete metadata (${gaps.join("; ")}).`;
      lastStatus = 502;
      continue;
    } catch (err) {
      lastError = String(err.message || err);
      lastStatus = 500;
      continue;
    }
  }

  if (bestPartial) {
    return Response.json({
      ...bestPartial.enforced,
      _meta: {
        provider,
        modelUsed: bestPartial.modelId,
        fellBack: bestPartial.fellBack,
        partial: true,
        warnings: [partialWarning(bestPartial.gaps)],
      },
    });
  }

  return Response.json(
    { error: `All ${provider} models failed. Last error: ${lastError}` },
    { status: lastStatus }
  );
}
