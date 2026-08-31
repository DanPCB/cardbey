import type { MarketIntentLlmResponse } from '../../marketIntentSchema.js';

/**
 * Deterministic mock LLM responses for CI scenario tests.
 * Simulates semantic extraction output — not keyword routing.
 */
export function mockLlmResponseForText(rawText: string): MarketIntentLlmResponse {
  const t = rawText.toLowerCase();

  if (/happy birthday|chúc mừng khai trương|lovely weather|just had coffee/i.test(rawText)) {
    return {
      classification: 'NON_COMMERCIAL',
      classificationConfidence: 0.88,
      classificationReason: 'Personal or social message without commercial objective.',
      classificationEvidence: [
        {
          statement: 'Social/personal content without business ask.',
          span: rawText.slice(0, 60),
          basis: 'EXPLICIT',
          confidence: 0.85,
        },
      ],
      intents: [],
      has: [],
      wants: [],
    };
  }

  if (/maybe interested|not sure yet/i.test(rawText)) {
    return {
      classification: 'AMBIGUOUS',
      classificationConfidence: 0.42,
      classificationReason: 'Vague mention of business interest without clear objective.',
      classificationEvidence: [
        {
          statement: 'Insufficient detail to determine commercial intent family.',
          span: rawText,
          basis: 'EXPLICIT',
          confidence: 0.4,
        },
      ],
      intents: [],
      has: [],
      wants: [],
    };
  }

  if (/interest rates today|interesting article/i.test(rawText)) {
    return {
      classification: 'NON_COMMERCIAL',
      classificationConfidence: 0.8,
      classificationReason: 'News commentary without actionable commercial intent.',
      classificationEvidence: [
        {
          statement: 'Business inviting partners for national expansion.',
          span: rawText.match(/partner|franchise/i)?.[0] ?? null,
          basis: 'EXPLICIT',
          confidence: 0.9,
        },
      ],
      intents: [],
      has: [],
      wants: [],
    };
  }

  if (/used toyota|selling my used|gumtree/i.test(t) || /bán.*xe|sell.*\$5,?500/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.9,
      classificationReason: 'Individual selling a used vehicle — valid commercial sell intent.',
      classificationEvidence: [
        {
          statement: 'Seller offering a vehicle for sale.',
          span: rawText.match(/toyota|vehicle|\$5,?500/i)?.[0] ?? null,
          basis: 'EXPLICIT',
          confidence: 0.92,
        },
      ],
      intents: [
        {
          family: 'SELL',
          confidence: 0.93,
          basis: 'EXPLICIT',
          evidence: [{ statement: 'Selling used vehicle', span: 'Selling my used Toyota', basis: 'EXPLICIT', confidence: 0.9 }],
        },
      ],
      has: [
        {
          type: 'ASSET',
          label: 'used Toyota Camry 2018',
          confidence: 0.9,
          basis: 'EXPLICIT',
          evidence: [],
        },
      ],
      wants: [
        {
          type: 'BUYER',
          label: 'buyer for vehicle',
          confidence: 0.85,
          basis: 'INFERRED',
          evidence: [{ statement: 'Sale listing implies seeking a buyer', span: null, basis: 'INFERRED', confidence: 0.8 }],
        },
      ],
      actorHint: 'individual seller',
    };
  }

  if (/nhà sản xuất bao bì|manufacturer.*packaging|eco-friendly containers|ecopack|seeking australian distributors|sustainable packaging/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.92,
      classificationReason: 'Manufacturer seeking distribution in Australia.',
      classificationEvidence: [
        {
          statement: 'Explicit search for distributors in Australia.',
          span: rawText.includes('Australia') ? 'Australia' : 'Úc',
          basis: 'EXPLICIT',
          confidence: 0.9,
        },
      ],
      intents: [
        {
          family: 'DISTRIBUTE',
          confidence: 0.94,
          basis: 'EXPLICIT',
          evidence: [],
        },
        {
          family: 'EXPAND',
          confidence: 0.75,
          basis: 'INFERRED',
          evidence: [{ statement: 'Seeking distributors implies market expansion', span: null, basis: 'INFERRED', confidence: 0.7 }],
        },
      ],
      has: [
        { type: 'PRODUCT', label: 'sustainable food packaging', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
        { type: 'CAPABILITY', label: 'manufacturing', confidence: 0.85, basis: 'EXPLICIT', evidence: [] },
        { type: 'LOCATION', label: 'Vietnam', confidence: 0.88, basis: 'EXPLICIT', evidence: [] },
      ],
      wants: [
        { type: 'DISTRIBUTOR', label: 'Australian distributors', confidence: 0.92, basis: 'EXPLICIT', evidence: [] },
        { type: 'MARKET_ACCESS', label: 'Australia', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
      ],
      locationHint: 'Vietnam → Australia',
    };
  }

  if (/spa chain|franchise.*partner|expand nationally/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.91,
      classificationReason: 'Business inviting partners for national expansion.',
      classificationEvidence: [
        {
          statement: 'Business inviting partners for national expansion.',
          span: rawText.match(/partner|franchise/i)?.[0] ?? null,
          basis: 'EXPLICIT',
          confidence: 0.9,
        },
      ],
      intents: [
        { family: 'PARTNER', confidence: 0.93, basis: 'EXPLICIT', evidence: [] },
        { family: 'EXPAND', confidence: 0.88, basis: 'EXPLICIT', evidence: [] },
      ],
      has: [
        { type: 'BUSINESS', label: 'wellness spa chain', confidence: 0.85, basis: 'EXPLICIT', evidence: [] },
        { type: 'CAPABILITY', label: 'established brand with 12 locations', confidence: 0.8, basis: 'EXPLICIT', evidence: [] },
      ],
      wants: [
        { type: 'PARTNER', label: 'franchise and operating partners', confidence: 0.92, basis: 'EXPLICIT', evidence: [] },
      ],
      businessHint: 'wellness spa chain',
      locationHint: 'Australia',
    };
  }

  if (/co-founder|đồng đội|co-develop/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.87,
      classificationReason: 'Founder seeking collaborator/co-founder.',
      classificationEvidence: [],
      intents: [{ family: 'COLLABORATE', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      has: [{ type: 'BUSINESS', label: 'startup project', confidence: 0.7, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'COLLABORATOR', label: 'co-founder / teammate', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
    };
  }

  if (/hợp tác đầu tư|seeking investors|nhà đầu tư/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.89,
      classificationReason: 'Investment cooperation or investor search.',
      classificationEvidence: [],
      intents: [
        { family: 'INVEST', confidence: 0.92, basis: 'EXPLICIT', evidence: [] },
        { family: 'PARTNER', confidence: 0.7, basis: 'INFERRED', evidence: [] },
      ],
      has: [{ type: 'ASSET', label: 'project or business seeking capital', confidence: 0.75, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'INVESTOR', label: 'investors', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
    };
  }

  if (/hiring|tuyển|cộng tác viên bán hàng|recruitment/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.86,
      classificationReason: 'Hiring or recruitment post.',
      classificationEvidence: [],
      intents: [{ family: 'HIRE', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      has: [{ type: 'BUSINESS', label: 'employer', confidence: 0.7, basis: 'INFERRED', evidence: [] }],
      wants: [{ type: 'EMPLOYEE', label: 'staff or sales collaborators', confidence: 0.88, basis: 'EXPLICIT', evidence: [] }],
    };
  }

  if (/supplier|nhà cung cấp|raw material/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.88,
      classificationReason: 'Seeking suppliers.',
      classificationEvidence: [],
      intents: [
        { family: 'BUY', confidence: 0.85, basis: 'EXPLICIT', evidence: [] },
        { family: 'SUPPLY', confidence: 0.8, basis: 'INFERRED', evidence: [] },
      ],
      has: [{ type: 'BUSINESS', label: 'buyer organization', confidence: 0.65, basis: 'INFERRED', evidence: [] }],
      wants: [{ type: 'SUPPLIER', label: 'suppliers', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
    };
  }

  if (/promot|wholesale|stockists|customers|book now|khách hàng/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.85,
      classificationReason: 'Promotion or customer acquisition.',
      classificationEvidence: [],
      intents: [
        { family: 'PROMOTE', confidence: 0.88, basis: 'EXPLICIT', evidence: [] },
        { family: 'SELL', confidence: 0.75, basis: 'INFERRED', evidence: [] },
      ],
      has: [{ type: 'PRODUCT', label: 'product or service offering', confidence: 0.75, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'CUSTOMER', label: 'customers or stockists', confidence: 0.85, basis: 'EXPLICIT', evidence: [] }],
    };
  }

  if (/opening a new|khai trương|launched a new/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.87,
      classificationReason: 'Business launch announcement.',
      classificationEvidence: [],
      intents: [{ family: 'LAUNCH', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      has: [{ type: 'BUSINESS', label: 'new business venture', confidence: 0.8, basis: 'EXPLICIT', evidence: [] }],
      wants: [],
    };
  }

  if (/reseller program|franchise opportunity/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.88,
      classificationReason: 'Partner/reseller recruitment.',
      classificationEvidence: [],
      intents: [{ family: 'PARTNER', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      has: [{ type: 'BUSINESS', label: 'brand with partner program', confidence: 0.75, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'RESELLER', label: 'resellers or franchisees', confidence: 0.88, basis: 'EXPLICIT', evidence: [] }],
    };
  }

  if (/good plumber|anyone know/i.test(rawText)) {
    return {
      classification: 'AMBIGUOUS',
      classificationConfidence: 0.55,
      classificationReason: 'Consumer question — may be personal need not business commercial intent.',
      classificationEvidence: [],
      intents: [],
      has: [],
      wants: [],
    };
  }

  // Default commercial for remaining business-like cohort entries
  return {
    classification: 'COMMERCIAL',
    classificationConfidence: 0.78,
    classificationReason: 'General commercial business signal.',
    classificationEvidence: [],
    intents: [{ family: 'OTHER_COMMERCIAL', confidence: 0.7, basis: 'INFERRED', evidence: [] }],
    has: [],
    wants: [],
  };
}

export function createMockLlmGenerate() {
  return async ({ prompt }: { prompt: string }) => {
    const match = prompt.match(/rawText:\s*"""([\s\S]*?)"""/);
    const rawText = match?.[1]?.trim() ?? '';
    return { text: JSON.stringify(mockLlmResponseForText(rawText)) };
  };
}
