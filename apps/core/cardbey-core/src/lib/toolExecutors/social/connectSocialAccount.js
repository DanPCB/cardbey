/**
 * connect_social_account — Meta OAuth URL for Method B (External Connections / push).
 * Token exchange runs in GET /api/oauth/facebook/callback.
 */

import { supportsOAuthConnectForAlias } from '../../externalConnections/capabilities.js';

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID;
const FACEBOOK_REDIRECT = process.env.FACEBOOK_REDIRECT_URI;

const FB_SCOPES = ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'].join(',');

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

  if (supportsOAuthConnectForAlias(platform)) {
    if (!FACEBOOK_APP_ID || !FACEBOOK_REDIRECT) {
      return {
        status: 'failed',
        reason: 'facebook_not_configured',
        error: {
          code: 'facebook_not_configured',
          message:
            'Facebook app credentials are not set. Add FACEBOOK_APP_ID and FACEBOOK_REDIRECT_URI to environment.',
        },
        output: {
          ok: false,
          error: 'facebook_not_configured',
          platform,
        },
      };
    }

    const state = Buffer.from(JSON.stringify({ userId, storeId, platform })).toString('base64');
    const oauthUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth');
    oauthUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    oauthUrl.searchParams.set('redirect_uri', FACEBOOK_REDIRECT);
    oauthUrl.searchParams.set('scope', FB_SCOPES);
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('state', state);

    const oauthMessage =
      'Open this URL to connect your Facebook Page. You will be redirected back automatically.';
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
        oauthUrl: oauthUrl.toString(),
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
