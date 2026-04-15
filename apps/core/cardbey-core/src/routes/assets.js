import { Router } from 'express';

const router = Router();

const STATIC_RESULTS = [
  {
    url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=2048&q=80',
    thumb: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80',
    source: 'unsplash',
    author: 'Toa Heftiba',
    tags: ['coffee', 'cafe', 'latte', 'breakfast'],
  },
  {
    url: 'https://images.unsplash.com/photo-1504674900247-246e1c0b121c?auto=format&fit=crop&w=2048&q=80',
    thumb: 'https://images.unsplash.com/photo-1504674900247-246e1c0b121c?auto=format&fit=crop&w=400&q=80',
    source: 'unsplash',
    author: 'Brooke Lark',
    tags: ['pastry', 'dessert', 'bakery'],
  },
  {
    url: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=2048&q=80',
    thumb: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=400&q=80',
    source: 'pexels',
    author: 'Pixabay',
    tags: ['fresh', 'produce', 'market'],
  },
  {
    url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=2048&q=80',
    thumb: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=400&q=80',
    source: 'unsplash',
    author: 'Karolina Grabowska',
    tags: ['sale', 'shopping', 'discount', 'retail'],
  },
  {
    url: 'https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=2048&q=80',
    thumb: 'https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=400&q=80',
    source: 'unsplash',
    author: 'Karolina Grabowska',
    tags: ['sale', 'promotion', 'store'],
  },
  {
    url: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=2048&q=80',
    thumb: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=400&q=80',
    source: 'unsplash',
    author: 'Jeswin Thomas',
    tags: ['sale', 'discount', 'business', 'marketing'],
  },
  {
    url: 'https://images.pexels.com/photos/5686132/pexels-photo-5686132.jpeg?auto=compress&cs=tinysrgb&w=1260',
    thumb: 'https://images.pexels.com/photos/5686132/pexels-photo-5686132.jpeg?auto=compress&cs=tinysrgb&w=400',
    source: 'pexels',
    author: 'ROSE',
    tags: ['roses', 'flowers', 'bouquet', 'fresh'],
  },
  {
    url: 'https://images.pexels.com/photos/1024960/pexels-photo-1024960.jpeg?auto=compress&cs=tinysrgb&w=1260',
    thumb: 'https://images.pexels.com/photos/1024960/pexels-photo-1024960.jpeg?auto=compress&cs=tinysrgb&w=400',
    source: 'pexels',
    author: 'Pixabay',
    tags: ['flower', 'roses', 'garden', 'plant'],
  },
  {
    url: 'https://images.pexels.com/photos/1323550/pexels-photo-1323550.jpeg?auto=compress&cs=tinysrgb&w=1260',
    thumb: 'https://images.pexels.com/photos/1323550/pexels-photo-1323550.jpeg?auto=compress&cs=tinysrgb&w=400',
    source: 'pexels',
    author: 'Pexels',
    tags: ['flowers', 'bloom', 'nature', 'garden'],
  },
  {
    url: 'https://images.pexels.com/photos/210019/pexels-photo-210019.jpeg?auto=compress&cs=tinysrgb&w=1260',
    thumb: 'https://images.pexels.com/photos/210019/pexels-photo-210019.jpeg?auto=compress&cs=tinysrgb&w=400',
    source: 'pexels',
    author: 'Pexels',
    tags: ['cars', 'vehicle', 'automobile', 'road'],
  },
  {
    url: 'https://images.pexels.com/photos/1001682/pexels-photo-1001682.jpeg?auto=compress&cs=tinysrgb&w=1260',
    thumb: 'https://images.pexels.com/photos/1001682/pexels-photo-1001682.jpeg?auto=compress&cs=tinysrgb&w=400',
    source: 'pexels',
    author: 'Pexels',
    tags: ['fish', 'fishes', 'seafood', 'ocean'],
  },
  {
    url: 'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=1260',
    thumb: 'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=400',
    source: 'pexels',
    author: 'Pexels',
    tags: ['house', 'houses', 'home', 'building'],
  },
];

/** Map static entry to dashboard PexelsPhoto shape (GET /api/assets/photos) */
function toPexelsPhoto(entry, index) {
  return {
    id: `static-${index}-${entry.url.slice(-12).replace(/\D/g, '')}`,
    type: 'photo',
    thumbUrl: entry.thumb,
    fullUrl: entry.url,
    width: 2048,
    height: 1365,
    photographer: entry.author,
    photographerUrl: entry.source === 'pexels' ? 'https://www.pexels.com' : 'https://unsplash.com',
    sourcePageUrl: entry.url,
    licenseNote: 'Free to use (Unsplash / Pexels)',
    attributionText: `${entry.author} / ${entry.source}`,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
  };
}

/** True if tag matches query token (including singular/plural: "flowers" <-> "flower"). */
function tagMatchesToken(tag, token) {
  const t = tag.toLowerCase();
  const q = token.toLowerCase();
  if (t.includes(q) || q.includes(t)) return true;
  const qSingular = q.endsWith('s') && q.length > 1 ? q.slice(0, -1) : null;
  const tSingular = t.endsWith('s') && t.length > 1 ? t.slice(0, -1) : null;
  if (qSingular && (t === qSingular || t.includes(qSingular))) return true;
  if (tSingular && (q === tSingular || q.includes(tSingular))) return true;
  return false;
}

function scoreForQuery(result, queryTokens) {
  if (!queryTokens.length) return 0;
  let score = 0;
  for (const token of queryTokens) {
    if (!token) continue;
    const lc = token.toLowerCase();
    if (result.author?.toLowerCase().includes(lc)) score += 0.5;
    if (Array.isArray(result.tags)) {
      score += result.tags.some((tag) => tagMatchesToken(tag, token)) ? 1 : 0;
    }
  }
  return score;
}

router.get('/search', (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const tokens = query.split(/\s+/).filter(Boolean);
  const ranked = [...STATIC_RESULTS]
    .map((item) => ({ ...item, _score: scoreForQuery(item, tokens) }))
    .sort((a, b) => b._score - a._score);

  res.json({
    ok: true,
    results: ranked.map(({ _score, ...rest }) => rest),
    query,
    count: ranked.length,
  });
});

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || null;
const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search';

/** Map Pexels API photo to dashboard PexelsPhoto shape */
function fromPexelsApi(photo) {
  const src = photo?.src || {};
  const fullUrl = src.large2x || src.large || src.original || photo?.url;
  const thumbUrl = src.medium || src.small || fullUrl;
  return {
    id: String(photo?.id ?? ''),
    type: 'photo',
    thumbUrl,
    fullUrl,
    width: photo?.width ?? 2048,
    height: photo?.height ?? 1365,
    photographer: photo?.photographer ?? 'Pexels',
    photographerUrl: photo?.photographer_url ?? 'https://www.pexels.com',
    sourcePageUrl: photo?.url ?? fullUrl,
    licenseNote: 'Free to use (Pexels)',
    attributionText: `${photo?.photographer ?? 'Pexels'} / pexels`,
    alt: photo?.alt ?? undefined,
    tags: photo?.alt ? [photo.alt] : [],
  };
}

/**
 * GET /api/assets/photos?q=&page=1&perPage=24
 * Dashboard Content Studio Assets panel expects this shape (PexelsSearchResponse).
 * When PEXELS_API_KEY is set and query is present: calls Pexels API for relevant results.
 * Otherwise: returns static curated photos ranked by query (no API key required).
 */
router.get('/photos', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = Math.min(50, Math.max(1, parseInt(req.query.perPage, 10) || 24));
  const orientation = req.query.orientation; // optional: landscape | portrait | square

  // Live Pexels search when key is set and user provided a search term
  if (PEXELS_API_KEY && query) {
    try {
      const params = new URLSearchParams({
        query: query.slice(0, 200),
        page: String(page),
        per_page: String(perPage),
      });
      if (orientation === 'landscape' || orientation === 'portrait' || orientation === 'square') {
        params.set('orientation', orientation);
      }
      const pexelsRes = await fetch(`${PEXELS_SEARCH_URL}?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: PEXELS_API_KEY },
      });
      if (pexelsRes.ok) {
        const data = await pexelsRes.json();
        const photos = Array.isArray(data.photos) ? data.photos : [];
        const items = photos.map(fromPexelsApi);
        return res.json({
          ok: true,
          provider: 'pexels',
          query,
          page,
          perPage,
          total: data.total_results ?? items.length,
          items,
          results: items,
        });
      }
      // Fall through to static list on Pexels error (e.g. rate limit)
    } catch (err) {
      console.warn('[assets/photos] Pexels search failed, using static list:', err?.message);
    }
  }

  // Static list: rank by query and return only matches when user searched
  const tokens = query ? query.split(/\s+/).filter(Boolean) : [];
  const ranked = [...STATIC_RESULTS]
    .map((item, i) => ({ item, i, _score: tokens.length ? scoreForQuery(item, tokens) : 1 }))
    .sort((a, b) => b._score - a._score);
  const matched = tokens.length ? ranked.filter((r) => r._score > 0) : ranked;
  const total = matched.length;
  const start = (page - 1) * perPage;
  const pageItems = matched.slice(start, start + perPage);
  const items = pageItems.map(({ item, i }) => toPexelsPhoto(item, i));

  res.json({
    ok: true,
    provider: 'pexels',
    query: query || '',
    page,
    perPage,
    total,
    items,
    results: items,
  });
});

/**
 * GET /api/assets/icons?icon=...
 * Dashboard Content Studio Assets Icons tab. Returns a simple placeholder SVG so the tab doesn't 404.
 */
router.get('/icons', (req, res) => {
  const icon = typeof req.query.icon === 'string' ? req.query.icon.trim() : '';
  if (!icon) {
    return res.status(400).json({
      ok: false,
      provider: 'iconify',
      icon: '',
      svg: '',
      error: { code: 'MISSING_ICON', message: 'Query param "icon" is required' },
    });
  }
  // Placeholder SVG (24x24 box) so UI doesn't break; replace with Iconify proxy when configured
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
  res.json({
    ok: true,
    provider: 'iconify',
    icon,
    svg,
  });
});

export default router;
