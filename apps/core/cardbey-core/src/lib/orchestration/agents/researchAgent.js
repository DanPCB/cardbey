import { V1OrchestrationAgent } from './baseAgent.js';
import {
  callAgentJson,
  emitAgentEvent,
  emitSse,
  formatStoreSection,
} from './liveAgentHelpers.js';

export class ResearchAgent extends V1OrchestrationAgent {
  static agentType = 'research';

  static agentName = 'research';

  /**
   * Live research — Claude JSON → ResearchOutput; falls back to stub on LLM failure.
   * @param {object} task
   */
  async execute(task) {
    const started = Date.now();
    const taskId = String(task?.taskId ?? '').trim() || `task_${Date.now()}`;
    const agentType = String(task?.agentType ?? this.agentType).trim() || this.agentType;
    const brief = String(
      task?.goal ?? task?.description ?? this.context.brief ?? this.context.goal ?? '',
    ).trim();
    const missionId = this.context.missionId ?? null;
    const storeKnowledge = this.context.storeKnowledge ?? null;

    emitSse(this.context, {
      agentName: 'ResearchAgent',
      status: 'running',
      missionId,
    });

    try {
      const research = await this.runLiveResearch(brief, storeKnowledge);
      await emitAgentEvent(this.context, 'research:complete', {
        agentName: 'ResearchAgent',
        output: research,
        missionId,
        completedAt: new Date().toISOString(),
      });
      emitSse(this.context, {
        agentName: 'ResearchAgent',
        status: 'complete',
        summary: research.marketContext?.slice(0, 100),
        missionId,
      });
      return {
        taskId,
        agentType,
        result: research,
        summary: research.summary ?? research.marketContext?.slice(0, 160) ?? 'Research complete',
        confidence: 0.85,
        latencyMs: Math.max(0, Date.now() - started),
      };
    } catch (err) {
      console.warn('[ResearchAgent] live research failed, using stub:', err?.message ?? err);
      await emitAgentEvent(this.context, 'agent:error', {
        agentName: 'ResearchAgent',
        error: err?.message ?? String(err),
        missionId,
      });
      return super.execute(task);
    }
  }

  async runLiveResearch(brief, storeKnowledge) {
    const storeSection = formatStoreSection(storeKnowledge);
    const parsed = await callAgentJson({
      purpose: 'orchestration:research_agent',
      tenantKey: this.tenantKey,
      agentName: 'ResearchAgent',
      missionId: this.context.missionId,
      sseEmitter: this.context.sseEmitter,
      maxTokens: 800,
      system: `You are a marketing research analyst for Cardbey, a local commerce platform.
Return ONLY valid JSON with the required fields. No preamble.`,
      user: `${storeSection}

User request: "${brief || 'Create marketing content for this business'}"

Conduct focused market research to inform a response to this request.
Return a JSON object with exactly these fields:
{
  "marketContext": "2-3 sentences on the local market context for this business type in this location",
  "audienceInsight": "2-3 sentences describing the target audience most likely to respond",
  "keyMessages": ["message 1", "message 2", "message 3"],
  "toneRecommendation": "one of: warm|professional|playful|urgent|community-focused",
  "contentAngles": ["angle 1", "angle 2", "angle 3"],
  "dataQualityNote": "note if store data is too thin for specific recommendations, or null"
}`,
    });

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('ResearchAgent JSON parse failed');
    }

    const tone = String(parsed.toneRecommendation ?? 'professional').toLowerCase();
    return {
      type: 'research',
      marketContext: String(parsed.marketContext ?? '').trim() || 'Local market context unavailable.',
      audienceInsight: String(parsed.audienceInsight ?? '').trim() || 'Audience insight unavailable.',
      keyMessages: Array.isArray(parsed.keyMessages)
        ? parsed.keyMessages.map(String).filter(Boolean).slice(0, 5)
        : [],
      toneRecommendation: tone,
      contentAngles: Array.isArray(parsed.contentAngles)
        ? parsed.contentAngles.map(String).filter(Boolean).slice(0, 5)
        : [],
      dataQualityNote:
        parsed.dataQualityNote != null
          ? String(parsed.dataQualityNote)
          : storeKnowledge?.enrichmentStatus && storeKnowledge.enrichmentStatus !== 'ENRICHED'
            ? `Store data is ${storeKnowledge.enrichmentStatus}`
            : null,
      summary: String(parsed.marketContext ?? '').trim().slice(0, 200) || 'Research complete',
    };
  }

  buildResult(task) {
    const base = super.buildResult(task);
    const sk = this.context.storeKnowledge;
    return {
      ...base,
      type: 'research',
      summary: sk?.name
        ? `Research stub — context for ${sk.name} (V1)`
        : 'Research stub — market context placeholder (V1)',
      marketContext: 'Local V1 stub — no external research API',
      audienceInsight: 'Unable to run live research',
      keyMessages: [],
      toneRecommendation: 'professional',
      contentAngles: [],
      dataQualityNote: 'Stub fallback — live research unavailable',
      marketReport: {
        stub: true,
        highlights: ['Local V1 stub — no external research API'],
        goal: base.goal,
        storeName: sk?.name ?? null,
        category: sk?.category ?? null,
        enrichmentStatus: sk?.enrichmentStatus ?? null,
        ...(base.dataQualityWarning ? { warning: base.dataQualityWarning } : {}),
      },
    };
  }
}
