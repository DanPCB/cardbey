/**
 * Multi-agent orchestrator — intent routing, planning, review, execution, refinement.
 */

import { randomUUID } from 'node:crypto';
import { IntentClassifier } from '../agents/intent.classifier.js';
import { Planner } from '../agents/planner.agent.js';
import { Critic } from '../agents/critic.agent.js';
import { Refiner } from '../agents/refiner.agent.js';
import { Specialist } from '../agents/specialist.agent.js';
import {
  AgentType,
  Intent,
  type MissionPlan,
  type MissionResult,
  type SpecialistDomain,
  type TelemetryData,
} from '../types/agent.types.js';
import {
  loadMultiAgentRuntimeConfig,
  shouldRouteToDeepSeek,
} from '../config/agent.config.js';
import { loadDeepSeekConfig } from '../config/deepseek.config.js';
import logger from '../telemetry/logger.js';
import {
  buildQualityMetrics,
  globalMetrics,
} from '../telemetry/metrics.js';
import { executePlanPipeline } from './pipeline.js';
import type { StepExecutor } from './pipeline.js';

const INTENT_TO_DOMAIN: Partial<Record<Intent, SpecialistDomain>> = {
  [Intent.STORE_SETUP]: 'store_setup',
  [Intent.STORE_UPDATE]: 'store_management',
  [Intent.STORE_QUERY]: 'store_management',
  [Intent.GENERAL_QUERY]: 'general_assistance',
  [Intent.SUPPORT]: 'customer_support',
};

export interface OrchestratorOptions {
  stepExecutor?: StepExecutor;
  intentClassifier?: IntentClassifier;
  planner?: Planner;
  critic?: Critic;
  refiner?: Refiner;
}

export class Orchestrator {
  private readonly intentClassifier: IntentClassifier;
  private readonly planner: Planner;
  private readonly critic: Critic;
  private readonly refiner: Refiner;
  private readonly specialists = new Map<SpecialistDomain, Specialist>();
  private readonly stepExecutor?: StepExecutor;

  private readonly parallelLimit: number;
  private readonly retryOnFailure: boolean;
  private readonly maxRefinements: number;
  private readonly hitlEnabled: boolean;
  private readonly traceEnabled: boolean;
  private readonly telemetryEnabled: boolean;
  private readonly executePlans: boolean;
  private readonly shadowEnabled: boolean;

  constructor(options: OrchestratorOptions = {}) {
    this.intentClassifier = options.intentClassifier ?? new IntentClassifier();
    this.planner = options.planner ?? new Planner();
    this.critic = options.critic ?? new Critic();
    this.refiner = options.refiner ?? new Refiner();
    this.stepExecutor = options.stepExecutor;

    const runtime = loadMultiAgentRuntimeConfig();
    this.parallelLimit = runtime.parallelLimit;
    this.retryOnFailure = runtime.retryOnFailure;
    this.maxRefinements = runtime.maxRefinements;
    this.hitlEnabled = runtime.hitlEnabled;
    this.traceEnabled = runtime.traceEnabled;
    this.telemetryEnabled = runtime.telemetryEnabled;
    this.executePlans = runtime.executePlans;
    this.shadowEnabled = loadDeepSeekConfig().shadowEnabled;
  }

  async processMission(userMessage: string): Promise<MissionResult> {
    const missionId = `MISSION_${randomUUID().slice(0, 8)}`;
    const startTime = Date.now();
    const telemetry: TelemetryData = {
      missionId,
      timestamp: new Date(),
      duration: 0,
      agentsUsed: [],
      tokenUsage: { total: 0, byAgent: {} },
      thinkingMode: loadDeepSeekConfig().thinking,
      parallelLimit: this.parallelLimit,
      hitlEnabled: this.hitlEnabled,
      retries: 0,
      errors: [],
    };

    if (!loadMultiAgentRuntimeConfig().enabled) {
      return {
        missionId,
        status: 'failed',
        intent: Intent.GENERAL_QUERY,
        finalResponse: 'Multi-agent processing is disabled.',
        telemetry,
        error: 'MULTI_AGENT_DISABLED',
      };
    }

    if (!shouldRouteToDeepSeek(missionId)) {
      logger.info({
        message: `[${missionId}] A/B routing to legacy provider`,
        missionId,
      });
    }

    if (this.traceEnabled) {
      logger.info({
        message: `[${missionId}] Starting mission processing`,
        missionId,
        userMessage,
      });
    }

    try {
      const intentResult = await this.intentClassifier.process(userMessage);
      telemetry.agentsUsed.push(AgentType.INTENT_CLASSIFIER);
      this.trackAgentTokens(telemetry, AgentType.INTENT_CLASSIFIER, 100);

      if (this.traceEnabled) {
        logger.info({
          message: `[${missionId}] Intent classified`,
          missionId,
          intent: intentResult.intent,
          confidence: intentResult.confidence,
        });
      }

      let result: MissionResult;

      if (this.isSetupIntent(intentResult.intent)) {
        result = await this.handleSetupMission(
          missionId,
          userMessage,
          intentResult.intent,
          intentResult.confidence,
          telemetry,
        );
      } else {
        result = await this.handleGeneralQuery(
          missionId,
          userMessage,
          intentResult.intent,
          intentResult.confidence,
          telemetry,
        );
      }

      if (this.shadowEnabled) {
        result = await this.runShadowComparison(userMessage, result);
      }

      telemetry.duration = Date.now() - startTime;
      telemetry.qualityMetrics = buildQualityMetrics({
        intentConfidence: intentResult.confidence,
        criticConfidence: result.review?.confidence,
        planApproved: result.review?.approved,
        refinementCount: result.telemetry.agentsUsed.includes(AgentType.REFINER) ? 1 : 0,
      });

      result.telemetry = telemetry;
      telemetry.intent = result.intent;
      telemetry.missionStatus = result.status;
      telemetry.userMessage = userMessage;
      telemetry.planSteps = result.plan?.steps?.length ?? 0;
      telemetry.planComplexity = result.plan?.estimatedComplexity ?? 'medium';

      if (this.telemetryEnabled) {
        globalMetrics.recordMission(telemetry);
      }

      if (this.traceEnabled) {
        logger.info({
          message: `[${missionId}] Mission completed`,
          missionId,
          status: result.status,
          duration: telemetry.duration,
        });
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      telemetry.errors.push(message);
      telemetry.duration = Date.now() - startTime;
      telemetry.missionStatus = 'failed';

      if (this.telemetryEnabled) {
        globalMetrics.recordMission(telemetry);
      }

      logger.error({
        message: `[${missionId}] Mission failed`,
        missionId,
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        missionId,
        status: 'failed',
        intent: Intent.GENERAL_QUERY,
        finalResponse: `I apologize, but I encountered an error processing your request: ${message}`,
        telemetry,
        error: message,
      };
    }
  }

  recordHitlFeedback(
    missionId: string,
    decision: 'approved' | 'rejected' | 'modified',
    notes?: string,
  ): void {
    globalMetrics.recordHitlFeedback(missionId, decision, notes);
  }

  private async handleSetupMission(
    missionId: string,
    userMessage: string,
    intent: Intent,
    intentConfidence: number,
    telemetry: TelemetryData,
  ): Promise<MissionResult> {
    const plan = await this.planner.process({
      message: userMessage,
      context: { intent, confidence: intentConfidence },
    });
    telemetry.agentsUsed.push(AgentType.PLANNER);
    this.trackAgentTokens(telemetry, AgentType.PLANNER, 500);

    if (plan.isClarification) {
      return {
        missionId,
        status: 'completed',
        intent,
        plan,
        finalResponse:
          plan.clarificationMessage ??
          'I need a bit more detail before we can create your stores.',
        telemetry,
      };
    }

    if (this.traceEnabled) {
      logger.info({
        message: `[${missionId}] Plan created`,
        missionId,
        steps: plan.steps.length,
        complexity: plan.estimatedComplexity,
      });
    }

    const review = await this.critic.process({ plan, originalMessage: userMessage });
    telemetry.agentsUsed.push(AgentType.CRITIC);
    this.trackAgentTokens(telemetry, AgentType.CRITIC, 300);

    if (this.traceEnabled) {
      logger.info({
        message: `[${missionId}] Plan reviewed`,
        missionId,
        approved: review.approved,
        issues: review.issues.length,
      });
    }

    if (this.hitlEnabled && !review.approved) {
      return {
        missionId,
        status: 'pending_human_review',
        intent,
        plan,
        review,
        finalResponse: `This plan requires human review. Issues found: ${review.issues.join('; ')}`,
        telemetry,
      };
    }

    let execution = undefined;
    if (this.executePlans) {
      execution = await executePlanPipeline(
        {
          missionId,
          plan,
          review,
          intent,
          parallelLimit: this.parallelLimit,
          retryOnFailure: this.retryOnFailure,
        },
        this.stepExecutor,
      );
    } else {
      execution = plan.steps.map((step) => ({
        success: true,
        stepId: step.id,
        result: `Simulated: ${step.action}`,
        duration: 0,
      }));
    }

    const successCount = execution.filter((r) => r.success).length;
    let draftResponse = `Mission completed: ${successCount} of ${execution.length} steps succeeded.`;
    if (execution.some((r) => !r.success)) {
      draftResponse += ` ${execution.filter((r) => !r.success).length} steps need attention.`;
    }

    let refinedResponse = draftResponse;
    for (let i = 0; i < this.maxRefinements; i += 1) {
      refinedResponse = await this.refiner.process(refinedResponse);
      telemetry.agentsUsed.push(AgentType.REFINER);
      this.trackAgentTokens(telemetry, AgentType.REFINER, 150);
    }

    return {
      missionId,
      status: 'completed',
      intent,
      plan,
      review,
      execution,
      finalResponse: refinedResponse,
      telemetry,
    };
  }

  private async handleGeneralQuery(
    missionId: string,
    userMessage: string,
    intent: Intent,
    intentConfidence: number,
    telemetry: TelemetryData,
  ): Promise<MissionResult> {
    const domain = INTENT_TO_DOMAIN[intent];
    let response: string;

    if (domain) {
      const specialist = this.getSpecialist(domain);
      response = await specialist.process(userMessage);
      telemetry.agentsUsed.push(AgentType.SPECIALIST);
      this.trackAgentTokens(telemetry, AgentType.SPECIALIST, 200);
    } else {
      response = `I understand you're asking about ${intent} (confidence: ${intentConfidence}). How can I help specifically?`;
    }

    return {
      missionId,
      status: 'completed',
      intent,
      finalResponse: response,
      telemetry,
    };
  }

  private getSpecialist(domain: SpecialistDomain): Specialist {
    if (!this.specialists.has(domain)) {
      this.specialists.set(domain, new Specialist(domain));
    }
    return this.specialists.get(domain)!;
  }

  private isSetupIntent(intent: Intent): boolean {
    return [
      Intent.STORE_SETUP,
      Intent.STORE_UPDATE,
      Intent.MISSION_PLANNING,
    ].includes(intent);
  }

  private trackAgentTokens(
    telemetry: TelemetryData,
    agent: AgentType,
    tokens: number,
  ): void {
    telemetry.tokenUsage.byAgent[agent] =
      (telemetry.tokenUsage.byAgent[agent] ?? 0) + tokens;
    telemetry.tokenUsage.total += tokens;
    globalMetrics.addTokenUsage(agent, tokens, loadDeepSeekConfig().model);
    const batch = globalMetrics.flushTokenBatch();
    telemetry.costUsd = (telemetry.costUsd ?? 0) + batch.costUsd;
  }

  private async runShadowComparison(
    userMessage: string,
    primary: MissionResult,
  ): Promise<MissionResult> {
    try {
      const shadowClassifier = new IntentClassifier({
        model: process.env.OPENAI_BACKUP_MODEL || 'gpt-4o-mini',
        provider: 'openai',
      });

      const shadowIntent = await shadowClassifier.process(userMessage);
      const intentMatch = shadowIntent.intent === primary.intent;

      primary.telemetry.shadowComparison = {
        primaryProvider: 'deepseek',
        shadowProvider: 'openai',
        intentMatch,
        shadowIntent: shadowIntent.intent,
        shadowConfidence: shadowIntent.confidence,
        deepSeekBetter: !intentMatch && shadowIntent.confidence > (primary.telemetry.qualityMetrics?.intentConfidence ?? 0),
        planStepDelta: (primary.plan?.steps?.length ?? 0) - (primary.plan?.steps?.length ?? 0),
        notes: intentMatch
          ? ['Shadow intent matches primary']
          : [`Shadow intent ${shadowIntent.intent} differs from ${primary.intent}`],
      };

      if (process.env.AGENT_SHADOW_LOG_DETAILED === 'true') {
        logger.info({
          message: 'shadow_comparison',
          missionId: primary.missionId,
          intentMatch,
          primaryIntent: primary.intent,
          shadowIntent: shadowIntent.intent,
        });
      }
    } catch (error) {
      logger.warn({
        message: 'shadow_comparison_failed',
        missionId: primary.missionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return primary;
  }
}
