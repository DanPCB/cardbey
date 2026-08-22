import type { HttpRequest, HttpResponse, HttpTransport } from '@cardbey/display-runtime';

const DEVICE = 'fixture-device-1f2d79a8-f321-4377-af7e-c6130d6bf55c';
const CODE = 'Fx12Ab';

export type FixtureScenario =
  | 'pending_then_claimed'
  | 'expired'
  | 'network_error'
  | 'empty_playlist'
  | 'playlist_ready';

/**
 * Explicit development fixture transport. Never selected as a fallback for real API failures.
 */
export function createFixtureTransport(
  scenario: FixtureScenario = 'pending_then_claimed',
): HttpTransport {
  let pollCount = 0;

  return {
    async request<T>(req: HttpRequest): Promise<HttpResponse<T>> {
      const url = req.url;

      if (scenario === 'network_error') {
        throw new Error('fixture_network_error');
      }

      if (req.method === 'POST' && url.includes('/request-pairing')) {
        return json({
          ok: true,
          sessionId: DEVICE,
          code: CODE,
          expiresAt: new Date(Date.now() + 120_000).toISOString(),
          deviceId: DEVICE,
        });
      }

      if (req.method === 'GET' && url.includes('/pair-status/')) {
        pollCount += 1;
        if (scenario === 'expired') {
          return json({ ok: true, status: 'expired', sessionId: DEVICE, ttlLeftMs: 0 });
        }
        if (scenario === 'pending_then_claimed' && pollCount < 2) {
          return json({
            ok: true,
            status: 'pending',
            sessionId: DEVICE,
            pairingCode: CODE,
            expiresAt: new Date(Date.now() + 120_000).toISOString(),
            ttlLeftMs: 120_000,
          });
        }
        return json({
          ok: true,
          status: 'claimed',
          sessionId: DEVICE,
          deviceId: DEVICE,
          ttlLeftMs: 0,
        });
      }

      if (req.method === 'POST' && url.includes('/pair-complete')) {
        return json({
          ok: true,
          deviceId: DEVICE,
          screenId: DEVICE,
          token: null,
          status: 'online',
        });
      }

      if (req.method === 'POST' && url.includes('/heartbeat')) {
        return json({
          ok: true,
          deviceId: DEVICE,
          status: 'online',
          pairingStatus:
            scenario === 'playlist_ready' ? 'PAIRED_PLAYLIST_ASSIGNED' : 'PAIRED_NO_PLAYLIST',
          displayName: 'Fixture Screen',
          storeId: 'fixture-store',
          tenantId: 'fixture-tenant',
          commands: [],
        });
      }

      if (req.method === 'GET' && url.includes('/playlist/full')) {
        if (scenario === 'empty_playlist' || scenario === 'pending_then_claimed') {
          return json({
            ok: true,
            deviceId: DEVICE,
            orientation: 'horizontal',
            state: 'assigned_empty_playlist',
            playlist: null,
            itemCount: 0,
            hasPlaylist: false,
          });
        }
        return json({
          ok: true,
          deviceId: DEVICE,
          orientation: 'horizontal',
          state: 'ready',
          hasPlaylist: true,
          itemCount: 1,
          playlistId: 'fixture-playlist',
          playlist: {
            id: 'fixture-playlist',
            name: 'Fixture',
            version: '1',
            items: [
              {
                id: 'fixture-item-1',
                type: 'image',
                url: 'https://cdn.example.com/fixture.jpg',
                durationMs: 5000,
                order: 0,
              },
            ],
          },
        });
      }

      return json({ ok: false, error: 'fixture_unhandled', message: url }, 404);
    },
  };
}

function json<T>(data: unknown, status = 200): HttpResponse<T> {
  return { status, headers: { 'content-type': 'application/json' }, data: data as T };
}
