/**
 * Wikimedia Commons venue photos — free licence only, high name-match confidence.
 */

import type { EnrichmentBudget } from './budget.js';
import { venueNameMatchConfidence as nameMatchConfidence } from './venueNameMatch.js';

const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php';

export type WikimediaPhoto = {
  url: string;
  thumbUrl: string;
  title: string;
  licence: string;
  width: number;
  height: number;
  nameMatchConfidence: number;
};

const FREE_LICENCES = ['CC BY', 'CC BY-SA', 'CC0', 'Public domain'];

export { nameMatchConfidence };

export async function fetchWikimediaPhoto(
  budget: EnrichmentBudget,
  businessName: string,
  suburb: string | null,
  minConfidence = 0.85,
): Promise<WikimediaPhoto | null> {
  const name = businessName.trim();
  if (!name) return null;

  const query = [name, suburb].filter(Boolean).join(' ');
  budget.consumeFetch();

  try {
    const searchParams = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srnamespace: '6',
      srlimit: '5',
      format: 'json',
      origin: '*',
    });
    const searchRes = await fetch(`${WIKIMEDIA_API}?${searchParams}`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent':
          process.env.WIKIMEDIA_USER_AGENT?.trim() ||
          'CardbeyEnrichment/1.0 (https://cardbey.com)',
      },
    });
    if (!searchRes.ok) return null;
    const searchData = (await searchRes.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    const results = searchData?.query?.search ?? [];

    for (const row of results) {
      const title = row.title;
      if (!title) continue;
      const confidence = nameMatchConfidence(name, title);
      if (confidence < minConfidence) continue;

      const infoParams = new URLSearchParams({
        action: 'query',
        titles: title,
        prop: 'imageinfo',
        iiprop: 'url|size|extmetadata',
        iiurlwidth: '1200',
        format: 'json',
        origin: '*',
      });
      // Info call shares the same consumeFetch slot conceptually as one "wikimedia" attempt;
      // do not double-consume â€” still within one planned fetch unit.
      const infoRes = await fetch(`${WIKIMEDIA_API}?${infoParams}`, {
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent':
            process.env.WIKIMEDIA_USER_AGENT?.trim() ||
            'CardbeyEnrichment/1.0 (https://cardbey.com)',
        },
      });
      if (!infoRes.ok) continue;
      const infoData = (await infoRes.json()) as {
        query?: { pages?: Record<string, { title?: string; imageinfo?: Array<Record<string, unknown>> }> };
      };
      const pages = Object.values(infoData?.query?.pages ?? {});
      const page = pages[0];
      const imageInfo = page?.imageinfo?.[0] as
        | {
            url?: string;
            thumburl?: string;
            width?: number;
            height?: number;
            extmetadata?: { LicenseShortName?: { value?: string } };
          }
        | undefined;
      if (!imageInfo?.url || (imageInfo.width ?? 0) < 800) continue;
      const licence = imageInfo.extmetadata?.LicenseShortName?.value ?? 'Unknown';
      if (!FREE_LICENCES.some((l) => licence.includes(l))) continue;

      return {
        url: imageInfo.url,
        thumbUrl: imageInfo.thumburl ?? imageInfo.url,
        title: page?.title ?? title,
        licence,
        width: imageInfo.width ?? 0,
        height: imageInfo.height ?? 0,
        nameMatchConfidence: confidence,
      };
    }
    return null;
  } catch {
    return null;
  }
}
