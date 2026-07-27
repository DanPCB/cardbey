/**
 * Reporter Agent
 * Generates human-readable activity reports from event data
 */

import { getTextEngine } from '../../ai/engines/index.js';
import { DAILY_TENANT_REPORTER_SYSTEM_PROMPT } from './prompts.js';
import type { DailyTenantReporterInput, ReporterResponse } from './types.js';

/**
 * Reporter Agent Interface
 */
export interface ReporterAgent {
  /**
   * Generate a daily tenant report
   * @param input - Daily tenant reporter input with events and stats
   * @returns Reporter response with markdown content
   */
  generateDailyTenantReport(input: DailyTenantReporterInput): Promise<ReporterResponse>;
}

/**
 * Default Reporter Agent Implementation
 * Uses LLM to generate markdown reports from activity events
 */
export class DefaultReporterAgent implements ReporterAgent {
  /**
   * Generate a daily tenant report
   */
  async generateDailyTenantReport(input: DailyTenantReporterInput): Promise<ReporterResponse> {
    const engine = getTextEngine();

    // Build user prompt from input
    const userPrompt = JSON.stringify(input, null, 2);

    // Generate report using LLM
    const { text } = await engine.generateText({
      systemPrompt: DAILY_TENANT_REPORTER_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3, // Lower temperature for more consistent, factual reports
      maxTokens: 2000,
    });

    // Extract title from markdown (first # heading)
    const titleMatch = text.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : `Daily Activity Report – ${input.tenantName} (${input.date})`;

    // Determine scope based on report kind
    const scope = 'tenant_activity';

    // Generate tags from event types
    const eventTypes = [...new Set(input.events.map(e => e.type))];
    const tags = eventTypes.join(',');

    return {
      contentMd: text.trim(),
      title,
      scope,
      tags: tags || undefined,
    };
  }
}

/**
 * Get default reporter agent instance
 */
export function getReporterAgent(): ReporterAgent {
  return new DefaultReporterAgent();
}

