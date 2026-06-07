/**
 * Explore featured videos — Prisma when available, JSON file fallback for dev.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../../lib/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.resolve(__dirname, '../../.cache/exploreVideos.json');

const DEFAULT_MAX_BYTES = Number(process.env.EXPLORE_VIDEO_MAX_BYTES || 100 * 1024 * 1024);

export const EXPLORE_VIDEO_ALLOWED_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

export function getExploreVideoMaxBytes() {
  return Number.isFinite(DEFAULT_MAX_BYTES) && DEFAULT_MAX_BYTES > 0
    ? DEFAULT_MAX_BYTES
    : 100 * 1024 * 1024;
}

function hasPrismaModel() {
  return Boolean(prisma?.exploreVideo);
}

function readJsonStore() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return [];
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonStore(rows) {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(rows, null, 2), 'utf8');
}

function normalizeRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    category: row.category || '',
    videoUrl: row.videoUrl,
    thumbnailUrl: row.thumbnailUrl || null,
    duration: row.duration ?? null,
    ctaIntent: row.ctaIntent || null,
    status: row.status === 'draft' ? 'draft' : 'published',
    priority: typeof row.priority === 'number' ? row.priority : 50,
    createdBy: row.createdBy || null,
    createdAt: row.createdAt || new Date().toISOString(),
    updatedAt: row.updatedAt || new Date().toISOString(),
  };
}

function sortVideos(rows) {
  return [...rows].sort((a, b) => {
    const p = (b.priority ?? 0) - (a.priority ?? 0);
    if (p !== 0) return p;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function listExploreVideos({ includeDraft = false } = {}) {
  let rows = [];
  if (hasPrismaModel()) {
    rows = await prisma.exploreVideo.findMany({
      where: includeDraft ? undefined : { status: 'published' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  } else {
    rows = readJsonStore();
    if (!includeDraft) rows = rows.filter((r) => r.status === 'published');
  }
  return sortVideos(rows.map(normalizeRow));
}

export async function getExploreVideoById(id) {
  if (hasPrismaModel()) {
    const row = await prisma.exploreVideo.findUnique({ where: { id } });
    return row ? normalizeRow(row) : null;
  }
  const row = readJsonStore().find((r) => r.id === id);
  return row ? normalizeRow(row) : null;
}

export async function createExploreVideo(payload) {
  const data = {
    title: String(payload.title || '').trim(),
    description: String(payload.description || '').trim(),
    category: String(payload.category || '').trim(),
    videoUrl: payload.videoUrl,
    thumbnailUrl: payload.thumbnailUrl || null,
    duration: payload.duration ?? null,
    ctaIntent: payload.ctaIntent || null,
    status: payload.status === 'draft' ? 'draft' : 'published',
    priority: typeof payload.priority === 'number' ? payload.priority : 200,
    createdBy: payload.createdBy || null,
  };

  if (!data.title || !data.videoUrl) {
    throw Object.assign(new Error('title_and_video_required'), { status: 400 });
  }

  if (hasPrismaModel()) {
    const row = await prisma.exploreVideo.create({ data });
    return normalizeRow(row);
  }

  const row = normalizeRow({
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const all = readJsonStore();
  all.push(row);
  writeJsonStore(all);
  return row;
}

export async function updateExploreVideo(id, patch, actorId, isAdmin = false) {
  const existing = await getExploreVideoById(id);
  if (!existing) return null;
  if (!isAdmin && existing.createdBy && actorId && existing.createdBy !== actorId) {
    const err = new Error('forbidden');
    err.status = 403;
    throw err;
  }

  const data = {};
  if (patch.title != null) data.title = String(patch.title).trim();
  if (patch.description != null) data.description = String(patch.description).trim();
  if (patch.category != null) data.category = String(patch.category).trim();
  if (patch.videoUrl != null) data.videoUrl = patch.videoUrl;
  if (patch.thumbnailUrl != null) data.thumbnailUrl = patch.thumbnailUrl;
  if (patch.duration != null) data.duration = patch.duration;
  if (patch.ctaIntent != null) data.ctaIntent = patch.ctaIntent || null;
  if (patch.status != null) data.status = patch.status === 'draft' ? 'draft' : 'published';
  if (patch.priority != null) data.priority = Number(patch.priority);

  if (hasPrismaModel()) {
    const row = await prisma.exploreVideo.update({ where: { id }, data });
    return normalizeRow(row);
  }

  const all = readJsonStore();
  const idx = all.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  all[idx] = normalizeRow({ ...all[idx], ...data, updatedAt: new Date().toISOString() });
  writeJsonStore(all);
  return all[idx];
}

export async function deleteExploreVideo(id, actorId, isAdmin) {
  const existing = await getExploreVideoById(id);
  if (!existing) return false;
  if (!isAdmin && existing.createdBy && actorId && existing.createdBy !== actorId) {
    const err = new Error('forbidden');
    err.status = 403;
    throw err;
  }

  if (hasPrismaModel()) {
    await prisma.exploreVideo.delete({ where: { id } });
    return true;
  }

  const all = readJsonStore().filter((r) => r.id !== id);
  writeJsonStore(all);
  return true;
}

export async function canManageExploreVideos(user) {
  if (!user) return false;
  if (user.isDevAdmin) return true;
  const role = String(user.role || '').trim().toLowerCase();
  if (role === 'admin' || role === 'super_admin') return true;
  if (role === 'owner') return true;
  try {
    const count = await prisma.business.count({ where: { userId: user.id } });
    return count > 0;
  } catch {
    return role === 'owner';
  }
}

export function validateVideoMime(mime) {
  const m = String(mime || '').toLowerCase();
  return EXPLORE_VIDEO_ALLOWED_MIME.has(m);
}

export function formatDurationLabel(seconds) {
  if (!seconds || !Number.isFinite(seconds)) return '';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${mins} min ${rem}s` : `${mins} min`;
}
