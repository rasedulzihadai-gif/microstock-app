export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = "llama3.2-vision";
export const OLLAMA_CLOUD_BASE_URL = "https://ollama.com";
export const DEFAULT_OLLAMA_CLOUD_MODEL = "gemma4:31b";

/**
 * Normalizes the root URL of an Ollama server before appending an API path.
 * A path prefix is intentionally preserved for reverse-proxy installations.
 */
export function normalizeOllamaBaseUrl(value) {
  const candidate = String(value || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).trim();
  if (!candidate) {
    throw new Error("Enter an Ollama server URL.");
  }

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Ollama server URL must be a valid http:// or https:// URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Ollama server URL must use http:// or https://.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Ollama server URL cannot include credentials, a query string, or a fragment.");
  }

  const normalizedPath = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${normalizedPath === "/" ? "" : normalizedPath}`;
}

export function getOllamaApiUrl(baseUrl, endpoint) {
  return `${baseUrl.replace(/\/+$/, "")}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

export function isOllamaModelAvailable(models, requestedModel) {
  const requested = String(requestedModel || "").trim();
  const available = Array.isArray(models)
    ? models.flatMap((model) => [model?.name, model?.model]).filter(Boolean)
    : [];

  return available.some((name) => {
    const candidate = String(name);
    return candidate === requested || (!requested.includes(":") && candidate === `${requested}:latest`);
  });
}
