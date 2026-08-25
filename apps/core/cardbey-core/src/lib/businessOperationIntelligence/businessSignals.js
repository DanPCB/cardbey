/**
 * BusinessSignal contract — Phase D6 (ephemeral; not persisted).
 * Signals are derived only from BusinessContext + BusinessSnapshot evidence.
 */

import { KNOWLEDGE_STATES } from './knowledgeStates.js';

export const SIGNAL_TYPES = Object.freeze({
  WEBSITE_PRESENT: 'WEBSITE_PRESENT',
  WEBSITE_MISSING: 'WEBSITE_MISSING',
  WEBSITE_UNREACHABLE: 'WEBSITE_UNREACHABLE',
  STRUCTURED_CATALOG_PRESENT: 'STRUCTURED_CATALOG_PRESENT',
  STRUCTURED_CATALOG_MISSING: 'STRUCTURED_CATALOG_MISSING',
  OFFERING_DEPTH_HIGH: 'OFFERING_DEPTH_HIGH',
  OFFERING_DESCRIPTION_SPARSE: 'OFFERING_DESCRIPTION_SPARSE',
  OFFERING_STRUCTURE_FRAGMENTED: 'OFFERING_STRUCTURE_FRAGMENTED',
  SOCIAL_PRESENCE_FOUND: 'SOCIAL_PRESENCE_FOUND',
  SOCIAL_PRESENCE_MISSING: 'SOCIAL_PRESENCE_MISSING',
  BUSINESS_IDENTITY_COMPLETE: 'BUSINESS_IDENTITY_COMPLETE',
  BUSINESS_IDENTITY_FRAGMENTED: 'BUSINESS_IDENTITY_FRAGMENTED',
  SERVICE_AREA_EXPLICIT: 'SERVICE_AREA_EXPLICIT',
  SERVICE_AREA_UNKNOWN: 'SERVICE_AREA_UNKNOWN',
  CONTACT_PATH_PRESENT: 'CONTACT_PATH_PRESENT',
  CONTACT_PATH_UNCLEAR: 'CONTACT_PATH_UNCLEAR',
  CONTENT_RICH: 'CONTENT_RICH',
  CONTENT_SPARSE: 'CONTENT_SPARSE',
  DIGITAL_PRESENCE_STRONG: 'DIGITAL_PRESENCE_STRONG',
  DIGITAL_PRESENCE_WEAK: 'DIGITAL_PRESENCE_WEAK',
  CONCEPT_STATED: 'CONCEPT_STATED',
  CUSTOMER_TYPE_UNKNOWN: 'CUSTOMER_TYPE_UNKNOWN',
  OFFERINGS_UNDEFINED: 'OFFERINGS_UNDEFINED',
  OPERATING_MODEL_STATED: 'OPERATING_MODEL_STATED',
  OPERATING_MODEL_UNKNOWN: 'OPERATING_MODEL_UNKNOWN',
  LOCATION_STATED: 'LOCATION_STATED',
  LOCATION_UNKNOWN: 'LOCATION_UNKNOWN',
});

/**
 * @param {object} partial
 */
export function createBusinessSignal(partial) {
  return {
    type: partial.type,
    subject: partial.subject || null,
    observation: partial.observation || '',
    evidenceRefs: partial.evidenceRefs || [],
    knowledgeState: partial.knowledgeState || KNOWLEDGE_STATES.DISCOVERED_FACT,
    vertical: partial.vertical || null,
    significance: partial.significance || 'medium',
    limitations: partial.limitations || null,
    metrics: partial.metrics || {},
  };
}

/**
 * Extract relational signals from confirmed context + snapshot.
 * Does not invent unsupported facts.
 *
 * @param {{
 *   context: object,
 *   snapshot: object | null,
 *   vertical?: string | null,
 * }} input
 */
export function extractBusinessSignals(input) {
  const { context, snapshot, vertical } = input;
  const mode = context?.mode || snapshot?.mode;
  /** @type {ReturnType<typeof createBusinessSignal>[]} */
  const signals = [];

  const name = snapshot?.identity?.name?.value || context?.identity?.name || null;
  const location = snapshot?.identity?.location?.value || context?.identity?.location || null;
  const website = snapshot?.identity?.website?.value || context?.identity?.website || null;
  const businessType =
    snapshot?.identity?.businessType?.value || context?.identity?.businessType || null;
  const operatingModel =
    snapshot?.identity?.operatingModel?.value || context?.identity?.operatingModel || null;

  const offeringItems = snapshot?.offerings?.items || [];
  const offeringCount =
    typeof snapshot?.offerings?.count === 'number'
      ? snapshot.offerings.count
      : offeringItems.length;
  const offeringsFound = snapshot?.offerings?.status === 'found' && offeringCount > 0;
  const social = snapshot?.digitalPresence?.social || snapshot?.social || [];
  const socialCount = Array.isArray(social) ? social.length : 0;
  const description =
    snapshot?.digitalPresence?.description ||
    snapshot?.identity?.description?.value ||
    null;
  const digStatus = String(snapshot?.digitalPresence?.status || '');
  const websiteReachable =
    digStatus === 'found' ||
    digStatus === 'website_only' ||
    digStatus === 'partial' ||
    snapshot?.digitalPresence?.websiteReachable === true ||
    (Boolean(website) && digStatus !== 'unreachable' && digStatus !== 'website_not_found');

  // Identity completeness (relational)
  const identityParts = [name, businessType, location].filter(Boolean);
  if (identityParts.length >= 3) {
    signals.push(
      createBusinessSignal({
        type: SIGNAL_TYPES.BUSINESS_IDENTITY_COMPLETE,
        subject: name,
        observation: `Identity fields present: name, type/category signal, and location.`,
        evidenceRefs: ['snapshot.identity', 'context.identity'],
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
        vertical,
        significance: 'high',
        metrics: { fieldCount: identityParts.length },
      }),
    );
  } else {
    signals.push(
      createBusinessSignal({
        type: SIGNAL_TYPES.BUSINESS_IDENTITY_FRAGMENTED,
        subject: name,
        observation: `Only ${identityParts.length} of name/type/location are clear on current evidence.`,
        evidenceRefs: ['snapshot.identity', 'context.identity'],
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
        vertical,
        significance: 'high',
        metrics: { fieldCount: identityParts.length },
        limitations: 'Missing fields are absence of evidence, not proof they do not exist.',
      }),
    );
  }

  if (location) {
    signals.push(
      createBusinessSignal({
        type: SIGNAL_TYPES.LOCATION_STATED,
        subject: location,
        observation: `Location stated as ${location}.`,
        evidenceRefs: ['identity.location'],
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
        vertical,
        significance: 'medium',
      }),
    );
  } else {
    signals.push(
      createBusinessSignal({
        type: SIGNAL_TYPES.LOCATION_UNKNOWN,
        observation: 'No verified location/service area on current evidence.',
        evidenceRefs: ['identity.location'],
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
        vertical,
        significance: 'high',
      }),
    );
  }

  // Service area: require explicit catchment language — a city label alone is not enough
  const areaLanguage = /\b(suburb|suburbs|service area|within\s+\d+\s*km|covering|servicing|we service|service region|catchment)\b/i.test(
    String(description || ''),
  );
  if (location && areaLanguage) {
    signals.push(
      createBusinessSignal({
        type: SIGNAL_TYPES.SERVICE_AREA_EXPLICIT,
        observation: 'Geographic service-area language is present in description evidence.',
        evidenceRefs: ['identity.location', 'digitalPresence.description'],
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
        vertical,
        significance: 'medium',
      }),
    );
  } else if (mode === 'EXISTING' && location) {
    signals.push(
      createBusinessSignal({
        type: SIGNAL_TYPES.SERVICE_AREA_UNKNOWN,
        observation:
          'Cardbey could not verify explicit service-area or catchment language beyond a primary location label.',
        evidenceRefs: ['identity.location'],
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
        vertical,
        significance: 'medium',
        limitations: 'Absence of service-area copy is not proof the business does not serve a defined area.',
      }),
    );
  }

  if (mode === 'EXISTING') {
    if (website && websiteReachable) {
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.WEBSITE_PRESENT,
          subject: website,
          observation: `Website recorded and treated as reachable: ${website}.`,
          evidenceRefs: ['identity.website', 'digitalPresence'],
          knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
          vertical,
          significance: 'high',
        }),
      );
    } else if (website && snapshot?.digitalPresence?.status === 'unreachable') {
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.WEBSITE_UNREACHABLE,
          subject: website,
          observation: `Website URL recorded but not verified as reachable.`,
          evidenceRefs: ['identity.website', 'snapshot.failures'],
          knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
          vertical,
          significance: 'high',
        }),
      );
    } else {
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.WEBSITE_MISSING,
          observation: 'No verified website on current snapshot evidence.',
          evidenceRefs: ['identity.website', 'snapshot.failures'],
          knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
          vertical,
          significance: 'high',
          limitations: 'Missing website evidence is not proof the business has no online presence elsewhere.',
        }),
      );
    }

    if (offeringsFound) {
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.STRUCTURED_CATALOG_PRESENT,
          observation: `${offeringCount} product/service item(s) identified from website evidence.`,
          evidenceRefs: ['snapshot.offerings'],
          knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
          vertical,
          significance: 'high',
          metrics: { offeringCount },
        }),
      );

      if (offeringCount >= 5) {
        signals.push(
          createBusinessSignal({
            type: SIGNAL_TYPES.OFFERING_DEPTH_HIGH,
            observation: `Offering depth is relatively high (${offeringCount} items).`,
            evidenceRefs: ['snapshot.offerings'],
            knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
            vertical,
            significance: 'medium',
            metrics: { offeringCount },
          }),
        );
      }

      // Relational: many names but little description/spec structure on items
      const withDesc = offeringItems.filter(
        (i) => String(i.description || i.detail || '').trim().length > 24,
      ).length;
      const sparseRatio = offeringCount ? (offeringCount - withDesc) / offeringCount : 1;
      if (offeringCount >= 3 && sparseRatio >= 0.5) {
        signals.push(
          createBusinessSignal({
            type: SIGNAL_TYPES.OFFERING_DESCRIPTION_SPARSE,
            observation: `${offeringCount - withDesc} of ${offeringCount} identified items lack usable description/specification text on current evidence.`,
            evidenceRefs: ['snapshot.offerings.items'],
            knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
            vertical,
            significance: 'high',
            metrics: { offeringCount, withDescription: withDesc, sparseCount: offeringCount - withDesc },
            limitations: 'Based on extracted fields only — pages may contain richer detail not captured.',
          }),
        );
      }

      // Fragmented if offerings came from individual pages / menu lines without categories
      const sources = new Set(offeringItems.map((i) => i.source).filter(Boolean));
      if (offeringCount >= 4 && sources.size <= 1 && !offeringItems.some((i) => i.category)) {
        signals.push(
          createBusinessSignal({
            type: SIGNAL_TYPES.OFFERING_STRUCTURE_FRAGMENTED,
            observation: `${offeringCount} items were discovered without clear category structure on current evidence.`,
            evidenceRefs: ['snapshot.offerings'],
            knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
            vertical,
            significance: 'medium',
            metrics: { offeringCount },
          }),
        );
      }
    } else {
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.STRUCTURED_CATALOG_MISSING,
          observation:
            snapshot?.offerings?.message ||
            'No structured product/service catalogue verified from reliable sources.',
          evidenceRefs: ['snapshot.offerings', 'snapshot.failures'],
          knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
          vertical,
          significance: 'high',
          limitations: 'Absence of extraction is not proof the business has no offerings.',
        }),
      );
    }

    if (socialCount > 0) {
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.SOCIAL_PRESENCE_FOUND,
          observation: `${socialCount} social profile link(s) found on website evidence.`,
          evidenceRefs: ['digitalPresence.social'],
          knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
          vertical,
          significance: 'low',
          metrics: { socialCount },
        }),
      );
    } else if (website) {
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.SOCIAL_PRESENCE_MISSING,
          observation: 'No social profile links were verified on the homepage probe.',
          evidenceRefs: ['digitalPresence.social'],
          knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
          vertical,
          significance: 'low',
          limitations: 'Social may exist off-site without homepage links.',
        }),
      );
    }

    const hasContactHint =
      /\b(contact|email|phone|call|book|enquiry|inquiry|quote)\b/i.test(String(description || '')) ||
      (snapshot?.digitalPresence?.contactPaths || []).length > 0;
    if (hasContactHint) {
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.CONTACT_PATH_PRESENT,
          observation: 'Contact/enquiry language or path indicators were present in probed content.',
          evidenceRefs: ['digitalPresence'],
          knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
          vertical,
          significance: 'medium',
        }),
      );
    } else if (website) {
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.CONTACT_PATH_UNCLEAR,
          observation: 'Cardbey could not verify a clear contact, quote, or booking path on current probe evidence.',
          evidenceRefs: ['digitalPresence'],
          knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
          vertical,
          significance: 'high',
          limitations:
            'Missing contact path on probe is not proof the business lacks one on other pages or channels.',
        }),
      );
    }

    const rich =
      offeringsFound &&
      offeringCount >= 3 &&
      website &&
      websiteReachable &&
      (socialCount > 0 || String(description || '').length > 40);
    if (rich) {
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.DIGITAL_PRESENCE_STRONG,
          observation: `Verified website plus ${offeringCount} offerings${
            socialCount ? ` and ${socialCount} social link(s)` : ''
          }.`,
          evidenceRefs: ['identity.website', 'snapshot.offerings', 'digitalPresence'],
          knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
          vertical,
          significance: 'high',
          metrics: { offeringCount, socialCount },
        }),
      );
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.CONTENT_RICH,
          observation: 'Public digital content depth is relatively rich on current evidence.',
          evidenceRefs: ['snapshot.offerings', 'digitalPresence'],
          knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
          vertical,
          significance: 'medium',
        }),
      );
    } else if (!website || !offeringsFound) {
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.DIGITAL_PRESENCE_WEAK,
          observation: 'Digital presence is incomplete on current evidence (website and/or catalogue gaps).',
          evidenceRefs: ['identity.website', 'snapshot.offerings'],
          knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
          vertical,
          significance: 'high',
        }),
      );
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.CONTENT_SPARSE,
          observation: 'Public content available to Cardbey is sparse relative to a complete customer-facing profile.',
          evidenceRefs: ['snapshot'],
          knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
          vertical,
          significance: 'medium',
        }),
      );
    }
  }

  if (mode === 'INTENDED') {
    signals.push(
      createBusinessSignal({
        type: SIGNAL_TYPES.CONCEPT_STATED,
        subject: name || businessType,
        observation: `Founder-stated concept: ${name || businessType || 'unnamed idea'}${
          location ? ` targeting ${location}` : ''
        }.`,
        evidenceRefs: ['business_context'],
        knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
        vertical,
        significance: 'high',
      }),
    );

    const customerGap = (snapshot?.informationGaps || []).some((g) =>
      /customer/i.test(g.key || g.label || ''),
    );
    if (customerGap || !(snapshot?.assumptions || []).some((a) => /customer/i.test(a.key || a.label || ''))) {
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.CUSTOMER_TYPE_UNKNOWN,
          observation: 'Intended customer type is not fully validated on current evidence.',
          evidenceRefs: ['snapshot.informationGaps', 'snapshot.assumptions'],
          knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
          vertical,
          significance: 'high',
        }),
      );
    }

    signals.push(
      createBusinessSignal({
        type: SIGNAL_TYPES.OFFERINGS_UNDEFINED,
        observation: 'No operating offering catalogue exists yet for an intended business.',
        evidenceRefs: ['mode'],
        knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
        vertical,
        significance: 'high',
        limitations: 'Planning gap — not a claim about future products.',
      }),
    );

    if (operatingModel) {
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.OPERATING_MODEL_STATED,
          subject: operatingModel,
          observation: `Operating model noted as: ${operatingModel}.`,
          evidenceRefs: ['identity.operatingModel'],
          knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
          vertical,
          significance: 'medium',
        }),
      );
    } else {
      signals.push(
        createBusinessSignal({
          type: SIGNAL_TYPES.OPERATING_MODEL_UNKNOWN,
          observation: 'Operating model was not explicitly stated.',
          evidenceRefs: ['identity.operatingModel'],
          knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
          vertical,
          significance: 'medium',
        }),
      );
    }
  }

  return signals;
}

export function signalByType(signals, type) {
  return (signals || []).find((s) => s.type === type) || null;
}

export function hasSignal(signals, type) {
  return Boolean(signalByType(signals, type));
}
