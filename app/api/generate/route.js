import { buildPlatformPrompt, FALLBACK_REMINDER, PLATFORM_NAMES } from "../../../lib/prompt";
import { enforceOutputRules } from "../../../lib/enforce-rules";

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

  let provider = (headerProvider || body.provider || "gemini").toLowerCase();
  if (!PROVIDER_FALLBACK_CHAINS[provider]) {
    provider = "gemini";
  }

  const apiKey = headerKey || body.apiKey;
  if (!apiKey) {
    const providerName = provider === "agnes" ? "Agnes AI" : provider === "openrouter" ? "OpenRouter" : provider === "mistral" ? "Mistral" : provider === "deepseek" ? "DeepSeek" : "Gemini";
    return Response.json(
      { error: `Missing API key. Add your ${providerName} API key in Settings first.` },
      { status: 400 }
    );
  }

  const { imageBase64, mimeType, context } = body;
  const targetPlatform = PLATFORM_NAMES[body.targetPlatform] ? body.targetPlatform : "adobe_stock";
  const systemPrompt = buildPlatformPrompt(targetPlatform);
  if (!imageBase64) {
    return Response.json({ error: "No image provided." }, { status: 400 });
  }

  const baseUserText = context
    ? `Context / Theme hint: ${context}. Now analyze this image for stock photography SEO metadata.`
    : "Analyze this image for stock photography SEO metadata.";

  const fallbackChain = PROVIDER_FALLBACK_CHAINS[provider] || PROVIDER_FALLBACK_CHAINS.gemini;
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
      } else {
        callResult = await callGemini(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64);
      }

      const { ok, status, data } = callResult;

      if (!ok) {
        lastError = data?.error?.message || data?.message || `${modelId} request failed (status ${status}).`;
        lastStatus = status === 400 ? 401 : status;
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
