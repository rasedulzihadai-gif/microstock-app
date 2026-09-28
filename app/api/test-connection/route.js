import {
  DEFAULT_OLLAMA_MODEL,
  getOllamaApiUrl,
  isOllamaModelAvailable,
  normalizeOllamaBaseUrl,
} from "../../../lib/ollama";

export const maxDuration = 15;

export async function POST(req) {
  try {
    const {
      provider = "gemini",
      apiKey,
      ollamaBaseUrl,
      ollamaModel = DEFAULT_OLLAMA_MODEL,
    } = await req.json();

    if (provider === "ollama") {
      let baseUrl;
      try {
        baseUrl = normalizeOllamaBaseUrl(ollamaBaseUrl);
      } catch (err) {
        return Response.json({ ok: false, error: String(err.message || err) }, { status: 400 });
      }

      const model = String(ollamaModel || "").trim();
      if (!model) {
        return Response.json({ ok: false, error: "Choose an Ollama vision model first." }, { status: 400 });
      }

      const res = await fetch(getOllamaApiUrl(baseUrl, "/api/tags"));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return Response.json(
          { ok: false, error: data?.error || `Ollama connection failed (status ${res.status}).` },
          { status: res.status }
        );
      }

      if (!isOllamaModelAvailable(data?.models, model)) {
        return Response.json(
          {
            ok: false,
            error: `Ollama is reachable, but “${model}” is not installed. Run “ollama pull ${model}” on that server, or enter an installed vision model.`,
          },
          { status: 422 }
        );
      }

      return Response.json({
        ok: true,
        provider: "ollama",
        message: `Ollama connected. ${model} is available.`,
      });
    }

    if (!apiKey || !apiKey.trim()) {
      return Response.json({ ok: false, error: "API key cannot be empty." }, { status: 400 });
    }

    const key = apiKey.trim();

    if (provider === "deepseek") {
      const res = await fetch("https://api.deepseek.com/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return Response.json({ ok: true, provider: "deepseek", message: "DeepSeek API connected successfully." });
      }
      return Response.json(
        { ok: false, error: data?.error?.message || `DeepSeek authentication failed (status ${res.status}).` },
        { status: res.status }
      );
    }

    if (provider === "agnes") {
      const res = await fetch("https://apihub.agnes-ai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return Response.json({ ok: true, provider: "agnes", message: "Agnes AI API connected successfully." });
      }
      return Response.json(
        { ok: false, error: data?.error?.message || data?.message || `Agnes AI authentication failed (status ${res.status}).` },
        { status: res.status }
      );
    }

    if (provider === "openrouter") {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return Response.json({ ok: true, provider: "openrouter", message: "OpenRouter API connected successfully." });
      }
      return Response.json(
        { ok: false, error: data?.error?.message || `OpenRouter authentication failed (status ${res.status}).` },
        { status: res.status }
      );
    }

    if (provider === "mistral") {
      const res = await fetch("https://api.mistral.ai/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return Response.json({ ok: true, provider: "mistral", message: "Mistral API connected successfully." });
      }
      return Response.json(
        { ok: false, error: data?.message || data?.error?.message || `Mistral authentication failed (status ${res.status}).` },
        { status: res.status }
      );
    }

    // Default to Gemini
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return Response.json({ ok: true, provider: "gemini", message: "Gemini API connected successfully." });
    }
    return Response.json(
      { ok: false, error: data?.error?.message || `Gemini authentication failed (status ${res.status}).` },
      { status: res.status }
    );
  } catch (err) {
    return Response.json({ ok: false, error: `Connection check failed: ${String(err.message || err)}` }, { status: 500 });
  }
}
