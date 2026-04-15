/**
 * System Watcher Orchestrator Entry
 * Analyzes system events and generates insights using AI
 */

import { getTextEngine } from '../ai/engines/index.js';

/**
 * Run system watcher analysis
 * 
 * @param {Object} input - Watcher input
 * @param {string|null} [input.question] - Optional question
 * @param {Array} input.events - Array of system events
 * @param {Object} input.aggregates - Event aggregates
 * @returns {Promise<Object>} SystemWatcherResult
 */
export async function runSystemWatcher(input) {
  const engine = getTextEngine();

  const systemPrompt = `You are the Cardbey System Watcher, an expert ops + product + infra assistant.
You receive structured system events and aggregates.

Your job:
- Summarize system health.
- Detect anomalies and opportunities.
- Suggest concrete actions.

Return STRICTLY valid JSON matching this schema:
{
  "summary": "string - overall health summary",
  "insights": [
    {
      "id": "string - unique ID",
      "title": "string - insight title",
      "severity": "info" | "low" | "medium" | "high" | "critical",
      "summary": "string - brief description",
      "category": "devices" | "ai_pipelines" | "campaigns" | "performance" | "security" | "other",
      "createdAt": "ISO 8601 string",
      "context": {},
      "actions": [
        {
          "id": "string",
          "label": "string",
          "type": "navigate" | "command" | "explain_more",
          "target": "string (optional)",
          "payload": {}
        }
      ]
    }
  ],
  "suggestions": [
    {
      "id": "string",
      "label": "string",
      "description": "string",
      "severity": "info" | "low" | "medium" | "high" | "critical",
      "actionType": "navigate" | "command" | "config_change" | "investigate",
      "target": "string (optional)",
      "payload": {}
    }
  ]
}

Be concise but actionable. Focus on high-severity issues first.`;

  const userPrompt = JSON.stringify(
    {
      question: input.question ?? null,
      events: input.events.slice(0, 200), // Limit for cost
      aggregates: input.aggregates,
    },
    null,
    2
  );

  const { text } = await engine.generateText({
    systemPrompt,
    userPrompt,
    temperature: 0.3,
  });

  // Parse and validate JSON. If parsing fails, fall back to a safe object.
  let parsed;
  try {
    parsed = JSON.parse(text);
    
    // Ensure all required fields exist
    if (!parsed.summary) {
      parsed.summary = 'System health analysis completed.';
    }
    if (!parsed.insights) {
      parsed.insights = [];
    }
    if (!parsed.suggestions) {
      parsed.suggestions = [];
    }

    // Import action builder (dynamic import to avoid circular dependencies)
    const {
      buildInsightAction,
      inferEntryPointFromInsight,
      buildPayloadForEntryPoint,
      isInsightInputErrorLike,
    } = await import('../utils/insightActionBuilder.js');

    // Ensure all insights have required fields and standardized actions
    parsed.insights = parsed.insights.map((insight, idx) => {
      const baseInsight = {
        id: insight.id || `insight-${Date.now()}-${idx}`,
        title: insight.title || 'System insight',
        severity: insight.severity || 'info',
        summary: insight.summary || '',
        category: insight.category || 'other',
        createdAt: insight.createdAt || new Date().toISOString(),
        context: insight.context || {},
        actions: insight.actions || [], // Legacy actions format (keep for compatibility)
      };

      // Infer entry point and build standardized action
      const entryPoint = inferEntryPointFromInsight(
        insight.tags || insight.category,
        insight.category,
        baseInsight.title,
        baseInsight.summary,
        { deviceId: insight.context?.deviceId },
      );

      let action = null;
      if (entryPoint) {
        // Extract tenantId from context if available
        const tenantId = insight.context?.tenantId || input.aggregates?.tenantId || '';
        if (tenantId) {
          try {
            const actionPayload = buildPayloadForEntryPoint(entryPoint, tenantId, {
              category: baseInsight.category,
              ...insight.context,
            });

            action = buildInsightAction({
              description: `Take action: ${baseInsight.title}`,
              entryPoint,
              payload: actionPayload,
              source: "insight_card",
              priority: baseInsight.severity === "high" || baseInsight.severity === "critical" ? "primary" : "secondary",
            });
          } catch (e) {
            if (isInsightInputErrorLike(e)) {
              console.warn(
                '[systemWatcher] insight_action_skipped',
                JSON.stringify({ event: 'insight_action_skipped', code: e.code, entryPoint: e.entryPoint }),
              );
            } else {
              throw e;
            }
          }
        }
      }

      return {
        ...baseInsight,
        action, // New standardized action
      };
    });

    // Ensure all suggestions have required fields
    parsed.suggestions = parsed.suggestions.map((suggestion, idx) => ({
      id: suggestion.id || `suggestion-${Date.now()}-${idx}`,
      label: suggestion.label || 'Suggestion',
      description: suggestion.description || '',
      severity: suggestion.severity || 'info',
      actionType: suggestion.actionType || 'investigate',
      target: suggestion.target,
      payload: suggestion.payload || {},
    }));
  } catch (parseError) {
    console.error('[SystemWatcher] Failed to parse AI response:', parseError);
    parsed = {
      summary:
        'Watcher could not parse full result. Please check system logs.' +
        (input.question ? ` Question: ${input.question}` : ''),
      insights: [],
      suggestions: [],
    };
  }

  return parsed;
}

