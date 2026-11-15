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

// Magnific (the marketplace formerly branded Freepik) truncates titles after
// 100 characters, so anything longer is wasted text.
export const MAGNIFIC_MAX_TITLE = 100;

// Tail phrases that only name use-cases rather than describing the asset.
const USE_CASE_TAIL_WORDS = new Set([
  "for", "and", "or", "with", "in", "on", "the", "a", "an", "&", "/", "by",
  "social", "media", "banner", "wallpaper", "poster", "cover", "covers", "web",
  "website", "webpage", "packaging", "presentation", "print", "design",
  "designs", "background", "backgrounds", "card", "cards", "flyer", "flyers",
  "brochure", "brochures", "thumbnail", "thumbnails", "invitation",
  "invitations", "header", "app", "mobile", "instagram", "youtube", "facebook",
  "twitter", "linkedin", "branding", "advertising", "marketing", "template",
  "templates", "mockup", "mockups", "ui", "interface", "blog", "ads",
  "ecommerce", "shop", "store", "product", "promo", "promotion", "story",
  "stories", "reel", "reels", "video", "content", "screen", "desktop", "phone",
  "business", "corporate", "commercial", "campaign", "campaigns", "brand",
  "brands", "label", "labels", "sticker", "stickers", "menu", "menus",
  "calendar", "newsletter", "presentation", "slides", "slide", "apparel",
  "merch", "merchandising", "stationery", "decor", "decoration",
  "project", "projects", "purpose", "purposes", "use", "usage", "need", "needs",
  "solution", "solutions", "asset", "assets", "creator", "creators", "agency",
  "agencies", "studio", "studios", "client", "clients", "company", "companies",
  "layout", "layouts", "logo", "logos", "icon", "icons", "sale", "sales",
  "offer", "offers", "deal", "deals", "launch", "announcement", "event",
  "events", "party", "parties", "holiday", "holidays", "season", "seasonal",
  "celebration", "celebrations", "wedding", "weddings", "birthday", "birthdays",
  "dropshipping", "reseller", "resellers", "merchant", "merchants", "businesses",
]);

/**
 * Magnific titles carry no use-case tail: "... for social media, banner and
 * wallpaper" is removed and the use-cases live in the keywords instead.
 * Only a trailing clause made entirely of use-case words is dropped, so real
 * visual descriptions survive intact.
 */
export function stripUseCaseTail(title) {
  const text = String(title ?? "").trim();
  const marker = text.lastIndexOf(" for ");
  if (marker === -1) return text;

  const tail = text.slice(marker + 1); // "for social media, banner and wallpaper"
  const words = tail
    .toLowerCase()
    .split(/[\s,;:.]+/)
    .filter(Boolean);
  if (!words.length) return text;
  if (!words.every((word) => USE_CASE_TAIL_WORDS.has(word))) return text;

  // Keep a describable title behind; never strip the whole thing away.
  const head = text.slice(0, marker).replace(/[\s,;:.]+$/g, "").trim();
  return head.length >= 20 ? head : text;
}

// Character caps must not slice a word in half or leave a dangling connector.
function trimToLimit(text, max) {
  if (text.length <= max) return text;

  // Prefer ending on a complete sentence when one ends late in the allowance.
  const head = text.slice(0, max);
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (sentenceEnd >= 60) return head.slice(0, sentenceEnd + 1).trim();

  let cut = head;
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.6) cut = cut.slice(0, lastSpace);
  return cut
    .replace(/[\s,;:.\-–—|\/]+$/g, "")
    .replace(/\s+(?:a|an|and|the|of|for|with|or|in|on|to|by)$/i, "")
    .trim();
}

export function enforceTitleRules(title, platformKey) {
  let cleaned = String(title ?? "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim();

  // Adobe Stock: zero commas allowed, max 200 chars
  if (platformKey === "adobe_stock") {
    // Commas are banned, but lists must stay readable: "a, b and c" -> "a b and c".
    cleaned = cleaned
      .replace(/\s*,\s*/g, " ")
      .replace(/\s+([.])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 200);
  } else if (platformKey === "freepik_vecteezy") {
    // Magnific: no use-case tail, hard 100-character cap.
    cleaned = trimToLimit(stripUseCaseTail(cleaned), MAGNIFIC_MAX_TITLE);
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
