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

function isNonProductionDeploy() {
  const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
    .trim()
    .toLowerCase();
  if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}

function readNonProductionFlag(envName, parentEnabled = true) {
  if (!parentEnabled) return false;
  const raw = String(process.env[envName] ?? '').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
  if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
  return isNonProductionDeploy();
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
   * LLM Gateway — Integrate, Don't Build (Phase 0).
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
    /** OpenAI-family fallback model for engines / gateway fallback path. */
    get fallbackModel() {
      const raw = String(
        process.env.LLM_FALLBACK_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      ).trim();
      return raw || 'gpt-4o-mini';
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
  /**
   * Grounded store creation V1 — stop silent product invention + weak stock media.
   * Default OFF. Set ENABLE_GROUNDED_STORE_CREATION_V1=true to enable for new/regenerated drafts.
   */
  groundedStoreCreation: {
    get v1() {
      return parseBoolEnv(process.env.ENABLE_GROUNDED_STORE_CREATION_V1, false);
    },
    /** Min semantic media match score (0–1) to attach stock/generated imagery. */
    get minMediaMatchScore() {
      return parseThreshold(process.env.GROUNDED_MIN_MEDIA_MATCH_SCORE, 0.55);
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
  /**
   * Canonical store reviews (Business = store).
   * v1 + submission: on in non-prod by default; production off unless env set.
   * Moderation + owner reply: off unless explicitly enabled.
   */
  storeReviews: {
    get v1() {
      return readNonProductionFlag('ENABLE_STORE_REVIEWS_V1');
    },
    get submissionV1() {
      return readNonProductionFlag('ENABLE_STORE_REVIEW_SUBMISSION_V1', Features.storeReviews.v1);
    },
    get moderationV1() {
      return parseBoolEnv(process.env.ENABLE_STORE_REVIEW_MODERATION_V1, false);
    },
    get ownerReplyV1() {
      return parseBoolEnv(process.env.ENABLE_STORE_REVIEW_OWNER_REPLY_V1, false);
    },
  },
  marketplace: {
    get contentMarketplaceV1() {
      return parseBoolEnv(process.env.ENABLE_CONTENT_MARKETPLACE_V1, false);
    },
    get sellerV1() {
      return readNonProductionFlag(
        'ENABLE_MARKETPLACE_SELLER_V1',
        Features.marketplace.contentMarketplaceV1,
      );
    },
    get listingV1() {
      return readNonProductionFlag(
        'ENABLE_CREATOR_MARKETPLACE_LISTING_V1',
        Features.marketplace.contentMarketplaceV1,
      );
    },
    get moderationV1() {
      return readNonProductionFlag(
        'ENABLE_MARKETPLACE_MODERATION_V1',
        Features.marketplace.contentMarketplaceV1,
      );
    },
    get premiumPurchaseV1() {
      return parseBoolEnv(process.env.ENABLE_PREMIUM_CONTENT_PURCHASE_V1, false);
    },
    get creatorEarningsV1() {
      return parseBoolEnv(process.env.ENABLE_CREATOR_EARNINGS_V1, false);
    },
  },
  /**
   * Storefront Design Library Phase 1 — contracts/registries/adapters only.
   * Never authoritative for generation/render in Phase 1 (see isDesignLibraryAuthoritative).
   */
  designLibrary: {
    get v1() {
      const raw = String(process.env.ENABLE_DESIGN_LIBRARY_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
        .trim()
        .toLowerCase();
      if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
        return true;
      }
      return process.env.NODE_ENV !== 'production';
    },
    get projectionShadowV1() {
      if (!Features.designLibrary.v1) return false;
      const raw = String(process.env.ENABLE_STOREFRONT_PROJECTION_SHADOW_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
        .trim()
        .toLowerCase();
      if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
        return true;
      }
      return process.env.NODE_ENV !== 'production';
    },
    get projectionPreviewV1() {
      if (!Features.designLibrary.v1) return false;
      const raw = String(process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
        .trim()
        .toLowerCase();
      if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
        return true;
      }
      return process.env.NODE_ENV !== 'production';
    },
    get projectionAcceptanceV1() {
      if (!Features.designLibrary.v1) return false;
      const raw = String(process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
        .trim()
        .toLowerCase();
      if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
        return true;
      }
      return process.env.NODE_ENV !== 'production';
    },
    get projectionPreviewRenderV1() {
      if (!Features.designLibrary.v1) return false;
      const raw = String(process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_RENDER_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
        .trim()
        .toLowerCase();
      if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
        return true;
      }
      return process.env.NODE_ENV !== 'production';
    },
    get projectionPublishV1() {
      if (!Features.designLibrary.v1) return false;
      const raw = String(process.env.ENABLE_STOREFRONT_PROJECTION_PUBLISH_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
        .trim()
        .toLowerCase();
      if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
        return true;
      }
      return process.env.NODE_ENV !== 'production';
    },
    /**
     * Per-draft accepted projection → storefront renderer cutover (not publish).
     * Default off in production. Requires design library.
     */
    get projectionRenderCutoverV1() {
      if (!Features.designLibrary.v1) return false;
      const raw = String(process.env.ENABLE_STOREFRONT_PROJECTION_RENDER_CUTOVER_V1 ?? '')
        .trim()
        .toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
        .trim()
        .toLowerCase();
      if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
        return true;
      }
      return process.env.NODE_ENV !== 'production';
    },
  },
  /**
   * Performer turn V1 — POST /api/performer/turn (reason-only LLM via llmGateway).
   * Default ON outside production; set ENABLE_PERFORMER_TURN_V1=false to disable.
   * Does not execute CRM/booking; dashboard structured planner remains fallback.
   */
  performerTurn: {
    get v1() {
      return readNonProductionFlag('ENABLE_PERFORMER_TURN_V1');
    },
  },

  /**
   * Language Intelligence — Phase 1 contracts + Phase 2 TranslationEngine.
   * Never authoritative for storefront/chat cutover (see isLanguageIntelligenceAuthoritative).
   * Overwrite-elimination on store translate is unconditional (bug fix).
   */
  languageIntelligence: {
    get v1() {
      const raw = String(process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
        .trim()
        .toLowerCase();
      if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
        return true;
      }
      return process.env.NODE_ENV !== 'production';
    },
    get engineV1() {
      if (!Features.languageIntelligence.v1) return false;
      const raw = String(process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
        .trim()
        .toLowerCase();
      if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
        return true;
      }
      return process.env.NODE_ENV !== 'production';
    },
    get conversationV1() {
      if (!Features.languageIntelligence.engineV1) return false;
      const raw = String(process.env.ENABLE_LANGUAGE_INTELLIGENCE_CONVERSATION_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
        .trim()
        .toLowerCase();
      if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
        return true;
      }
      return process.env.NODE_ENV !== 'production';
    },
    get storefrontLocalizerV1() {
      if (!Features.languageIntelligence.engineV1) return false;
      const raw = String(process.env.ENABLE_LANGUAGE_INTELLIGENCE_STOREFRONT_LOCALIZER_V1 ?? '')
        .trim()
        .toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
        .trim()
        .toLowerCase();
      if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
        return true;
      }
      return process.env.NODE_ENV !== 'production';
    },
    get preferencesV1() {
      if (!Features.languageIntelligence.engineV1) return false;
      const raw = String(process.env.ENABLE_LANGUAGE_INTELLIGENCE_PREFERENCES_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
        .trim()
        .toLowerCase();
      if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
        return true;
      }
      return process.env.NODE_ENV !== 'production';
    },
    get consumptionV1() {
      if (!Features.languageIntelligence.engineV1) return false;
      const raw = String(process.env.ENABLE_LANGUAGE_INTELLIGENCE_CONSUMPTION_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
        .trim()
        .toLowerCase();
      if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
        return true;
      }
      return process.env.NODE_ENV !== 'production';
    },
    /** Stage 0–2 — fail closed (off in production when unset). */
    get autoResolutionV1() {
      if (!Features.languageIntelligence.engineV1) return false;
      const raw = String(process.env.ENABLE_LANGUAGE_AUTO_RESOLUTION_V1 ?? '').trim().toLowerCase();
      return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
    },
    get resolveApiV1() {
      if (!Features.languageIntelligence.autoResolutionV1) return false;
      const raw = String(process.env.ENABLE_LANGUAGE_RESOLVE_API_V1 ?? '').trim().toLowerCase();
      return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
    },
    get visitorPreferenceV1() {
      if (!Features.languageIntelligence.autoResolutionV1) return false;
      const raw = String(process.env.ENABLE_LANGUAGE_VISITOR_PREFERENCE_V1 ?? '').trim().toLowerCase();
      return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
    },
    /** Stage 3 — dashboard chrome ↔ account pref bridge (fail closed). */
    get dashboardPrefBridgeV1() {
      if (!Features.languageIntelligence.preferencesV1) return false;
      const raw = String(process.env.ENABLE_LANGUAGE_DASHBOARD_PREF_BRIDGE_V1 ?? '').trim().toLowerCase();
      return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
    },
    /** Stage 4 — public storefront consumption cutover (fail closed). */
    get storefrontConsumptionCutoverV1() {
      if (!Features.languageIntelligence.autoResolutionV1) return false;
      const raw = String(process.env.ENABLE_LANGUAGE_STOREFRONT_CONSUMPTION_CUTOVER_V1 ?? '')
        .trim()
        .toLowerCase();
      return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
    },
    get storefrontSelectorV1() {
      if (!Features.languageIntelligence.storefrontConsumptionCutoverV1) return false;
      const raw = String(process.env.ENABLE_LANGUAGE_STOREFRONT_SELECTOR_V1 ?? '').trim().toLowerCase();
      return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
    },
  },
  /**
   * Universal Library — Phase 2A population + taxonomy foundation.
   */
  universalLibrary: {
    get v1() {
      return readNonProductionFlag('ENABLE_UNIVERSAL_LIBRARY_V1');
    },
    get populationV1() {
      return readNonProductionFlag('ENABLE_CONTENT_POPULATION_V1', Features.universalLibrary.v1);
    },
    get taxonomyV1() {
      return readNonProductionFlag('ENABLE_CONTENT_TAXONOMY_V1', Features.universalLibrary.v1);
    },
    get discoveryV1() {
      return readNonProductionFlag('ENABLE_UNIVERSAL_DISCOVERY_V1', Features.universalLibrary.v1);
    },
    get reputationV1() {
      return parseBoolEnv(process.env.ENABLE_UNIVERSAL_REPUTATION_V1, false);
    },
    /** Phase 3 — real catalogue population (Cardbey Originals, creator projection). */
    get realPopulationV1() {
      return readNonProductionFlag('ENABLE_REAL_LIBRARY_POPULATION_V1', Features.universalLibrary.v1);
    },
    get cardbeyOriginalsV1() {
      return readNonProductionFlag(
        'ENABLE_CARDBEY_ORIGINALS_SOURCE_V1',
        Features.universalLibrary.realPopulationV1,
      );
    },
    /** Phase 3B — grow Cardbey Originals beyond pilot seed. */
    get originalsExpansionV1() {
      return readNonProductionFlag(
        'ENABLE_CARDBEY_ORIGINALS_EXPANSION_V1',
        Features.universalLibrary.cardbeyOriginalsV1,
      );
    },
    /** Phase 3B alias — real catalogue expansion umbrella. */
    get realLibraryExpansionV1() {
      return readNonProductionFlag(
        'ENABLE_REAL_LIBRARY_EXPANSION_V1',
        Features.universalLibrary.realPopulationV1,
      );
    },
    get creatorLibraryPublicationV1() {
      return parseBoolEnv(process.env.ENABLE_CREATOR_LIBRARY_PUBLICATION_V1, false);
    },
    get businessAssetDerivationV1() {
      return parseBoolEnv(process.env.ENABLE_BUSINESS_ASSET_DERIVATION_V1, false);
    },
    get libraryOperationsV1() {
      return readNonProductionFlag('ENABLE_LIBRARY_OPERATIONS_V1', Features.universalLibrary.v1);
    },
    /** Fixtures never default on — even in non-prod. Explicit opt-in only. */
    get fixturesV1() {
      return parseBoolEnv(process.env.ENABLE_UNIVERSAL_LIBRARY_FIXTURES_V1, false);
    },
    get externalOpenProviderV1() {
      return (
        parseBoolEnv(process.env.ENABLE_FIRST_EXTERNAL_PROVIDER_V1, false) ||
        parseBoolEnv(process.env.ENABLE_EXTERNAL_OPEN_PROVIDER_V1, false)
      );
    },
    get providerScheduledSyncV1() {
      return parseBoolEnv(process.env.ENABLE_PROVIDER_SCHEDULED_SYNC_V1, false);
    },
    get realLibraryCollectionsV1() {
      return readNonProductionFlag(
        'ENABLE_REAL_LIBRARY_COLLECTIONS_V1',
        Features.universalLibrary.realPopulationV1,
      );
    },
  },
  /**
   * Capability Engine (Phase 4A) — reusable outcome packages.
   * Marketplace remains separately gated and off.
   */
  capabilityEngine: {
    get v1() {
      return readNonProductionFlag('ENABLE_CAPABILITY_ENGINE_V1');
    },
    get libraryV1() {
      return readNonProductionFlag(
        'ENABLE_CAPABILITY_LIBRARY_V1',
        Features.capabilityEngine.v1,
      );
    },
    get applicationV1() {
      return readNonProductionFlag(
        'ENABLE_CAPABILITY_APPLICATION_V1',
        Features.capabilityEngine.v1,
      );
    },
    get creatorToolsV1() {
      return parseBoolEnv(process.env.ENABLE_CAPABILITY_CREATOR_TOOLS_V1, false);
    },
    get operationsV1() {
      return readNonProductionFlag(
        'ENABLE_CAPABILITY_OPERATIONS_V1',
        Features.capabilityEngine.v1,
      );
    },
    get marketplaceV1() {
      return parseBoolEnv(process.env.ENABLE_CAPABILITY_MARKETPLACE_V1, false);
    },
  },
  /**
   * Universal Resource Intelligence (URI) — Phase 1 foundation.
   * AI-native discovery/index/rights-suggest/reuse-plan. Not a crawler.
   * Consumers: Universal Library, Capability Engine, Performer, Business Creation, Creator Studio.
   */
  universalResourceIntelligence: {
    get v1() {
      return readNonProductionFlag('ENABLE_UNIVERSAL_RESOURCE_INTELLIGENCE_V1');
    },
    get searchV1() {
      return readNonProductionFlag(
        'ENABLE_URI_SEARCH_V1',
        Features.universalResourceIntelligence.v1,
      );
    },
    get federationV1() {
      return readNonProductionFlag(
        'ENABLE_URI_FEDERATION_V1',
        Features.universalResourceIntelligence.v1,
      );
    },
    get opsCopilotV1() {
      return parseBoolEnv(process.env.ENABLE_URI_OPS_COPILOT_V1, false);
    },
    get learningV1() {
      return parseBoolEnv(process.env.ENABLE_URI_LEARNING_V1, false);
    },
    /** Phase 2 — rights-aware reuse pilot (select → confirm → draft custody). */
    get reusePilotV1() {
      return readNonProductionFlag(
        'ENABLE_URI_REUSE_PILOT_V1',
        Features.universalResourceIntelligence.v1,
      );
    },
    /** Phase 3 — multimodal discovery + resource workspace. */
    get workspaceV1() {
      return readNonProductionFlag(
        'ENABLE_URI_WORKSPACE_V1',
        Features.universalResourceIntelligence.reusePilotV1,
      );
    },
    /** Phase 4 — product integration / invisible intelligence layer. */
    get productIntegrationV1() {
      return readNonProductionFlag(
        'ENABLE_URI_PRODUCT_INTEGRATION_V1',
        Features.universalResourceIntelligence.workspaceV1,
      );
    },
    /** Phase 5 — Provider SDK + registry adapters. */
    get providerSdkV1() {
      return readNonProductionFlag(
        'ENABLE_URI_PROVIDER_SDK_V1',
        Features.universalResourceIntelligence.federationV1,
      );
    },
    /** Phase 5 — Federation Planner (subset of sources). */
    get federationPlannerV1() {
      return readNonProductionFlag(
        'ENABLE_URI_FEDERATION_PLANNER_V1',
        Features.universalResourceIntelligence.providerSdkV1,
      );
    },
    /** Phase 5 — Global Resource Graph enrichment. */
    get resourceGraphV1() {
      return readNonProductionFlag(
        'ENABLE_URI_RESOURCE_GRAPH_V1',
        Features.universalResourceIntelligence.providerSdkV1,
      );
    },
  },
  /**
   * Business Discovery Layer (BDL) — Phase 4 foundation.
   * Canonical publishing projection for SEO/AI/social/directory consumers.
   * Not authoritative; no consumer cutover. Sibling of lib/businessDiscovery (acquisition).
   */
  businessDiscoveryLayer: {
    get v1() {
      const raw = String(process.env.ENABLE_BUSINESS_DISCOVERY_LAYER_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
        .trim()
        .toLowerCase();
      if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
        return true;
      }
      return process.env.NODE_ENV !== 'production';
    },
    get projectionV1() {
      if (!Features.businessDiscoveryLayer.v1) return false;
      const raw = String(process.env.ENABLE_BUSINESS_DISCOVERY_PROJECTION_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      return Features.businessDiscoveryLayer.v1;
    },
    get validationV1() {
      if (!Features.businessDiscoveryLayer.projectionV1) return false;
      const raw = String(process.env.ENABLE_BUSINESS_DISCOVERY_VALIDATION_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      return Features.businessDiscoveryLayer.projectionV1;
    },
    get eventsV1() {
      if (!Features.businessDiscoveryLayer.v1) return false;
      const raw = String(process.env.ENABLE_BUSINESS_DISCOVERY_EVENTS_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      return Features.businessDiscoveryLayer.v1;
    },
    get cacheV1() {
      if (!Features.businessDiscoveryLayer.projectionV1) return false;
      const raw = String(process.env.ENABLE_BUSINESS_DISCOVERY_CACHE_V1 ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
      if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
      return Features.businessDiscoveryLayer.projectionV1;
    },
    /** Always fail-closed until later phases wire consumers. */
    get consumerCutoverV1() {
      const raw = String(process.env.ENABLE_BUSINESS_DISCOVERY_CONSUMER_CUTOVER_V1 ?? '')
        .trim()
        .toLowerCase();
      return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
    },
    get seoConsumerV1() {
      if (!Features.businessDiscoveryLayer.consumerCutoverV1) return false;
      const raw = String(process.env.ENABLE_BUSINESS_DISCOVERY_SEO_CONSUMER_V1 ?? '')
        .trim()
        .toLowerCase();
      return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
    },
  },
};

/** Snapshot for health checks and startup logs (plain values, not getters). */
/** @deprecated Always false — decision loop authority removed (Phase 1 collapse). */
export function isDecisionLoopEnabled() {
  return false;
}

export function isMarketplaceListingPilotEnabled() {
  return (
    Features.marketplace.contentMarketplaceV1 &&
    Features.marketplace.sellerV1 &&
    Features.marketplace.listingV1
  );
}

export function snapshotFeatures() {
  return {
    llm: {
      useGateway: Features.llm.useGateway,
      defaultProvider: Features.llm.defaultProvider,
      fallbackProvider: Features.llm.fallbackProvider,
      defaultModel: Features.llm.defaultModel ?? null,
      fallbackModel: Features.llm.fallbackModel,
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
    groundedStoreCreation: {
      v1: Features.groundedStoreCreation.v1,
      minMediaMatchScore: Features.groundedStoreCreation.minMediaMatchScore,
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
    storeReviews: {
      v1: Features.storeReviews.v1,
      submissionV1: Features.storeReviews.submissionV1,
      moderationV1: Features.storeReviews.moderationV1,
      ownerReplyV1: Features.storeReviews.ownerReplyV1,
    },
    marketplace: {
      contentMarketplaceV1: Features.marketplace.contentMarketplaceV1,
      sellerV1: Features.marketplace.sellerV1,
      listingV1: Features.marketplace.listingV1,
      moderationV1: Features.marketplace.moderationV1,
      premiumPurchaseV1: Features.marketplace.premiumPurchaseV1,
      creatorEarningsV1: Features.marketplace.creatorEarningsV1,
      listingPilotEnabled: isMarketplaceListingPilotEnabled(),
    },
    designLibrary: {
      v1: Features.designLibrary.v1,
      projectionShadowV1: Features.designLibrary.projectionShadowV1,
      projectionPreviewV1: Features.designLibrary.projectionPreviewV1,
      projectionAcceptanceV1: Features.designLibrary.projectionAcceptanceV1,
      projectionPreviewRenderV1: Features.designLibrary.projectionPreviewRenderV1,
      projectionPublishV1: Features.designLibrary.projectionPublishV1,
      projectionRenderCutoverV1: Features.designLibrary.projectionRenderCutoverV1,
    },
    languageIntelligence: {
      v1: Features.languageIntelligence.v1,
      engineV1: Features.languageIntelligence.engineV1,
      conversationV1: Features.languageIntelligence.conversationV1,
      storefrontLocalizerV1: Features.languageIntelligence.storefrontLocalizerV1,
      preferencesV1: Features.languageIntelligence.preferencesV1,
      consumptionV1: Features.languageIntelligence.consumptionV1,
      autoResolutionV1: Features.languageIntelligence.autoResolutionV1,
      resolveApiV1: Features.languageIntelligence.resolveApiV1,
      visitorPreferenceV1: Features.languageIntelligence.visitorPreferenceV1,
      dashboardPrefBridgeV1: Features.languageIntelligence.dashboardPrefBridgeV1,
      storefrontConsumptionCutoverV1: Features.languageIntelligence.storefrontConsumptionCutoverV1,
      storefrontSelectorV1: Features.languageIntelligence.storefrontSelectorV1,
    },
    businessDiscoveryLayer: {
      v1: Features.businessDiscoveryLayer.v1,
      projectionV1: Features.businessDiscoveryLayer.projectionV1,
      validationV1: Features.businessDiscoveryLayer.validationV1,
      eventsV1: Features.businessDiscoveryLayer.eventsV1,
      cacheV1: Features.businessDiscoveryLayer.cacheV1,
      consumerCutoverV1: Features.businessDiscoveryLayer.consumerCutoverV1,
      seoConsumerV1: Features.businessDiscoveryLayer.seoConsumerV1,
    },
    universalLibrary: {
      v1: Features.universalLibrary.v1,
      populationV1: Features.universalLibrary.populationV1,
      taxonomyV1: Features.universalLibrary.taxonomyV1,
      discoveryV1: Features.universalLibrary.discoveryV1,
      reputationV1: Features.universalLibrary.reputationV1,
      realPopulationV1: Features.universalLibrary.realPopulationV1,
      cardbeyOriginalsV1: Features.universalLibrary.cardbeyOriginalsV1,
      originalsExpansionV1: Features.universalLibrary.originalsExpansionV1,
      realLibraryExpansionV1: Features.universalLibrary.realLibraryExpansionV1,
      creatorLibraryPublicationV1: Features.universalLibrary.creatorLibraryPublicationV1,
      businessAssetDerivationV1: Features.universalLibrary.businessAssetDerivationV1,
      libraryOperationsV1: Features.universalLibrary.libraryOperationsV1,
      fixturesV1: Features.universalLibrary.fixturesV1,
      externalOpenProviderV1: Features.universalLibrary.externalOpenProviderV1,
      providerScheduledSyncV1: Features.universalLibrary.providerScheduledSyncV1,
      realLibraryCollectionsV1: Features.universalLibrary.realLibraryCollectionsV1,
    },
    capabilityEngine: {
      v1: Features.capabilityEngine.v1,
      libraryV1: Features.capabilityEngine.libraryV1,
      applicationV1: Features.capabilityEngine.applicationV1,
      creatorToolsV1: Features.capabilityEngine.creatorToolsV1,
      operationsV1: Features.capabilityEngine.operationsV1,
      marketplaceV1: Features.capabilityEngine.marketplaceV1,
    },
    universalResourceIntelligence: {
      v1: Features.universalResourceIntelligence.v1,
      searchV1: Features.universalResourceIntelligence.searchV1,
      federationV1: Features.universalResourceIntelligence.federationV1,
      opsCopilotV1: Features.universalResourceIntelligence.opsCopilotV1,
      learningV1: Features.universalResourceIntelligence.learningV1,
      reusePilotV1: Features.universalResourceIntelligence.reusePilotV1,
      workspaceV1: Features.universalResourceIntelligence.workspaceV1,
      productIntegrationV1: Features.universalResourceIntelligence.productIntegrationV1,
      providerSdkV1: Features.universalResourceIntelligence.providerSdkV1,
      federationPlannerV1: Features.universalResourceIntelligence.federationPlannerV1,
      resourceGraphV1: Features.universalResourceIntelligence.resourceGraphV1,
    },
  };
}

export default Features;
