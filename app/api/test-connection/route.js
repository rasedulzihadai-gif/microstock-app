export const maxDuration = 15;

export async function POST(req) {
  try {
    const { provider = "gemini", apiKey } = await req.json();

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
