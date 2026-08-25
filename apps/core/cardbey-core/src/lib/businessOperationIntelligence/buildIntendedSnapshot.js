/**
 * INTENDED-mode free snapshot builder (Phase B).
 * Never invents operating revenue, customers, offerings, or digital presence.
 */

import { KNOWLEDGE_STATES } from './knowledgeStates.js';
import {
  SNAPSHOT_BUDGETS,
  SNAPSHOT_STAGE_STATUS,
  createEmptyBusinessSnapshot,
  field,
  identityFromContext,
} from './snapshotTypes.js';

/**
 * @param {import('./types.js').BusinessContext} context
 */
export function buildIntendedBusinessSnapshot(context) {
  const started = Date.now();
  const snapshot = createEmptyBusinessSnapshot(context);
  snapshot.mode = 'INTENDED';
  snapshot.identity = identityFromContext(context);

  // Never treat Places / website discovery as operating facts for INTENDED
  snapshot.digitalPresence = {
    status: 'not_applicable',
    website: null,
    listing: null,
    social: [],
    cardbeyPresence: null,
    message: 'Intended businesses do not have verified operating digital presence yet.',
  };
  snapshot.offerings = {
    status: 'not_applicable',
    count: 0,
    items: [],
    message: 'No existing offerings — this is a business idea, not an operating catalog.',
  };

  for (const k of context.knowledge || []) {
    snapshot.evidence.push({
      field: k.field,
      value: k.value,
      knowledgeState: k.knowledgeState,
      source: k.source || null,
      confidence: k.confidence,
    });
  }

  // Assumptions board — only explicit / required
  const addAssumption = (key, label, value, knowledgeState, source) => {
    if (value == null || value === '') return;
    snapshot.assumptions.push({
      key,
      label,
      value,
      knowledgeState,
      source: source || null,
    });
  };

  addAssumption(
    'location',
    'Target location',
    snapshot.identity.location?.value,
    snapshot.identity.location?.knowledgeState || KNOWLEDGE_STATES.USER_DEFINED,
    snapshot.identity.location?.source,
  );
  addAssumption(
    'operatingModel',
    'Business model',
    snapshot.identity.operatingModel?.value,
    snapshot.identity.operatingModel?.knowledgeState || KNOWLEDGE_STATES.USER_DEFINED,
    snapshot.identity.operatingModel?.source,
  );
  addAssumption(
    'businessType',
    'Intended business type',
    snapshot.identity.businessType?.value || snapshot.identity.name?.value,
    snapshot.identity.businessType?.knowledgeState || KNOWLEDGE_STATES.AI_INFERENCE,
    snapshot.identity.businessType?.source,
  );

  // AI inferences for structure (labelled)
  const category = snapshot.identity.category?.value;
  if (category) {
    snapshot.assumptions.push({
      key: 'category',
      label: 'Likely industry / category',
      value: category,
      knowledgeState: snapshot.identity.category.knowledgeState || KNOWLEDGE_STATES.AI_INFERENCE,
      source: snapshot.identity.category.source || 'classifyBusiness',
    });
  }

  const customerInference = inferCustomerType(context);
  if (customerInference) {
    snapshot.assumptions.push({
      key: 'possible_customer_type',
      label: 'Possible customer type',
      value: customerInference,
      knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
      source: 'intended_structure',
    });
  }

  snapshot.readiness = {
    status: 'concept',
    findings: [
      {
        key: 'concept_clarity',
        label: 'Concept clarity',
        status:
          snapshot.identity.businessType?.value || snapshot.identity.name?.value ? 'ok' : 'gap',
        detail: 'Based on your description only — not market validation.',
        knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
      },
      {
        key: 'location_defined',
        label: 'Target location',
        status: snapshot.identity.location?.value ? 'ok' : 'gap',
        detail: snapshot.identity.location?.value
          ? `Target location: ${snapshot.identity.location.value}`
          : 'Target location not yet defined.',
        knowledgeState:
          snapshot.identity.location?.knowledgeState || KNOWLEDGE_STATES.ASSUMPTION,
      },
    ],
    message: 'This is a business idea snapshot — not an operating business report.',
  };

  snapshot.observations = buildIntendedObservations(snapshot, context);
  snapshot.informationGaps = buildIntendedGaps(snapshot);

  snapshot.stages = [
    {
      id: 'context',
      label: 'Business idea confirmed',
      budget: SNAPSHOT_BUDGETS.INSTANT,
      status: SNAPSHOT_STAGE_STATUS.done,
      ms: 0,
    },
    {
      id: 'presence',
      label: 'Online presence checked',
      budget: SNAPSHOT_BUDGETS.INSTANT,
      status: SNAPSHOT_STAGE_STATUS.skipped,
      ms: 0,
      detail: 'Not applicable for intended businesses',
    },
    {
      id: 'offerings',
      label: 'Products/services reviewed',
      budget: SNAPSHOT_BUDGETS.INSTANT,
      status: SNAPSHOT_STAGE_STATUS.skipped,
      ms: 0,
      detail: 'No operating catalog for business ideas',
    },
    {
      id: 'snapshot',
      label: 'Snapshot prepared',
      budget: SNAPSHOT_BUDGETS.INSTANT,
      status: SNAPSHOT_STAGE_STATUS.done,
      ms: 0,
    },
  ];

  // Ensure we never leak invented website as DISCOVERED for INTENDED unless USER_DEFINED
  if (
    snapshot.identity.website?.value &&
    snapshot.identity.website.knowledgeState !== KNOWLEDGE_STATES.USER_DEFINED
  ) {
    snapshot.identity.website = field(null, KNOWLEDGE_STATES.ASSUMPTION, {
      note: 'Website ignored for intended mode unless user-defined',
    });
  }

  snapshot.timing.totalMs = Date.now() - started;
  snapshot.timing.generatedAt = new Date().toISOString();
  snapshot.generatedAt = snapshot.timing.generatedAt;
  return snapshot;
}

function inferCustomerType(context) {
  const corpus = [
    context.identity?.businessType,
    context.identity?.name,
    context.identity?.category,
    context.identity?.operatingModel,
    context.sourceText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!corpus) return null;
  if (/\b(sme|business|b2b|fleet|commercial|enterprise)\b/.test(corpus)) {
    return 'Businesses / fleets (inferred)';
  }
  if (/\b(detailing|restaurant|cafe|salon|retail|consumer|mobile)\b/.test(corpus)) {
    return 'Consumers / local customers (inferred)';
  }
  return null;
}

function buildIntendedObservations(snapshot, context) {
  const observations = [];
  const name = snapshot.identity.name?.value || snapshot.identity.businessType?.value;
  if (name) {
    observations.push({
      kind: 'FACT',
      text: `Cardbey understands your idea as: ${name}${
        snapshot.identity.location?.value ? ` targeting ${snapshot.identity.location.value}` : ''
      }.`,
      knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
      source: 'business_context',
    });
  }
  if (snapshot.identity.operatingModel?.value) {
    observations.push({
      kind: 'FACT',
      text: `Operating model stated: ${snapshot.identity.operatingModel.value}.`,
      knowledgeState: snapshot.identity.operatingModel.knowledgeState,
      source: snapshot.identity.operatingModel.source,
    });
  }
  observations.push({
    kind: 'INTERPRETATION',
    text: 'This snapshot structures your idea for later analysis — it is not market validation.',
    knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
    source: 'intended_snapshot',
  });
  return observations.slice(0, 3);
}

function buildIntendedGaps(snapshot) {
  const gaps = [];
  gaps.push({
    key: 'customer_type',
    label: 'Intended customer type',
    why: 'Sharpens demand and offer design in later analysis.',
    knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
  });
  gaps.push({
    key: 'core_offerings',
    label: 'Core offerings you plan to sell',
    why: 'Lets Cardbey model the catalog without inventing products.',
    knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
  });
  if (!snapshot.identity.location?.value) {
    gaps.push({
      key: 'service_area',
      label: 'Service area / target location',
      why: 'Grounds local opportunity analysis.',
      knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
    });
  } else {
    gaps.push({
      key: 'service_area_detail',
      label: 'Service area boundaries',
      why: 'City-level location is known; finer coverage still improves analysis.',
      knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
    });
  }
  if (!snapshot.identity.operatingModel?.value) {
    gaps.push({
      key: 'operating_model',
      label: 'Initial operating model',
      why: 'Distinguishes mobile, storefront, digital, etc.',
      knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
    });
  }
  return gaps.slice(0, 4);
}
