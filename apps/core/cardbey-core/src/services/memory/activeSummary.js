/**
 * Active Summary — concise mission gist for quick dispatch context.
 */

import groqAdapter from '../../lib/llm/groqAdapter.js';
import { getPrismaClient } from '../../lib/prisma.js';

function fallbackSummary(mission, result) {
  const action = mission?.primaryAction ?? mission?.type ?? 'mission';
  const ok = result?.success !== false;
  return {
    gist: `${action} completed${ok ? ' successfully' : ' with issues'}`,
    keyFacts: [`Action: ${action}`, `Outcome: ${ok ? 'success' : 'failure'}`],
  };
}

function parseSummaryFromGroq(groqResult) {
  const raw = groqResult?.reasoning ?? '';
  try {
    const jsonMatch = String(raw).match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.summary) {
        return {
          gist: String(parsed.summary),
          keyFacts: Array.isArray(parsed.keyFacts)
            ? parsed.keyFacts.map((f) => String(f))
            : [],
        };
      }
    }
  } catch {
    /* use fallback below */
  }
  if (raw?.trim()) {
    return { gist: String(raw).trim().slice(0, 500), keyFacts: [] };
  }
  return null;
}

export class ActiveSummary {
  /**
   * @param {{ type?: string; primaryAction?: string }} mission
   * @param {{ success?: boolean; output?: unknown; error?: string }} result
   * @param {Record<string, unknown>} [context]
   */
  async generate(mission, result, context = {}) {
    const summaryPrompt = `Summarize this mission result in 2-3 sentences and extract key facts.

Mission: ${mission?.type ?? 'unknown'}
Action: ${mission?.primaryAction ?? mission?.type ?? 'unknown'}
Result: ${JSON.stringify(result ?? {})}
Context: ${JSON.stringify(context ?? {})}

Output JSON only:
{
  "summary": "2-3 sentence summary",
  "keyFacts": ["fact1", "fact2"]
}`;

    try {
      const groqResult = await groqAdapter.reason(
        { intent: { type: 'summarize', prompt: summaryPrompt } },
        { session: { learnedSignals: [] } },
      );
      const parsed = parseSummaryFromGroq(groqResult);
      if (parsed) return parsed;
    } catch {
      /* fallback */
    }
    return fallbackSummary(mission, result);
  }

  /**
   * @param {string} missionId
   * @param {{ gist: string; keyFacts?: string[] }} summary
   */
  async updateActiveSummary(missionId, summary) {
    const id = missionId ? String(missionId).trim() : '';
    if (!id || !summary?.gist) return null;

    const prisma = getPrismaClient();
    const payload = {
      activeSummary: summary.gist,
      keyFacts: Array.isArray(summary.keyFacts) ? summary.keyFacts : [],
      activeSummaryUpdatedAt: new Date().toISOString(),
    };

    if (prisma?.missionPipeline?.update) {
      try {
        const existing = await prisma.missionPipeline.findUnique({
          where: { id },
          select: { metadataJson: true },
        });
        if (existing) {
          const meta =
            existing.metadataJson && typeof existing.metadataJson === 'object'
              ? existing.metadataJson
              : {};
          return prisma.missionPipeline.update({
            where: { id },
            data: { metadataJson: { ...meta, ...payload } },
          });
        }
      } catch {
        /* try mission context */
      }
    }

    if (prisma?.missionContext?.upsert) {
      try {
        const ctxRow = await prisma.missionContext.findUnique({
          where: { missionId: id },
          select: { contextJson: true },
        });
        let ctx = {};
        try {
          ctx = JSON.parse(ctxRow?.contextJson ?? '{}');
        } catch {
          ctx = {};
        }
        return prisma.missionContext.upsert({
          where: { missionId: id },
          create: {
            missionId: id,
            contextJson: JSON.stringify({ ...ctx, ...payload }),
          },
          update: {
            contextJson: JSON.stringify({ ...ctx, ...payload }),
          },
        });
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Record gist after a completed runtime execution (fire-and-forget friendly).
   */
  async recordMissionResult(args) {
    const { missionId, mission, result, context } = args ?? {};
    if (!missionId) return null;
    const summary = await this.generate(mission, result, context);
    await this.updateActiveSummary(missionId, summary);
    return summary;
  }
}

const activeSummary = new ActiveSummary();
export default activeSummary;
