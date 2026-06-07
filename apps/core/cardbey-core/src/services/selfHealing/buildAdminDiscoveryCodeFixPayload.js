/**
 * Maps admin tool discovery gaps → governed code_fix payloads (Path A shape).
 */

import { detectAdminToolDiscoveryIssues } from '../detection/adminToolDiscovery.js';
import { ADMIN_TOOL_DISCOVERY_PLAYBOOK } from '../../lib/telemetry/adminToolDiscoveryPlaybook.js';

const ISSUE_TYPE = 'admin_tool_discovery_failure';

/**
 * @param {{
 *   windowHours: number;
 *   sessionsAnalyzed: number;
 *   problematicCount: number;
 *   problematic: Array<Record<string, unknown>>;
 *   suggestedGlobalFix: string | null;
 * }} discovery
 * @param {{ sessionId?: string | null; issueId?: string | null }} [filter]
 * @returns {Array<Record<string, unknown>>}
 */
export function mapDiscoveryToCodeFixPayloads(discovery, filter = {}) {
  const payloads = [];
  const problematic = Array.isArray(discovery?.problematic) ? discovery.problematic : [];
  const sessionFilter = filter.sessionId ? String(filter.sessionId) : null;
  const issueIdFilter = filter.issueId ? String(filter.issueId) : null;

  for (const row of problematic) {
    if (!row || typeof row !== 'object') continue;
    const severity = row.severity === 'high' ? 'high' : row.severity === 'medium' ? 'medium' : 'low';
    if (severity === 'high') continue;

    const sessionId = row.sessionId != null ? String(row.sessionId) : null;
    const userId = row.userId != null ? String(row.userId) : null;
    const issueId = sessionId ? `admin_tool_discovery:${sessionId}` : `admin_tool_discovery:anon:${payloads.length}`;

    if (sessionFilter && sessionId !== sessionFilter) continue;
    if (issueIdFilter && issueId !== issueIdFilter) continue;

    const searchQueries = Array.isArray(row.searchQueries)
      ? row.searchQueries.map((q) => String(q ?? '')).filter(Boolean)
      : [];
    const suggestedFix =
      typeof row.suggestedFix === 'string' && row.suggestedFix.trim()
        ? row.suggestedFix.trim()
        : 'Add Control Tower link for admin users on marketing navigation.';

    payloads.push({
      issueId,
      category: 'admin_tool_discovery',
      type: ISSUE_TYPE,
      description: buildPayloadDescription({
        suggestedFix,
        suggestedGlobalFix: null,
        sessionId,
        userId,
        searchQueries,
        marketingVisits: row.marketingVisits,
        consoleVisits: row.consoleVisits,
        frustrationSignals: row.frustrationSignals,
        severity,
        scope: 'session',
      }),
      filePaths: [...ADMIN_TOOL_DISCOVERY_PLAYBOOK.likelyFiles],
      sessionId,
      userId,
      playbookId: ADMIN_TOOL_DISCOVERY_PLAYBOOK.id,
      playbook: ADMIN_TOOL_DISCOVERY_PLAYBOOK,
      metadata: {
        type: ISSUE_TYPE,
        confidence: severity === 'medium' ? 0.82 : 0.75,
        detectedAt: new Date().toISOString(),
        originalSuggestion: suggestedFix,
        searchQueries,
        marketingVisits: row.marketingVisits ?? 0,
        consoleVisits: row.consoleVisits ?? 0,
        frustrationSignals: row.frustrationSignals ?? 0,
        severity,
      },
    });
  }

  const globalFix =
    typeof discovery?.suggestedGlobalFix === 'string' && discovery.suggestedGlobalFix.trim()
      ? discovery.suggestedGlobalFix.trim()
      : null;

  if (globalFix && problematic.length > 0) {
    const globalIssueId = 'admin_tool_discovery:global';
    const includeGlobal = !issueIdFilter || issueIdFilter === globalIssueId;
    if (includeGlobal && !sessionFilter) {
      payloads.push({
        issueId: globalIssueId,
        category: 'admin_tool_discovery',
        type: ISSUE_TYPE,
        description: buildPayloadDescription({
          suggestedFix: globalFix,
          suggestedGlobalFix: globalFix,
          sessionId: null,
          userId: null,
          searchQueries: [],
          marketingVisits: null,
          consoleVisits: null,
          frustrationSignals: null,
          severity: 'medium',
          scope: 'global',
        }),
        filePaths: [...ADMIN_TOOL_DISCOVERY_PLAYBOOK.likelyFiles],
        sessionId: null,
        userId: null,
        playbookId: ADMIN_TOOL_DISCOVERY_PLAYBOOK.id,
        playbook: ADMIN_TOOL_DISCOVERY_PLAYBOOK,
        metadata: {
          type: ISSUE_TYPE,
          confidence: 0.85,
          detectedAt: new Date().toISOString(),
          originalSuggestion: globalFix,
          severity: 'medium',
          scope: 'global',
          problematicCount: discovery.problematicCount ?? problematic.length,
        },
      });
    }
  }

  return payloads;
}

/**
 * @param {import('../../lib/prisma.js').PrismaClient} prisma
 * @param {{ windowHours?: number; sessionId?: string; issueId?: string }} [opts]
 */
export async function buildAdminDiscoveryCodeFixPayload(prisma, opts = {}) {
  const windowHours = opts.windowHours ?? 24;
  const discovery = await detectAdminToolDiscoveryIssues(prisma, { windowHours });
  return mapDiscoveryToCodeFixPayloads(discovery, {
    sessionId: opts.sessionId ?? null,
    issueId: opts.issueId ?? null,
  });
}

function buildPayloadDescription(details) {
  const lines = [
    '[SELF_HEALING_ADMIN_TOOL_DISCOVERY] Proposal only. Human approval required before any edit.',
    `Scope: ${details.scope}`,
    `Category: admin_tool_discovery`,
    `Severity: ${details.severity}`,
    `Suggested fix: ${details.suggestedFix}`,
  ];
  if (details.suggestedGlobalFix) {
    lines.push(`Global recommendation: ${details.suggestedGlobalFix}`);
  }
  if (details.sessionId) lines.push(`Session: ${details.sessionId}`);
  if (details.userId) lines.push(`User: ${details.userId}`);
  if (details.searchQueries?.length) {
    lines.push(`Search queries: ${details.searchQueries.join(', ')}`);
  }
  if (details.marketingVisits != null) lines.push(`Marketing visits: ${details.marketingVisits}`);
  if (details.consoleVisits != null) lines.push(`Console visits: ${details.consoleVisits}`);
  if (details.frustrationSignals != null) lines.push(`Frustration signals: ${details.frustrationSignals}`);
  lines.push('Playbook — likely files:');
  for (const f of ADMIN_TOOL_DISCOVERY_PLAYBOOK.likelyFiles) {
    lines.push(` - ${f}`);
  }
  lines.push('Playbook — constraints:');
  for (const c of ADMIN_TOOL_DISCOVERY_PLAYBOOK.constraints) {
    lines.push(` - ${c}`);
  }
  lines.push('Playbook — validation steps:');
  for (const v of ADMIN_TOOL_DISCOVERY_PLAYBOOK.validationSteps) {
    lines.push(` - ${v}`);
  }
  return lines.join('\n');
}
