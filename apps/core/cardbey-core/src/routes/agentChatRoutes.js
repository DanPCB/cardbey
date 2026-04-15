/**
 * Agent Chat attachment OCR: uses extractTextWithFallback (OpenAI Vision primary + optional Google Vision fallback). Store creation uses performMenuOcr unchanged.
 * POST /api/agent-chat/attachments/ocr — requireAuth, canAccessMission(missionId).
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { canAccessMission } from './agentMessagesRoutes.js';
import { getPrismaClient } from '../lib/prisma.js';
import { broadcastAgentMessage } from '../realtime/simpleSse.js';
import { extractTextWithFallback } from '../lib/ocr/ocrFallback.js';
import {
  AGENT_CHAT_OCR_FAILURE_MESSAGE,
  businessCardLooksLikeOcrText,
  isRefusalResponse,
} from '../modules/vision/runOcr.js';
import { parseOcrToEntities, buildSummaryAndBullets } from '../lib/ocrToEntities.js';
import { parseBusinessCardOCR, truncateRawTextForPayload, entitiesToBusinessProfile } from '../lib/businessCardParser.js';
import { mergeMissionContext } from '../lib/mission.js';
import { runPlannerInProcess } from '../lib/plannerExecutor.js';
import { resolvePublicUrl } from '../utils/publicUrl.js';

const router = Router();
const prisma = getPrismaClient();


/**
 * Resolve body to a single image URL for OCR. Prefer storageKey (look up Media) over imageUrl.
 * Returns { imageUrl } or null if neither resolved.
 */
async function resolveImageInput(body, req) {
  const { imageUrl, storageKey } = body ?? {};
  if (storageKey && typeof storageKey === 'string' && storageKey.trim()) {
    const media = await prisma.media.findFirst({
      where: { storageKey: storageKey.trim() },
      select: { url: true },
    });
    if (media?.url) {
      const absolute = media.url.startsWith('http') ? media.url : resolvePublicUrl(media.url, req);
      return { imageUrl: absolute, source: 'storageKey' };
    }
  }
  if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim()) {
    return { imageUrl: imageUrl.trim(), source: 'imageUrl' };
  }
  return null;
}

/**
 * Convert HTTP(S) image URL to data URL so we use the same input format as store creation (photoDataUrl).
 * Does not modify performMenuOcr; callers pass the result to it.
 */
async function imageUrlToDataUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') throw new Error('imageUrl required');
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith('data:image/')) return trimmed;
  const response = await fetch(trimmed, {
    headers: { 'User-Agent': 'Cardbey-OCR/1.0' },
  });
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  return `data:${contentType};base64,${base64}`;
}

/**
 * POST /api/agent-chat/attachments/ocr
 * Body: { missionId: string, imageDataUrl?: string, imageUrl?: string, storageKey?: string }
 * When imageDataUrl is provided (data:image/...), it is used directly and no URL fetch is performed (avoids 502 when backend cannot reach frontend URL).
 * Returns: { ok: true, extractedText: string, entities?: object } or 4xx + optional system message posted.
 */
router.post('/attachments/ocr', requireAuth, async (req, res, next) => {
  try {
    const { missionId, imageDataUrl: bodyDataUrl } = req.body ?? {};
    const missionIdTrimmed = missionId && typeof missionId === 'string' ? missionId.trim() : '';
    if (!missionIdTrimmed) {
      return res.status(400).json({
        ok: false,
        code: 'MISSION_ID_REQUIRED',
        message: 'missionId is required',
      });
    }

    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission',
      });
    }

    let imageInputForOcr;
    const hasDirectDataUrl =
      bodyDataUrl && typeof bodyDataUrl === 'string' && bodyDataUrl.trim().startsWith('data:image/');

    if (hasDirectDataUrl) {
      imageInputForOcr = bodyDataUrl.trim();
      if (process.env.NODE_ENV !== 'production') {
        console.log('[agent-chat/attachments/ocr] input source: imageDataUrl (no fetch)');
      }
    } else {
      const resolved = await resolveImageInput(req.body, req);
      if (!resolved?.imageUrl) {
        return res.status(400).json({
          ok: false,
          code: 'IMAGE_REQUIRED',
          message: 'imageDataUrl, imageUrl, or storageKey is required',
        });
      }
      const imageUrl = resolved.imageUrl;
      if (process.env.NODE_ENV !== 'production') {
        console.log('[agent-chat/attachments/ocr] input source:', resolved.source);
      }

      const inputFormat = imageUrl.trim().startsWith('data:image/') ? 'data_url' : 'url';
      if (process.env.NODE_ENV !== 'production') {
        console.log('[agent-chat/attachments/ocr] input format:', inputFormat);
      }
      if (inputFormat === 'data_url') {
        imageInputForOcr = imageUrl;
      } else {
        try {
          imageInputForOcr = await imageUrlToDataUrl(imageUrl);
        } catch (fetchErr) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[agent-chat/attachments/ocr] Failed to fetch image URL:', fetchErr?.message || fetchErr);
          }
          try {
            const failMsg = await prisma.agentMessage.create({
              data: {
                missionId: missionIdTrimmed,
                senderType: 'system',
                senderId: 'system',
                visibleToUser: true,
                channel: 'main',
                performative: null,
                messageType: 'text',
                content: { text: AGENT_CHAT_OCR_FAILURE_MESSAGE },
                payload: null,
              },
            });
            broadcastAgentMessage(missionIdTrimmed, { missionId: missionIdTrimmed, message: failMsg });
          } catch (createErr) {
            console.warn('[agent-chat/attachments/ocr] Failed to post OCR failure message:', createErr?.message || createErr);
          }
          return res.status(502).json({
            ok: false,
            code: 'OCR_FAILED',
            message: 'Could not load image. Please try uploading again or type business name, phone, and address in chat.',
          });
        }
      }
      if (process.env.NODE_ENV !== 'production' && inputFormat === 'url') {
        console.log('[agent-chat/attachments/ocr] converted URL to data_url for OCR (same as store creation)');
      }
    }

    const MAX_IMAGE_DATA_URL_LENGTH = 8 * 1024 * 1024;
    if (imageInputForOcr.length > MAX_IMAGE_DATA_URL_LENGTH) {
      return res.status(413).json({
        ok: false,
        code: 'IMAGE_TOO_LARGE',
        message: 'Image is too large for OCR. Please use a smaller image.',
      });
    }

    let ocrResult;
    try {
      ocrResult = await extractTextWithFallback({
        imageDataUrl: imageInputForOcr,
        purpose: 'business_card',
      });
    } catch (ocrErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[agent-chat/attachments/ocr] OCR failed:', ocrErr?.message || ocrErr);
      }
      try {
        const failMsg = await prisma.agentMessage.create({
          data: {
            missionId: missionIdTrimmed,
            senderType: 'system',
            senderId: 'system',
            visibleToUser: true,
            channel: 'main',
            performative: null,
            messageType: 'text',
            content: { text: AGENT_CHAT_OCR_FAILURE_MESSAGE },
            payload: null,
          },
        });
        broadcastAgentMessage(missionIdTrimmed, { missionId: missionIdTrimmed, message: failMsg });
      } catch (createErr) {
        console.warn('[agent-chat/attachments/ocr] Failed to post OCR failure message:', createErr?.message || createErr);
      }
      return res.status(502).json({
        ok: false,
        code: 'OCR_FAILED',
        message: 'Image OCR failed. A message was added to the chat.',
      });
    }

    const extractedText = ocrResult.text;
    const dataUrlPrefix = typeof imageInputForOcr === 'string'
      ? imageInputForOcr.slice(0, 50)
      : '(no dataUrl)';
    const imageByteSize = typeof imageInputForOcr === 'string' && imageInputForOcr.startsWith('data:')
      ? Math.floor((imageInputForOcr.length - (imageInputForOcr.indexOf(',') >= 0 ? imageInputForOcr.indexOf(',') + 1 : 0)) * 0.75)
      : 0;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[agent-chat/attachments/ocr] providerUsed:', ocrResult.providerUsed, 'didFallback:', ocrResult.didFallback);
      console.log('[agent-chat/attachments/ocr] image dataUrl prefix:', dataUrlPrefix);
      console.log('[agent-chat/attachments/ocr] image byte size (approx):', imageByteSize);
      console.log('[agent-chat/attachments/ocr] OCR text first 80 chars:', (extractedText || '').slice(0, 80));
    }

    const ocrRejected = isRefusalResponse(extractedText) || !businessCardLooksLikeOcrText(extractedText);
    if (ocrRejected) {
      console.warn('[agent-chat/attachments/ocr] OCR returned refusal or non–business-card text; not creating research_result');
      try {
        const failMsg = await prisma.agentMessage.create({
          data: {
            missionId: missionIdTrimmed,
            senderType: 'system',
            senderId: 'system',
            visibleToUser: true,
            channel: 'main',
            performative: null,
            messageType: 'text',
            content: { text: AGENT_CHAT_OCR_FAILURE_MESSAGE },
            payload: null,
          },
        });
        broadcastAgentMessage(missionIdTrimmed, { missionId: missionIdTrimmed, message: failMsg });
      } catch (createErr) {
        console.warn('[agent-chat/attachments/ocr] Failed to post OCR failure message:', createErr?.message || createErr);
      }
      return res.status(502).json({
        ok: false,
        code: 'OCR_FAILED',
        message: 'OCR did not return usable text. Please type business name, phone, and address in chat.',
      });
    }

    const parsed = parseBusinessCardOCR(extractedText, { country: 'AU' });
    const hasStructured = parsed.extractedEntities && Object.keys(parsed.extractedEntities).length > 0;
    const entities = hasStructured ? parsed.extractedEntities : parseOcrToEntities(extractedText);
    const { summary, bullets } = buildSummaryAndBullets(entities, extractedText);
    const rawTextStored = truncateRawTextForPayload(extractedText);

    const payload = {
      title: 'Image summary (OCR)',
      summary,
      bullets,
      extractedEntities: entities,
      query: 'OCR from attachment',
      details: { rawText: rawTextStored },
      meta: { providerUsed: ocrResult.providerUsed },
    };
    if (hasStructured && parsed.confidence && Object.keys(parsed.confidence).length > 0) {
      payload.confidence = parsed.confidence;
    }

    const researchMsg = await prisma.agentMessage.create({
      data: {
        missionId: missionIdTrimmed,
        senderType: 'agent',
        senderId: 'research',
        visibleToUser: true,
        channel: 'main',
        performative: null,
        messageType: 'research_result',
        content: { text: summary },
        payload,
      },
    });
    broadcastAgentMessage(missionIdTrimmed, { missionId: missionIdTrimmed, message: researchMsg });

    const normalizedProfile = entitiesToBusinessProfile(entities);
    if (Object.keys(normalizedProfile).length > 0) {
      await mergeMissionContext(missionIdTrimmed, { businessProfile: normalizedProfile }).catch(() => {});
      if (process.env.NODE_ENV !== 'production') {
        console.log('[agent-chat/attachments/ocr] businessProfile merged keys:', Object.keys(normalizedProfile));
      }
    }

    // Run planner with updated context so the plan uses the extracted business card data
    runPlannerInProcess(missionIdTrimmed).catch((err) =>
      console.warn('[agent-chat/attachments/ocr] runPlannerInProcess failed:', err?.message || err)
    );

    return res.json({
      ok: true,
      extractedText,
      entities,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
