/**
 * EXISTING-mode free snapshot builder (Phase B).
 */

import { KNOWLEDGE_STATES } from './knowledgeStates.js';
import { probeWebsiteForSnapshot } from './lightWebsiteProbe.js';
import {
  SNAPSHOT_BUDGETS,
  SNAPSHOT_STAGE_STATUS,
  createEmptyBusinessSnapshot,
  field,
  identityFromContext,
  knowledgeForField,
} from './snapshotTypes.js';

/**
 * @param {import('./types.js').BusinessContext} context
 * @param {{ probeWebsiteForSnapshot?: typeof probeWebsiteForSnapshot }} [deps]
 */
export async function buildExistingBusinessSnapshot(context, deps = {}) {
  const started = Date.now();
  const snapshot = createEmptyBusinessSnapshot(context);
  snapshot.mode = 'EXISTING';
  snapshot.identity = identityFromContext(context);

  const stages = [];
  stages.push({
    id: 'context',
    label: 'Business confirmed',
    budget: SNAPSHOT_BUDGETS.INSTANT,
    status: SNAPSHOT_STAGE_STATUS.done,
    ms: 0,
  });

  // Evidence from confirmed context
  for (const k of context.knowledge || []) {
    snapshot.evidence.push({
      field: k.field,
      value: k.value,
      knowledgeState: k.knowledgeState,
      source: k.source || null,
      confidence: k.confidence,
    });
  }

  const resolutionStatus = context.resolution?.status;
  const unresolved =
    resolutionStatus === 'unresolved' ||
    (!context.resolution?.selectedEntityId &&
      !(context.resolution?.candidates || []).length &&
      resolutionStatus !== 'matched');

  if (unresolved && resolutionStatus !== 'matched') {
    snapshot.failures.push({
      code: 'business_unresolved',
      message: 'Business listing was not fully resolved. Snapshot uses your confirmed description.',
    });
  }

  if (context.resolution?.selectedEntityId || (context.resolution?.candidates || []).length) {
    const selected =
      (context.resolution.candidates || []).find(
        (c) => c.entityId === context.resolution.selectedEntityId,
      ) || context.resolution.candidates?.[0];
    if (selected) {
      snapshot.digitalPresence.listing = {
        name: selected.name,
        location: selected.location || null,
        website: selected.website || null,
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
        source: selected.source || 'places',
        confidence: selected.confidence,
      };
    }
  }

  const websiteValue =
    snapshot.identity.website?.value ||
    knowledgeForField(context, 'website')?.value ||
    null;

  const probeFn = deps.probeWebsiteForSnapshot || probeWebsiteForSnapshot;
  const presenceStarted = Date.now();

  if (!websiteValue) {
    stages.push({
      id: 'presence',
      label: 'Online presence checked',
      budget: SNAPSHOT_BUDGETS.FAST,
      status: SNAPSHOT_STAGE_STATUS.skipped,
      ms: 0,
      detail: 'No website on confirmed context',
    });
    snapshot.digitalPresence.status = 'website_not_found';
    snapshot.digitalPresence.message = "We couldn't verify a website yet.";
    snapshot.digitalPresence.website = null;
    snapshot.failures.push({
      code: 'website_not_found',
      message: "We couldn't verify a website yet.",
    });

    stages.push({
      id: 'offerings',
      label: 'Products/services reviewed',
      budget: SNAPSHOT_BUDGETS.FAST,
      status: SNAPSHOT_STAGE_STATUS.skipped,
      ms: 0,
      detail: 'Offering reconstruction not eligible without website',
    });
    snapshot.offerings = {
      status: 'unavailable',
      count: 0,
      items: [],
      message: 'No products or services were found from reliable sources.',
    };
  } else {
    snapshot.digitalPresence.website = {
      url: String(websiteValue),
      knowledgeState: snapshot.identity.website.knowledgeState,
      source: snapshot.identity.website.source || 'business_context',
    };

    const probe = await probeFn(String(websiteValue), {
      businessName: String(snapshot.identity.name?.value || ''),
      vertical: String(context.identity?.verticalGroup || context.identity?.category || ''),
    });

    const presenceMs = Date.now() - presenceStarted;
    if (!probe.ok || !probe.websiteReachable) {
      stages.push({
        id: 'presence',
        label: 'Online presence checked',
        budget: SNAPSHOT_BUDGETS.FAST,
        status: SNAPSHOT_STAGE_STATUS.failed,
        ms: presenceMs,
        detail: probe.reason || 'website_fetch_failed',
      });
      snapshot.digitalPresence.status = 'unreachable';
      snapshot.digitalPresence.message = probe.message || "We couldn't verify a website yet.";
      snapshot.failures.push({
        code: probe.reason || 'website_fetch_failed',
        message: probe.message || "We couldn't verify a website yet.",
      });
      snapshot.offerings = {
        status: 'unavailable',
        count: 0,
        items: [],
        message: 'Offering extraction unavailable because the website could not be reached.',
      };
      stages.push({
        id: 'offerings',
        label: 'Products/services reviewed',
        budget: SNAPSHOT_BUDGETS.FAST,
        status: SNAPSHOT_STAGE_STATUS.failed,
        ms: 0,
        detail: 'website unreachable',
      });
    } else {
      snapshot.digitalPresence.status = 'partial';
      snapshot.digitalPresence.social = probe.social || [];
      if (probe.description) {
        snapshot.identity.description = field(probe.description, KNOWLEDGE_STATES.DISCOVERED_FACT, {
          source: 'website_meta',
          confidence: 0.75,
        });
      }
      if ((probe.social || []).length || probe.description) {
        snapshot.digitalPresence.status = 'found';
      } else {
        snapshot.digitalPresence.status = 'website_only';
        snapshot.digitalPresence.message = 'Website reached; limited additional digital signals found.';
      }

      stages.push({
        id: 'presence',
        label: 'Online presence checked',
        budget: SNAPSHOT_BUDGETS.FAST,
        status: SNAPSHOT_STAGE_STATUS.done,
        ms: presenceMs,
      });

      const items = probe.offerings || [];
      if (items.length) {
        snapshot.offerings = {
          status: 'found',
          count: items.length,
          items,
          message: null,
          sourceSummary: probe.deepUsed
            ? 'website_reconstruction'
            : 'website_homepage_extract',
        };
        stages.push({
          id: 'offerings',
          label: 'Products/services reviewed',
          budget: SNAPSHOT_BUDGETS.FAST,
          status: SNAPSHOT_STAGE_STATUS.done,
          ms: probe.ms,
          detail: probe.deepUsed ? 'deep_reconstruction' : 'homepage_extract',
        });
      } else {
        snapshot.offerings = {
          status: 'absent',
          count: 0,
          items: [],
          message: 'No products or services were found from reliable sources.',
        };
        const offeringStatus =
          probe.deepFailed === 'timeout'
            ? SNAPSHOT_STAGE_STATUS.partial
            : SNAPSHOT_STAGE_STATUS.done;
        stages.push({
          id: 'offerings',
          label: 'Products/services reviewed',
          budget: SNAPSHOT_BUDGETS.FAST,
          status: offeringStatus,
          ms: probe.ms,
          detail: probe.deepFailed || 'no_usable_catalog',
        });
        if (probe.deepFailed === 'timeout') {
          snapshot.failures.push({
            code: 'timeout',
            message: 'Deeper offering scan timed out. Showing homepage evidence only.',
          });
        } else if (probe.deepFailed) {
          snapshot.failures.push({
            code: 'provider_failure',
            message: 'Offering reconstruction was unavailable. Homepage evidence was used instead.',
          });
        } else {
          snapshot.failures.push({
            code: 'offering_evidence_absent',
            message: 'No products or services were found from reliable sources.',
          });
        }
      }

      if (probe.ok && probe.websiteReachable && snapshot.digitalPresence.status === 'partial') {
        snapshot.failures.push({
          code: 'partial_research',
          message: 'Partial research — some digital signals may still be missing.',
        });
      }
    }
  }

  snapshot.readiness = buildExistingReadiness(snapshot, context);
  snapshot.observations = buildExistingObservations(snapshot);
  snapshot.informationGaps = buildExistingGaps(snapshot);

  stages.push({
    id: 'snapshot',
    label: 'Snapshot prepared',
    budget: SNAPSHOT_BUDGETS.INSTANT,
    status: SNAPSHOT_STAGE_STATUS.done,
    ms: 0,
  });

  snapshot.stages = stages;
  snapshot.timing.totalMs = Date.now() - started;
  snapshot.timing.generatedAt = new Date().toISOString();
  snapshot.generatedAt = snapshot.timing.generatedAt;
  return snapshot;
}

function buildExistingReadiness(snapshot, context) {
  const findings = [];

  findings.push({
    key: 'identity_completeness',
    label: 'Business identity',
    status: snapshot.identity.name?.value ? 'ok' : 'gap',
    detail: snapshot.identity.name?.value
      ? 'Business name is present on the confirmed context.'
      : 'Business name is still missing.',
    knowledgeState: snapshot.identity.name?.knowledgeState || KNOWLEDGE_STATES.AI_INFERENCE,
  });

  findings.push({
    key: 'website_presence',
    label: 'Website presence',
    status:
      snapshot.digitalPresence.status === 'found' ||
      snapshot.digitalPresence.status === 'website_only'
        ? 'ok'
        : snapshot.digitalPresence.status === 'unreachable'
          ? 'gap'
          : 'gap',
    detail:
      snapshot.digitalPresence.message ||
      (snapshot.identity.website?.value
        ? 'Website is recorded on the confirmed context.'
        : 'No website verified yet.'),
    knowledgeState: snapshot.identity.website?.knowledgeState || KNOWLEDGE_STATES.ASSUMPTION,
  });

  findings.push({
    key: 'offering_clarity',
    label: 'Offering clarity',
    status:
      snapshot.offerings.status === 'found'
        ? 'ok'
        : snapshot.offerings.status === 'absent'
          ? 'gap'
          : 'unknown',
    detail:
      snapshot.offerings.status === 'found'
        ? `${snapshot.offerings.count} offering(s) supported by website evidence.`
        : snapshot.offerings.message || 'Offering evidence not available.',
    knowledgeState:
      snapshot.offerings.status === 'found'
        ? KNOWLEDGE_STATES.DISCOVERED_FACT
        : KNOWLEDGE_STATES.ASSUMPTION,
  });

  if (context.resolution?.status === 'unresolved') {
    findings.push({
      key: 'discoverability',
      label: 'Public listing match',
      status: 'gap',
      detail: 'No confident public listing match was selected.',
      knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
    });
  }

  return {
    status: findings.some((f) => f.status === 'gap') ? 'gaps_found' : 'ok',
    findings,
    message: null,
  };
}

function buildExistingObservations(snapshot) {
  /** @type {import('./snapshotTypes.js').SnapshotObservation[]} */
  const observations = [];

  if (snapshot.identity.name?.value) {
    observations.push({
      kind: 'FACT',
      text: `Cardbey identified this business as ${snapshot.identity.name.value}${
        snapshot.identity.location?.value ? ` in ${snapshot.identity.location.value}` : ''
      }.`,
      knowledgeState: snapshot.identity.name.knowledgeState,
      source: snapshot.identity.name.source,
    });
  }

  if (snapshot.offerings.status === 'found' && snapshot.offerings.count > 0) {
    observations.push({
      kind: 'FACT',
      text: `${snapshot.offerings.count} product/service item(s) were identified from website evidence.`,
      knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
      source: snapshot.offerings.sourceSummary || 'website',
    });
    observations.push({
      kind: 'INTERPRETATION',
      text: 'Your offerings appear to be documented online enough for Cardbey to read them.',
      knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
      source: 'snapshot_observation',
    });
  } else if (snapshot.offerings.status === 'absent') {
    observations.push({
      kind: 'FACT',
      text: 'No products or services were found from reliable sources on the checked pages.',
      knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
      source: 'website_probe',
    });
  }

  if (!snapshot.identity.website?.value) {
    observations.push({
      kind: 'FACT',
      text: 'No verified website is attached to this business context yet.',
      knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
      source: 'business_context',
    });
  }

  return observations.slice(0, 3);
}

function buildExistingGaps(snapshot) {
  const gaps = [];
  if (!snapshot.identity.website?.value) {
    gaps.push({
      key: 'website',
      label: 'Website URL',
      why: 'Lets Cardbey verify offerings and digital presence.',
      knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
    });
  }
  if (snapshot.offerings.status !== 'found') {
    gaps.push({
      key: 'offerings',
      label: 'Core products or services',
      why: 'Improves readiness findings and later store building.',
      knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
    });
  }
  if (!snapshot.identity.category?.value && !snapshot.identity.businessType?.value) {
    gaps.push({
      key: 'category',
      label: 'Business category',
      why: 'Helps Cardbey structure the next analysis.',
      knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
    });
  }
  return gaps.slice(0, 4);
}
