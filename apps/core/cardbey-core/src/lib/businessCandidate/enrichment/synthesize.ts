/**
 * Description + BI brief synthesis — evidence-grounded only.
 * Policy version: enrichment-synthesis-v1
 *
 * Never invents products, prices, years, awards, hours, contacts, or legal identity.
 */

import { createHash } from 'node:crypto';
import { postAnthropicMessages } from '../../llm/anthropicProvider.js';
import { resolveAnthropicModel } from '../../llm/anthropicModelConfig.js';
import { sanitizeEnrichmentText } from '../../businessIngestion/enrichmentSafety.js';
import type { EnrichmentBudget } from './budget.js';
import { parseJsonObject, wordCount } from './htmlUtils.js';
import type { ConfirmedField } from './types.js';

export const SYNTHESIS_POLICY_VERSION = 'enrichment-synthesis-v1';

const BANNED_ADJECTIVES =
  /\b(premier|leading|world-class|passionate|dedicated|one-stop|your go-to|best|finest|award-winning)\b/i;

/** Services/products that must appear in evidence to be allowed in output. */
const UNSUPPORTED_INFERENCE =
  /\b(colorbond|colourbond|timber fencing|gate repair|free quotes?|24\/7|licensed|insured|family-owned since|est\.?\s*\d{4})\b/i;

export type DescriptionInputs = {
  businessName: string;
  category: string | null;
  suburb: string | null;
  websiteDescription: string | null;
  instagramBio: string | null;
  facebookAbout: string | null;
  yellowPagesDescription?: string | null;
  trueLocalDescription?: string | null;
  cuisineOrSpecialty: string | null;
  evidenceUrls?: string[];
};

export type SynthesisMeta = {
  source: 'claude_synthesised' | 'rule_synthesised' | 'rejected';
  usedClaude: boolean;
  model: string | null;
  policyVersion: string;
  evidenceHash: string;
  rejectedClaims: string[];
  aiGenerated: boolean;
};

function evidenceHash(input: DescriptionInputs): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        businessName: input.businessName,
        category: input.category,
        suburb: input.suburb,
        websiteDescription: input.websiteDescription,
        instagramBio: input.instagramBio,
        facebookAbout: input.facebookAbout,
        yellowPagesDescription: input.yellowPagesDescription,
        trueLocalDescription: input.trueLocalDescription,
        cuisineOrSpecialty: input.cuisineOrSpecialty,
        evidenceUrls: input.evidenceUrls ?? [],
      }),
    )
    .digest('hex')
    .slice(0, 24);
}

function collectEvidenceText(input: DescriptionInputs): string {
  return [
    input.websiteDescription,
    input.instagramBio,
    input.facebookAbout,
    input.yellowPagesDescription,
    input.trueLocalDescription,
    input.cuisineOrSpecialty,
  ]
    .filter(Boolean)
    .join(' \n ');
}

/**
 * Minimal grounded description — allowed for sparse evidence.
 * Example: "Example Fencing is listed as a fencing business in Braybrook."
 */
export function minimalGroundedDescription(input: DescriptionInputs): string {
  const name = input.businessName.trim();
  const category = (input.category ?? 'local').trim().toLowerCase();
  const suburb = input.suburb?.trim();
  const aggregator = sanitizeEnrichmentText(
    [input.yellowPagesDescription, input.trueLocalDescription].filter(Boolean).join(' '),
    220,
  );
  const lead = suburb
    ? `${name} is a ${category} business in ${suburb}.`
    : `${name} is a ${category} business.`;
  if (aggregator && wordCount(aggregator) >= 8) {
    return `${lead} ${aggregator}`.replace(/\s+/g, ' ').trim().slice(0, 480);
  }
  const tail = suburb
    ? `Public listings identify it as a local ${category} venue serving the ${suburb} community.`
    : `Public listings identify it as a local ${category} venue.`;
  return `${lead} ${tail}`.replace(/\s+/g, ' ').trim();
}

export function validateSynthesizedDescription(
  text: string,
  input: DescriptionInputs,
): { ok: boolean; rejectedClaims: string[]; cleaned: string | null } {
  const rejectedClaims: string[] = [];
  let cleaned = text.replace(/\s+/g, ' ').trim();

  if (BANNED_ADJECTIVES.test(cleaned)) {
    rejectedClaims.push('unsupported_marketing_adjective');
    cleaned = cleaned.replace(BANNED_ADJECTIVES, '').replace(/\s+/g, ' ').trim();
  }

  const evidence = collectEvidenceText(input).toLowerCase();
  const unsupported = cleaned.match(UNSUPPORTED_INFERENCE);
  if (unsupported) {
    for (const m of unsupported) {
      if (!evidence.includes(m.toLowerCase())) {
        rejectedClaims.push(`unsupported_inference:${m}`);
      }
    }
  }
  if (rejectedClaims.some((r) => r.startsWith('unsupported_inference:'))) {
    return { ok: false, rejectedClaims, cleaned: null };
  }

  // Must cite name + (category or suburb) from inputs
  const nameOk = cleaned.toLowerCase().includes(input.businessName.trim().toLowerCase().slice(0, 12));
  if (!nameOk) {
    rejectedClaims.push('missing_name_grounding');
    return { ok: false, rejectedClaims, cleaned: null };
  }

  return {
    ok: true,
    rejectedClaims,
    cleaned: sanitizeEnrichmentText(cleaned, 480),
  };
}

function ruleBasedDescription(input: DescriptionInputs): string {
  const evidence = collectEvidenceText(input);
  if (!evidence || wordCount(evidence) < 8) {
    return minimalGroundedDescription(input);
  }
  const name = input.businessName.trim();
  const suburb = input.suburb?.trim() || null;
  const category = input.category?.trim() || 'local business';
  const s1 = suburb
    ? `${name} is a ${category.toLowerCase()} business in ${suburb}.`
    : `${name} is a ${category.toLowerCase()} business.`;
  const seed = sanitizeEnrichmentText(evidence, 180);
  const s2 = input.cuisineOrSpecialty
    ? `Confirmed specialty: ${input.cuisineOrSpecialty}.`
    : seed
      ? seed
      : '';
  const text = `${s1} ${s2}`.replace(/\s+/g, ' ').trim();
  const validated = validateSynthesizedDescription(text, input);
  return validated.cleaned ?? minimalGroundedDescription(input);
}

export async function synthesizeDescription(
  budget: EnrichmentBudget,
  input: DescriptionInputs,
): Promise<{ text: string | null; meta: SynthesisMeta }> {
  const hash = evidenceHash(input);
  const baseMeta: Omit<SynthesisMeta, 'source' | 'usedClaude' | 'model' | 'rejectedClaims' | 'aiGenerated'> =
    {
      policyVersion: SYNTHESIS_POLICY_VERSION,
      evidenceHash: hash,
    };

  const hasApi = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (!hasApi) {
    const text = ruleBasedDescription(input);
    const validated = validateSynthesizedDescription(text, input);
    return {
      text: validated.cleaned,
      meta: {
        ...baseMeta,
        source: validated.ok ? 'rule_synthesised' : 'rejected',
        usedClaude: false,
        model: null,
        rejectedClaims: validated.rejectedClaims,
        aiGenerated: false,
      },
    };
  }

  budget.consumeClaude();
  const model = resolveAnthropicModel('fast');
  try {
    const response = await postAnthropicMessages({
      model,
      max_tokens: 180,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: `Write a factual business description using ONLY the confirmed evidence below.
Rules:
- Plain language. 20–60 words (never under 20 words).
- Do NOT invent products, services, prices, years, awards, hours, contacts, or legal claims.
- Do NOT use: premier, leading, world-class, passionate, dedicated, one-stop, your go-to, best, award-winning.
- If evidence is only name+category+location, write two grounded sentences: "{name} is a {category} business in {suburb}. Public listings identify it as a local {category} venue serving the {suburb} community." Expand with any Yellow Pages / True Local snippets when present.
Confirmed evidence JSON: ${JSON.stringify({
  ...input,
  yellowPagesDescription: input.yellowPagesDescription ?? null,
  trueLocalDescription: input.trueLocalDescription ?? null,
})}
Return strict JSON: {"description": string, "citedEvidenceFields": string[]}`,
        },
      ],
    });
    const raw = response?.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '';
    const parsed = parseJsonObject(raw);
    const description = typeof parsed?.description === 'string' ? parsed.description : null;
    if (!description) {
      const fallback = ruleBasedDescription(input);
      return {
        text: fallback,
        meta: {
          ...baseMeta,
          source: 'rule_synthesised',
          usedClaude: true,
          model,
          rejectedClaims: ['malformed_model_output'],
          aiGenerated: false,
        },
      };
    }
    const validated = validateSynthesizedDescription(description, input);
    if (!validated.ok || !validated.cleaned) {
      return {
        text: minimalGroundedDescription(input),
        meta: {
          ...baseMeta,
          source: 'rule_synthesised',
          usedClaude: true,
          model,
          rejectedClaims: validated.rejectedClaims,
          aiGenerated: false,
        },
      };
    }
    if (wordCount(validated.cleaned) < 20) {
      return {
        text: minimalGroundedDescription(input),
        meta: {
          ...baseMeta,
          source: 'rule_synthesised',
          usedClaude: true,
          model,
          rejectedClaims: [...validated.rejectedClaims, 'thin_claude_description'],
          aiGenerated: false,
        },
      };
    }
    return {
      text: validated.cleaned,
      meta: {
        ...baseMeta,
        source: 'claude_synthesised',
        usedClaude: true,
        model,
        rejectedClaims: validated.rejectedClaims,
        aiGenerated: true,
      },
    };
  } catch {
    return {
      text: ruleBasedDescription(input),
      meta: {
        ...baseMeta,
        source: 'rule_synthesised',
        usedClaude: true,
        model,
        rejectedClaims: ['claude_error'],
        aiGenerated: false,
      },
    };
  }
}

export type BiBriefInputs = {
  businessName: string;
  legalName: string | null;
  abn: string | null;
  category: string | null;
  suburb: string | null;
  description: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  openingHours: string | null;
  tags: string[];
  heroImageSource: string | null;
  enrichmentSources: string[];
  claimUrl: string | null;
  flags: string[];
};

function ruleBasedBiBrief(input: BiBriefInputs): string {
  const lines = [
    `# BI Brief — ${input.businessName}`,
    '',
    '## 1. Business snapshot',
    input.description ?? minimalGroundedDescription({
      businessName: input.businessName,
      category: input.category,
      suburb: input.suburb,
      websiteDescription: null,
      instagramBio: null,
      facebookAbout: null,
      cuisineOrSpecialty: null,
    }),
    input.legalName && input.legalName !== input.businessName
      ? `Legal name (ABR corroboration only): ${input.legalName}.`
      : null,
    input.abn ? `ABN (legal corroboration): ${input.abn}.` : null,
    '',
    '## 2. Data quality assessment',
    `Sources used: ${input.enrichmentSources.join(', ') || 'none'}.`,
    `Hero image source: ${input.heroImageSource ?? 'NO_ELIGIBLE_MEDIA'}.`,
    `Opening hours: ${input.openingHours ? 'confirmed' : 'missing'}.`,
    `Website: ${input.website ? 'confirmed' : 'missing'}.`,
    '',
    '## 3. Cardbey fit',
    `${input.category ?? 'Local'} businesses can use a claimable Cardbey page for discovery once owner-verified details are supplied.`,
    '',
    '## 4. Claim instructions',
    input.claimUrl
      ? `Claim URL: ${input.claimUrl}`
      : 'Claim URL: not yet assigned — generate after QA approve.',
    '',
    '## 5. Enrichment notes',
    input.flags.length ? input.flags.map((f) => `- ${f}`).join('\n') : '- None',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

export async function synthesizeBiBrief(
  budget: EnrichmentBudget,
  input: BiBriefInputs,
): Promise<{ text: string; meta: SynthesisMeta }> {
  const hash = evidenceHash({
    businessName: input.businessName,
    category: input.category,
    suburb: input.suburb,
    websiteDescription: input.description,
    instagramBio: null,
    facebookAbout: null,
    cuisineOrSpecialty: null,
  });
  const fallback = ruleBasedBiBrief(input);
  const hasApi = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (!hasApi) {
    return {
      text: fallback,
      meta: {
        source: 'rule_synthesised',
        usedClaude: false,
        model: null,
        policyVersion: SYNTHESIS_POLICY_VERSION,
        evidenceHash: hash,
        rejectedClaims: [],
        aiGenerated: false,
      },
    };
  }

  budget.consumeClaude();
  const model = resolveAnthropicModel('fast');
  try {
    const response = await postAnthropicMessages({
      model,
      max_tokens: 700,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: `Write a structured BI Brief for a QA reviewer. Use ONLY confirmed data. Do not invent.
Sections: 1 snapshot 2 data quality 3 Cardbey fit 4 claim instructions 5 enrichment notes.
Input JSON: ${JSON.stringify(input)}`,
        },
      ],
    });
    const raw = response?.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '';
    const text = String(raw).trim();
    if (text.length < 80 || UNSUPPORTED_INFERENCE.test(text) || BANNED_ADJECTIVES.test(text)) {
      return {
        text: fallback,
        meta: {
          source: 'rule_synthesised',
          usedClaude: true,
          model,
          policyVersion: SYNTHESIS_POLICY_VERSION,
          evidenceHash: hash,
          rejectedClaims: ['model_output_failed_policy'],
          aiGenerated: false,
        },
      };
    }
    return {
      text,
      meta: {
        source: 'claude_synthesised',
        usedClaude: true,
        model,
        policyVersion: SYNTHESIS_POLICY_VERSION,
        evidenceHash: hash,
        rejectedClaims: [],
        aiGenerated: true,
      },
    };
  } catch {
    return {
      text: fallback,
      meta: {
        source: 'rule_synthesised',
        usedClaude: true,
        model,
        policyVersion: SYNTHESIS_POLICY_VERSION,
        evidenceHash: hash,
        rejectedClaims: ['claude_error'],
        aiGenerated: false,
      },
    };
  }
}

export function preferHigherTierField<T>(
  existing: ConfirmedField<T> | undefined,
  incoming: ConfirmedField<T>,
): ConfirmedField<T> {
  if (!existing) return incoming;
  if (incoming.sourceTier < existing.sourceTier) return incoming;
  return existing;
}
