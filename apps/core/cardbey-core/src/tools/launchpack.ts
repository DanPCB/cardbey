/**
 * tool_launchpack_zip_v1: generates launch pack contents (captions, hashtags, schedule, links).
 * Produces artifact message(s) with contentsList and, when storage is available, a downloadable ZIP.
 * If storage fails, falls back to inline contents only (no download URL) to avoid breaking existing flows.
 */

import JSZip from 'jszip';
import type { ToolContext, ToolResult } from './registry';
import { registerTool } from './registry';
import { uploadBufferToS3, getPresignedGetUrl } from '../lib/s3Client.js';
import { resolvePublicUrl } from '../utils/publicUrl.js';

const TOOL_KEY = 'tool_launchpack_zip_v1';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function runLaunchpack(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> {
  const missionId = ctx.missionId;
  const platformTargets = Array.isArray(input.platformTargets) ? input.platformTargets : ['instagram', 'facebook'];
  const startDate = typeof input.startDate === 'string' ? input.startDate : formatDate(new Date());
  const durationDays = typeof input.durationDays === 'number' ? Math.max(1, Math.min(30, input.durationDays)) : 7;

  const captions = [
    'Launch day is here! 🎉',
    'We\'re live. Thank you for your support.',
    'New launch – check it out and share with someone who\'d love it.',
  ].join('\n\n');

  const hashtags = [
    '#launch #newproduct #launchday',
    '#smallbusiness #supportlocal',
    '#newarrival',
  ].join('\n');

  const scheduleRows: string[] = ['date,platform,action,notes'];
  const start = new Date(startDate);
  for (let i = 0; i < durationDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dayStr = formatDate(d);
    for (const platform of platformTargets) {
      scheduleRows.push(`${dayStr},${String(platform)},post,Launch content`);
    }
  }
  const schedule = scheduleRows.join('\n');

  const links = [
    'Website: [Add your store URL]',
    'Instagram: [Add profile URL]',
    'Facebook: [Add page URL]',
  ].join('\n');

  const contentsList = ['captions.txt', 'hashtags.txt', 'schedule.csv', 'links.txt'];
  const summary = {
    missionId,
    platformTargets,
    startDate,
    durationDays,
    contentsList,
    message: `Launch pack generated: ${contentsList.join(', ')}`,
  };

  // Always compute a short preview snippet from captions
  const previewTextSnippet = captions.slice(0, 300);

  // Try to build and store a ZIP; if anything fails, we keep downloadUrl null and fall back to inline-only contents.
  let storageKey: string | null = null;
  let downloadUrl: string | null = null;
  const signedUrlTtlSeconds = 3600;
  let signedUrlExpiresAt: string | undefined;
  let storageProvider: 's3' | undefined;

  try {
    const zip = new JSZip();
    zip.file('captions.txt', captions);
    zip.file('hashtags.txt', hashtags);
    zip.file('schedule.csv', schedule);
    zip.file('links.txt', links);

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const originalName = `launchpack-${missionId || 'mission'}.zip`;

    const { key, url } = await uploadBufferToS3(buffer, originalName, 'application/zip');
    storageKey = key;
    if (key && process.env.S3_BUCKET_NAME) {
      const signed = await getPresignedGetUrl(key, signedUrlTtlSeconds);
      downloadUrl = signed.url;
      signedUrlExpiresAt = signed.expiresAt;
      storageProvider = 's3';
    } else {
      downloadUrl = resolvePublicUrl(url, null);
    }
  } catch (err) {
    // Storage is additive; failure here should not break existing artifact flows.
    console.warn('[launchpack] ZIP storage failed, falling back to inline contents only:', err?.message || err);
    storageKey = null;
    downloadUrl = null;
    signedUrlExpiresAt = undefined;
    storageProvider = undefined;
  }

  return {
    ok: true,
    summary,
    contentsList,
    downloadUrl,
    artifacts: [
      {
        title: 'Launch pack',
        mimeType: 'application/zip',
        internalTool: TOOL_KEY,
        payload: {
          title: 'Launch pack',
          internalTool: TOOL_KEY,
          artifactType: 'launch_pack',
          summary: summary.message,
          // Keep inline contents as a fallback for existing consumers and when storage is unavailable.
          contents: {
            'captions.txt': captions,
            'hashtags.txt': hashtags,
            'schedule.csv': schedule,
            'links.txt': links,
          },
          contentsList,
          storageKey: storageKey ?? undefined,
          url: downloadUrl ?? undefined,
          ...(signedUrlExpiresAt && storageProvider && {
            meta: {
              signedUrlExpiresAt,
              signedUrlTtlSeconds,
              storageProvider,
            },
          }),
          fileName: originalName,
          sizeBytes: typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function'
            ? Buffer.byteLength(captions + hashtags + schedule + links)
            : undefined,
          preview: {
            textSnippet: previewTextSnippet,
          },
        },
      },
    ],
  };
}

const spec = {
  toolKey: TOOL_KEY,
  capabilities: ['social', 'launch_pack', 'content_generation'],
  risk: 'R1' as const,
  executionMode: 'sync' as const,
  inputSchema: {
    required: ['missionId'],
    optional: ['platformTargets', 'startDate', 'durationDays'],
    types: {
      missionId: 'string',
      platformTargets: 'array',
      startDate: 'string',
      durationDays: 'number',
    },
  },
  outputSchema: {
    artifactId: true,
    downloadUrl: true,
    contentsList: true,
    summary: true,
  },
  requiredSecrets: [],
  retries: 0,
  timeoutMs: 30000,
};

export function registerLaunchpackTool(): void {
  registerTool(spec, runLaunchpack);
}
