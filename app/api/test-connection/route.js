import {
  DEFAULT_OLLAMA_CLOUD_MODEL,
  DEFAULT_OLLAMA_MODEL,
  OLLAMA_CLOUD_BASE_URL,
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
      ollamaModel,
    } = await req.json();

    if (provider === "ollama_cloud") {
      const key = String(apiKey || "").trim();
      const model = String(ollamaModel || DEFAULT_OLLAMA_CLOUD_MODEL).trim();
      if (!key) {
        return Response.json({ ok: false, error: "Ollama Cloud API key cannot be empty." }, { status: 400 });
      }
      if (!model) {
        return Response.json({ ok: false, error: "Choose an Ollama Cloud vision model first." }, { status: 400 });
      }

      const res = await fetch(getOllamaApiUrl(OLLAMA_CLOUD_BASE_URL, "/api/tags"), {
        headers: { Authorization: `Bearer ${key}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return Response.json(
          {
            ok: false,
            error: data?.error?.message
              || (typeof data?.error === "string" ? data.error : null)
              || data?.message
              || `Ollama Cloud authentication failed (status ${res.status}).`,
          },
          { status: res.status }
        );
      }

      if (!isOllamaModelAvailable(data?.models, model)) {
        return Response.json(
          {
            ok: false,
            error: `Ollama Cloud connected, but “${model}” is not available to this account. Choose a model returned by the Ollama Cloud API.`,
          },
          { status: 422 }
        );
      }

      return Response.json({
        ok: true,
        provider: "ollama_cloud",
        message: `Ollama Cloud connected. ${model} is available.`,
      });
    }

    if (provider === "ollama") {
      let baseUrl;
      try {
        baseUrl = normalizeOllamaBaseUrl(ollamaBaseUrl);
      } catch (err) {
        return Response.json({ ok: false, error: String(err.message || err) }, { status: 400 });
      }

      const model = String(ollamaModel || DEFAULT_OLLAMA_MODEL).trim();
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

    if (provider === "llm7") {
      // LLM7.io works anonymously with the literal key "unused" (lower rate limits).
      const key = String(apiKey || "").trim() || "unused";
      const res = await fetch("https://api.llm7.io/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return Response.json({
          ok: true,
          provider: "llm7",
          message: key === "unused"
            ? "LLM7.io connected anonymously. Add a free token for higher rate limits."
            : "LLM7.io connected successfully.",
        });
      }
      return Response.json(
        { ok: false, error: data?.error?.message || (typeof data?.error === "string" ? data.error : null) || data?.message || `LLM7.io authentication failed (status ${res.status}).` },
        { status: res.status }
      );
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

    if (provider === "chutes") {
      const res = await fetch("https://llm.chutes.ai/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return Response.json({ ok: true, provider: "chutes", message: "Chutes.ai API connected successfully." });
      }
      return Response.json(
        { ok: false, error: data?.error?.message || (typeof data?.error === "string" ? data.error : null) || data?.message || `Chutes.ai authentication failed (status ${res.status}).` },
        { status: res.status }
      );
    }

    if (provider === "huggingface") {
      const res = await fetch("https://router.huggingface.co/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return Response.json({ ok: true, provider: "huggingface", message: "Hugging Face API connected successfully." });
      }
      return Response.json(
        { ok: false, error: data?.error?.message || (typeof data?.error === "string" ? data.error : null) || data?.message || `Hugging Face authentication failed (status ${res.status}).` },
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
