// DANH: skill-round5-video
/**
 * analyze_video_brief — derive video style from store context (read-only).
 */

import { getPrismaClient } from '../../prisma.js';

export async function execute(input = {}) {
  const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : '';
  const userMessage = typeof input?.userMessage === 'string' ? input.userMessage : '';

  let storeName = 'Your store';
  let category = 'General';

  if (storeId) {
    try {
      const prisma = getPrismaClient();
      const business = await prisma.business.findFirst({
        where: { id: storeId },
        select: { name: true, type: true },
      });
      if (business?.name) storeName = business.name;
      if (business?.type) category = business.type;
    } catch {
      /* non-fatal */
    }
  }

  const msg = userMessage.toLowerCase();
  const style = msg.includes('promo') || msg.includes('sale') ? 'promotional' : 'brand_story';
  const duration = msg.includes('short') ? 15 : 30;
  const mood = msg.includes('energetic') || msg.includes('fun') ? 'energetic' : 'warm';

  return {
    status: 'ok',
    output: {
      style,
      duration,
      mood,
      keywords: [category, storeName, style, mood].filter(Boolean),
      storeName,
      category,
    },
  };
}

export default execute;
