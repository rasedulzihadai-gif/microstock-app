// Deterministic post-processing of model output. The prompt asks the model to
// follow rules B, C and D, but lighter fallback models still drift (dumping the
// whole use-case pool, over-using filler, pairing "vibrant" with "dark").
// Keyword lists are ordered by relevance, so whenever something has to go we
// always drop the LATER (less relevant) entry.

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

const norm = (k) => String(k).trim().toLowerCase();

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

export function enforceKeywordRules(keywords) {
  if (!Array.isArray(keywords)) return keywords;
  const cleaned = dedupe(keywords.map((k) => String(k).trim()));
  return capFiller(capUseCases(removeContradictions(cleaned)));
}

export function enforceOutputRules(parsed) {
  if (!parsed || typeof parsed !== "object" || !parsed.platforms) return parsed;
  const platforms = {};
  for (const [name, block] of Object.entries(parsed.platforms)) {
    platforms[name] = block && Array.isArray(block.keywords)
      ? { ...block, keywords: enforceKeywordRules(block.keywords) }
      : block;
  }
  return { ...parsed, platforms };
}
