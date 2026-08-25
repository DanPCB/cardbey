/**
 * Evidence-tied recommendation engine — Phase D6.
 * Deterministic signal → finding → recommendation. Optional LLM wording enrichment only.
 */

import { KNOWLEDGE_STATES } from './knowledgeStates.js';
import { CARDBEY_ACTIONS, recommendation as baseRecommendation, stated } from './fullAnalysisTypes.js';
import { SIGNAL_TYPES, extractBusinessSignals, hasSignal, signalByType } from './businessSignals.js';
import { resolveVerticalArchetype, VERTICAL_ARCHETYPES } from './verticalPacks.js';
import {
  SPECIFICITY,
  classifyRecommendationSpecificity,
  applySpecificityGate,
} from './specificityGate.js';
import { deriveCustomerSegmentHypotheses } from './customerSegments.js';
import { buildPlanFromRecommendations } from './planFromRecommendations.js';

/**
 * @param {{
 *   context: object,
 *   snapshot: object | null,
 *   competitorCandidates?: object[],
 * }} input
 * @param {{ enrichRecommendationWording?: Function }} [deps]
 */
export async function buildVerticalIntelligence(input, deps = {}) {
  const vertical = resolveVerticalArchetype({
    context: input.context,
    snapshot: input.snapshot,
    mode: input.context?.mode,
  });
  const signals = extractBusinessSignals({
    context: input.context,
    snapshot: input.snapshot,
    vertical: vertical.id,
  });

  const name =
    input.snapshot?.identity?.name?.value || input.context?.identity?.name || null;
  const location =
    input.snapshot?.identity?.location?.value || input.context?.identity?.location || null;
  const offeringCount = input.snapshot?.offerings?.count || 0;
  const mode = input.context?.mode;

  const costAudit = {
    llmCalls: 0,
    approximateTokens: 0,
    provider: null,
    model: null,
    latencyMs: 0,
    fallbackUsed: true,
  };

  /** @type {object[]} */
  let draftRecs =
    mode === 'INTENDED'
      ? buildIntendedRecommendations({ signals, vertical, name, location, snapshot: input.snapshot, context: input.context })
      : buildExistingRecommendations({
          signals,
          vertical,
          name,
          location,
          snapshot: input.snapshot,
          context: input.context,
          competitorCandidates: input.competitorCandidates || [],
        });

  // Optional LLM enrichment (wording only) — must pass validation
  if (typeof deps.enrichRecommendationWording === 'function' && draftRecs.length) {
    try {
      const t0 = Date.now();
      const enriched = await deps.enrichRecommendationWording({
        recommendations: draftRecs,
        signals,
        vertical,
        businessName: name,
        location,
        mode,
      });
      costAudit.latencyMs = Date.now() - t0;
      costAudit.llmCalls = enriched?.llmCalls ?? 0;
      costAudit.approximateTokens = enriched?.approximateTokens ?? 0;
      costAudit.provider = enriched?.provider || null;
      costAudit.model = enriched?.model || null;
      costAudit.fallbackUsed = Boolean(enriched?.skipped) || !enriched?.recommendations?.length;
      if (
        !enriched?.skipped &&
        Array.isArray(enriched?.recommendations) &&
        enriched.recommendations.length
      ) {
        draftRecs = mergeEnrichedWording(draftRecs, enriched.recommendations);
        costAudit.fallbackUsed = false;
      }
    } catch {
      costAudit.fallbackUsed = true;
    }
  }

  // Attach specificity + gate
  for (const r of draftRecs) {
    r.specificity = classifyRecommendationSpecificity({
      text: `${r.businessSpecificObservation || ''} ${r.recommendedAction || r.recommendation || ''}`,
      observation: r.businessSpecificObservation,
      evidenceRefs: r.evidenceRefs || [],
      metrics: r.metrics || {},
      businessName: name,
      location,
      verticalLabel: vertical.label,
      offeringCount,
    });
  }

  const gated = applySpecificityGate(draftRecs, { allowInsufficientNote: true });
  const recommendations = gated.recommendations.map(normalizeRecommendation);

  const findings = buildFindingsFromSignals({ signals, vertical, name, location, mode, snapshot: input.snapshot });
  const opportunities = recommendations.slice(0, 4).map((r) =>
    stated({
      id: `opp_${r.id}`,
      title: r.title || r.recommendedAction.slice(0, 80),
      detail: r.whyItMatters,
      knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
      evidenceRefs: r.evidenceRefs,
      limitations: Array.isArray(r.limitations) ? r.limitations.join(' ') : r.limitations,
    }),
  );

  const segments = deriveCustomerSegmentHypotheses({
    context: input.context,
    snapshot: input.snapshot,
    vertical,
  });

  const capabilities =
    mode === 'INTENDED'
      ? (vertical.capabilityPriorities || []).map((key) =>
          stated({
            id: `cap_${key}`,
            title: humanizeCapability(key, vertical),
            detail: capabilityDetail(key, vertical, name, location),
            knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
            limitations: 'Planning requirement for this archetype — not a discovered fact.',
          }),
        )
      : [];

  const plan = buildPlanFromRecommendations(recommendations);

  return {
    vertical,
    signals,
    findings,
    opportunities,
    recommendations,
    rejectedRecommendations: gated.rejected,
    customerSegmentHypotheses: segments,
    capabilityRequirements: capabilities,
    plan,
    costAudit,
    phase: 'D6',
  };
}

function normalizeRecommendation(r) {
  const action = r.recommendedAction || r.recommendation || '';
  const exec = r.cardbeyExecution || mapExecution(r.possibleCardbeyAction);
  return baseRecommendation({
    ...r,
    id: r.id,
    title: r.title || action.slice(0, 72),
    finding: r.businessSpecificObservation || r.finding || '',
    businessSpecificObservation: r.businessSpecificObservation || r.finding || '',
    evidence: r.evidence || [],
    evidenceRefs: r.evidenceRefs || [],
    signal: r.signal || null,
    interpretation: r.whyItMatters || r.interpretation || '',
    whyItMatters: r.whyItMatters || r.interpretation || '',
    recommendation: action,
    recommendedAction: action,
    priority: r.priority || 'medium',
    specificity: r.specificity || SPECIFICITY.BUSINESS_SPECIFIC,
    verticalContext: r.verticalContext || null,
    limitations: r.limitations || 'Guidance only — not a guaranteed outcome.',
    requiredCapability: r.requiredCapability || null,
    possibleCardbeyAction: r.possibleCardbeyAction || {
      kind: exec?.capability || 'manual',
      label: exec?.label || 'Manual action / future capability',
      href: exec?.route || null,
    },
    cardbeyExecution: exec,
    supportingStates: r.supportingStates || [KNOWLEDGE_STATES.DISCOVERED_FACT],
    confidence: r.confidence ?? 0.7,
    assumptions: r.assumptions || [],
  });
}

function mapExecution(action) {
  if (!action) {
    return { capability: 'manual', route: null, status: 'MANUAL', label: 'Manual action / future capability' };
  }
  if (action.href === '/for-business') {
    return {
      capability: action.kind || 'create_or_claim',
      route: '/for-business',
      status: 'EXECUTABLE_NOW',
      label: action.label,
    };
  }
  if (action.href?.includes('/app/console')) {
    return {
      capability: action.kind || 'performer',
      route: action.href,
      status: 'PARTIALLY_EXECUTABLE',
      label: action.label,
    };
  }
  if (action.href === '/see-your-business') {
    return {
      capability: 'see_business',
      route: '/see-your-business',
      status: 'EXECUTABLE_NOW',
      label: action.label,
    };
  }
  return {
    capability: action.kind || 'manual',
    route: action.href || null,
    status: action.href ? 'PARTIALLY_EXECUTABLE' : 'MANUAL',
    label: action.label,
  };
}

function buildFindingsFromSignals({ signals, vertical, name, location, mode, snapshot }) {
  const findings = [];
  // Deeper conclusions only — avoid FREE restatement unless used for implication
  const catalog = signalByType(signals, SIGNAL_TYPES.STRUCTURED_CATALOG_PRESENT);
  const sparse = signalByType(signals, SIGNAL_TYPES.OFFERING_DESCRIPTION_SPARSE);
  const fragmented = signalByType(signals, SIGNAL_TYPES.OFFERING_STRUCTURE_FRAGMENTED);
  const strong = signalByType(signals, SIGNAL_TYPES.DIGITAL_PRESENCE_STRONG);
  const weak = signalByType(signals, SIGNAL_TYPES.DIGITAL_PRESENCE_WEAK);
  const contact = signalByType(signals, SIGNAL_TYPES.CONTACT_PATH_UNCLEAR);
  const area = signalByType(signals, SIGNAL_TYPES.SERVICE_AREA_UNKNOWN);

  if (mode === 'EXISTING' && strong) {
    findings.push(
      stated({
        id: 'finding_rich_digital',
        title: 'Evidence depth supports operational analysis',
        detail: `${name || 'This business'}: ${strong.observation} For a ${vertical.label.toLowerCase()}, FULL analysis focuses on conversion paths, catalogue structure, and geographic clarity — not restating identity.`,
        knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
        evidenceRefs: strong.evidenceRefs,
      }),
    );
  }

  if (catalog && (sparse || fragmented)) {
    const m = sparse?.metrics || fragmented?.metrics || {};
    findings.push(
      stated({
        id: 'finding_catalog_quality',
        title: 'Catalogue present but structure incomplete',
        detail: `${catalog.observation}${sparse ? ` ${sparse.observation}` : ''}${
          fragmented ? ` ${fragmented.observation}` : ''
        } Customers may struggle to compare items, and Cardbey cannot reliably reuse complete structured product data across execution surfaces.`,
        knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
        evidenceRefs: ['snapshot.offerings'],
        confidence: 0.75,
        limitations: sparse?.limitations || fragmented?.limitations,
      }),
    );
    void m;
  } else if (catalog) {
    findings.push(
      stated({
        id: 'finding_catalog_strength',
        title: 'Structured offerings are usable',
        detail: `${catalog.observation} Next value for ${name || 'this business'} is connecting offerings to clear enquiry/booking paths and geographic targeting${
          location ? ` around ${location}` : ''
        }.`,
        knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
        evidenceRefs: catalog.evidenceRefs,
      }),
    );
  }

  if (hasSignal(signals, SIGNAL_TYPES.STRUCTURED_CATALOG_MISSING)) {
    const s = signalByType(signals, SIGNAL_TYPES.STRUCTURED_CATALOG_MISSING);
    findings.push(
      stated({
        id: 'finding_no_catalog',
        title: 'Offering structure not verified',
        detail: `${s.observation} Without a structured catalogue, ${
          name || 'the business'
        } is harder for customers to evaluate and harder for Cardbey to operationalise.`,
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
        evidenceRefs: s.evidenceRefs,
        limitations: s.limitations,
      }),
    );
  }

  if (contact && vertical.id === VERTICAL_ARCHETYPES.HOSPITALITY) {
    findings.push(
      stated({
        id: 'finding_menu_vs_booking',
        title: 'Discovery vs conversion gap',
        detail: `${contact.observation} If bookings or orders are part of the operating model, the gap between menu discovery and conversion may be material.`,
        knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
        evidenceRefs: contact.evidenceRefs,
        limitations: contact.limitations,
      }),
    );
  } else if (contact) {
    findings.push(
      stated({
        id: 'finding_contact_gap',
        title: 'Enquiry path unclear',
        detail: `${contact.observation} For a ${vertical.label.toLowerCase()}, unclear quote/contact paths increase friction after discovery.`,
        knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
        evidenceRefs: contact.evidenceRefs,
        limitations: contact.limitations,
      }),
    );
  }

  if (area && [VERTICAL_ARCHETYPES.LOCAL_SERVICE, VERTICAL_ARCHETYPES.PROFESSIONAL_SERVICE].includes(vertical.id)) {
    findings.push(
      stated({
        id: 'finding_service_area',
        title: 'Service area not explicit',
        detail: `${area.observation} Local customers need suburb/region clarity for ${name || 'this service business'}.`,
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
        evidenceRefs: area.evidenceRefs,
        limitations: area.limitations,
      }),
    );
  }

  if (weak) {
    findings.push(
      stated({
        id: 'finding_weak_digital',
        title: 'Digital presence incomplete',
        detail: weak.observation,
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
        evidenceRefs: weak.evidenceRefs,
      }),
    );
  }

  if (mode === 'INTENDED') {
    findings.push(
      stated({
        id: 'finding_concept',
        title: 'Concept framing',
        detail: signalByType(signals, SIGNAL_TYPES.CONCEPT_STATED)?.observation || 'Intended concept recorded.',
        knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
        evidenceRefs: ['business_context'],
      }),
    );
    const cust = signalByType(signals, SIGNAL_TYPES.CUSTOMER_TYPE_UNKNOWN);
    if (cust) {
      findings.push(
        stated({
          id: 'finding_customer_unknown',
          title: 'Customer assumption open',
          detail: `${cust.observation} For a ${vertical.label.toLowerCase()}, clarifying who pays is a first-order validation need.`,
          knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
          evidenceRefs: cust.evidenceRefs,
        }),
      );
    }
  }

  void snapshot;
  return findings;
}

function buildExistingRecommendations({
  signals,
  vertical,
  name,
  location,
  snapshot,
  competitorCandidates,
}) {
  /** @type {object[]} */
  const recs = [];
  const offeringCount = snapshot?.offerings?.count || 0;
  const biz = name || 'this business';

  const add = (partial) => {
    recs.push({
      ...partial,
      verticalContext: vertical.id,
      metrics: partial.metrics || {},
    });
  };

  // Rich catalogue + sparse descriptions
  const sparse = signalByType(signals, SIGNAL_TYPES.OFFERING_DESCRIPTION_SPARSE);
  if (sparse) {
    const incomplete = sparse.metrics?.sparseCount ?? Math.max(1, offeringCount - (sparse.metrics?.withDescription || 0));
    add({
      id: 'rec_standardize_offerings',
      title: 'Standardize incomplete offering records',
      businessSpecificObservation: sparse.observation,
      evidenceRefs: sparse.evidenceRefs,
      signal: sparse.type,
      whyItMatters: `Customers may have difficulty comparing products/services for ${biz}, and Cardbey cannot reliably reuse complete structured offering data across other execution surfaces.`,
      recommendedAction: `Standardize the ${incomplete} incomplete offering record${incomplete === 1 ? '' : 's'} so each item has a clear name, short description, and category.`,
      priority: 'high',
      requiredCapability: 'offering_editor',
      possibleCardbeyAction: CARDBEY_ACTIONS.CREATE_OR_CLAIM,
      limitations: [sparse.limitations, 'Guidance only — not a guaranteed conversion lift.'].filter(Boolean),
      confidence: 0.78,
      metrics: sparse.metrics,
    });
  }

  const fragmented = signalByType(signals, SIGNAL_TYPES.OFFERING_STRUCTURE_FRAGMENTED);
  if (fragmented && !sparse) {
    add({
      id: 'rec_categorize_offerings',
      title: 'Add category structure to offerings',
      businessSpecificObservation: fragmented.observation,
      evidenceRefs: fragmented.evidenceRefs,
      signal: fragmented.type,
      whyItMatters: `Without categories, ${biz}'s ${offeringCount} items are harder for customers to scan and harder to reuse in Cardbey surfaces.`,
      recommendedAction: `Group the ${offeringCount} identified offerings into clear categories for ${biz}${
        location ? ` in ${location}` : ''
      }.`,
      priority: 'high',
      possibleCardbeyAction: CARDBEY_ACTIONS.CREATE_OR_CLAIM,
      limitations: ['Based on extraction structure only.'],
      confidence: 0.72,
      metrics: { offeringCount },
    });
  }

  // Hospitality: menu vs booking
  if (
    vertical.id === VERTICAL_ARCHETYPES.HOSPITALITY &&
    hasSignal(signals, SIGNAL_TYPES.STRUCTURED_CATALOG_PRESENT) &&
    hasSignal(signals, SIGNAL_TYPES.CONTACT_PATH_UNCLEAR)
  ) {
    const contact = signalByType(signals, SIGNAL_TYPES.CONTACT_PATH_UNCLEAR);
    add({
      id: 'rec_booking_path',
      title: 'Connect menu discovery to booking/order (if applicable)',
      businessSpecificObservation: `Cardbey identified ${offeringCount} menu/offering item(s) for ${biz}${
        location ? ` in ${location}` : ''
      }, but could not verify a booking or order path.`,
      evidenceRefs: ['snapshot.offerings', ...(contact?.evidenceRefs || [])],
      signal: SIGNAL_TYPES.CONTACT_PATH_UNCLEAR,
      whyItMatters:
        'If bookings or takeaway orders are part of the operating model, the gap between discovery and conversion may leave demand on the table.',
      recommendedAction: `If bookings or orders are part of ${biz}'s operating model, add a direct booking/order action alongside the menu experience.`,
      priority: 'high',
      possibleCardbeyAction: CARDBEY_ACTIONS.CREATE_OR_CLAIM,
      limitations: [
        'Absence of a booking link does not prove the business needs reservations.',
        contact?.limitations,
      ].filter(Boolean),
      confidence: 0.7,
      assumptions: ['Owner confirms whether reservations/orders are offered'],
      metrics: { offeringCount },
    });
  }

  // Local service: offerings + unclear area
  if (
    (vertical.id === VERTICAL_ARCHETYPES.LOCAL_SERVICE ||
      vertical.id === VERTICAL_ARCHETYPES.PROFESSIONAL_SERVICE) &&
    hasSignal(signals, SIGNAL_TYPES.STRUCTURED_CATALOG_PRESENT) &&
    hasSignal(signals, SIGNAL_TYPES.SERVICE_AREA_UNKNOWN)
  ) {
    const area = signalByType(signals, SIGNAL_TYPES.SERVICE_AREA_UNKNOWN);
    add({
      id: 'rec_service_area',
      title: 'Make service area explicit',
      businessSpecificObservation: `Cardbey identified ${offeringCount} service offering(s) for ${biz}, but could not verify the geographic service area beyond ${
        location || 'a primary location label'
      }.`,
      evidenceRefs: ['snapshot.offerings', ...(area?.evidenceRefs || [])],
      signal: SIGNAL_TYPES.SERVICE_AREA_UNKNOWN,
      whyItMatters:
        'Adding suburbs or service regions would make the proposition clearer for local customers and improve geographic targeting.',
      recommendedAction: `Publish an explicit service-area list (suburbs/regions) for ${biz}${
        location ? ` based around ${location}` : ''
      }.`,
      priority: 'high',
      possibleCardbeyAction: CARDBEY_ACTIONS.CREATE_OR_CLAIM,
      limitations: [area?.limitations].filter(Boolean),
      confidence: 0.74,
      metrics: { offeringCount },
    });
  }

  // Manufacturing / B2B: catalogue without buyer qualification
  if (
    vertical.id === VERTICAL_ARCHETYPES.MANUFACTURING_B2B &&
    hasSignal(signals, SIGNAL_TYPES.STRUCTURED_CATALOG_PRESENT)
  ) {
    add({
      id: 'rec_buyer_qualification',
      title: 'Structure buyer qualification fields',
      businessSpecificObservation: `Cardbey identified ${offeringCount} product type(s) for ${biz}${
        location ? ` (${location})` : ''
      }, but could not verify MOQ, lead-time, or buyer qualification information on current evidence.`,
      evidenceRefs: ['snapshot.offerings'],
      signal: SIGNAL_TYPES.STRUCTURED_CATALOG_PRESENT,
      whyItMatters:
        'These fields are useful to structure before approaching wholesale/import buyers — stated as planning guidance, not as proven buyer requirements for this firm.',
      recommendedAction: `Add MOQ, typical lead-time, and enquiry/qualification fields to the ${offeringCount} product records for ${biz}.`,
      priority: 'high',
      possibleCardbeyAction: CARDBEY_ACTIONS.CREATE_OR_CLAIM,
      limitations: [
        'Do not treat missing MOQ/lead-time as proof buyers require specific terms.',
        'Based on absence of extracted fields only.',
      ],
      confidence: 0.7,
      metrics: { offeringCount },
    });
  }

  // Missing catalogue
  if (hasSignal(signals, SIGNAL_TYPES.STRUCTURED_CATALOG_MISSING)) {
    const s = signalByType(signals, SIGNAL_TYPES.STRUCTURED_CATALOG_MISSING);
    add({
      id: 'rec_build_catalogue',
      title: 'Build an evidence-backed offering catalogue',
      businessSpecificObservation: `${s.observation} for ${biz}${location ? ` in ${location}` : ''}.`,
      evidenceRefs: s.evidenceRefs,
      signal: s.type,
      whyItMatters: `Without a structured catalogue, customers cannot evaluate ${biz}, and Cardbey cannot operationalise offerings across store and marketing surfaces.`,
      recommendedAction: `List the core products/services ${biz} actually sells, with short descriptions suitable for a public catalogue.`,
      priority: 'high',
      possibleCardbeyAction: CARDBEY_ACTIONS.CREATE_OR_CLAIM,
      limitations: [s.limitations].filter(Boolean),
      confidence: 0.8,
    });
  }

  // Missing website
  if (
    hasSignal(signals, SIGNAL_TYPES.WEBSITE_MISSING) ||
    hasSignal(signals, SIGNAL_TYPES.WEBSITE_UNREACHABLE)
  ) {
    const s =
      signalByType(signals, SIGNAL_TYPES.WEBSITE_MISSING) ||
      signalByType(signals, SIGNAL_TYPES.WEBSITE_UNREACHABLE);
    add({
      id: 'rec_digital_presence',
      title: 'Establish a verifiable public presence',
      businessSpecificObservation: `${s.observation} (${biz}${location ? `, ${location}` : ''}).`,
      evidenceRefs: s.evidenceRefs,
      signal: s.type,
      whyItMatters: `A reachable profile reduces fragmented identity signals for this ${vertical.label.toLowerCase()}.`,
      recommendedAction: `Create or claim a Cardbey business presence for ${biz} and keep identity/offerings consistent with any existing channels.`,
      priority: 'high',
      possibleCardbeyAction: CARDBEY_ACTIONS.CREATE_OR_CLAIM,
      limitations: [s.limitations].filter(Boolean),
      confidence: 0.77,
    });
  }

  // Rich evidence: messaging that references offerings count (not generic "prepare messaging")
  if (
    hasSignal(signals, SIGNAL_TYPES.DIGITAL_PRESENCE_STRONG) &&
    offeringCount > 0 &&
    !sparse &&
    !hasSignal(signals, SIGNAL_TYPES.CONTACT_PATH_UNCLEAR)
  ) {
    add({
      id: 'rec_offering_led_content',
      title: 'Publish offering-led customer messaging',
      businessSpecificObservation: `Cardbey verified a reachable website and ${offeringCount} offering(s) for ${biz}${
        location ? ` in ${location}` : ''
      }.`,
      evidenceRefs: ['identity.website', 'snapshot.offerings'],
      signal: SIGNAL_TYPES.DIGITAL_PRESENCE_STRONG,
      whyItMatters: `With catalogue evidence already present, the next leverage is clearer customer-facing messaging that uses the ${offeringCount} known offerings rather than generic brand copy.`,
      recommendedAction: `Draft 2–3 customer messages that explicitly name ${biz}'s top offerings and primary location${
        location ? ` (${location})` : ''
      }.`,
      priority: 'medium',
      possibleCardbeyAction: CARDBEY_ACTIONS.PERFORMER,
      limitations: ['Not based on campaign performance data.'],
      confidence: 0.68,
      metrics: { offeringCount },
    });
  }

  // Contact unclear (non-hospitality already covered partially)
  if (
    hasSignal(signals, SIGNAL_TYPES.CONTACT_PATH_UNCLEAR) &&
    vertical.id !== VERTICAL_ARCHETYPES.HOSPITALITY &&
    hasSignal(signals, SIGNAL_TYPES.WEBSITE_PRESENT)
  ) {
    const s = signalByType(signals, SIGNAL_TYPES.CONTACT_PATH_UNCLEAR);
    add({
      id: 'rec_contact_path',
      title: 'Clarify enquiry / quote path',
      businessSpecificObservation: `${s.observation} for ${biz}.`,
      evidenceRefs: s.evidenceRefs,
      signal: s.type,
      whyItMatters: `After discovering ${biz}, customers need a clear next step (call, form, quote request).`,
      recommendedAction: `Add a single primary enquiry or quote action for ${biz} that is visible from the main customer journey.`,
      priority: 'medium',
      possibleCardbeyAction: CARDBEY_ACTIONS.CREATE_OR_CLAIM,
      limitations: [s.limitations].filter(Boolean),
      confidence: 0.7,
    });
  }

  // Competitors weak → manual compare only if zero candidates (specific wording)
  if (!(competitorCandidates || []).length && location && vertical.id !== VERTICAL_ARCHETYPES.GENERAL) {
    add({
      id: 'rec_manual_comparisons',
      title: 'Name direct alternatives',
      businessSpecificObservation: `Cardbey did not classify enough evidence-backed comparison businesses for ${biz} in ${location}.`,
      evidenceRefs: ['competitorCandidates'],
      signal: null,
      whyItMatters:
        'Absence of candidates is not low competition — owner-named alternatives improve later comparison quality.',
      recommendedAction: `List 2–3 businesses in ${location} that customers usually compare with ${biz}.`,
      priority: 'low',
      possibleCardbeyAction: CARDBEY_ACTIONS.MANUAL,
      limitations: ['Manual owner input required.'],
      confidence: 0.65,
    });
  }

  return recs;
}

function buildIntendedRecommendations({ signals, vertical, name, location, snapshot, context }) {
  const recs = [];
  const concept = name || context?.identity?.businessType || 'this concept';
  const add = (partial) => {
    recs.push({ ...partial, verticalContext: vertical.id, metrics: partial.metrics || {} });
  };

  if (hasSignal(signals, SIGNAL_TYPES.CUSTOMER_TYPE_UNKNOWN)) {
    const s = signalByType(signals, SIGNAL_TYPES.CUSTOMER_TYPE_UNKNOWN);
    add({
      id: 'rec_validate_customer',
      title: 'Validate intended customer',
      businessSpecificObservation: `${s.observation} Concept: ${concept}${
        location ? ` targeting ${location}` : ''
      } (${vertical.label}).`,
      evidenceRefs: s.evidenceRefs,
      signal: s.type,
      whyItMatters: `Launch risk is highest where customer assumptions for a ${vertical.label.toLowerCase()} remain untested.`,
      recommendedAction: `Define the primary customer for ${concept} and validate with at least 5 real conversations before heavy build-out.`,
      priority: 'high',
      possibleCardbeyAction: CARDBEY_ACTIONS.MANUAL,
      limitations: ['General validation guidance — not market research results.'],
      confidence: 0.75,
      supportingStates: [KNOWLEDGE_STATES.ASSUMPTION],
    });
  }

  if (hasSignal(signals, SIGNAL_TYPES.OFFERINGS_UNDEFINED)) {
    add({
      id: 'rec_define_offerings',
      title: 'Define minimum offerings',
      businessSpecificObservation: `No operating offering catalogue exists yet for ${concept} (${vertical.label}).`,
      evidenceRefs: ['mode'],
      signal: SIGNAL_TYPES.OFFERINGS_UNDEFINED,
      whyItMatters: `Without defined offerings, acquisition and operations for this ${vertical.label.toLowerCase()} cannot be tested.`,
      recommendedAction: offeringActionForVertical(vertical, concept),
      priority: 'high',
      possibleCardbeyAction: CARDBEY_ACTIONS.CREATE_OR_CLAIM,
      limitations: ['Planning action — not an operating fact.'],
      confidence: 0.78,
      supportingStates: [KNOWLEDGE_STATES.ASSUMPTION],
    });
  }

  if (hasSignal(signals, SIGNAL_TYPES.OPERATING_MODEL_UNKNOWN)) {
    add({
      id: 'rec_operating_model',
      title: 'Choose an initial operating model',
      businessSpecificObservation: `Operating model was not explicitly stated for ${concept}.`,
      evidenceRefs: ['identity.operatingModel'],
      signal: SIGNAL_TYPES.OPERATING_MODEL_UNKNOWN,
      whyItMatters: `A ${vertical.label.toLowerCase()} needs an explicit first operating model (e.g. mobile vs fixed site, online vs wholesale) before capability planning.`,
      recommendedAction: operatingModelActionForVertical(vertical, concept, location),
      priority: 'high',
      possibleCardbeyAction: CARDBEY_ACTIONS.MANUAL,
      limitations: ['Hypothesis guidance — founder must confirm.'],
      confidence: 0.7,
      supportingStates: [KNOWLEDGE_STATES.ASSUMPTION],
    });
  }

  if (hasSignal(signals, SIGNAL_TYPES.LOCATION_UNKNOWN)) {
    add({
      id: 'rec_location',
      title: 'Specify target geography',
      businessSpecificObservation: `No verified target location for ${concept}.`,
      evidenceRefs: ['identity.location'],
      signal: SIGNAL_TYPES.LOCATION_UNKNOWN,
      whyItMatters: 'Geography shapes acquisition, compliance, and operations assumptions.',
      recommendedAction: `State the first target city/region for ${concept} before comparing local presence.`,
      priority: 'medium',
      possibleCardbeyAction: CARDBEY_ACTIONS.MANUAL,
      confidence: 0.72,
    });
  }

  // Structure on Cardbey — concept-specific
  add({
    id: 'rec_structure_on_cardbey',
    title: 'Structure the concept on Cardbey',
    businessSpecificObservation: `${concept} is an intended ${vertical.label.toLowerCase()}${
      location ? ` aimed at ${location}` : ''
    } with no operating digital presence yet.`,
    evidenceRefs: ['mode', 'business_context'],
    signal: SIGNAL_TYPES.CONCEPT_STATED,
    whyItMatters:
      'A lightweight Cardbey presence helps structure offerings and messaging for learning — it does not certify viability.',
    recommendedAction: `Create ${concept} on Cardbey when ready to structure offerings and identity for validation.`,
    priority: 'medium',
    possibleCardbeyAction: CARDBEY_ACTIONS.CREATE_OR_CLAIM,
    limitations: ['Does not imply commercial viability.'],
    confidence: 0.7,
    supportingStates: [KNOWLEDGE_STATES.USER_DEFINED],
  });

  // Capability-specific second action from pack (not generic list dump)
  const caps = vertical.capabilityPriorities || [];
  if (caps.includes('supplier_resource') || caps.includes('supplier_inputs')) {
    add({
      id: 'rec_supplier_plan',
      title: 'Map critical inputs / suppliers',
      businessSpecificObservation: `${concept} (${vertical.label}) typically depends on supplier/input readiness before launch.`,
      evidenceRefs: ['vertical.capabilityPriorities'],
      signal: null,
      whyItMatters: 'Supplier ambiguity is a common silent blocker for product/manufacturing concepts.',
      recommendedAction: `List the top 3 inputs or suppliers ${concept} would need for a minimum sellable offer${
        location ? ` in ${location}` : ''
      }.`,
      priority: 'medium',
      possibleCardbeyAction: CARDBEY_ACTIONS.MANUAL,
      limitations: ['Archetype planning guidance — not discovered supplier facts.'],
      confidence: 0.66,
      supportingStates: [KNOWLEDGE_STATES.ASSUMPTION],
    });
  }

  void snapshot;
  return recs;
}

function offeringActionForVertical(vertical, concept) {
  switch (vertical.id) {
    case VERTICAL_ARCHETYPES.STARTUP_PRODUCT:
    case VERTICAL_ARCHETYPES.PRODUCT_RETAIL:
      return `Write a minimum product list for ${concept} (3–7 SKUs or product types) with one-sentence descriptions.`;
    case VERTICAL_ARCHETYPES.HOSPITALITY:
      return `Draft a starter menu for ${concept} with categories and item names (even if provisional).`;
    case VERTICAL_ARCHETYPES.MANUFACTURING_B2B:
      return `Define the first product family and customization options ${concept} would quote to buyers.`;
    case VERTICAL_ARCHETYPES.LOCAL_SERVICE:
    case VERTICAL_ARCHETYPES.STARTUP_SERVICE:
      return `Write 4–6 named services ${concept} would sell, including what is included in each.`;
    default:
      return `Write a minimum set of core offerings you plan to sell for ${concept}.`;
  }
}

function operatingModelActionForVertical(vertical, concept, location) {
  switch (vertical.id) {
    case VERTICAL_ARCHETYPES.STARTUP_SERVICE:
    case VERTICAL_ARCHETYPES.LOCAL_SERVICE:
      return `Choose whether ${concept} launches as mobile, fixed-site, or hybrid${
        location ? ` in ${location}` : ''
      }, and write one paragraph explaining why.`;
    case VERTICAL_ARCHETYPES.STARTUP_PRODUCT:
    case VERTICAL_ARCHETYPES.PRODUCT_RETAIL:
      return `Choose the first sales channel for ${concept} (online storefront, wholesale, or pop-up) and state the assumption behind it.`;
    case VERTICAL_ARCHETYPES.MANUFACTURING_B2B:
      return `State whether ${concept} starts made-to-order, stocked SKUs, or both — and who the first buyer type is.`;
    case VERTICAL_ARCHETYPES.HOSPITALITY:
      return `State whether ${concept} starts dine-in, takeaway, delivery, or a combination${
        location ? ` in ${location}` : ''
      }.`;
    default:
      return `Write the initial operating model assumption for ${concept}.`;
  }
}

function humanizeCapability(key, vertical) {
  const map = {
    offering_definition: 'Offering definition',
    service_definition: 'Service definition',
    service_area: 'Service area',
    contact_quote_path: 'Contact / quote path',
    digital_presence: 'Digital presence',
    scheduling_ops: 'Scheduling / operations',
    customer_acquisition: 'Customer acquisition',
    acquisition: 'Customer acquisition',
    client_segment: 'Client segment clarity',
    trust_proof: 'Trust / proof assets',
    sales_conversion: 'Sales / conversion path',
    compliance: 'Compliance readiness',
    menu_definition: 'Menu definition',
    location_experience: 'Location experience',
    booking_or_order_path: 'Booking / order path',
    operations: 'Operations',
    product_catalogue: 'Product catalogue',
    product_definition: 'Product definition',
    brand_identity: 'Brand identity',
    brand: 'Brand identity',
    sales_channel: 'Sales channel',
    channel: 'Sales channel',
    fulfillment: 'Fulfillment',
    payments: 'Payments',
    product_range: 'Product range',
    buyer_qualification_data: 'Buyer qualification data',
    enquiry_path: 'Enquiry path',
    supplier_inputs: 'Supplier / inputs',
    supplier_resource: 'Supplier / resource plan',
    customer_validation: 'Customer validation',
    operating_model: 'Operating model',
    identity: 'Business identity',
  };
  return map[key] || key;
}

function capabilityDetail(key, vertical, name, location) {
  const who = name || 'this concept';
  const where = location ? ` in ${location}` : '';
  return `${humanizeCapability(key, vertical)} is a typical launch capability for a ${vertical.label.toLowerCase()} such as ${who}${where}. Treat as ASSUMPTION until confirmed.`;
}

function mergeEnrichedWording(base, enriched) {
  const byId = new Map(enriched.map((e) => [e.id, e]));
  return base.map((r) => {
    const e = byId.get(r.id);
    if (!e) return r;
    // Only allow wording fields to change; keep evidence/signal
    return {
      ...r,
      whyItMatters: e.whyItMatters || r.whyItMatters,
      recommendedAction: e.recommendedAction || r.recommendedAction,
      businessSpecificObservation: e.businessSpecificObservation || r.businessSpecificObservation,
    };
  });
}
