import {
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
  // Ollama providers use the exact model selected in Settings. Local models
  // must be installed; cloud models must be available to the user's account.
  ollama: [],
  ollama_cloud: [],
};

function isRetryableStatus(status) {
  return status === 429 || status === 503 || status === 502 || status === 504 || status >= 500;
}

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

  const { imageBase64, mimeType, context } = body;
  const targetPlatform = isSupportedTargetPlatform(body.targetPlatform) ? body.targetPlatform : "adobe_stock";
  const systemPrompt = buildPlatformPrompt(targetPlatform);
  if (!imageBase64) {
    return Response.json({ error: "No image provided." }, { status: 400 });
  }

  const baseUserText = context
    ? `Context / Theme hint: ${context}. Now analyze this image for stock photography SEO metadata.`
    : "Analyze this image for stock photography SEO metadata.";

  const fallbackChain = isLocalOllama || isOllamaCloud
    ? [ollamaModel]
    : (PROVIDER_FALLBACK_CHAINS[provider] || PROVIDER_FALLBACK_CHAINS.gemini);
  let lastError = null;
  let lastStatus = 500;

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
        if (!isRetryableStatus(status)) {
          return Response.json(
            { error: lastError, provider, modelTried: modelId },
            { status: lastStatus }
          );
        }
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

      return Response.json({
        ...enforced,
        _meta: {
          provider,
          modelUsed: modelId,
          fellBack: i > 0,
        },
      });
    } catch (err) {
      lastError = String(err.message || err);
      lastStatus = 500;
      continue;
    }
  }

  return Response.json(
    { error: `All ${provider} models failed. Last error: ${lastError}` },
    { status: lastStatus }
  );
}
