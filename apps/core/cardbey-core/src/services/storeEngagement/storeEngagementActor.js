/**
 * Resolve a stable actor key for engagement relationships.
 * Authenticated users use user:{id}; anonymous visitors use viewer:{key}.
 */

export function buildActorKey({ userId, viewerKey }) {
  const uid = userId != null ? String(userId).trim() : '';
  if (uid) return `user:${uid}`;
  const vk = viewerKey != null ? String(viewerKey).trim() : '';
  if (vk && vk !== 'anonymous') return `viewer:${vk.slice(0, 128)}`;
  return 'viewer:anonymous';
}

export function viewerKeyFromReq(req) {
  const header = req.get?.('x-cardbey-viewer-key') ?? req.headers?.['x-cardbey-viewer-key'];
  if (header && String(header).trim()) return String(header).trim().slice(0, 128);
  const bodyKey = req.body?.viewerKey;
  if (bodyKey && String(bodyKey).trim()) return String(bodyKey).trim().slice(0, 128);
  const sessionId = req.body?.sessionId ?? req.query?.sessionId;
  if (sessionId && String(sessionId).trim()) return String(sessionId).trim().slice(0, 128);
  return 'anonymous';
}

export function sessionIdFromReq(req) {
  const sid = req.body?.sessionId ?? req.query?.sessionId ?? req.get?.('x-cardbey-session-id');
  if (sid && String(sid).trim()) return String(sid).trim().slice(0, 128);
  return viewerKeyFromReq(req);
}
