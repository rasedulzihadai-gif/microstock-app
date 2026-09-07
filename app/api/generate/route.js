import { SYSTEM_PROMPT } from "../../../lib/prompt";

// Tried in order. If one is overloaded/rate-limited/unavailable, the next
// one is used automatically — the user never has to switch models manually.
const MODEL_FALLBACK_CHAIN = [
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
];

// Only fall through to the next model for transient/capacity errors.
// A bad API key (401/403) or a bad request (400) should fail immediately —
// retrying with another model won't fix those.
function isRetryableStatus(status) {
  return status === 429 || status === 503 || status >= 500;
}

async function callModel(modelId, apiKey, systemPrompt, userText, mimeType, imageBase64) {
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
      generationConfig: { temperature: 0.4 },
    }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function POST(req) {
  const apiKey = req.headers.get("x-provider-key");
  if (!apiKey) {
    return Response.json(
      { error: "Missing API key. Add your Gemini key in Settings first." },
      { status: 400 }
    );
  }

  const { imageBase64, mimeType, context } = await req.json();
  if (!imageBase64) {
    return Response.json({ error: "No image provided." }, { status: 400 });
  }

  const userText = context
    ? `Context/theme hint from the user: ${context}. Now analyze this image.`
    : "Analyze this image.";

  let lastError = null;
  let lastStatus = 500;

  for (let i = 0; i < MODEL_FALLBACK_CHAIN.length; i++) {
    const modelId = MODEL_FALLBACK_CHAIN[i];
    try {
      const { ok, status, data } = await callModel(
        modelId, apiKey, SYSTEM_PROMPT, userText, mimeType, imageBase64
      );

      if (!ok) {
        lastError = data?.error?.message || `${modelId} request failed.`;
        lastStatus = status === 400 ? 401 : status; // treat bad key as 401-ish
        // Bad key / bad request: stop immediately, no point trying other models.
        if (!isRetryableStatus(status)) {
          return Response.json(
            { error: lastError, modelTried: modelId },
            { status: lastStatus }
          );
        }
        // Otherwise (overloaded/rate-limited): fall through to next model.
        continue;
      }

      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = rawText.replace(/```json|```/g, "").trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        lastError = "Model returned invalid JSON.";
        lastStatus = 502;
        continue; // try next model on malformed output too
      }

      // Success — tell the frontend which model actually answered, and
      // whether a fallback happened, so the UI can show it if useful.
      return Response.json({
        ...parsed,
        _meta: { modelUsed: modelId, fellBack: i > 0 },
      });
    } catch (err) {
      lastError = String(err);
      lastStatus = 500;
      continue;
    }
  }

  // All models in the chain failed.
  return Response.json(
    { error: `All models unavailable. Last error: ${lastError}` },
    { status: lastStatus }
  );
}
