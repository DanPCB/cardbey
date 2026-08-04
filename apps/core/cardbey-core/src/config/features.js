/**
 * Single source of truth for intake feature flags.
 * All runtime code must read flags from here — no direct process.env.INTAKE_* elsewhere.
 */

function parseBoolEnv(raw, defaultValue) {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off') return false;
  if (normalized === 'true' || normalized === '1' || normalized === 'on') return true;
  return defaultValue;
}

function parseThreshold(raw, fallback) {
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** @deprecated Decision loop removed — IntentReasoner is the sole classifier. Always false. */
function readDecisionLoopEnabled() {
  return false;
}

function readBeliefShadowEnabled() {
  return parseBoolEnv(process.env.INTAKE_BELIEF_SHADOW_ENABLED, true);
}

function readAdvisorShadowEnabled() {
  const raw = String(process.env.INTAKE_ADVISOR_SHADOW_ENABLED ?? '').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off') return false;
  if (raw === 'true' || raw === '1' || raw === 'on') return true;
  return readBeliefShadowEnabled();
}

export const Features = {
  /**
   * LLM Gateway — Integrate, Don't Build (Phase 0–1).
   * Default ON: all text-gen should go through llmGateway.
   * Rollback: USE_LLM_GATEWAY=false
   */
  llm: {
    get useGateway() {
      return parseBoolEnv(process.env.USE_LLM_GATEWAY, true);
    },
    get defaultProvider() {
      const raw = String(process.env.LLM_DEFAULT_PROVIDER || 'anthropic').trim().toLowerCase();
      return raw || 'anthropic';
    },
    get fallbackProvider() {
      const raw = String(process.env.LLM_FALLBACK_PROVIDER || 'openai').trim().toLowerCase();
      return raw || 'openai';
    },
    get defaultModel() {
      const raw = String(process.env.LLM_DEFAULT_MODEL || '').trim();
      return raw || undefined;
    },
    /** Phase 1: strip PII before external provider calls. Rollback: ENABLE_PII_REDACTION=false */
    get piiRedaction() {
      return parseBoolEnv(process.env.ENABLE_PII_REDACTION, true);
    },
    providers: {
      kimi: {
        get enabled() {
          if (parseBoolEnv(process.env.KIMI_DISABLED, false)) return false;
          return parseBoolEnv(process.env.KIMI_ENABLED, true);
        },
        get defaultModel() {
          return (
            String(process.env.KIMI_DEFAULT_MODEL || process.env.KIMI_MODEL || 'kimi-k2.5').trim() ||
            'kimi-k2.5'
          );
        },
      },
      groq: {
        get enabled() {
          return parseBoolEnv(process.env.GROQ_ENABLED, true);
        },
        get defaultModel() {
          return (
            String(process.env.GROQ_DEFAULT_MODEL || process.env.GROQ_MODEL || 'llama-3.1-8b-instant').trim() ||
            'llama-3.1-8b-instant'
          );
        },
      },
    },
    /** True when any gateway-backed provider key is configured. */
    get available() {
      return Boolean(
        String(process.env.ANTHROPIC_API_KEY || '').trim() ||
          String(process.env.OPENAI_API_KEY || '').trim() ||
          String(process.env.DEEPSEEK_API_KEY || '').trim() ||
          String(process.env.XAI_API_KEY || '').trim() ||
          String(process.env.KIMI_API_KEY || '').trim() ||
          String(process.env.GROQ_API_KEY || '').trim(),
      );
    },
  },
  decisionLoop: {
    get enabled() {
      return readDecisionLoopEnabled();
    },
    get shadow() {
      return readBeliefShadowEnabled();
    },
    get log() {
      return parseBoolEnv(process.env.INTAKE_DECISION_LOOP_LOG, false);
    },
    thresholds: {
      get low() {
        return parseThreshold(process.env.INTAKE_DECISION_T_LOW, 0.55);
      },
      get margin() {
        return parseThreshold(process.env.INTAKE_DECISION_T_MARGIN, 0.15);
      },
    },
  },
  belief: {
    get shadow() {
      return readBeliefShadowEnabled();
    },
    get shadowLog() {
      return parseBoolEnv(process.env.INTAKE_BELIEF_SHADOW_LOG, false);
    },
  },
  advisor: {
    get shadow() {
      return readAdvisorShadowEnabled();
    },
    get shadowLog() {
      return parseBoolEnv(process.env.INTAKE_ADVISOR_SHADOW_LOG, false);
    },
  },
  bypasses: {
    get telemetryLog() {
      return parseBoolEnv(process.env.INTAKE_BYPASS_TELEMETRY_LOG, false);
    },
  },
  compiler: {
    get useForCampaigns() {
      return parseBoolEnv(process.env.USE_COMPILER_FOR_CAMPAIGNS, false);
    },
    get useForStores() {
      return parseBoolEnv(process.env.USE_COMPILER_FOR_STORES, false);
    },
  },
  loyalty: {
    /** When true: loyalty card scan uses IntentReasoner → compile → writeMetadata. Default false keeps ui-action. */
    get useSpine() {
      return parseBoolEnv(process.env.USE_LOYALTY_SPINE, false);
    },
    /**
     * When true: block synthetic DEFAULT_TEMPLATE topology (2×5 etc.) so missing topology surfaces loudly.
     * Set LOYALTY_DISABLE_DEFAULT_TEMPLATE=true while debugging card extraction / graph handoff.
     */
    get disableDefaultTemplate() {
      return parseBoolEnv(process.env.LOYALTY_DISABLE_DEFAULT_TEMPLATE, false);
    },
  },
  multiAgent: {
    /** When true: multi_agent / campaign_orchestration missions require explicit confirmation before AUTO_RUN. */
    get requireConfirmation() {
      return parseBoolEnv(process.env.MULTI_AGENT_REQUIRE_CONFIRMATION, true);
    },
    /** Internal user IDs allowed to bypass confirmation when skipConfirmation=true. */
    get skipConfirmationUsers() {
      const raw = String(process.env.MULTI_AGENT_SKIP_CONFIRMATION_USERS ?? '').trim();
      if (!raw) return [];
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    },
    /** Phase 2: default LLM provider for multiAgent BaseAgent (via llmGateway). */
    get provider() {
      const raw = String(process.env.MULTIAGENT_PROVIDER || 'deepseek').trim().toLowerCase();
      return raw || 'deepseek';
    },
    get fallbackProvider() {
      const raw = String(
        process.env.MULTIAGENT_FALLBACK_PROVIDER ||
          process.env.LLM_FALLBACK_PROVIDER ||
          'anthropic',
      )
        .trim()
        .toLowerCase();
      return raw || 'anthropic';
    },
    /** Route multiAgent LLM through llmGateway. Rollback: MULTIAGENT_USE_GATEWAY=false */
    get useGateway() {
      if (!Features.llm.useGateway) return false;
      return parseBoolEnv(process.env.MULTIAGENT_USE_GATEWAY, true);
    },
    get enabled() {
      return parseBoolEnv(process.env.MULTI_AGENT_ENABLED, true);
    },
  },
  /** Phase 2: intent classification / reasoner provider hints. */
  intent: {
    get provider() {
      const raw = String(
        process.env.INTENT_PROVIDER ||
          process.env.MULTIAGENT_PROVIDER ||
          'deepseek',
      )
        .trim()
        .toLowerCase();
      return raw || 'deepseek';
    },
    get useRegex() {
      return parseBoolEnv(process.env.INTENT_USE_REGEX, true);
    },
  },
  /**
   * Phase 3: multimodal + embeddings facades (via llmGateway).
   * Rollback per surface: VISION_ENABLED / EMBEDDING_ENABLED / IMAGE_GEN_ENABLED / VIDEO_GEN_ENABLED=false
   * Full rollback: USE_LLM_GATEWAY=false
   */
  vision: {
    get enabled() {
      return parseBoolEnv(process.env.VISION_ENABLED, true);
    },
    get useGateway() {
      return Features.llm.useGateway && Features.vision.enabled;
    },
    get defaultProvider() {
      const raw = String(process.env.VISION_PROVIDER || 'anthropic').trim().toLowerCase();
      return raw || 'anthropic';
    },
    get fallbackProvider() {
      const raw = String(process.env.VISION_FALLBACK_PROVIDER || 'openai').trim().toLowerCase();
      return raw || 'openai';
    },
  },
  embeddings: {
    get enabled() {
      return parseBoolEnv(process.env.EMBEDDING_ENABLED, true);
    },
    get useGateway() {
      return Features.llm.useGateway && Features.embeddings.enabled;
    },
    get defaultProvider() {
      const raw = String(process.env.EMBEDDING_PROVIDER || 'openai').trim().toLowerCase();
      return raw || 'openai';
    },
    get fallbackProvider() {
      const raw = String(process.env.EMBEDDING_FALLBACK_PROVIDER || 'voyage').trim().toLowerCase();
      return raw || 'voyage';
    },
  },
  image: {
    get enabled() {
      return parseBoolEnv(process.env.IMAGE_GEN_ENABLED, true);
    },
    get useGateway() {
      return Features.llm.useGateway && Features.image.enabled;
    },
    get defaultProvider() {
      const raw = String(process.env.IMAGE_PROVIDER || 'dalle').trim().toLowerCase();
      return raw || 'dalle';
    },
    get fallbackProvider() {
      const raw = String(process.env.IMAGE_FALLBACK_PROVIDER || 'ideogram').trim().toLowerCase();
      return raw || 'ideogram';
    },
  },
  video: {
    get enabled() {
      return parseBoolEnv(process.env.VIDEO_GEN_ENABLED, true);
    },
    get useGateway() {
      return Features.llm.useGateway && Features.video.enabled;
    },
    get defaultProvider() {
      const raw = String(process.env.VIDEO_PROVIDER || 'openai').trim().toLowerCase();
      return raw || 'openai';
    },
    get fallbackProvider() {
      const raw = String(process.env.VIDEO_FALLBACK_PROVIDER || 'kling').trim().toLowerCase();
      return raw || 'kling';
    },
  },
  reasoningPhase0: {
    get centralizedOutcome() {
      return parseBoolEnv(process.env.PHASE0_CENTRALIZED_OUTCOME, true);
    },
    get explicitDefaultTemplate() {
      return parseBoolEnv(process.env.PHASE0_EXPLICIT_DEFAULT_TEMPLATE, true);
    },
    get graphContractInvariant() {
      return parseBoolEnv(process.env.PHASE0_GRAPH_CONTRACT_INVARIANT, true);
    },
    get missionProjectionPrimary() {
      return parseBoolEnv(process.env.PHASE0_MISSION_PROJECTION_PRIMARY, true);
    },
  },
  phase1: {
    /** Write perceptions/decisions through MissionEvidenceGraph service. */
    get graphWriteTarget() {
      return parseBoolEnv(process.env.PHASE1_GRAPH_WRITE_TARGET, true);
    },
    /** Graph is primary; block deprecated metadata keys on new writes. */
    get graphPrimary() {
      return parseBoolEnv(process.env.PHASE1_GRAPH_PRIMARY, false);
    },
    /** Detect new evidence after freeze and surface re-analysis prompt. */
    get graphConflictDetection() {
      return parseBoolEnv(process.env.PHASE1_GRAPH_CONFLICT_DETECTION, true);
    },
    /** Append reasoning lines to graph.reasoningTrace. */
    get consolidatedReasoningTrace() {
      return parseBoolEnv(process.env.PHASE1_CONSOLIDATED_REASONING_TRACE, true);
    },
    /** Dashboard projection reads graph before legacy metadata. */
    get projectionFromGraph() {
      return parseBoolEnv(process.env.PHASE1_PROJECTION_FROM_GRAPH, true);
    },
    /** Log internal version bump traces (dev). */
    get traceVersionBumps() {
      return parseBoolEnv(process.env.PHASE1_TRACE_VERSION_BUMPS, false);
    },
  },
  phase2: {
    /** Active reasoning loop via ReasoningCoordinator (graph-driven capabilities). */
    get activeReasoning() {
      return parseBoolEnv(process.env.PHASE2_ACTIVE_REASONING, false);
    },
    /** Topology DAG is a snapshot; coordinator decides when to run/re-plan. */
    get topologyAsSnapshot() {
      return parseBoolEnv(process.env.PHASE2_TOPOLOGY_AS_SNAPSHOT, true);
    },
    /** Log reasoning step decisions in non-production. */
    get reasoningStepLog() {
      return parseBoolEnv(process.env.PHASE2_REASONING_STEP_LOG, false);
    },
    /** Only enable reasoning on CARDEY_DEPLOY_ENV=staging. */
    get stagingOnly() {
      return parseBoolEnv(process.env.PHASE2_REASONING_STAGING_ONLY, false);
    },
    /** 0–100 mission cohort rollout (hash-stable per missionId). */
    get rolloutPercent() {
      const value = parseFloat(process.env.PHASE2_REASONING_ROLLOUT_PERCENT ?? '0');
      if (!Number.isFinite(value)) return 0;
      return Math.max(0, Math.min(100, value));
    },
    /** In-process step metrics for soak monitoring. */
    get telemetry() {
      return parseBoolEnv(process.env.PHASE2_REASONING_TELEMETRY, true);
    },
    /** Coordinator owns full loop; DAG runs only when loyalty.run_topology_plan defers. */
    get reasoningPrimary() {
      return parseBoolEnv(process.env.PHASE2_REASONING_PRIMARY, false);
    },
  },
  uaf: {
    get enabled() {
      const raw = String(process.env.ENABLE_UNIVERSAL_ARTIFACT_FACTORY ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off') return false;
      if (raw === 'true' || raw === '1' || raw === 'on') return true;
      return process.env.NODE_ENV !== 'production';
    },
  },
  typedCatalog: {
    get compilerEnabled() {
      const raw = String(process.env.ENABLE_TYPED_CATALOG_COMPILER ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off') return false;
      if (raw === 'true' || raw === '1' || raw === 'on') return true;
      return process.env.NODE_ENV !== 'production';
    },
    get semanticQaEnabled() {
      const raw = String(process.env.ENABLE_SEMANTIC_CATALOG_QA ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off') return false;
      return true;
    },
  },
  intentEngine: {
    /** Phase 1: run intent-first engine alongside legacy pipeline (read-only compare). */
    get shadow() {
      return parseBoolEnv(process.env.INTENT_ENGINE_SHADOW, true);
    },
    /** Phase 2: route intake through intent-first engine as primary authority. */
    get primary() {
      return parseBoolEnv(process.env.INTENT_ENGINE_PRIMARY, false);
    },
    get shadowLog() {
      return parseBoolEnv(
        process.env.INTENT_ENGINE_SHADOW_LOG,
        process.env.NODE_ENV === 'development',
      );
    },
  },
  businessUnderstanding: {
    /**
     * Run Business Understanding Engine after attachment analysis.
     * Default ON (create-store / loyalty understanding). Set BUE_PIPELINE_ENABLED=false to kill.
     */
    get enabled() {
      return parseBoolEnv(process.env.BUE_PIPELINE_ENABLED, true);
    },
    /**
     * Optional vision enrich for brand signals (extra LLM call).
     * Default ON with BUE; set BUE_BRAND_VISION_ENABLED=false to disable vision enrich only.
     */
    get brandVision() {
      return parseBoolEnv(process.env.BUE_BRAND_VISION_ENABLED, true);
    },
    /** Log BUE pipeline summaries in non-production. */
    get telemetryLog() {
      return parseBoolEnv(
        process.env.BUE_TELEMETRY_LOG,
        process.env.NODE_ENV !== 'production',
      );
    },
  },
  ctaEngine: {
    get v1() {
      return parseBoolEnv(process.env.ENABLE_CTA_ENGINE_V1, true);
    },
    /**
     * Phase 2 platform marketing consumer. Default on non-prod, off production.
     */
    get platformMarketingV1() {
      const raw = String(process.env.ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1 ?? '')
        .trim()
        .toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      // Staging Render uses NODE_ENV=production + CARDEY_DEPLOY_ENV=staging — treat as non-prod.
      // Live production stays off until ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1 is set explicitly.
      const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
        .trim()
        .toLowerCase();
      if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
        return true;
      }
      return process.env.NODE_ENV !== 'production';
    },
  },
};

/** Snapshot for health checks and startup logs (plain values, not getters). */
/** @deprecated Always false — decision loop authority removed (Phase 1 collapse). */
export function isDecisionLoopEnabled() {
  return false;
}

export function snapshotFeatures() {
  return {
    llm: {
      useGateway: Features.llm.useGateway,
      defaultProvider: Features.llm.defaultProvider,
      fallbackProvider: Features.llm.fallbackProvider,
      defaultModel: Features.llm.defaultModel ?? null,
      piiRedaction: Features.llm.piiRedaction,
      available: Features.llm.available,
      providers: {
        kimi: {
          enabled: Features.llm.providers.kimi.enabled,
          defaultModel: Features.llm.providers.kimi.defaultModel,
        },
        groq: {
          enabled: Features.llm.providers.groq.enabled,
          defaultModel: Features.llm.providers.groq.defaultModel,
        },
      },
    },
    decisionLoop: {
      enabled: Features.decisionLoop.enabled,
      shadow: Features.decisionLoop.shadow,
      log: Features.decisionLoop.log,
      thresholds: {
        low: Features.decisionLoop.thresholds.low,
        margin: Features.decisionLoop.thresholds.margin,
      },
    },
    belief: {
      shadow: Features.belief.shadow,
      shadowLog: Features.belief.shadowLog,
    },
    advisor: {
      shadow: Features.advisor.shadow,
      shadowLog: Features.advisor.shadowLog,
    },
    bypasses: {
      telemetryLog: Features.bypasses.telemetryLog,
    },
    compiler: {
      useForCampaigns: Features.compiler.useForCampaigns,
      useForStores: Features.compiler.useForStores,
    },
    typedCatalog: {
      compilerEnabled: Features.typedCatalog.compilerEnabled,
      semanticQaEnabled: Features.typedCatalog.semanticQaEnabled,
    },
    loyalty: {
      useSpine: Features.loyalty.useSpine,
    },
    multiAgent: {
      requireConfirmation: Features.multiAgent.requireConfirmation,
      skipConfirmationUsers: Features.multiAgent.skipConfirmationUsers,
      provider: Features.multiAgent.provider,
      fallbackProvider: Features.multiAgent.fallbackProvider,
      useGateway: Features.multiAgent.useGateway,
      enabled: Features.multiAgent.enabled,
    },
    intent: {
      provider: Features.intent.provider,
      useRegex: Features.intent.useRegex,
    },
    vision: {
      enabled: Features.vision.enabled,
      useGateway: Features.vision.useGateway,
      defaultProvider: Features.vision.defaultProvider,
      fallbackProvider: Features.vision.fallbackProvider,
    },
    embeddings: {
      enabled: Features.embeddings.enabled,
      useGateway: Features.embeddings.useGateway,
      defaultProvider: Features.embeddings.defaultProvider,
      fallbackProvider: Features.embeddings.fallbackProvider,
    },
    image: {
      enabled: Features.image.enabled,
      useGateway: Features.image.useGateway,
      defaultProvider: Features.image.defaultProvider,
      fallbackProvider: Features.image.fallbackProvider,
    },
    video: {
      enabled: Features.video.enabled,
      useGateway: Features.video.useGateway,
      defaultProvider: Features.video.defaultProvider,
      fallbackProvider: Features.video.fallbackProvider,
    },
    reasoningPhase0: {
      centralizedOutcome: Features.reasoningPhase0.centralizedOutcome,
      explicitDefaultTemplate: Features.reasoningPhase0.explicitDefaultTemplate,
      graphContractInvariant: Features.reasoningPhase0.graphContractInvariant,
      missionProjectionPrimary: Features.reasoningPhase0.missionProjectionPrimary,
    },
    phase1: {
      graphWriteTarget: Features.phase1.graphWriteTarget,
      graphPrimary: Features.phase1.graphPrimary,
      graphConflictDetection: Features.phase1.graphConflictDetection,
      consolidatedReasoningTrace: Features.phase1.consolidatedReasoningTrace,
      projectionFromGraph: Features.phase1.projectionFromGraph,
    },
    phase2: {
      activeReasoning: Features.phase2.activeReasoning,
      topologyAsSnapshot: Features.phase2.topologyAsSnapshot,
      reasoningStepLog: Features.phase2.reasoningStepLog,
      stagingOnly: Features.phase2.stagingOnly,
      rolloutPercent: Features.phase2.rolloutPercent,
      telemetry: Features.phase2.telemetry,
    },
    uaf: {
      enabled: Features.uaf.enabled,
    },
    intentEngine: {
      shadow: Features.intentEngine.shadow,
      primary: Features.intentEngine.primary,
      shadowLog: Features.intentEngine.shadowLog,
    },
    ctaEngine: {
      v1: Features.ctaEngine.v1,
      platformMarketingV1: Features.ctaEngine.platformMarketingV1,
    },
  };
}

export default Features;
