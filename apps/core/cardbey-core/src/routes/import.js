// src/routes/import.js
import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import fssync from 'fs';
import { PrismaClient } from '@prisma/client';
import { lookup as mimeLookup } from 'mime-types';
// Lazy load sharp to avoid startup crashes if platform binaries aren't available
let sharp = null;

async function getSharp() {
  if (sharp) return sharp;
  
  try {
    const sharpModule = await import('sharp');
    sharp = sharpModule.default;
    return sharp;
  } catch (error) {
    console.warn('[import] Failed to load sharp:', error.message);
    console.warn('[import] Image metadata extraction will be disabled');
    return null;
  }
}

// Lazy load ffmpeg to avoid startup crashes if packages aren't installed
let ffmpeg = null;
let ffprobeStatic = null;

async function getFfmpeg() {
  if (ffmpeg) return ffmpeg;
  
  try {
    const ffmpegModule = await import('fluent-ffmpeg');
    ffmpeg = ffmpegModule.default;
    
    const ffprobeStaticModule = await import('ffprobe-static');
    ffprobeStatic = ffprobeStaticModule.default;
    
    if (ffmpeg && ffprobeStatic?.path) {
      ffmpeg.setFfprobePath(ffprobeStatic.path);
    }
    
    return ffmpeg;
  } catch (error) {
    console.warn('[import] Failed to load ffmpeg packages:', error.message);
    return null;
  }
}

const router = Router();
const prisma = new PrismaClient();

function isMedia(file) {
  const m = (mimeLookup(file) || '').toString();
  return m.startsWith('image/') || m.startsWith('video/');
}

router.post('/folder-to-playlist', async (req, res) => {
  try {
    // body: { folderPath: string, playlistName?: string, overwrite?: boolean }
    const { folderPath, playlistName, overwrite } = req.body || {};

    if (!folderPath) {
      return res.status(400).json({ error: 'folderPath required' });
    }

    const abs = path.resolve(folderPath);

    if (!fssync.existsSync(abs)) {
      return res.status(400).json({ error: 'Folder not found' });
    }

    const files = (await fs.readdir(abs))
      .filter(f => isMedia(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (!files.length) {
      return res.status(400).json({ error: 'No media files in folder' });
    }

    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fssync.existsSync(uploadsDir)) {
      fssync.mkdirSync(uploadsDir, { recursive: true });
    }

    const mediaIds = [];

    for (const file of files) {
      const src = path.join(abs, file);
      const timestamp = Date.now();
      const safeName = file.replace(/\s+/g, '_');
      const dst = path.join(uploadsDir, `${timestamp}_${safeName}`);

      // Copy file
      await fs.copyFile(src, dst);

      const url = `/uploads/${path.basename(dst)}`;
      const mime = (mimeLookup(dst) || 'application/octet-stream').toString();
      const stat = await fs.stat(dst);
      const kind = mime.startsWith('video/') ? 'VIDEO' : 'IMAGE';

      // Extract metadata (same logic as upload route)
      let width;
      let height;
      let durationS;

      if (kind === 'IMAGE') {
        const sharpInstance = await getSharp();
        if (sharpInstance) {
          try {
            const meta = await sharpInstance(dst).metadata();
            width = meta.width ?? undefined;
            height = meta.height ?? undefined;
          } catch (err) {
            console.warn('[import] Failed to extract image metadata:', err);
          }
        } else {
          console.warn('[import] sharp not available, skipping image metadata extraction');
        }
      } else {
        // VIDEO
        const ffmpegInstance = await getFfmpeg();
        if (ffmpegInstance && ffmpegInstance.ffprobe) {
          try {
            await new Promise((resolve) => {
              ffmpegInstance.ffprobe(dst, (err, data) => {
                if (!err && data.streams?.length) {
                  const v = data.streams.find(s => s.codec_type === 'video');
                  width = v?.width || undefined;
                  height = v?.height || undefined;
                  durationS = Number(data.format?.duration) || undefined;
                }
                resolve();
              });
            });
          } catch (err) {
            console.warn('[import] Failed to extract video metadata:', err.message);
          }
        } else {
          console.warn('[import] ffmpeg not available, skipping video metadata extraction');
        }
      }

      const created = await prisma.media.create({
        data: {
          url,
          kind,
          mime,
          width: width ?? null,
          height: height ?? null,
          durationS: durationS ?? null,
          sizeBytes: Number(stat.size),
        },
      });

      mediaIds.push(created.id);
    }

    const p = await prisma.playlist.create({
      data: {
        type: 'MEDIA', // Explicitly set type for media playlists
        name: playlistName || path.basename(abs),
        items: {
          create: mediaIds.map((id, idx) => ({
            orderIndex: idx,
            durationS: 8,
            fit: 'cover',
            muted: true,
            loop: false,
            media: { connect: { id } },
          })),
        },
      },
      include: {
        items: {
          include: { media: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    // Broadcast playlist.updated event - find screens using this playlist and target them
    try {
      const { broadcast } = await import('../realtime/sse.js');
      
      // Find all screens assigned to this playlist (excluding soft-deleted)
      const screensUsingPlaylist = await prisma.screen.findMany({
        where: {
          assignedPlaylistId: p.id,
          deletedAt: null,
        },
        select: { id: true }
      });
      
      // Broadcast to each screen that uses this playlist
      screensUsingPlaylist.forEach(screen => {
        broadcast('playlist.updated', { 
          playlistId: p.id,
          screenId: screen.id  // Target specific screen
        });
      });
      
      // Also broadcast generic event (for backward compatibility)
      broadcast('playlist.updated', { playlistId: p.id });
      
      console.log(`[import.routes] Broadcast playlist.updated event for playlistId=${p.id} to ${screensUsingPlaylist.length} screens`);
    } catch (broadcastError) {
      console.error('[import.routes] Failed to broadcast playlist.updated:', broadcastError);
      // Don't fail the request if broadcast fails
    }

    res.status(201).json({ data: p });
  } catch (e) {
    console.error('[import.routes] POST /folder-to-playlist error:', e);
    res.status(500).json({ error: 'Import failed', message: e.message });
  }
});

export default router;



