/**
 * RAG integration for Performer LLMReasoner.
 * Retrieves store docs/reports via buildRagContext; fails gracefully on error/timeout.
 */

import { buildRagContext } from '../../services/ragService.js';
import { isSimpleGreetingText, normalizeIntakeMessageText } from './intentFastPath.js';

function cleanString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function parseEnvInt(name, fallback) {
  const n = parseInt(process.env[name] ?? String(fallback), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseEnvFloat(name, fallback) {
  const n = parseFloat(process.env[name] ?? String(fallback));
  return Number.isFinite(n) ? n : fallback;
}

function resolveTenantId(context, userId) {
  const ctx = context && typeof context === 'object' && !Array.isArray(context) ? context : {};
  return (
    cleanString(ctx.tenantId) ||
    cleanString(ctx.tenantKey) ||
    cleanString(userId) ||
    null
  );
}

function isRagExcludeImperativeEnabled() {
  const raw = process.env.RAG_EXCLUDE_IMPERATIVE_ACTIONS;
  if (raw === undefined || raw === '') return true;
  return String(raw).trim().toLowerCase() === 'true';
}

function isQuestionLikeText(text) {
  return (
    /(what|how|why|when|where|who|show|tell|explain|describe|is|are)\b/i.test(text) ||
    /\?\s*$/.test(text)
  );
}

/**
 * Imperative action requests (create, set up, help me…) should not trigger RAG retrieval.
 * Informational "show me analytics" is excluded from this check.
 *
 * @param {string} text normalized intake text
 */
export function isImperativeActionText(text) {
  if (!isRagExcludeImperativeEnabled()) return false;

  const t = normalizeIntakeMessageText(text);
  if (!t) return false;

  if (
    /\b(show me|tell me)\s+(my\s+)?(analytics|sales|revenue|performance|report|metrics|insights|trends)\b/i.test(
      t,
    )
  ) {
    return false;
  }

  const imperativeStarts = [
    'create',
    'set up',
    'setup',
    'make',
    'build',
    'start',
    'launch',
    'add',
    'upload',
    'generate',
    'publish',
    'deploy',
    'install',
  ];

  for (const action of imperativeStarts) {
    if (t.startsWith(`${action} `) || t === action || t.includes(` ${action} `)) {
      return true;
    }
  }

  if (/\bhelp me\b/.test(t)) return true;
  if (/\bi want to\b/.test(t)) return true;
  if (/\bshow me how\b/.test(t)) return true;
  if (/\btell me to\b/.test(t)) return true;

  return false;
}

function normalizeChunks(ragResult, { limit, minScore }) {
  const raw = Array.isArray(ragResult?.chunks) ? ragResult.chunks : [];
  return raw
    .map((chunk) => {
      const score = Number(chunk?.similarity ?? chunk?.score ?? 0);
      const content = cleanString(chunk?.content) || cleanString(chunk?.snippet);
      if (!content || score < minScore) return null;
      const sourcePath = cleanString(chunk?.sourcePath);
      const scope = cleanString(chunk?.scope);
      return {
        content,
        score,
        source: sourcePath || scope || 'store',
        metadata: {
          source: sourcePath || scope || 'store',
          scope: scope || null,
          chunkIndex: chunk?.chunkIndex ?? null,
          id: chunk?.id ?? null,
        },
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}

export class RagIntegration {
  /**
   * @param {Object} [options]
   * @param {Console} [options.logger]
   * @param {{ track?: (event: string, props: Record<string, unknown>) => void } | null} [options.telemetry]
   */
  constructor({ logger = console, telemetry = null } = {}) {
    this.logger = logger;
    this.telemetry = telemetry;
  }

  /**
   * @param {Object} input
   * @param {Record<string, unknown>} [context]
   * @returns {boolean}
   */
  shouldUseRag(input, context) {
    if (String(process.env.ENABLE_RAG_IN_REASONER ?? '').trim().toLowerCase() !== 'true') {
      return false;
    }

    const text = normalizeIntakeMessageText(input?.text ?? input?.originalUserMessage ?? '');
    if (!text) return false;

    if (isSimpleGreetingText(text)) {
      return false;
    }

    if (isImperativeActionText(text)) {
      return false;
    }

    if (isQuestionLikeText(text)) {
      return true;
    }

    if (/(campaign|sales|revenue|performance|analytics|insights|report|metrics|kpi)/i.test(text)) {
      return true;
    }

    if (
      /(store|business|customer|product|menu|inventory|order|booking|appointment)/i.test(text) &&
      isQuestionLikeText(text)
    ) {
      return true;
    }

    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 3) {
      return false;
    }

    void context;
    return false;
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   * @param {string} query
   * @param {Record<string, unknown>} [context]
   * @returns {Promise<{ chunks: Array<{ content: string, score: number, source: string, metadata: object }> } | null>}
   */
  async fetchRagContext(userId, sessionId, query, context) {
    const startTime = Date.now();
    const question = cleanString(query);
    if (!question) return null;

    const limit = parseEnvInt('RAG_MAX_CHUNKS', 5);
    const minScore = parseEnvFloat('RAG_MIN_SCORE', 0.6);
    const timeoutMs = parseEnvInt('RAG_TIMEOUT_MS', 3000);
    const tenantId = resolveTenantId(context, userId);

    this.logger.debug?.('[RAG] Fetching context', {
      userId,
      sessionId,
      query: question.slice(0, 100),
      timeoutMs,
      tenantId: tenantId ?? null,
    });

    try {
      const ragPromise = buildRagContext(question, undefined, tenantId ?? undefined);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`rag_timeout_${timeoutMs}ms`)), timeoutMs);
      });

      const ragResult = await Promise.race([ragPromise, timeoutPromise]);
      const chunks = normalizeChunks(ragResult, { limit, minScore });
      const durationMs = Date.now() - startTime;

      const payload = {
        userId,
        sessionId,
        query: question.slice(0, 50),
        chunkCount: chunks.length,
        durationMs,
        tenantId: tenantId ?? null,
        timeout: durationMs > 2000 ? 'slow' : 'ok',
      };

      this._track('rag.retrieved', payload);
      this.logger.debug?.('[RAG] Context retrieved', payload);

      return chunks.length ? { chunks } : null;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errPayload = {
        userId,
        sessionId,
        query: question.slice(0, 50),
        error: error?.message ?? String(error),
        durationMs,
      };
      this.logger.warn?.('[RAG] Retrieval failed', errPayload);
      this._track('rag.error', errPayload);
      return null;
    }
  }

  /**
   * @param {{ chunks?: Array<{ content: string, score?: number, source?: string, metadata?: { source?: string } }> } | null} ragResult
   * @returns {string | null}
   */
  formatRagContext(ragResult) {
    if (!ragResult?.chunks?.length) return null;

    const lines = ['', 'Relevant context from your store (retrieved documents — use only if applicable):'];
    for (let i = 0; i < ragResult.chunks.length; i++) {
      const chunk = ragResult.chunks[i];
      const source = chunk.metadata?.source || chunk.source || 'store';
      const scorePct = Math.round((chunk.score ?? 0) * 100);
      const excerpt = chunk.content.slice(0, 500);
      lines.push(`\n[${i + 1}] (${source}, ${scorePct}% relevant):\n${excerpt}`);
    }
    return lines.join('\n');
  }

  /**
   * @param {{ chunks?: Array<{ score?: number, source?: string, metadata?: { source?: string } }> } | null} ragResult
   * @returns {{ hasRag: boolean, chunkCount: number, sources: string[], topScore: number }}
   */
  getRagSummary(ragResult) {
    if (!ragResult?.chunks?.length) {
      return { hasRag: false, chunkCount: 0, sources: [], topScore: 0 };
    }

    const sources = ragResult.chunks.map(
      (c) => c.metadata?.source || c.source || 'unknown',
    );
    return {
      hasRag: true,
      chunkCount: ragResult.chunks.length,
      sources: [...new Set(sources)],
      topScore: ragResult.chunks[0]?.score ?? 0,
    };
  }

  /**
   * @param {string} event
   * @param {Record<string, unknown>} props
   */
  _track(event, props) {
    if (this.telemetry?.track) {
      this.telemetry.track(event, props);
    }
  }
}

export default RagIntegration;
