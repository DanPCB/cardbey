import { V1OrchestrationAgent } from './baseAgent.js';
import {
  emitAgentEvent,
  emitSse,
  findPriorAgentResult,
} from './liveAgentHelpers.js';

export class ActionAgent extends V1OrchestrationAgent {
  static agentType = 'action';

  static agentName = 'action';

  async execute(task) {
    const started = Date.now();
    const taskId = String(task?.taskId ?? '').trim() || `task_${Date.now()}`;
    const agentType = String(task?.agentType ?? this.agentType).trim() || this.agentType;
    const missionId = this.context.missionId ?? null;
    const storeId = this.context.storeId ?? this.context.targetId ?? null;

    emitSse(this.context, { agentName: 'ActionAgent', status: 'running', missionId });

    try {
      const build = await findPriorAgentResult(this.context, task, 'build');
      const qa = await findPriorAgentResult(this.context, task, 'qa');
      const result = await this.runLiveAction(build, qa, storeId, missionId);

      await emitAgentEvent(this.context, 'action:complete', {
        agentName: 'ActionAgent',
        output: result,
        missionId,
        completedAt: new Date().toISOString(),
      });
      emitSse(this.context, {
        agentName: 'ActionAgent',
        status: 'complete',
        summary: result.summary,
        missionId,
      });

      return {
        taskId,
        agentType,
        result,
        summary: result.summary,
        confidence: result.actionsPerformed.length ? 0.9 : 0.5,
        latencyMs: Math.max(0, Date.now() - started),
      };
    } catch (err) {
      console.warn('[ActionAgent] live action failed, using stub:', err?.message ?? err);
      return super.execute(task);
    }
  }

  async runLiveAction(build, qa, storeId, missionId) {
    if (qa && qa.approvedForAction === false) {
      return {
        type: 'action',
        actionsPerformed: [],
        artifactIds: [],
        artifactUrls: [],
        summary: `Execution skipped — QA score ${qa.score ?? 0}/100. Issues: ${(
          qa.issues ?? []
        ).join('; ')}`,
      };
    }

    const actionsPerformed = [];
    const artifactIds = [];
    const artifactUrls = [];
    let graphicUrl = null;
    let content = null;

    if (build?.headline) {
      const artifactId = `artifact-copy-${Date.now()}`;
      content = [build.headline, build.subheadline, build.bodyText, build.callToAction]
        .filter(Boolean)
        .join('\n');
      await emitAgentEvent(this.context, 'artifact:created', {
        artifactId,
        artifactType: 'copy',
        type: 'copy',
        title: build.headline,
        content,
        missionId,
        storeId,
      });
      await emitAgentEvent(this.context, 'skill:copy_artifact', {
        type: 'copy',
        title: build.headline,
        content,
        missionId,
      });
      actionsPerformed.push('Copy artifact created');
      artifactIds.push(artifactId);
    }

    if (build?.graphicBrief && storeId) {
      try {
        const { dispatchTool } = await import('../../toolDispatcher.js');
        const graphicResult = await dispatchTool(
          'generate_promotion_asset',
          {
            storeId,
            missionId,
            prompt:
              build.graphicBrief.visualConcept ||
              build.graphicBrief.textOverlay ||
              build.headline ||
              'Promotional graphic',
            description:
              build.graphicBrief.visualConcept ||
              build.graphicBrief.textOverlay ||
              build.headline ||
              'Promotional graphic',
            format:
              build.graphicBrief.format === 'landscape'
                ? '16:9'
                : build.graphicBrief.format === 'portrait'
                  ? '9:16'
                  : '1:1',
            mood: build.graphicBrief.mood || 'calm',
          },
          {
            storeId,
            missionId,
            userId: this.context.userId ?? this.context.actorId ?? null,
            actorId: this.context.userId ?? this.context.actorId ?? null,
            source: 'action_agent',
            runtimeAuthority: true,
          },
        );

        const url =
          graphicResult?.output?.graphicUrl ||
          graphicResult?.output?.artifactUrl ||
          graphicResult?.output?.url ||
          null;
        if (url) {
          graphicUrl = url;
          actionsPerformed.push('Promotional graphic generated');
          artifactUrls.push(url);
          const gid = `artifact-graphic-${Date.now()}`;
          artifactIds.push(gid);
          await emitAgentEvent(this.context, 'artifact:created', {
            artifactId: gid,
            artifactType: 'graphic',
            type: 'graphic',
            graphicUrl: url,
            artifactUrl: url,
            missionId,
          });
          await emitAgentEvent(this.context, 'skill:promotion_asset', {
            type: 'promotion_asset',
            title: build.headline ?? 'Promotion graphic',
            graphicUrl: url,
            artifactUrl: url,
            missionId,
          });
        } else {
          actionsPerformed.push(
            `Graphic generation attempted (${graphicResult?.status ?? 'no_url'})`,
          );
        }
      } catch (err) {
        console.warn('[ActionAgent] Graphic generation failed:', err?.message ?? err);
        actionsPerformed.push('Graphic generation attempted (failed)');
      }
    }

    return {
      type: graphicUrl ? 'promotion_asset' : 'copy',
      actionsPerformed,
      artifactIds,
      artifactUrls,
      graphicUrl,
      artifactUrl: graphicUrl,
      content,
      summary: `${actionsPerformed.length} action(s) completed`,
    };
  }

  buildResult(task) {
    const base = super.buildResult(task);
    return {
      ...base,
      type: 'action',
      summary: 'Action stub — no side effects in V1',
      actionsPerformed: [],
      artifactIds: [],
      artifactUrls: [],
      action: { status: 'skipped', reason: 'v1_stub' },
    };
  }
}
