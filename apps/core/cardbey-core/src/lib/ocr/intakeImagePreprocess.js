/**
 * Intake V2 — OCR / vision pre-processing before classification.
 * One vision call returns structured sections for classifier + tool parameters.
 */

import { runOcr } from '../../modules/vision/runOcr.js';

const MAX_TEXT_FOR_CLASSIFIER = 8000;

/**
 * @param {string} raw
 * @returns {{ imageText: string, imageDescription: string, raw: string }}
 */
export function parseIntakePreprocessVisionOutput(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { imageText: '', imageDescription: '', raw: text };

  const headerText = '---IMAGE_TEXT---';
  const headerDesc = '---IMAGE_DESCRIPTION---';
  const tIdx = text.indexOf(headerText);
  const dIdx = text.indexOf(headerDesc);

  if (tIdx >= 0 && dIdx > tIdx) {
    const imageText = text.slice(tIdx + headerText.length, dIdx).trim();
    const afterDesc = text.slice(dIdx + headerDesc.length).trim();
    const imageDescription = afterDesc.split(/\n+/)[0]?.trim() || '';
    return { imageText, imageDescription, raw: text };
  }
  if (tIdx >= 0) {
    const imageText = text.slice(tIdx + headerText.length).trim();
    return { imageText, imageDescription: '', raw: text };
  }
  if (dIdx >= 0) {
    const afterDesc = text.slice(dIdx + headerDesc.length).trim();
    const imageDescription = afterDesc.split(/\n+/)[0]?.trim() || '';
    const imageText = dIdx > 0 ? text.slice(0, dIdx).trim() : '';
    return { imageText, imageDescription, raw: text };
  }

  return { imageText: text, imageDescription: '', raw: text };
}

/**
 * @param {string} imageDataUrl
 * @returns {Promise<{ imageText: string, imageDescription: string, raw: string }>}
 */
export async function extractIntakeImageAttachment(imageDataUrl) {
  if (!imageDataUrl || typeof imageDataUrl !== 'string') {
    return { imageText: '', imageDescription: '', raw: '' };
  }
  const raw = await runOcr(imageDataUrl.trim(), { task: 'intake_preprocess' });
  return parseIntakePreprocessVisionOutput(raw);
}

/**
 * Appended to the classifier user message so the LLM sees transcript + summary.
 * @param {string} originalMessage
 * @param {{ imageText?: string, imageDescription?: string } | null} p
 */
export function buildClassifierAugmentedUserMessage(originalMessage, p) {
  if (!p || (!p.imageText?.trim() && !p.imageDescription?.trim())) {
    return originalMessage;
  }
  const parts = [`User message: "${originalMessage}"`];
  if (p.imageDescription?.trim()) {
    parts.push(`Image summary (for routing): ${p.imageDescription.trim()}`);
  }
  if (p.imageText?.trim()) {
    const tx = p.imageText.trim().slice(0, MAX_TEXT_FOR_CLASSIFIER);
    parts.push(`Text extracted from attached image:\n${tx}`);
  }
  return parts.join('\n\n');
}

/**
 * Single string for campaignContext / plan parameters (executors).
 * @param {{ imageText?: string, imageDescription?: string } | null} p
 */
export function buildCampaignContextFromPreprocess(p) {
  if (!p) return '';
  const blocks = [];
  if (p.imageText?.trim()) blocks.push(`Text from image:\n${p.imageText.trim()}`);
  if (p.imageDescription?.trim()) blocks.push(`Visual summary:\n${p.imageDescription.trim()}`);
  return blocks.join('\n\n');
}
