import { SYSTEM_PROMPT } from "../../../lib/prompt";

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

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  try {
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
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

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const message = data?.error?.message || "Provider request failed.";
      const status = geminiRes.status === 400 ? 401 : geminiRes.status; // treat bad key as 401-ish
      return Response.json({ error: message }, { status });
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return Response.json(
        { error: "Model returned invalid JSON. Try regenerating." },
        { status: 502 }
      );
    }

    return Response.json(parsed);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
