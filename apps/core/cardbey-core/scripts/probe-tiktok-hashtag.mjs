/**
 * Probe TikTok hashtag resolution (no DB).
 * Usage: node scripts/probe-tiktok-hashtag.mjs bakery melbournebakery
 */
import { resolveTikTokHashtag } from '../src/lib/discovery/sources/tiktokHashtagResolver.js';

const tags = process.argv.slice(2);
const list = tags.length > 0 ? tags : ['bakery'];

for (const tag of list) {
  const r = await resolveTikTokHashtag(tag, { maxUrls: 10 });
  console.log(
    JSON.stringify({
      tag: r.tag,
      status: r.status,
      classification: r.classification,
      httpStatus: r.httpStatus,
      urls: r.urls.length,
      sample: r.urls.slice(0, 5),
      detail: r.detail,
      bytes: r.responseBytes,
    }),
  );
}
