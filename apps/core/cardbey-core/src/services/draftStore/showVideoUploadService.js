/**
 * Show section video upload — persists to storefrontSettings.featuredWorks + miniWebsite show section.
 * Bumps publishedAt on active stores so the global frontpage feed re-queues the store first.
 */

import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { uploadBufferToS3 } from '../../lib/s3Client.js';
import { VIDEO_UPLOAD_MAX_BYTES, VIDEO_UPLOAD_MAX_MB } from '../../constants/videoUploadLimits.js';
import { getMiniWebsiteSnapshot } from '../../lib/miniWebsiteSectionMerge.js';

const ALLOWED_VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const SHOW_SECTION_HEADING = 'Shows';

const showVideoUploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    if (ALLOWED_VIDEO_MIMES.has(mime)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported video type. Use MP4, WebM, or MOV.'), false);
    }
  },
});

export function showVideoUploadSingle(req, res, next) {
  showVideoUploadMulter.single('file')(req, res, (err) => {
    if (err) {
      const isLimit = err.code === 'LIMIT_FILE_SIZE';
      return res.status(isLimit ? 413 : 400).json({
        ok: false,
        error: isLimit ? 'file_too_large' : 'invalid_file',
        message: isLimit
          ? `Video must be ${VIDEO_UPLOAD_MAX_MB}MB or smaller.`
          : err.message || 'Invalid or missing file',
      });
    }
    next();
  });
}

function parseJsonObject(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : {};
    } catch {
      return {};
    }
  }
  return {};
}

function buildShowWork({ url, title, uploadedAt }) {
  const workId = `show-${randomUUID()}`;
  return {
    id: workId,
    title,
    kind: 'video',
    type: 'video',
    mediaUrl: url,
    thumbnailUrl: null,
    uploadedAt,
    ctaLabel: 'Watch',
  };
}

function prependShowWorkToStorefrontSettings(storefrontSettings, work) {
  const base = parseJsonObject(storefrontSettings);
  const existing = Array.isArray(base.featuredWorks) ? base.featuredWorks : [];
  return {
    ...base,
    featuredWorks: [work, ...existing],
  };
}

function prependShowWorkToMiniWebsite(stylePreferences, work) {
  const sp = parseJsonObject(stylePreferences);
  const { sections: prevSections, theme, miniBase } = getMiniWebsiteSnapshot(sp);
  const sections = Array.isArray(prevSections) ? prevSections.map((s) => ({ ...s })) : [];

  let showSection = sections.find((s) => s && typeof s === 'object' && String(s.type) === 'show');
  if (!showSection) {
    showSection = { type: 'show', content: { heading: SHOW_SECTION_HEADING, items: [] } };
    const uspIdx = sections.findIndex((s) => s?.type === 'usp_bar');
    if (uspIdx >= 0) sections.splice(uspIdx + 1, 0, showSection);
    else {
      const heroIdx = sections.findIndex((s) => s?.type === 'hero');
      sections.splice(heroIdx >= 0 ? heroIdx + 1 : 0, 0, showSection);
    }
  }

  const content =
    showSection.content && typeof showSection.content === 'object' && !Array.isArray(showSection.content)
      ? { ...showSection.content }
      : {};
  const existingItems = Array.isArray(content.items)
    ? content.items
    : Array.isArray(content.works)
      ? content.works
      : [];

  showSection.content = {
    ...content,
    heading: SHOW_SECTION_HEADING,
    items: [work, ...existingItems],
  };

  const updatedMini = {
    ...miniBase,
    sections,
    theme,
    updatedAt: work.uploadedAt,
  };

  return { ...sp, miniWebsite: updatedMini };
}

/**
 * @param {{
 *   prisma: import('@prisma/client').PrismaClient,
 *   storeId: string,
 *   file: Express.Multer.File,
 *   title?: string | null,
 * }} input
 */
export async function executeShowVideoUpload({ prisma, storeId, file, title }) {
  if (!file?.buffer?.length) {
    const err = new Error('File buffer is empty');
    err.statusCode = 400;
    throw err;
  }

  const mime = (file.mimetype || 'video/mp4').toLowerCase();
  if (!ALLOWED_VIDEO_MIMES.has(mime)) {
    const err = new Error('Unsupported video type. Use MP4, WebM, or MOV.');
    err.statusCode = 400;
    throw err;
  }
  if (file.buffer.length > VIDEO_UPLOAD_MAX_BYTES) {
    const err = new Error(`Video must be ${VIDEO_UPLOAD_MAX_MB}MB or smaller.`);
    err.statusCode = 413;
    throw err;
  }

  const originalName = file.originalname || 'show-video.mp4';
  const { url: storageUrl } = await uploadBufferToS3(file.buffer, originalName, mime, 'videos');
  const uploadedAt = new Date().toISOString();
  const workTitle =
    (typeof title === 'string' && title.trim()) ||
    originalName.replace(/\.[^.]+$/, '').trim() ||
    'Show video';
  const work = buildShowWork({ url: storageUrl, title: workTitle, uploadedAt });

  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, isActive: true, storefrontSettings: true, stylePreferences: true },
  });
  if (!store) {
    const err = new Error('Store not found');
    err.statusCode = 404;
    throw err;
  }

  const storefrontSettings = prependShowWorkToStorefrontSettings(store.storefrontSettings, work);
  const stylePreferences = prependShowWorkToMiniWebsite(store.stylePreferences, work);
  const bumpTime = new Date();

  await prisma.business.update({
    where: { id: storeId },
    data: {
      storefrontSettings,
      stylePreferences,
      updatedAt: bumpTime,
      ...(store.isActive ? { publishedAt: bumpTime } : {}),
    },
  });

  return { work, url: storageUrl, publishedAt: store.isActive ? bumpTime.toISOString() : null };
}
