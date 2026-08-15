import { getPrismaClient } from '../prisma.js';
import { resolveLiveVideoProvider } from './providers.js';
import {
  confirmProviderConnected,
  disconnectProviderSession,
  endProviderSession,
} from './service.js';

const RECONCILE_SESSION_STATES = Object.freeze(['READY', 'CONNECTING', 'LIVE', 'ENDING']);

function client(prisma) {
  return prisma || getPrismaClient();
}

/**
 * Poll provider evidence for active pilot sessions and apply truthful lifecycle updates.
 * Never persists or returns provider secrets.
 *
 * @param {{
 *   prisma?: import('@prisma/client').PrismaClient,
 *   videoProvider?: import('./providers.js').LiveVideoProvider,
 *   limit?: number,
 * }} [args]
 */
export async function reconcilePilotSessions(args = {}) {
  const db = client(args.prisma);
  const provider = resolveLiveVideoProvider({ provider: args.videoProvider });
  const limitRaw = Number(args.limit);
  const boundedLimit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 20) : 20;

  const sessions = await db.liveMarketSession.findMany({
    where: {
      state: { in: [...RECONCILE_SESSION_STATES] },
      providerExternalRef: { not: null },
    },
    orderBy: { updatedAt: 'asc' },
    take: boundedLimit,
  });

  /** @type {Array<{ sessionId: string, action: string, providerStatus: string, state: string }>} */
  const results = [];

  for (const session of sessions) {
    const sessionId = String(session.id);
    const externalRef = String(session.providerExternalRef || '').trim();
    if (!externalRef) {
      results.push({
        sessionId,
        action: 'skipped_missing_external_ref',
        providerStatus: 'missing',
        state: String(session.state),
      });
      continue;
    }

    try {
      const state = await provider.getSessionState({ sessionId, externalRef });
      let updated = session;
      let action = 'unchanged';

      if (state.status === 'live') {
        if (String(session.state) === 'READY') {
          action = 'awaiting_start_intent';
        } else {
          updated = await confirmProviderConnected({ prisma: db, sessionId });
          action = updated.state === session.state ? 'already_live' : 'confirmed_live';
        }
      } else if (state.status === 'prepared') {
        updated = await disconnectProviderSession({ prisma: db, sessionId });
        action = updated.state === session.state ? 'still_prepared' : 'disconnected';
      } else if (state.status === 'ended') {
        updated = await endProviderSession({ prisma: db, sessionId });
        action = updated.state === session.state ? 'already_ended' : 'ended';
      } else if (state.status === 'connecting') {
        action = 'connecting';
      } else if (state.status === 'unknown') {
        action = 'provider_missing';
      }

      results.push({
        sessionId,
        action,
        providerStatus: String(state.status),
        state: String(updated.state || session.state),
      });
    } catch (err) {
      results.push({
        sessionId,
        action: 'error',
        providerStatus: err?.code ? String(err.code) : 'error',
        state: String(session.state),
      });
    }
  }

  return {
    scanned: sessions.length,
    results,
  };
}
