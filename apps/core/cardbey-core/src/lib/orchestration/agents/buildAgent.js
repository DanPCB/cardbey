import { V1OrchestrationAgent } from './baseAgent.js';
import {
  callAgentJson,
  emitAgentEvent,
  emitSse,
  findPriorAgentResult,
  formatStoreSection,
} from './liveAgentHelpers.js';

export class BuildAgent extends V1OrchestrationAgent {
  static agentType = 'build';

  static agentName = 'build';

  async execute(task) {
    const started = Date.now();
    const taskId = String(task?.taskId ?? '').trim() || `task_${Date.now()}`;
    const agentType = String(task?.agentType ?? this.agentType).trim() || this.agentType;
    const brief = String(
      task?.goal ?? task?.description ?? this.context.brief ?? this.context.goal ?? '',
    ).trim();
    const missionId = this.context.missionId ?? null;
    const storeKnowledge = this.context.storeKnowledge ?? null;

    emitSse(this.context, { agentName: 'BuildAgent', status: 'running', missionId });

    try {
      const research = await findPriorAgentResult(this.context, task, 'research');
      const build = await this.runLiveBuild(brief, storeKnowledge, research);
      await emitAgentEvent(this.context, 'build:complete', {
        agentName: 'BuildAgent',
        output: build,
        missionId,
        completedAt: new Date().toISOString(),
      });
      emitSse(this.context, {
        agentName: 'BuildAgent',
        status: 'complete',
        summary: build.headline,
        missionId,
      });
      return {
        taskId,
        agentType,
        result: build,
        summary: build.summary ?? build.headline ?? 'Build complete',
        confidence: 0.85,
        latencyMs: Math.max(0, Date.now() - started),
      };
    } catch (err) {
      console.warn('[BuildAgent] live build failed, using stub:', err?.message ?? err);
      await emitAgentEvent(this.context, 'agent:error', {
        agentName: 'BuildAgent',
        error: err?.message ?? String(err),
        missionId,
      });
      return super.execute(task);
    }
  }

  async runLiveBuild(brief, storeKnowledge, research) {
    const storeSection = formatStoreSection(storeKnowledge);
    const researchSection = research
      ? `
Research findings:
- Market context: ${research.marketContext ?? ''}
- Audience: ${research.audienceInsight ?? ''}
- Key messages: ${(research.keyMessages ?? []).join(', ')}
- Recommended tone: ${research.toneRecommendation ?? ''}
- Content angles: ${(research.contentAngles ?? []).join(', ')}
`.trim()
      : 'No research context available — use general best practices.';

    const needsGraphic = /graphic|image|poster|banner|visual|design|campaign|promo/i.test(brief);

    const parsed = await callAgentJson({
      purpose: 'orchestration:build_agent',
      tenantKey: this.tenantKey,
      agentName: 'BuildAgent',
      missionId: this.context.missionId,
      sseEmitter: this.context.sseEmitter,
      maxTokens: 1000,
      system: `You are a copywriter and creative director for ${
        storeKnowledge?.name ?? 'a local business'
      }. Return ONLY valid JSON.`,
      user: `${storeSection}

${researchSection}

User request: "${brief || 'Create a promotion for this business'}"

Create compelling marketing content. Return a JSON object:
{
  "headline": "Primary headline (under 10 words, punchy)",
  "subheadline": "Secondary headline or null",
  "bodyText": "2-3 sentences of body copy",
  "callToAction": "CTA button text (2-4 words)",
  "alternateHeadlines": ["alternate 1", "alternate 2"],
  "outputType": "campaign|post|promotion|announcement|other",
  ${
    needsGraphic
      ? `"graphicBrief": {
    "format": "square|landscape|portrait|banner",
    "colorPalette": ["#hex1", "#hex2"],
    "visualConcept": "What the graphic should show",
    "textOverlay": "Text to appear on graphic",
    "mood": "mood/aesthetic description"
  }`
      : '"graphicBrief": null'
  }
}`,
    });

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('BuildAgent JSON parse failed');
    }

    const headline = String(parsed.headline ?? '').trim();
    const bodyText = String(parsed.bodyText ?? '').trim();
    const callToAction = String(parsed.callToAction ?? 'Learn more').trim();
    const content = [headline, parsed.subheadline, bodyText, callToAction]
      .filter(Boolean)
      .join('\n');

    return {
      type: 'copy',
      headline: headline || 'Untitled',
      subheadline: parsed.subheadline != null ? String(parsed.subheadline) : null,
      bodyText: bodyText || content,
      callToAction,
      alternateHeadlines: Array.isArray(parsed.alternateHeadlines)
        ? parsed.alternateHeadlines.map(String).filter(Boolean).slice(0, 3)
        : [],
      outputType: String(parsed.outputType ?? 'promotion'),
      graphicBrief:
        parsed.graphicBrief && typeof parsed.graphicBrief === 'object'
          ? {
              format: String(parsed.graphicBrief.format ?? 'square'),
              colorPalette: Array.isArray(parsed.graphicBrief.colorPalette)
                ? parsed.graphicBrief.colorPalette.map(String)
                : [],
              visualConcept: String(parsed.graphicBrief.visualConcept ?? ''),
              textOverlay: String(parsed.graphicBrief.textOverlay ?? headline),
              mood: String(parsed.graphicBrief.mood ?? 'modern'),
            }
          : null,
      content,
      summary: headline || 'Build complete',
    };
  }

  buildResult(task) {
    const base = super.buildResult(task);
    const ctx = this.context;
    return {
      ...base,
      type: 'build',
      summary: 'Build stub — store draft handled by structured_store_build step',
      headline: '',
      bodyText: '',
      callToAction: '',
      structured_store_build: {
        ok: true,
        stub: true,
        businessName:
          (typeof ctx.businessName === 'string' && ctx.businessName.trim()) ||
          (typeof ctx.storeName === 'string' && ctx.storeName.trim()) ||
          base.goal,
        storeId: ctx.storeId ?? ctx.targetId ?? null,
        missionId: ctx.missionId ?? null,
      },
    };
  }
}
