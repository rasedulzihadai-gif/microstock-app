// Deterministic post-processing of model output.
// Hard-enforces SEO formatting, platform character/keyword limits, and rules A-D.

export const USE_CASE_POOL = [
  "website background", "banner background", "social media background",
  "presentation background", "app background", "poster design",
  "phone wallpaper", "desktop wallpaper", "packaging design", "cover design",
  "print design", "book cover", "youtube thumbnail",
  "instagram story background", "brochure design", "flyer design",
  "product background", "greeting card", "invitation background",
  "header background",
];
export const USE_CASE_MAX = 10;

// Each inner array is one "slot" — synonyms share a slot (rule C).
export const FILLER_GROUPS = [
  ["modern", "contemporary"],
  ["abstract"],
  ["creative", "art", "artistic"],
  ["aesthetic", "style", "stylish"],
  ["element"],
  ["design", "graphic"],
  ["structure", "composition"],
  ["visual", "display"],
  ["effect"],
  ["surface"],
  ["tech", "digital", "technology", "cyber", "system"],
  ["clean", "simple", "minimal", "minimalist", "minimalism"],
  ["concept", "conceptual"],
  ["decorative", "decoration"],
];
export const FILLER_MAX = 6;

// Left group vs right group — any word from one side conflicts with any word
// from the other (rule D).
export const CONTRADICTION_PAIRS = [
  [
    ["vibrant", "bright", "vivid", "neon", "colorful", "colourful", "saturated"],
    ["dark", "deep", "moody", "muted", "dim", "shadowy", "pastel", "soft"],
  ],
  [["light", "airy", "white"], ["dark", "black", "night"]],
  [
    ["retro", "vintage", "classic", "rustic", "old"],
    ["futuristic", "cyber", "modern", "tech", "sci-fi", "scifi"],
  ],
  [
    ["minimal", "minimalist", "simple", "clean"],
    ["busy", "complex", "detailed", "intricate"],
  ],
  [["warm"], ["cool", "cold", "icy"]],
];

const PLATFORM_MAX_KEYWORDS = {
  adobe_stock: 49,
  shutterstock: 50,
  istock_getty: 30,
  freepik_vecteezy: 50,
};

const norm = (k) => String(k).trim().toLowerCase();

function cleanKeyword(k) {
  return String(k ?? "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/[,;]+/g, "")
    .trim();
}

function dedupe(keywords) {
  const seen = new Set();
  return keywords.filter((k) => {
    const n = norm(k);
    if (!n || seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}

function capUseCases(keywords) {
  const pool = new Set(USE_CASE_POOL);
  let kept = 0;
  return keywords.filter((k) => {
    if (!pool.has(norm(k))) return true;
    kept += 1;
    return kept <= USE_CASE_MAX;
  });
}

function capFiller(keywords) {
  const groupOf = new Map();
  FILLER_GROUPS.forEach((group, i) => group.forEach((w) => groupOf.set(w, i)));
  const usedSlots = new Set();
  return keywords.filter((k) => {
    const g = groupOf.get(norm(k));
    if (g === undefined) return true;
    if (usedSlots.has(g)) return true; // same slot already counted
    if (usedSlots.size >= FILLER_MAX) return false;
    usedSlots.add(g);
    return true;
  });
}

function removeContradictions(keywords) {
  const lower = keywords.map(norm);
  const drop = new Set();
  for (const [left, right] of CONTRADICTION_PAIRS) {
    const leftIdx = lower.findIndex((k) => left.includes(k));
    const rightIdx = lower.findIndex((k) => right.includes(k));
    if (leftIdx === -1 || rightIdx === -1) continue;
    // Whichever side appears later is treated as the weaker claim and removed.
    const losingSide = leftIdx < rightIdx ? right : left;
    lower.forEach((k, i) => {
      if (losingSide.includes(k)) drop.add(i);
    });
  }
  return keywords.filter((_, i) => !drop.has(i));
}

export function enforceKeywordRules(keywords, platformKey) {
  if (!Array.isArray(keywords)) return [];
  const cleaned = dedupe(keywords.map(cleanKeyword).filter(Boolean));
  const filtered = capFiller(capUseCases(removeContradictions(cleaned)));
  const maxKw = PLATFORM_MAX_KEYWORDS[platformKey] || 50;
  return filtered.slice(0, maxKw);
}

export function enforceTitleRules(title, platformKey) {
  let cleaned = String(title ?? "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim();

  // Adobe Stock: zero commas allowed, max 200 chars
  if (platformKey === "adobe_stock") {
    cleaned = cleaned.replace(/,/g, "").replace(/\s{2,}/g, " ").trim().slice(0, 200);
  } else if (platformKey === "freepik_vecteezy") {
    cleaned = cleaned.slice(0, 100);
  } else {
    cleaned = cleaned.slice(0, 200);
  }

  return cleaned;
}

export function enforceOutputRules(parsed, requestedPlatform) {
  if (!parsed || typeof parsed !== "object") return parsed;
  const platforms = {};
  const rawPlatforms = parsed.platforms || {};

  const supportedPlatforms = ["adobe_stock", "shutterstock", "istock_getty", "freepik_vecteezy"];
  // Requests can target one marketplace or all four marketplaces.
  const platformKeys = requestedPlatform === "all_platforms"
    ? supportedPlatforms
    : (supportedPlatforms.includes(requestedPlatform) ? [requestedPlatform] : supportedPlatforms);
  for (const name of platformKeys) {
    const block = rawPlatforms[name] || {};
    platforms[name] = {
      title: enforceTitleRules(block.title || "", name),
      keywords: enforceKeywordRules(block.keywords || [], name),
    };
  }

  return {
    description: String(parsed.description || "").trim(),
    platforms,
    category_suggestion: String(parsed.category_suggestion || "").trim(),
    flags: Array.isArray(parsed.flags) ? parsed.flags : [],
  };
}
