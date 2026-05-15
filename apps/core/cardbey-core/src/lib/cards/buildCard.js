import cuid from 'cuid';
import QRCode from 'qrcode';
import { getPrismaClient } from '../prisma.js';
import { emitHealthProbe } from '../telemetry/healthProbes.js';
import { writeStepOutput } from '../missionContextBus.js';
import { getCardSize } from './cardSizeStandards.js';
import { renderCard } from './cardRenderer.js';
import { resolveContent } from '../contentResolution/contentResolver.js';

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function getPublicOrigin() {
  const raw =
    (typeof process.env.PUBLIC_BASE_URL === 'string' && process.env.PUBLIC_BASE_URL.trim()) ||
    'http://localhost:5174';
  return raw.replace(/\/+$/, '');
}

/**
 * Loads account fields used for profile-style digital cards (matches My Account / Edit Profile).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 */
async function loadAccountProfileForCard(prisma, userId) {
  if (!userId || !prisma?.user?.findUnique) return null;
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        displayName: true,
        fullName: true,
        tagline: true,
        bio: true,
        avatarUrl: true,
        profilePhoto: true,
        phone: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        country: true,
        postcode: true,
      handle: true,
      },
    });
    if (!u) return null;
    const displayName =
      [u.displayName, u.fullName].find((x) => typeof x === 'string' && String(x).trim()) || '';
    const lines = [
      u.addressLine1,
      u.addressLine2,
      [u.city, u.postcode].filter(Boolean).join(' ').trim() || null,
      u.country,
    ]
      .filter((x) => x != null && String(x).trim())
      .map((x) => String(x).trim());
    const addressBlock = lines.join('\n');
    const origin = getPublicOrigin();
    const handle = typeof u.handle === 'string' && u.handle.trim() ? u.handle.trim() : '';
    const publicProfileUrl = handle ? `${origin}/u/${encodeURIComponent(handle)}` : null;
    return {
      displayName,
      tagline: typeof u.tagline === 'string' ? u.tagline.trim() : '',
      bio: typeof u.bio === 'string' ? u.bio.trim() : '',
      email: typeof u.email === 'string' ? u.email.trim() : '',
      phone: typeof u.phone === 'string' ? u.phone.trim() : '',
      addressBlock,
      avatarUrl: typeof u.avatarUrl === 'string' && u.avatarUrl.trim() ? u.avatarUrl.trim() : '',
      profilePhoto: typeof u.profilePhoto === 'string' && u.profilePhoto.trim() ? u.profilePhoto.trim() : '',
      publicProfileUrl,
    };
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown>} raw
 * @param {Awaited<ReturnType<typeof loadAccountProfileForCard>>} snap
 */
function mergeInputWithAccountProfile(raw, snap, { preferUserProfile, type }) {
  const i = { ...raw };
  if (!snap) return i;
  const display = snap.displayName;
  const logo = snap.avatarUrl || snap.profilePhoto;
  if (preferUserProfile) {
    if (display) i.businessName = display;
    if (logo) i.logoUrl = i.logoUrl || logo;
  } else if (type === 'profile') {
    const bn = typeof i.businessName === 'string' ? i.businessName.trim() : '';
    if (!bn || bn === 'My Business') {
      if (display) i.businessName = display;
    }
    if (logo && !i.logoUrl) i.logoUrl = logo;
  }
  return i;
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

const BUILD_CARD_TOOL = 'build_card';

export async function buildCard(missionId, input, options) {
  const prisma = options?.prisma ?? getPrismaClient();
  const emitContextUpdate = options?.emitContextUpdate;
  const userId = typeof options?.userId === 'string' ? options.userId.trim() : '';
  const tenantKey =
    typeof options?.tenantId === 'string' && options.tenantId.trim()
      ? options.tenantId.trim()
      : userId || 'cards';

  const writeStep = (stepIndex, stepTitle, output = {}) => {
    const mid = typeof missionId === 'string' ? missionId.trim() : '';
    if (!mid || stepIndex < 1) return;
    writeStepOutput(mid, { stepIndex, toolName: BUILD_CARD_TOOL, stepTitle }, output).catch(() => {});
  };

  const safeFallback = {
    cardId: null,
    liveUrl: null,
    qrCodeUrl: null,
    designJson: null,
    title: null,
  };

  try {
    await emitReasoning(emitContextUpdate, '🪪 Reading card parameters...');

    const preferUserProfile = options?.preferUserProfile === true;
    const rawIn = asObject(input);
    const typeRaw = typeof rawIn.type === 'string' ? rawIn.type.trim().toLowerCase() : 'profile';
    const type =
      ['profile', 'loyalty', 'promo', 'gift', 'event', 'invitation'].includes(typeRaw) ? typeRaw : 'profile';

    let profileSnap = null;
    if (userId && (type === 'profile' || preferUserProfile)) {
      profileSnap = await loadAccountProfileForCard(prisma, userId);
    }
    let i = mergeInputWithAccountProfile(rawIn, profileSnap, { preferUserProfile, type });

    const businessName =
      typeof i.businessName === 'string' && i.businessName.trim() ? i.businessName.trim() : 'My Business';
    const businessType =
      typeof i.businessType === 'string' && i.businessType.trim() ? i.businessType.trim() : 'General';
    const offer = typeof i.offer === 'string' && i.offer.trim() ? i.offer.trim() : '';
    const eventDate = typeof i.eventDate === 'string' && i.eventDate.trim() ? i.eventDate.trim() : '';
    const eventVenue = typeof i.eventVenue === 'string' && i.eventVenue.trim() ? i.eventVenue.trim() : '';
    const mediaUrl = typeof i.mediaUrl === 'string' && i.mediaUrl.trim() ? i.mediaUrl.trim() : '';

    const resolvedSize = getCardSize(type, asObject(i.sizeOverride));

    writeStep(1, 'Read document parameters', {
      status: 'done',
      type,
      businessName,
      businessType,
      fromAccountProfile: Boolean(profileSnap && type === 'profile'),
    });

    await emitReasoning(emitContextUpdate, '✍️ Generating card content...');

    let resolvedTitle;
    let resolvedBody;
    let resolvedCta;

    if (profileSnap && type === 'profile') {
      const tagCombined =
        [profileSnap.tagline, profileSnap.bio].find((x) => typeof x === 'string' && x.trim()) || '';
      resolvedTitle = businessName;
      resolvedBody = (tagCombined || businessType).slice(0, 280);
      resolvedCta = profileSnap.publicProfileUrl ? 'View public profile' : 'Chat with us';
    } else {
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
      resolvedTitle = titleRes?.content || businessName;
      resolvedBody = bodyRes?.content || businessType;
      resolvedCta = ctaRes?.content || 'Chat with us';
    }

    writeStep(2, 'Generate content', { status: 'done', title: resolvedTitle, body: resolvedBody, cta: resolvedCta });

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
      ...(profileSnap && type === 'profile'
        ? {
            email: profileSnap.email || null,
            phone: profileSnap.phone || null,
            address: profileSnap.addressBlock || null,
            publicProfileUrl: profileSnap.publicProfileUrl || null,
          }
        : {}),
    };

    writeStep(3, 'Configure card agent', { status: 'done', agentPersonality, capabilities });

    await emitReasoning(emitContextUpdate, '🎨 Designing card layout...');

    const logoUrl =
      typeof i.logoUrl === 'string' && i.logoUrl.trim() ? i.logoUrl.trim() : null;
    const profileTaglineForHtml =
      profileSnap && type === 'profile'
        ? [profileSnap.tagline, profileSnap.bio].find((x) => typeof x === 'string' && x.trim()) || ''
        : '';

    const designJson = {
      template: type,
      theme: type === 'profile' ? 'professional' : 'modern',
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
      logo: logoUrl,
      logoUrl,
      ...(profileSnap && type === 'profile'
        ? {
            tagline: profileTaglineForHtml || undefined,
            subtitle: profileSnap.addressBlock || undefined,
            phone: profileSnap.phone || undefined,
            email: profileSnap.email || undefined,
            website: profileSnap.publicProfileUrl || undefined,
          }
        : {}),
      size: resolvedSize,
    };

    writeStep(4, 'Design layout', { status: 'done', template: designJson.template, colors: designJson.colors });

    const cardId = cuid();
    const base = getPublicOrigin();
    const cardViewUrl = `${base}/card/${cardId}/view`;
    const scanTargetUrl =
      profileSnap && type === 'profile' && profileSnap.publicProfileUrl
        ? profileSnap.publicProfileUrl
        : cardViewUrl;
    const liveUrl = scanTargetUrl;

    await emitReasoning(emitContextUpdate, '🔗 Generating QR code...');

    let qrCodeUrl = null;
    try {
      qrCodeUrl = await QRCode.toDataURL(scanTargetUrl);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[buildCard] QR generation failed:', e?.message ?? e);
    }

    writeStep(5, 'Generate QR code', { status: 'done', qrCodeUrl: qrCodeUrl ?? null, liveUrl });

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

    writeStep(6, 'Save to Suitcase', { status: 'done', cardId: created.id, liveUrl: created.liveUrl });

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
    writeStep(7, 'Card ready', {
      status: 'done',
      cardId: created.id,
      liveUrl: created.liveUrl,
      qrCodeUrl: created.qrCodeUrl,
    });
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

