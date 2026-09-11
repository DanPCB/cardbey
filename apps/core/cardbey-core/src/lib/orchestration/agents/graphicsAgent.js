import { V1OrchestrationAgent } from './baseAgent.js';
import {
  emitAgentEvent,
  emitSse,
  findPriorAgentResult,
} from './liveAgentHelpers.js';
import {
  dispatchCampaignTool,
  pickPriorField,
  unwrapToolOutput,
} from './campaignAgentLive.js';

export class GraphicsAgent extends V1OrchestrationAgent {
  static agentType = 'graphics';

  static agentName = 'graphics';

  async execute(task) {
    const started = Date.now();
    const taskId = String(task?.taskId ?? '').trim() || `task_${Date.now()}`;
    const agentType = String(task?.agentType ?? this.agentType).trim() || this.agentType;
    const missionId = this.context.missionId ?? null;
    const storeId = this.context.storeId ?? this.context.targetId ?? null;

    emitSse(this.context, { agentName: 'GraphicsAgent', status: 'running', missionId });

    try {
      const briefPrior = await findPriorAgentResult(this.context, task, 'brief');
      const brief = pickPriorField(briefPrior, 'brief') ?? {};
      const goal = String(
        brief?.objective ?? task?.goal ?? task?.description ?? this.context.goal ?? '',
      ).trim();

      let graphics = [];
      let poster = null;
      let sourceTool = 'generate_campaign_graphics';

      const graphicsDispatch = await dispatchCampaignTool(
        'generate_campaign_graphics',
        { storeId, brief, objective: goal, mediaType: 'photo' },
        { ...this.context, goal },
      );
      const graphicsOut = unwrapToolOutput(graphicsDispatch);
      if (Array.isArray(graphicsOut?.graphics) && graphicsOut.graphics.some((g) => g?.url)) {
        graphics = graphicsOut.graphics;
      } else {
        // Fallback: branded promotion asset (same path ActionAgent uses).
        sourceTool = 'generate_promotion_asset';
        const promo = await dispatchCampaignTool(
          'generate_promotion_asset',
          {
            storeId,
            missionId,
            prompt: goal || brief?.objective || 'Promotional graphic',
            description: goal || brief?.objective || 'Promotional graphic',
            format: '1:1',
            mood: 'calm',
          },
          { ...this.context, goal },
        );
        const promoOut = unwrapToolOutput(promo);
        const url =
          promoOut?.graphicUrl ||
          promoOut?.artifactUrl ||
          promoOut?.url ||
          null;
        if (url) {
          graphics = [
            {
              id: `promo-${Date.now()}`,
              type: 'photo',
              url,
              thumbnailUrl: url,
              source: 'generate_promotion_asset',
              storeId,
            },
          ];
          poster = {
            title: brief?.objective || goal || 'Campaign',
            bgImage: url,
            businessName: this.context.storeKnowledge?.name ?? null,
          };
        } else {
          throw new Error(
            `graphics tools failed (${graphicsDispatch?.status}/${promo?.status}): ${
              graphicsDispatch?.blocker?.message ||
              promo?.blocker?.message ||
              promo?.error?.message ||
              'no url'
            }`,
          );
        }
      }

      if (!poster && graphics[0]?.url) {
        poster = {
          title: brief?.objective || goal || 'Campaign',
          bgImage: graphics[0].url,
          businessName: this.context.storeKnowledge?.name ?? null,
        };
      }

      const result = {
        type: 'graphics',
        graphics,
        poster,
        summary: `Generated ${graphics.length} visual asset(s) via ${sourceTool}`,
        stub: false,
      };

      await emitAgentEvent(this.context, 'graphics:complete', {
        agentName: 'GraphicsAgent',
        output: result,
        missionId,
        completedAt: new Date().toISOString(),
      });
      if (graphics[0]?.url) {
        await emitAgentEvent(this.context, 'skill:promotion_asset', {
          type: 'promotion_asset',
          title: poster?.title ?? 'Campaign graphic',
          graphicUrl: graphics[0].url,
          artifactUrl: graphics[0].url,
          missionId,
        });
      }
      emitSse(this.context, {
        agentName: 'GraphicsAgent',
        status: 'complete',
        summary: result.summary,
        missionId,
      });

      return {
        taskId,
        agentType,
        result,
        summary: result.summary,
        confidence: 0.8,
        latencyMs: Math.max(0, Date.now() - started),
      };
    } catch (err) {
      console.warn('[GraphicsAgent] live graphics failed, using stub:', err?.message ?? err);
      return super.execute(task);
    }
  }

  buildResult(task) {
    const base = super.buildResult(task);
    return {
      ...base,
      summary: 'Graphics stub — poster placeholder',
      graphics: { stub: true, posterUrl: null },
    };
  }
}
