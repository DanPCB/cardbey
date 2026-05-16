/**
 * Agent Chat stream auth: short-lived token for SSE.
 * EventSource cannot send Authorization header, so we use a one-time token in the URL.
 * - Issue: POST /api/agent-messages/stream-token (requireAuth + same ownership as GET agent-messages)
 * - Verify: GET /api/stream?key=agent-chat&missionId=...&streamToken=... (reject with 403 if missing/invalid)
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this';
const STREAM_TOKEN_EXPIRES_IN = '5m';
const STREAM_TOKEN_PURPOSE = 'agent-chat-stream';

/**
 * Issue a short-lived JWT that attests the bearer may subscribe to SSE for this missionId.
 * Caller must have already verified the user can access the mission (same logic as GET /api/agent-messages).
 *
 * @param {string} missionId
 * @param {string} userId
 * @returns {{ streamToken: string, expiresIn: number }}
 */
export function issueStreamToken(missionId, userId) {
  const expiresIn = 300; // 5 minutes in seconds
  const streamToken = jwt.sign(
    {
      purpose: STREAM_TOKEN_PURPOSE,
      missionId: missionId.trim(),
      userId,
    },
    JWT_SECRET,
    { expiresIn }
  );
  return { streamToken, expiresIn };
}

/**
 * Verify stream token from query. Returns { ok: true, missionId } or { ok: false, status, code, message }.
 * Does not touch the database.
 */
export function verifyStreamToken(streamToken, missionIdFromQuery) {
  if (!streamToken || typeof streamToken !== 'string' || !streamToken.trim()) {
    return { ok: false, status: 403, code: 'STREAM_TOKEN_REQUIRED', message: 'streamToken is required for agent-chat stream' };
  }
  const missionIdTrimmed = typeof missionIdFromQuery === 'string' && missionIdFromQuery.trim() ? missionIdFromQuery.trim() : null;
  if (!missionIdTrimmed) {
    return { ok: false, status: 403, code: 'MISSION_ID_REQUIRED', message: 'missionId is required for agent-chat stream' };
  }
  try {
    const decoded = jwt.verify(streamToken.trim(), JWT_SECRET);
    if (decoded.purpose !== STREAM_TOKEN_PURPOSE) {
      return { ok: false, status: 403, code: 'INVALID_TOKEN', message: 'Invalid stream token' };
    }
    if (decoded.missionId !== missionIdTrimmed) {
      return { ok: false, status: 403, code: 'MISSION_MISMATCH', message: 'Token does not match missionId' };
    }
    return { ok: true, missionId: decoded.missionId };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { ok: false, status: 403, code: 'TOKEN_EXPIRED', message: 'Stream token expired' };
    }
    return { ok: false, status: 403, code: 'INVALID_TOKEN', message: 'Invalid stream token' };
  }
}

/**
 * Express middleware: when key=agent-chat and missionId are present, require valid streamToken.
 * Call next() if not agent-chat or if token is valid; send 403 and end if agent-chat but token missing/invalid.
 */
export function verifyAgentChatStreamToken(req, res, next) {
  const key = req.query?.key;
  const missionId = req.query?.missionId;
  const streamToken = req.query?.streamToken;

  if (key !== 'agent-chat' || !missionId) {
    return next();
  }

  const result = verifyStreamToken(streamToken, missionId);
  if (result.ok) {
    return next();
  }
  res.status(result.status || 403).json({
    ok: false,
    code: result.code || 'FORBIDDEN',
    message: result.message || 'You do not have access to this stream',
  });
}
