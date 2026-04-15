import { Router } from 'express';
import { getPrismaClient } from '../lib/prisma.js';

const router = Router();

function iso(d) {
  try {
    return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function isObject(x) {
  return x != null && typeof x === 'object' && !Array.isArray(x);
}

router.get('/health', async (_req, res) => {
  const prisma = getPrismaClient();
  try {
    const rows = await prisma.telemetryProbe.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      select: { tag: true, createdAt: true, payload: true },
    });

    /** @type {Record<string, { count: number, lastAt: string | null, emptyCount?: number, lastError?: string }>} */
    const probes = {};
    let total = 0;
    for (const r of rows) {
      total += 1;
      const tag = typeof r.tag === 'string' ? r.tag.trim() : '';
      if (!tag) continue;
      if (!probes[tag]) {
        probes[tag] = { count: 0, lastAt: null };
      }
      probes[tag].count += 1;
      if (!probes[tag].lastAt) probes[tag].lastAt = iso(r.createdAt);

      if (tag === 'reasoning_log_polled') {
        if (probes[tag].emptyCount == null) probes[tag].emptyCount = 0;
        const p = isObject(r.payload) ? r.payload : {};
        if (p.empty === true) probes[tag].emptyCount += 1;
      }

      if (tag === 'planner_failure') {
        const p = isObject(r.payload) ? r.payload : {};
        const err = typeof p.error === 'string' ? p.error.trim() : '';
        if (err) probes[tag].lastError = err;
      }

      if (tag === 'doc_reminder_sent') {
        if (probes[tag].failCount == null) probes[tag].failCount = 0;
        const p = isObject(r.payload) ? r.payload : {};
        if (p.ok === false) probes[tag].failCount += 1;
      }
    }

    const reasoningLineWritten = probes.reasoning_line_written?.count ?? 0;
    const reasoningLogPolled = probes.reasoning_log_polled?.count ?? 0;
    const reasoningLogEmpty = probes.reasoning_log_polled?.emptyCount ?? 0;
    const plannerFailureCount = probes.planner_failure?.count ?? 0;
    const plannerLastError = probes.planner_failure?.lastError ?? '';
    const orchestraMirrorCount = probes.orchestra_mirror?.count ?? 0;
    const cardCreatedCount = probes.card_created?.count ?? 0;
    const cardAgentMessageCount = probes.card_agent_message?.count ?? 0;

    // Collect smart_store_from_card probe stats
    let smartStoreCardCount = 0;
    let smartStoreCardFailCount = 0;
    for (const r of rows) {
      if (r.tag === 'smart_store_from_card') {
        smartStoreCardCount += 1;
        const p = isObject(r.payload) ? r.payload : {};
        if (p.ok === false) smartStoreCardFailCount += 1;
      }
    }
    if (smartStoreCardCount > 0) {
      probes.smart_store_from_card = {
        count: smartStoreCardCount,
        failCount: smartStoreCardFailCount,
        lastAt: rows.find((r) => r.tag === 'smart_store_from_card')
          ? iso(rows.find((r) => r.tag === 'smart_store_from_card').createdAt)
          : null,
      };
    }

    if (probes.planner_failure) {
      const rate = total > 0 ? Math.round((plannerFailureCount / total) * 100) : 0;
      probes.planner_failure.rate = `${rate}%`;
    }

    /** @type {Array<{ code: string, priority: 'P1'|'P2', message: string, suggestion: string }>} */
    const risks = [];

    // RULE 1 (P1)
    if (reasoningLineWritten > 0 && reasoningLogPolled === 0) {
      risks.push({
        code: 'BLACKBOARD_POLL_DEAD',
        priority: 'P1',
        message:
          'Reasoning lines written but frontend never polled reasoning-log endpoint. BlackboardFeed polling is not running.',
        suggestion: 'Check shouldPollFeeds gate and intentType on activeMission.',
      });
    }

    // RULE 2 (P1)
    if (reasoningLogEmpty > 0 && reasoningLineWritten > 0) {
      risks.push({
        code: 'BLACKBOARD_WRITE_READ_MISMATCH',
        priority: 'P1',
        message:
          'Lines written but polling returns empty. normalizeReasoningLogFromContext may not parse stored format.',
        suggestion: 'Check Mission.context.reasoning_log shape vs normalizeReasoningLogFromContext.',
      });
    }

    // RULE 3 (P2)
    if (plannerFailureCount > 0) {
      risks.push({
        code: 'PLANNER_MODEL_MISSING',
        priority: 'P2',
        message: `Planner failing: ${plannerLastError || 'unknown_error'}`,
        suggestion: 'Set LLM_DEFAULT_MODEL in .env to a model your gateway supports.',
      });
    }

    // RULE 4 (P2)
    if (orchestraMirrorCount === 0) {
      risks.push({
        code: 'ORCHESTRA_MIRROR_SILENT',
        priority: 'P2',
        message: 'No orchestra mirrors in recent window.',
        suggestion: 'Check orchestraMirror.js is wired into OrchestratorTask transitions.',
      });
    }

    // RULE 5 (P2)
    if (smartStoreCardCount > 0 && smartStoreCardFailCount === smartStoreCardCount) {
      risks.push({
        code: 'SMART_STORE_CARD_FAILING',
        priority: 'P2',
        message: 'Business card → store pipeline is failing on all attempts.',
        suggestion: 'Check OCR extraction output and buildSmartStoreFromCard step logs.',
      });
    }

    // RULE 6 (P2)
    if (cardCreatedCount > 0 && cardAgentMessageCount === 0) {
      risks.push({
        code: 'CARD_AGENT_SILENT',
        priority: 'P2',
        message: 'Cards created but no visitor interactions recorded.',
        suggestion: 'Verify /card/:cardId/view is publicly accessible and /api/cards/:cardId/chat works.',
      });
    }

    // RULE 7 (P2) — SmartDocument agent silent
    const smartDocCreatedCount = probes.smart_document_created?.count ?? 0;
    const docAgentMessageCount = probes.doc_agent_message?.count ?? 0;
    if (smartDocCreatedCount > 0 && docAgentMessageCount === 0) {
      risks.push({
        code: 'DOC_AGENT_SILENT',
        priority: 'P2',
        message: 'Smart documents created but no visitor interactions recorded.',
        suggestion: 'Verify /doc/:id/view is publicly accessible and chat widget is loading.',
      });
    }

    // RULE 8 (P2) — High escalation rate
    const docEscalationCount = probes.doc_escalation?.count ?? 0;
    if (docEscalationCount > 3) {
      risks.push({
        code: 'DOC_HIGH_ESCALATION',
        priority: 'P2',
        message: `Document agent escalating frequently (${docEscalationCount} times).`,
        suggestion: 'Update knowledgeBase with answers to common visitor questions.',
      });
    }

    // RULE 9 (P1) — Reminder delivery failing
    const docReminderFailCount = probes.doc_reminder_sent?.failCount ?? 0;
    if (docReminderFailCount > 0) {
      risks.push({
        code: 'DOC_REMINDER_FAILING',
        priority: 'P1',
        message: 'Scheduled reminder delivery is failing.',
        suggestion: 'Check SENDGRID_API_KEY and TWILIO credentials in .env',
      });
    }

    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      window: 'last 50 probes',
      probes: {
        reasoning_line_written: {
          count: probes.reasoning_line_written?.count ?? 0,
          lastAt: probes.reasoning_line_written?.lastAt ?? null,
        },
        reasoning_log_polled: {
          count: probes.reasoning_log_polled?.count ?? 0,
          emptyCount: probes.reasoning_log_polled?.emptyCount ?? 0,
          lastAt: probes.reasoning_log_polled?.lastAt ?? null,
        },
        orchestra_mirror: {
          count: probes.orchestra_mirror?.count ?? 0,
          lastAt: probes.orchestra_mirror?.lastAt ?? null,
        },
        planner_failure: {
          count: probes.planner_failure?.count ?? 0,
          rate: probes.planner_failure?.rate ?? '0%',
          lastError: probes.planner_failure?.lastError ?? '',
        },
        smart_store_from_card: {
          count: probes.smart_store_from_card?.count ?? 0,
          failCount: probes.smart_store_from_card?.failCount ?? 0,
          lastAt: probes.smart_store_from_card?.lastAt ?? null,
        },
        card_created: {
          count: probes.card_created?.count ?? 0,
          lastAt: probes.card_created?.lastAt ?? null,
        },
        card_agent_message: {
          count: probes.card_agent_message?.count ?? 0,
          lastAt: probes.card_agent_message?.lastAt ?? null,
        },
        smart_document_created: {
          count: smartDocCreatedCount,
          lastAt: probes.smart_document_created?.lastAt ?? null,
        },
        doc_agent_message: {
          count: docAgentMessageCount,
          lastAt: probes.doc_agent_message?.lastAt ?? null,
        },
        doc_escalation: {
          count: docEscalationCount,
          lastAt: probes.doc_escalation?.lastAt ?? null,
        },
        doc_reminder_sent: {
          count: probes.doc_reminder_sent?.count ?? 0,
          failCount: docReminderFailCount,
          lastAt: probes.doc_reminder_sent?.lastAt ?? null,
        },
      },
      risks,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: e?.message || String(e),
    });
  }
});

export default router;

