/**
 * Idempotent seed: "Build Cardbey With Us — Vietnamese SME Pilot"
 * All items DRAFT or READY_FOR_APPROVAL — never published.
 */

import { appendMarketingAudit } from './audit.js';
import { createTrackedDestination } from './attributionService.js';
import { CONTENT_STATES, PILOT_CAMPAIGN_NAME, TARGET_TYPES } from './constants.js';
import { marketingRepo } from './repository.js';
import { createCampaign } from './campaignService.js';

const VI_POSTS = [
  {
    title: 'VI — Xây dựng Cardbey cùng chúng tôi',
    body:
      'Cardbey là nền tảng tạo doanh nghiệp bằng AI đang được phát triển. ' +
      'Chúng tôi đang mở pilot sớm cho SME Việt Nam — hãy xây dựng Cardbey cùng chúng tôi. ' +
      'Ngôn ngữ ban đầu: Tiếng Việt và English.',
  },
  {
    title: 'VI — Pilot SME: early access',
    body:
      'Tham gia pilot Cardbey dành cho SME Việt Nam. ' +
      'Đây là early access — nền tảng vẫn under development, không phải sản phẩm hoàn thiện tự vận hành. ' +
      'Chúng tôi cần phản hồi thực tế từ doanh nghiệp nhỏ.',
  },
  {
    title: 'VI — FAQ nhanh',
    body:
      'Cardbey giúp gì? Hỗ trợ tạo cửa hàng / doanh nghiệp bằng AI (đang phát triển). ' +
      'Có đảm bảo doanh thu? Không — chúng tôi không cam kết ROI. ' +
      'Có live trên toàn cầu chưa? Chưa — pilot EN/VI trước.',
  },
];

const EN_VARIANTS = [
  {
    title: 'EN — Build Cardbey With Us',
    body:
      'Cardbey is an AI business creation platform under development. ' +
      'We are opening an early Vietnamese SME pilot — build Cardbey with us. ' +
      'Initial languages: English and Vietnamese.',
  },
  {
    title: 'EN — SME pilot early access',
    body:
      'Join the Cardbey pilot for Vietnamese SMEs. ' +
      'This is early access — the platform is under development, not a finished autonomous product. ' +
      'We need real feedback from small businesses.',
  },
  {
    title: 'EN — Quick FAQ',
    body:
      'What does Cardbey help with? AI-assisted business / store creation (under development). ' +
      'Guaranteed revenue? No — we do not promise ROI. ' +
      'Available worldwide? Not yet — EN/VI pilot first.',
  },
];

/**
 * @param {{ actorId?: string, baseUrl?: string }} [opts]
 */
export async function seedPilotCampaign(opts = {}) {
  const existing = await marketingRepo.campaign.findFirst({
    where: { name: PILOT_CAMPAIGN_NAME },
    include: { contentItems: true },
  });

  if (existing) {
    return {
      ok: true,
      idempotent: true,
      campaign: existing,
      message: 'Pilot campaign already seeded',
    };
  }

  const campaign = await createCampaign(
    {
      name: PILOT_CAMPAIGN_NAME,
      description: 'Vietnamese SME pilot — foundation drafts only. No live publish.',
      objective: 'pilot_invite',
      language: 'vi',
      targetType: TARGET_TYPES.USER_ACQUISITION,
      channel: 'facebook',
      market: 'vn',
      audience: { segment: 'vietnamese_sme', languages: ['vi', 'en'] },
      offer: 'Vietnamese SME early-access pilot',
      cta: 'Build Cardbey With Us',
      successCriteria: {
        metrics: ['pilot_signups', 'business_created', 'faq_engagement', 'claim_violation_rate'],
      },
      metadata: {
        seed: 'facebook_marketing_operator_pilot_v1',
        successMetrics: [
          'pilot_signups',
          'business_created',
          'faq_engagement',
          'claim_violation_rate',
        ],
      },
    },
    { actorId: opts.actorId ?? null },
  );

  const baseUrl = opts.baseUrl || process.env.PUBLIC_WEB_BASE || 'https://cardbey.com/pilot';
  const destination = createTrackedDestination({
    baseUrl,
    campaignId: campaign.id,
    channel: 'facebook',
    source: 'organic_page',
    placement: 'pilot_seed',
    creativeVersion: '1',
  });

  const created = [];

  for (let i = 0; i < VI_POSTS.length; i++) {
    const vi = VI_POSTS[i];
    const viRow = await marketingRepo.content.create({
      campaignId: campaign.id,
      title: vi.title,
      channel: 'facebook',
      language: 'vi',
      contentType: 'post',
      status: i === 2 ? CONTENT_STATES.READY_FOR_APPROVAL : CONTENT_STATES.DRAFT,
      body: vi.body,
      destination: destination.ok ? { url: destination.url } : null,
      trackingMeta: destination.ok ? destination.params : null,
      mediaBrief: null,
      metadata: { seedIndex: i, lang: 'vi' },
      generationMeta: { mode: 'seed', promptVersion: null, generatedAt: new Date().toISOString() },
      createdBy: opts.actorId ?? null,
      currentVersion: 1,
    });
    await marketingRepo.version.create({
      contentId: viRow.id,
      version: 1,
      body: vi.body,
      changeNote: 'seed',
      generationMeta: { mode: 'seed' },
      createdBy: opts.actorId ?? null,
    });
    created.push(viRow);

    const en = EN_VARIANTS[i];
    const enRow = await marketingRepo.content.create({
      campaignId: campaign.id,
      title: en.title,
      channel: 'facebook',
      language: 'en',
      contentType: 'post',
      status: CONTENT_STATES.DRAFT,
      body: en.body,
      parentContentId: viRow.id,
      destination: destination.ok ? { url: destination.url } : null,
      trackingMeta: destination.ok ? destination.params : null,
      metadata: { seedIndex: i, lang: 'en', variantOf: viRow.id },
      generationMeta: { mode: 'seed', promptVersion: null, generatedAt: new Date().toISOString() },
      createdBy: opts.actorId ?? null,
      currentVersion: 1,
    });
    await marketingRepo.version.create({
      contentId: enRow.id,
      version: 1,
      body: en.body,
      changeNote: 'seed',
      generationMeta: { mode: 'seed' },
      createdBy: opts.actorId ?? null,
    });
    created.push(enRow);
  }

  const imageBrief = await marketingRepo.content.create({
    campaignId: campaign.id,
    title: 'Image brief — pilot hero',
    channel: 'facebook',
    language: 'en',
    contentType: 'image_brief',
    status: CONTENT_STATES.DRAFT,
    body: 'Warm, local SME storefront / laptop workspace. No stock “AI robot” clichés. Brand: Cardbey. Text: Build with us.',
    mediaBrief: {
      format: '1:1',
      mood: 'optimistic_local',
      mustInclude: ['cardbey wordmark space', 'SME context'],
      avoid: ['guaranteed ROI badges', 'global launch fireworks'],
    },
    createdBy: opts.actorId ?? null,
  });
  created.push(imageBrief);

  const videoBrief = await marketingRepo.content.create({
    campaignId: campaign.id,
    title: 'Video brief — 30s pilot invite',
    channel: 'facebook',
    language: 'vi',
    contentType: 'video_brief',
    status: CONTENT_STATES.DRAFT,
    body: '30s: problem → Cardbey under development → invite Vietnamese SMEs to pilot. End card EN+VI.',
    mediaBrief: {
      durationSec: 30,
      captions: ['vi', 'en'],
      cta: 'Join the pilot',
    },
    createdBy: opts.actorId ?? null,
  });
  created.push(videoBrief);

  const faq = await marketingRepo.content.create({
    campaignId: campaign.id,
    title: 'FAQ set — pilot',
    channel: 'facebook',
    language: 'en',
    contentType: 'faq',
    status: CONTENT_STATES.READY_FOR_APPROVAL,
    body: JSON.stringify(
      [
        { q: 'Is Cardbey finished?', a: 'No — under development; EN/VI pilot.' },
        { q: 'Do you guarantee results?', a: 'No.' },
        { q: 'Is this live Meta verified?', a: 'No — foundation only.' },
      ],
      null,
      0,
    ),
    metadata: { faq: true },
    createdBy: opts.actorId ?? null,
  });
  created.push(faq);

  await marketingRepo.campaign.update({
    where: { id: campaign.id },
    data: {
      plan: {
        seed: true,
        destinationProposal: destination.ok ? destination : null,
        successMetrics: campaign.metadata?.successMetrics || [
          'pilot_signups',
          'business_created',
        ],
        autoPublish: false,
      },
      metadata: {
        ...(typeof campaign.metadata === 'object' && campaign.metadata ? campaign.metadata : {}),
        destinationProposal: destination.ok ? destination.url : null,
      },
    },
  });

  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: campaign.id,
    action: 'seed_pilot',
    toStatus: CONTENT_STATES.DRAFT,
    actorId: opts.actorId,
    campaignId: campaign.id,
    reason: 'SEED_PILOT',
    metadata: { contentCount: created.length, published: false },
    createOperatorRun: true,
    runType: 'seed_pilot',
  });

  const fresh = await marketingRepo.campaign.findUnique({
    where: { id: campaign.id },
    include: { contentItems: true },
  });

  return {
    ok: true,
    idempotent: false,
    campaign: fresh,
    contentCount: created.length,
    statuses: created.map((c) => c.status),
  };
}
