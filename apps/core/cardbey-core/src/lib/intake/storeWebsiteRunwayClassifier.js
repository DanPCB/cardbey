/**
 * Deterministic store vs mini-website runway classification for Performer intake.
 * Used by system shortcuts and intake V2 message overrides.
 */

/** @typedef {'create_store'|'create_mini_website'|'create_storefront'|'create_campaign_page'|'create_landing_page'} CreateRunwayLabel */

/** @typedef {'store'|'website'} CreateRunwayMode */

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeMessage(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const WEBSITE_SIGNALS = [
  { label: /** @type {CreateRunwayLabel} */ ('create_mini_website'), re: /\bmini[- ]?website\b|\bmini[- ]?site\b|\bmicrosite\b|\bmicro[- ]?site\b/ },
  { label: 'create_landing_page', re: /\blanding\s+page\b/ },
  { label: 'create_campaign_page', re: /\b(campaign|promo(?:tion)?)\s+page\b/ },
  {
    label: 'create_mini_website',
    re: /\b(create|build|make|set\s+up|start)\b.{0,24}\b(website|web\s*site|site|web\s+presence)\b/,
  },
  {
    label: 'create_mini_website',
    re: /\b(website|web\s*site|site|web\s+presence)\b.{0,24}\b(for\s+my\s+(store|business|shop))\b/,
  },
  { label: 'create_mini_website', re: /\bwebsite\s+from\s+(attached\s+)?card\b/ },
  { label: 'create_mini_website', re: /\bsite\s+from\s+(attached\s+)?card\b/ },
  { label: 'create_mini_website', re: /\brefine\s*\(\s*website\s*\)\s*:/ },
];

const STORE_SIGNALS = [
  { label: /** @type {CreateRunwayLabel} */ ('create_store'), re: /\b(create|build|make|set\s+up|open|start)\b.{0,24}\b(store|shop|business)\b/ },
  { label: 'create_store', re: /\bnew\s+store\b|\bopen\s+store\b|\bcreate\s+my\s+(?:first\s+)?store\b/ },
  { label: 'create_storefront', re: /\bproduct\s+catalog\b|\bonline\s+store\b|\bstorefront\b/ },
  { label: 'create_store', re: /\brefine\s*\(\s*store\s*\)\s*:/ },
];

/** Video / clip creative requests must never count as store-create runway. */
const VIDEO_CREATE_BLOCK_RE =
  /\b(video|clip|tiktok|reels?|shorts?)\b|\banimate\b[\s\S]{0,24}\b(hero|banner|image)\b|\b\d+\s*(?:s|sec|second|seconds)\s+(?:ad|video|clip)\b/i;

/**
 * @param {string} userMessage
 */
export function messageLooksLikeVideoCreate(userMessage) {
  return VIDEO_CREATE_BLOCK_RE.test(normalizeMessage(userMessage));
}

/**
 * @param {string} msg
 * @param {Array<{ label: CreateRunwayLabel, re: RegExp }>} signals
 * @returns {Set<CreateRunwayLabel>}
 */
function matchLabels(msg, signals) {
  const out = new Set();
  for (const { label, re } of signals) {
    if (re.test(msg)) out.add(label);
  }
  return out;
}

/** @param {CreateRunwayLabel} label */
function labelToMode(label) {
  if (
    label === 'create_mini_website' ||
    label === 'create_landing_page' ||
    label === 'create_campaign_page'
  ) {
    return /** @type {CreateRunwayMode} */ ('website');
  }
  return /** @type {CreateRunwayMode} */ ('store');
}

/**
 * @param {string} userMessage
 * @returns {{
 *   label: CreateRunwayLabel | null,
 *   intentMode: CreateRunwayMode | null,
 *   ambiguous: boolean,
 *   websiteLabels: CreateRunwayLabel[],
 *   storeLabels: CreateRunwayLabel[],
 * }}
 */
export function classifyStoreWebsiteCreateIntent(userMessage) {
  const msg = normalizeMessage(userMessage);
  if (!msg) {
    return {
      label: null,
      intentMode: null,
      ambiguous: false,
      websiteLabels: [],
      storeLabels: [],
    };
  }

  // Creative video / clip requests are not store or website create runways.
  if (VIDEO_CREATE_BLOCK_RE.test(msg)) {
    return {
      label: null,
      intentMode: null,
      ambiguous: false,
      websiteLabels: [],
      storeLabels: [],
    };
  }

  const websiteLabels = [...matchLabels(msg, WEBSITE_SIGNALS)];
  const storeLabels = [...matchLabels(msg, STORE_SIGNALS)];

  const hasWebsite = websiteLabels.length > 0;
  const hasStore = storeLabels.length > 0;

  if (hasWebsite && hasStore) {
    const dualCreateIntent =
      /\b(create|build|make|open|start)\b.{0,30}\b(store|shop)\b.{0,16}\band\b.{0,30}\b(mini[- ]?website|website|landing|site)\b/i.test(
        msg,
      ) ||
      /\b(mini[- ]?website|website|landing\s+page)\b.{0,16}\band\b.{0,30}\b(store|shop)\b/i.test(msg);
    if (dualCreateIntent) {
      return {
        label: null,
        intentMode: null,
        ambiguous: true,
        websiteLabels,
        storeLabels,
      };
    }
    const websiteForMyStore =
      /\b(website|site|web\s*site)\b.{0,30}\bfor\s+my\s+(store|shop|business)\b/i.test(msg);
    if (websiteForMyStore) {
      const label = websiteLabels[0];
      return {
        label,
        intentMode: 'website',
        ambiguous: false,
        websiteLabels,
        storeLabels,
      };
    }
    return {
      label: null,
      intentMode: null,
      ambiguous: true,
      websiteLabels,
      storeLabels,
    };
  }

  if (hasWebsite) {
    const label = websiteLabels[0];
    return {
      label,
      intentMode: 'website',
      ambiguous: false,
      websiteLabels,
      storeLabels,
    };
  }

  if (hasStore) {
    const label = storeLabels[0];
    return {
      label,
      intentMode: 'store',
      ambiguous: false,
      websiteLabels,
      storeLabels,
    };
  }

  return {
    label: null,
    intentMode: null,
    ambiguous: false,
    websiteLabels,
    storeLabels,
  };
}

/**
 * Message-level website create detection (subset used for LLM parameter override).
 *
 * @param {string} raw
 * @returns {boolean}
 */
export function messageLooksLikeWebsiteCreate(raw) {
  const { intentMode, ambiguous } = classifyStoreWebsiteCreateIntent(raw);
  return !ambiguous && intentMode === 'website';
}

/**
 * Message-level store create detection.
 *
 * @param {string} raw
 * @returns {boolean}
 */
export function messageLooksLikeStoreCreate(raw) {
  const { intentMode, ambiguous } = classifyStoreWebsiteCreateIntent(raw);
  return !ambiguous && intentMode === 'store';
}

/**
 * Guest intake guard: allow free-text store / mini-website create phrases only.
 * @param {string} raw
 * @returns {boolean}
 */
export function isGuestAllowedStoreWebsiteIntent(raw) {
  const { intentMode, ambiguous } = classifyStoreWebsiteCreateIntent(raw);
  return !ambiguous && (intentMode === 'store' || intentMode === 'website');
}
