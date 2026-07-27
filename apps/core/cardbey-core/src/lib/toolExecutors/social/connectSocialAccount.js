/**
 * connect_social_account — OAuth URL for Method B (External Connections / push).
 * Meta (Facebook/Instagram) and Zalo OA token exchange in oauthSocialConnectRoutes.
 */

import { supportsOAuthConnectForAlias } from '../../externalConnections/capabilities.js';
import {
  buildMetaOAuthUrl,
  buildZaloOAuthUrl,
  facebookConfigured,
  zaloConfigured,
  isUserConnected,
} from '../../../services/social/socialConnectService.js';

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const platform = String(input.platform ?? '').trim().toLowerCase();
  const userId = String(input.userId ?? context.userId ?? '').trim();
  const storeId = String(input.storeId ?? context.storeId ?? '').trim() || null;

  if (!userId) {
    return { status: 'failed', error: { code: 'USER_ID_REQUIRED', message: 'user_id_required' } };
  }

  if (!platform) {
    return {
      status: 'blocked',
      reason: 'platform_required',
      output: { ok: false, error: 'provider_required', message: 'Social provider is required (facebook, instagram, zalo)' },
    };
  }

  const connected = await isUserConnected(userId, platform);
  if (connected) {
    return {
      status: 'ok',
      output: {
        ok: true,
        phase: 'already_connected',
        platform,
        connected: true,
        message: `Already connected to ${platform}`,
      },
    };
  }

  if (platform === 'zalo') {
    if (!zaloConfigured()) {
      return {
        status: 'failed',
        reason: 'zalo_not_configured',
        error: {
          code: 'zalo_not_configured',
          message: 'Zalo app credentials are not set. Add ZALO_APP_ID, ZALO_APP_SECRET, and ZALO_REDIRECT_URI.',
        },
        output: { ok: false, error: 'zalo_not_configured', platform },
      };
    }

    const oauthUrl = buildZaloOAuthUrl({ userId, storeId });
    const oauthMessage = 'Open this URL to connect your Zalo Official Account. You will be redirected back automatically.';
    return {
      status: 'blocked',
      reason: 'requires_user_input',
      message: oauthMessage,
      blocker: {
        code: 'requires_user_input',
        message: oauthMessage,
        requiredAction: 'complete_oauth_redirect',
      },
      output: {
        ok: true,
        phase: 'oauth_redirect',
        platform,
        oauthUrl,
        action: 'connect_social',
        message: oauthMessage,
      },
    };
  }

  if (supportsOAuthConnectForAlias(platform)) {
    if (!facebookConfigured()) {
      return {
        status: 'failed',
        reason: 'facebook_not_configured',
        error: {
          code: 'facebook_not_configured',
          message:
            'Meta app credentials are not set. Add FACEBOOK_APP_ID and FACEBOOK_REDIRECT_URI to environment.',
        },
        output: {
          ok: false,
          error: 'facebook_not_configured',
          platform,
        },
      };
    }

    const oauthUrl = buildMetaOAuthUrl({ userId, storeId, platform });
    const label = platform === 'instagram' ? 'Instagram (via Meta)' : 'Facebook Page';
    const oauthMessage = `Open this URL to connect ${label}. You will be redirected back automatically.`;
    return {
      status: 'blocked',
      reason: 'requires_user_input',
      message: oauthMessage,
      blocker: {
        code: 'requires_user_input',
        message: oauthMessage,
        requiredAction: 'complete_oauth_redirect',
      },
      output: {
        ok: true,
        phase: 'oauth_redirect',
        platform,
        oauthUrl,
        action: 'connect_social',
        message: oauthMessage,
      },
    };
  }

  return {
    status: 'blocked',
    reason: 'platform_not_supported',
    message: `Social platform not supported: ${platform || 'unknown'}`,
    blocker: {
      code: 'platform_not_supported',
      message: `Social platform not supported: ${platform || 'unknown'}`,
      requiredAction: 'choose_supported_platform',
    },
    output: { ok: false, error: 'platform_not_supported', platform: platform || null },
  };
}
