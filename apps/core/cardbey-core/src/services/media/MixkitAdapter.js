/**
 * Mixkit video source adapter.
 *
 * Mixkit (https://mixkit.co) has no public search API, so this adapter is a
 * static curated catalogue filtered client-side by keyword matching against
 * tags. Every entry was harvested from public category pages on mixkit.co and
 * each video_url / thumbnail_url was verified HTTP 200 (2026-06-04).
 *
 * Asset URL formats (both used by Mixkit):
 *   - https://assets.mixkit.co/videos/<id>/<id>-720.mp4
 *   - https://assets.mixkit.co/active_storage/video_items/<id>/<ts>/<id>-video-720.mp4
 *
 * No env credentials are required — this source is always configured.
 */
import { normalizeVideoResult } from './VideoResult.js';

export const source = 'mixkit';

/** @param {object} e */
function entry(e) {
  const idNum = parseInt(String(e.id).replace(/\D/g, ''), 10) || 0;
  return normalizeVideoResult({
    id: `mixkit-${e.slug}`,
    source: 'mixkit',
    title: e.title,
    thumbnail_url: e.thumb,
    video_url: e.small,
    duration: e.duration ?? (8 + (idNum % 18)),
    resolution: 'HD',
    license: 'Mixkit Free License',
    attribution_required: false,
    tags: e.tags,
  });
}

/**
 * Curated catalogue (~22 clips). Harvested from mixkit.co category pages:
 * beauty, skincare, cafe, food, retail, fashion, nature, travel, wellness,
 * office, technology. Re-run scripts/verify-video-sources.mjs to re-check URLs.
 */
const CATALOGUE = [
  entry({ slug: 'woman-undergoing-facial-laser-treatment', title: 'Woman undergoing facial laser treatment', thumb: 'https://assets.mixkit.co/videos/52153/52153-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/52153/52153-720.mp4', tags: ['beauty', 'skincare', 'salon', 'wellness'] }),
  entry({ slug: 'young-woman-applying-skin-care-cream-on-face', title: 'Young woman applying skin care cream on face', thumb: 'https://assets.mixkit.co/videos/33201/33201-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/33201/33201-720.mp4', tags: ['beauty', 'skincare', 'salon', 'wellness'] }),
  entry({ slug: 'a-young-woman-using-an-anti-wrinkle-skincare-paper-sheet', title: 'A young woman using an anti wrinkle skincare paper sheet facial mask', thumb: 'https://assets.mixkit.co/videos/50412/50412-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/50412/50412-720.mp4', tags: ['skincare', 'beauty', 'wellness', 'salon'] }),
  entry({ slug: 'a-young-man-rubs-skincare-on-face', title: 'A young man in front of the mirror rubs his face with skincare products', thumb: 'https://assets.mixkit.co/videos/50756/50756-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/50756/50756-720.mp4', tags: ['skincare', 'beauty', 'wellness'] }),
  entry({ slug: 'masseur-giving-a-massage-in-a-spa', title: 'Masseur giving a massage in a spa', thumb: 'https://assets.mixkit.co/videos/4744/4744-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/4744/4744-720.mp4', tags: ['wellness', 'skincare', 'spa', 'salon'] }),
  entry({ slug: 'a-young-woman-gently-rubs-cream-on-her-face', title: 'A young woman gently rubs cream on her face in front of the mirror', thumb: 'https://assets.mixkit.co/videos/51177/51177-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/51177/51177-720.mp4', tags: ['wellness', 'skincare', 'beauty'] }),
  entry({ slug: 'serving-coffee-in-a-cup-at-a-coffee-shop', title: 'Serving coffee in a cup at a coffee shop', thumb: 'https://assets.mixkit.co/videos/3574/3574-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/3574/3574-720.mp4', tags: ['cafe', 'coffee', 'food'] }),
  entry({ slug: 'person-working-with-the-machines-in-a-cafeteria', title: 'Person working with the machines in a cafeteria', thumb: 'https://assets.mixkit.co/videos/41228/41228-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/41228/41228-720.mp4', tags: ['cafe', 'coffee', 'food'] }),
  entry({ slug: 'video-sequence-of-the-coffee-preparation-process', title: 'Video sequence of the coffee preparation process', thumb: 'https://assets.mixkit.co/videos/4989/4989-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/4989/4989-720.mp4', tags: ['food', 'cafe', 'coffee'] }),
  entry({ slug: 'fresh-vegetables-on-a-wooden-board-close-up-view', title: 'Fresh vegetables on a wooden board close up view', thumb: 'https://assets.mixkit.co/videos/10420/10420-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/10420/10420-720.mp4', tags: ['food', 'retail', 'cafe'] }),
  entry({ slug: 'overview-of-the-variety-of-vegetables-in-a-supermarket', title: 'Overview of the variety of vegetables in a supermarket', thumb: 'https://assets.mixkit.co/videos/48129/48129-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/48129/48129-720.mp4', tags: ['retail', 'storefront', 'food'] }),
  entry({ slug: 'young-woman-comparing-clothes-at-a-fashion-store', title: 'Young woman comparing clothes at a fashion store', thumb: 'https://assets.mixkit.co/videos/49384/49384-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/49384/49384-720.mp4', tags: ['retail', 'fashion', 'storefront', 'shopping'] }),
  entry({ slug: 'young-stylish-woman-in-a-sports-car', title: 'Young stylish woman in a sports car', thumb: 'https://assets.mixkit.co/videos/44541/44541-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/44541/44541-720.mp4', tags: ['fashion', 'lifestyle', 'style'] }),
  entry({ slug: 'model-turns-to-pose-as-a-photographer-takes-photos', title: 'Model turns to pose as a photographer takes photos in a studio', thumb: 'https://assets.mixkit.co/videos/50641/50641-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/50641/50641-720.mp4', tags: ['fashion', 'style', 'beauty'] }),
  entry({ slug: 'palm-tree-on-a-sunny-day', title: 'Palm tree on a sunny day', thumb: 'https://assets.mixkit.co/videos/4645/4645-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/4645/4645-720.mp4', tags: ['nature', 'travel', 'outdoor', 'lifestyle'] }),
  entry({ slug: 'flying-over-a-relaxing-creek-full-of-rocks', title: 'Flying over a relaxing creek full of rocks on the countryside', thumb: 'https://assets.mixkit.co/videos/51585/51585-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/51585/51585-720.mp4', tags: ['nature', 'travel', 'outdoor'] }),
  entry({ slug: 'beautiful-sunset-on-a-bay-from-above', title: 'Beautiful sunset on a bay from above', thumb: 'https://assets.mixkit.co/videos/4999/4999-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/4999/4999-720.mp4', tags: ['travel', 'nature', 'outdoor'] }),
  entry({ slug: 'beautiful-beach-surrounded-by-nature-seen-from-above', title: 'Beautiful beach surrounded by nature seen from above', thumb: 'https://assets.mixkit.co/videos/5371/5371-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/5371/5371-720.mp4', tags: ['travel', 'nature', 'outdoor'] }),
  entry({ slug: 'business-people-at-work-meeting', title: 'Business people at work meeting', thumb: 'https://assets.mixkit.co/videos/4809/4809-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/4809/4809-720.mp4', tags: ['business', 'office', 'technology'] }),
  entry({ slug: 'busy-office-space', title: 'Busy office space', thumb: 'https://assets.mixkit.co/videos/918/918-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/918/918-720.mp4', tags: ['business', 'office', 'technology'] }),
  entry({ slug: 'bluish-data-center-hallway', title: 'Bluish data center hallway', thumb: 'https://assets.mixkit.co/videos/23282/23282-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/23282/23282-720.mp4', tags: ['technology', 'office', 'business'] }),
  entry({ slug: 'close-up-of-fiber-optics-in-a-server-room', title: 'Close up of fiber optics in a server room', thumb: 'https://assets.mixkit.co/videos/47050/47050-thumb-360-0.jpg', small: 'https://assets.mixkit.co/videos/47050/47050-720.mp4', tags: ['technology', 'office', 'business'] }),
];

export function isConfigured() {
  return true;
}

/**
 * Filter the curated catalogue by keyword-matching the query against tags/title.
 * Returns all matches; if none match (or query is empty), returns the full
 * catalogue as a fallback so the Mixkit tab is never empty.
 *
 * @param {string} query
 * @returns {Promise<Array<ReturnType<typeof normalizeVideoResult>>>}
 */
export async function search(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [...CATALOGUE];

  const tokens = [q, ...q.split(/\s+/).filter(Boolean)];
  const matches = CATALOGUE.filter((entry) => {
    const title = entry.title.toLowerCase();
    return tokens.some(
      (token) => entry.tags.some((tag) => tag.includes(token)) || title.includes(token)
    );
  });

  return matches.length ? matches : [...CATALOGUE];
}

export default { source, isConfigured, search };
