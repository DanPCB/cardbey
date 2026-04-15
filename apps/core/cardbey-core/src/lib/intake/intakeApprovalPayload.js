/**
 * Human-facing approval preview payload (no raw internal schema leakage).
 */

import { randomUUID } from 'node:crypto';
import { getToolEntry, RISK } from './intakeToolRegistry.js';

const LABELS = {
  storeId: 'Store',
  playlistId: 'Playlist',
  pushToAll: 'Push to all screens',
  deviceIds: 'Target devices',
  description: 'Description',
  campaignContext: 'Campaign context',
  productContext: 'Product context',
  dateFrom: 'From date',
  dateTo: 'To date',
  groupBy: 'Group by',
  targetMetric: 'Metric',
  targetValue: 'Target value',
  period: 'Period',
  status: 'Filter',
  prompt: 'Prompt',
};

function truncate(s, max = 140) {
  const t = String(s ?? '');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** @param {Record<string, unknown>} parameters */
function formatPlatformsForApproval(parameters) {
  const raw = parameters?.platforms;
  if (!Array.isArray(raw) || raw.length === 0) return 'social media';
  const lowered = raw.map((x) => String(x ?? '').trim().toLowerCase()).filter(Boolean);
  if (lowered.includes('all')) {
    return 'all supported channels (Facebook, Instagram, Zalo, WhatsApp, Telegram, X, email)';
  }
  return raw
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

/** @param {Record<string, unknown>} parameters */
function isAutoPostMode(parameters) {
  return String(parameters?.postMode ?? 'share_link').trim().toLowerCase() === 'auto';
}

/**
 * User-facing approval copy that registry labels cannot express (postMode, platform list).
 * @returns {{ title: string, summary: string, impact: string[] } | null}
 */
function explicitApprovalFace(tool, parameters, context) {
  const locale = context?.locale === 'vi' ? 'vi' : 'en';

  if (tool === 'publish_to_social') {
    const platformsLabel = formatPlatformsForApproval(parameters);
    const auto = isAutoPostMode(parameters);
    if (locale === 'vi') {
      return {
        title: 'Chia sẻ chiến dịch',
        summary: auto
          ? `Đăng trực tiếp lên: ${platformsLabel}.`
          : `Tạo liên kết chia sẻ cho: ${platformsLabel}.`,
        impact: auto
          ? [
              'Cardbey sẽ đăng bài lên tài khoản mạng xã hội đã kết nối của bạn (khi có).',
              'URL chiến dịch và chú thích sẽ được đưa vào bài đăng.',
            ]
          : [
              'Cardbey sẽ tạo liên kết chia sẻ để bạn đăng thủ công từng nền tảng.',
              'URL chiến dịch và chú thích sẽ được đưa vào liên kết hoặc nội dung copy.',
            ],
      };
    }
    return {
      title: 'Share campaign',
      summary: auto
        ? `Post your campaign directly to: ${platformsLabel}.`
        : `Generate share links for: ${platformsLabel}.`,
      impact: auto
        ? [
            'Cardbey will publish to your connected social accounts where a connection exists (e.g. Facebook Page).',
            'Your campaign URL and caption will be included in the post.',
          ]
        : [
            'Cardbey will generate platform share links so you can post yourself (no automatic post unless you connect an account and choose auto-post later).',
            'Your campaign URL and caption will be included in those links or copy-friendly text.',
          ],
    };
  }

  if (tool === 'connect_social_account') {
    const platform = String(parameters?.platform ?? 'social').trim() || 'social';
    if (locale === 'vi') {
      return {
        title: 'Kết nối mạng xã hội',
        summary: `Kết nối ${platform} với Cardbey để đăng bài thay bạn khi bạn chọn chế độ tự đăng.`,
        impact: [
          'Một cửa sổ (popup) sẽ mở tới Meta để bạn đăng nhập và cấp quyền cho Cardbey.',
          'Sau khi bạn đồng ý, Cardbey lưu mã truy cập trang của bạn trên máy chủ, đã mã hóa (AES-GCM).',
        ],
      };
    }
    return {
      title: 'Connect social account',
      summary: `Connect your ${platform} account to Cardbey so you can authorize automatic posting when you choose that mode.`,
      impact: [
        'A secure popup will open to Meta/Facebook for you to sign in and grant Cardbey permission to post on your behalf.',
        'If you approve, Cardbey stores a Page access token on our servers encrypted at rest — not in plain text.',
      ],
    };
  }

  return null;
}

/**
 * @param {Record<string, unknown>} parameters
 * @returns {Record<string, string>}
 */
export function formatParametersForDisplay(tool, parameters) {
  const input = parameters && typeof parameters === 'object' && !Array.isArray(parameters) ? parameters : {};
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined || v === '') continue;
    const label = LABELS[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
    if (typeof v === 'boolean') {
      out[label] = v ? 'Yes' : 'No';
    } else if (Array.isArray(v)) {
      out[label] = `${v.length} item(s)`;
    } else if (typeof v === 'object') {
      out[label] = '(details)';
    } else {
      out[label] = truncate(String(v), 160);
    }
  }
  return out;
}

/**
 * @param {string} tool
 * @param {Record<string, unknown>} parameters
 * @param {{ locale?: string, userMessage?: string }} [context]
 * @returns {string[]}
 */
function buildImpact(tool, parameters, context) {
  const entry = getToolEntry(tool);
  const risk = entry?.riskLevel ?? RISK.STATE_CHANGE;
  const base = [];
  if (tool === 'signage.publish-to-devices') {
    base.push('Schedules content to play on paired in-store screens.');
    if (parameters?.pushToAll === true) base.push('Targets all connected displays.');
    else if (Array.isArray(parameters?.deviceIds) && parameters.deviceIds.length)
      base.push(`Targets ${parameters.deviceIds.length} selected screen(s).`);
    base.push('May replace what is currently shown on those devices.');
  } else if (tool === 'code_fix') {
    base.push('Proposes text or content changes to your site or catalog.');
    base.push('You can review the diff before anything goes live.');
  } else if (tool === 'edit_artifact') {
    base.push('Updates stored promotion, business profile, hero text, or mini-website draft preview using AI.');
    base.push('Sweep mode may touch several of these; missing pieces are skipped without blocking the rest.');
  } else {
    base.push(`Runs the “${entry?.label ?? tool}” action using your current store context.`);
    if (risk === RISK.STATE_CHANGE) base.push('May change live store or campaign data.');
    if (risk === RISK.DESTRUCTIVE) base.push('This action may remove or overwrite existing content.');
  }
  if (context?.userMessage && base.length < 4) {
    base.push(`Based on your request: ${truncate(context.userMessage, 100)}`);
  }
  return base.slice(0, 4);
}

/**
 * @param {string} tool
 * @param {Record<string, unknown>} parameters
 * @param {{ locale?: string, userMessage?: string }} [context]
 */
function buildSummary(tool, parameters, context) {
  const entry = getToolEntry(tool);
  const label = entry?.label ?? tool;
  const locale = context?.locale === 'vi' ? 'vi' : 'en';
  if (locale === 'vi') {
    return `Xác nhận để chạy: ${label}.`;
  }
  return `Confirm to run ${label} with the details below.`;
}

/**
 * @param {{ tool: string, parameters: Record<string, unknown>, context?: { locale?: string, userMessage?: string } }} args
 * @returns {{ previewId: string, title: string, summary: string, impact: string[], parameters: Record<string, string>, requiresConfirmation: true }}
 */
export function buildApprovalPayload({ tool, parameters, context = {} }) {
  const entry = getToolEntry(tool);
  const face = explicitApprovalFace(tool, parameters, context);
  const title = face?.title ?? entry?.label ?? tool;
  const summary = face?.summary ?? buildSummary(tool, parameters, context);
  const impact = face?.impact ?? buildImpact(tool, parameters, context);
  const displayParams = formatParametersForDisplay(tool, parameters);
  return {
    previewId: randomUUID(),
    title,
    summary,
    impact,
    parameters: displayParams,
    requiresConfirmation: true,
  };
}
