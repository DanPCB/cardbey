import cuid from 'cuid';
import QRCode from 'qrcode';
import { getPrismaClient } from '../prisma.js';
import { emitHealthProbe } from '../telemetry/healthProbes.js';
import { getCardSize } from './cardSizeStandards.js';
import { renderCard } from './cardRenderer.js';
import { resolveContent } from '../contentResolution/contentResolver.js';

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

async function emitReasoning(emitContextUpdate, line) {
  if (typeof emitContextUpdate !== 'function') return;
  await emitContextUpdate({ reasoning_line: { line, timestamp: Date.now() } }).catch(() => {});
}

function personalityForType(type) {
  const t = String(type ?? '').toLowerCase().trim();
  if (t === 'loyalty') return 'friendly rewards assistant';
  if (t === 'promo') return 'enthusiastic deals helper';
  if (t === 'event') return 'welcoming event guide';
  if (t === 'profile') return 'professional business representative';
  if (t === 'gift') return 'warm gift concierge';
  if (t === 'invitation') return 'gracious event host';
  return 'helpful assistant';
}

function capabilitiesForType(type) {
  const t = String(type ?? '').toLowerCase().trim();
  if (t === 'loyalty') return ['answer_faq', 'record_stamp', 'redeem'];
  if (t === 'promo') return ['answer_faq', 'redeem_promo'];
  if (t === 'gift') return ['answer_faq', 'check_balance', 'redeem_gift'];
  if (t === 'event') return ['answer_faq', 'record_rsvp', 'show_media'];
  if (t === 'invitation') return ['answer_faq', 'record_rsvp', 'show_media', 'send_reminder'];
  if (t === 'profile') return ['answer_faq', 'capture_lead', 'book_appointment'];
  return ['answer_faq'];
}

export async function buildCard(missionId, input, options) {
  const prisma = options?.prisma ?? getPrismaClient();
  const emitContextUpdate = options?.emitContextUpdate;
  const userId = typeof options?.userId === 'string' ? options.userId.trim() : '';
  const tenantKey =
    typeof options?.tenantId === 'string' && options.tenantId.trim()
      ? options.tenantId.trim()
      : userId || 'cards';

  const safeFallback = {
    cardId: null,
    liveUrl: null,
    qrCodeUrl: null,
    designJson: null,
    title: null,
  };

  try {
    await emitReasoning(emitContextUpdate, '🪪 Reading card parameters...');

    const i = asObject(input);
    const typeRaw = typeof i.type === 'string' ? i.type.trim().toLowerCase() : 'profile';
    const type =
      ['profile', 'loyalty', 'promo', 'gift', 'event', 'invitation'].includes(typeRaw) ? typeRaw : 'profile';

    const businessName =
      typeof i.businessName === 'string' && i.businessName.trim() ? i.businessName.trim() : 'My Business';
    const businessType =
      typeof i.businessType === 'string' && i.businessType.trim() ? i.businessType.trim() : 'General';
    const offer = typeof i.offer === 'string' && i.offer.trim() ? i.offer.trim() : '';
    const eventDate = typeof i.eventDate === 'string' && i.eventDate.trim() ? i.eventDate.trim() : '';
    const eventVenue = typeof i.eventVenue === 'string' && i.eventVenue.trim() ? i.eventVenue.trim() : '';
    const mediaUrl = typeof i.mediaUrl === 'string' && i.mediaUrl.trim() ? i.mediaUrl.trim() : '';

    const resolvedSize = getCardSize(type, asObject(i.sizeOverride));

    await emitReasoning(emitContextUpdate, '✍️ Generating card content...');

    const [titleRes, bodyRes, ctaRes] = await Promise.all([
      resolveContent(
        missionId ?? null,
        {
          type: 'slogan',
          businessName,
          businessType,
          verticalSlug: '',
          existingContent: offer || undefined,
          maxLength: 64,
          tenantKey,
        },
        { emitContextUpdate },
      ),
      resolveContent(
        missionId ?? null,
        {
          type: 'product_description',
          businessName,
          businessType,
          verticalSlug: '',
          maxLength: 140,
          tenantKey,
        },
        { emitContextUpdate },
      ),
      resolveContent(
        missionId ?? null,
        {
          type: 'slogan',
          businessName,
          businessType,
          verticalSlug: '',
          maxLength: 44,
          tenantKey,
        },
        { emitContextUpdate },
      ),
    ]);

    const resolvedTitle = titleRes?.content || businessName;
    const resolvedBody = bodyRes?.content || businessType;
    const resolvedCta = ctaRes?.content || 'Chat with us';

    await emitReasoning(emitContextUpdate, '🤖 Configuring card agent...');

    const agentPersonality = personalityForType(type);
    const capabilities = capabilitiesForType(type);
    const knowledgeBase = {
      businessName,
      businessType,
      offer: offer || resolvedTitle,
      eventDate: eventDate || null,
      eventVenue: eventVenue || null,
      cta: resolvedCta,
      mediaUrl: mediaUrl || null,
    };

    await emitReasoning(emitContextUpdate, '🎨 Designing card layout...');

    const designJson = {
      template: type,
      colors: {
        primary: typeof i.colorPrimary === 'string' && i.colorPrimary.trim() ? i.colorPrimary.trim() : '#7C3AED',
        secondary:
          typeof i.colorSecondary === 'string' && i.colorSecondary.trim() ? i.colorSecondary.trim() : '#F3F4F6',
      },
      fonts: { heading: 'Inter', body: 'Inter' },
      content: {
        title: resolvedTitle,
        body: resolvedBody,
        cta: resolvedCta,
        offer: offer || null,
        eventDate: eventDate || null,
        venue: eventVenue || null,
        mediaUrl: mediaUrl || null,
      },
      logo: typeof i.logoUrl === 'string' && i.logoUrl.trim() ? i.logoUrl.trim() : null,
      size: resolvedSize,
    };

    const cardId = cuid();
    const PUBLIC_BASE_URL =
      (typeof process.env.PUBLIC_BASE_URL === 'string' && process.env.PUBLIC_BASE_URL.trim()) ||
      'http://localhost:5174';
    const base = PUBLIC_BASE_URL.trim().replace(/\/+$/, '');
    const liveUrl = `${base}/card/${cardId}/view`;

    await emitReasoning(emitContextUpdate, '🔗 Generating QR code...');

    let qrCodeUrl = null;
    try {
      qrCodeUrl = await QRCode.toDataURL(liveUrl);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[buildCard] QR generation failed:', e?.message ?? e);
    }

    await emitReasoning(emitContextUpdate, '💾 Saving to Suitcase...');

    const created = await prisma.card.create({
      data: {
        id: cardId,
        userId,
        type,
        title: resolvedTitle,
        status: 'active',
        designJson,
        agentPersonality,
        knowledgeBase,
        capabilities: JSON.stringify(capabilities),
        autoApprove: true,
        liveUrl,
        qrCodeUrl,
        sizeW: resolvedSize.w,
        sizeH: resolvedSize.h,
        sizeUnit: resolvedSize.unit,
        sizeDpi: resolvedSize.dpi,
      },
      select: { id: true, liveUrl: true, qrCodeUrl: true, designJson: true, title: true, sizeW: true, sizeH: true, sizeUnit: true },
    });

    let rendered = '';
    try {
      rendered = renderCard(created);
    } catch {
      rendered = '';
    }

    if (typeof emitContextUpdate === 'function') {
      await emitContextUpdate({
        patch: {
          cardId: created.id,
          cardType: type,
          liveUrl: created.liveUrl,
          qrCodeUrl: created.qrCodeUrl,
          renderedHtml: rendered ? rendered.slice(0, 200) : undefined,
        },
      }).catch(() => {});
    }

    emitHealthProbe('card_created', { cardId: created.id, type, missionId: missionId ?? null });
    await emitReasoning(emitContextUpdate, '✅ Card ready in your Suitcase');

    return {
      cardId: created.id,
      liveUrl: created.liveUrl,
      qrCodeUrl: created.qrCodeUrl,
      designJson: created.designJson,
      title: created.title,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[buildCard] error:', e?.message ?? e);
    return safeFallback;
  }
}

