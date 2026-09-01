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
      classificationEvidence: [],
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

  if (/packaging distributor seeking|distributor seeking.*manufacturer/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.9,
      classificationReason: 'Buyer-side distributor seeking upstream manufacturers to source from.',
      classificationEvidence: [],
      intents: [
        { family: 'BUY', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
        { family: 'SUPPLY', confidence: 0.75, basis: 'INFERRED', evidence: [] },
      ],
      has: [
        { type: 'BUSINESS', label: 'packaging distributor', confidence: 0.85, basis: 'EXPLICIT', evidence: [] },
      ],
      wants: [
        { type: 'SUPPLIER', label: 'Vietnamese manufacturers of eco-friendly containers', confidence: 0.92, basis: 'EXPLICIT', evidence: [] },
      ],
      locationHint: 'Australia',
    };
  }

  if (
    /nhà sản xuất bao bì|manufacturer.*packaging|eco-friendly containers|ecopack|seeking australian distributors|sustainable packaging/i.test(
      rawText,
    ) &&
    !/needs raw material|needs.*supplier|distributor seeking/i.test(rawText)
  ) {
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
      classificationEvidence: [],
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

  if (/hợp tác đầu tư|seeking investors|nhà đầu tư/i.test(rawText) && !/edtech startup|fintech startup/i.test(rawText)) {
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

  if (/nhà máy sơn|paint factory|tìm đại lý tỉnh|tìm đại lý.*mở rộng toàn quốc/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.92,
      classificationReason: 'Paint manufacturer seeking provincial distributors nationwide.',
      classificationEvidence: [],
      intents: [{ family: 'DISTRIBUTE', confidence: 0.95, basis: 'EXPLICIT', evidence: [] }],
      has: [{ type: 'PRODUCT', label: 'paint products', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      wants: [
        { type: 'DISTRIBUTOR', label: 'provincial distributors', confidence: 0.92, basis: 'EXPLICIT', evidence: [] },
        { type: 'RESELLER', label: 'regional representatives', confidence: 0.85, basis: 'EXPLICIT', evidence: [] },
      ],
      locationHint: 'Hanoi, Vietnam',
    };
  }

  if (/promot|customers|book now|khách hàng/i.test(rawText) && !/just launched|wholesale orders|stockists in victoria|mobile car detailing|book now for weekend/i.test(rawText)) {
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

  if (/stockists in victoria|want stockists/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.88,
      classificationReason: 'Product brand seeking retail stockists/distribution.',
      classificationEvidence: [],
      intents: [
        { family: 'DISTRIBUTE', confidence: 0.88, basis: 'EXPLICIT', evidence: [] },
        { family: 'SELL', confidence: 0.75, basis: 'INFERRED', evidence: [] },
      ],
      has: [{ type: 'PRODUCT', label: 'cold brew coffee line', confidence: 0.85, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'DISTRIBUTOR', label: 'stockists in Victoria', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      locationHint: 'Victoria, Australia',
    };
  }

  if (/just launched.*skincare|wholesale orders/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.88,
      classificationReason: 'New product launch seeking wholesale customers.',
      classificationEvidence: [],
      intents: [
        { family: 'LAUNCH', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
        { family: 'SELL', confidence: 0.85, basis: 'EXPLICIT', evidence: [] },
      ],
      has: [{ type: 'PRODUCT', label: 'organic skincare line', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      wants: [
        { type: 'CUSTOMER', label: 'wholesale orders', confidence: 0.88, basis: 'EXPLICIT', evidence: [] },
        { type: 'BUYER', label: 'wholesale buyers', confidence: 0.85, basis: 'EXPLICIT', evidence: [] },
      ],
    };
  }

  if (/opening a new|khai trương|launched a new/i.test(rawText) && !/stockists|want stockists/i.test(rawText)) {
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

  if (/tìm đối tác phân phối|distribution partner.*australia|k-beauty.*úc/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.9,
      classificationReason: 'Seeking distribution partners for market entry.',
      classificationEvidence: [],
      intents: [
        { family: 'DISTRIBUTE', confidence: 0.92, basis: 'EXPLICIT', evidence: [] },
        { family: 'EXPAND', confidence: 0.8, basis: 'INFERRED', evidence: [] },
      ],
      has: [{ type: 'PRODUCT', label: 'Korean cosmetics', confidence: 0.85, basis: 'EXPLICIT', evidence: [] }],
      wants: [
        { type: 'DISTRIBUTOR', label: 'distribution partners in Australia', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
        { type: 'MARKET_ACCESS', label: 'Australia market', confidence: 0.88, basis: 'EXPLICIT', evidence: [] },
      ],
      locationHint: 'Australia',
    };
  }

  if (/consulting firm looking for investors|scale operations into southeast asia/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.9,
      classificationReason: 'Business seeking investors for regional expansion.',
      classificationEvidence: [],
      intents: [
        { family: 'INVEST', confidence: 0.93, basis: 'EXPLICIT', evidence: [] },
        { family: 'EXPAND', confidence: 0.8, basis: 'INFERRED', evidence: [] },
      ],
      has: [{ type: 'BUSINESS', label: 'consulting firm', confidence: 0.85, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'INVESTOR', label: 'investors for Southeast Asia expansion', confidence: 0.92, basis: 'EXPLICIT', evidence: [] }],
    };
  }

  if (/needs raw material supplier|factory.*needs.*supplier|nhà máy.*cần.*nguyên liệu/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.9,
      classificationReason: 'Manufacturer seeking raw material suppliers.',
      classificationEvidence: [],
      intents: [
        { family: 'BUY', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
        { family: 'SUPPLY', confidence: 0.8, basis: 'INFERRED', evidence: [] },
      ],
      has: [
        { type: 'BUSINESS', label: 'sustainable packaging factory', confidence: 0.85, basis: 'EXPLICIT', evidence: [] },
        { type: 'LOCATION', label: 'Hanoi', confidence: 0.88, basis: 'EXPLICIT', evidence: [] },
      ],
      wants: [{ type: 'SUPPLIER', label: 'raw material suppliers', confidence: 0.92, basis: 'EXPLICIT', evidence: [] }],
      locationHint: 'Hanoi, Vietnam',
    };
  }

  if (/logistics company wants agents|agents in vietnam|cross-border freight/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.88,
      classificationReason: 'Logistics business seeking agents for cross-border expansion.',
      classificationEvidence: [],
      intents: [
        { family: 'DISTRIBUTE', confidence: 0.85, basis: 'EXPLICIT', evidence: [] },
        { family: 'EXPAND', confidence: 0.82, basis: 'EXPLICIT', evidence: [] },
      ],
      has: [{ type: 'BUSINESS', label: 'Sydney logistics company', confidence: 0.85, basis: 'EXPLICIT', evidence: [] }],
      wants: [
        { type: 'RESELLER', label: 'agents in Vietnam', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
        { type: 'MARKET_ACCESS', label: 'Vietnam cross-border freight', confidence: 0.85, basis: 'EXPLICIT', evidence: [] },
      ],
      locationHint: 'Sydney, Australia → Vietnam',
    };
  }

  if (/export-ready.*coffee|seeking importers|nhà rang xay.*xuất khẩu/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.92,
      classificationReason: 'Exporter seeking importers/distribution in target markets.',
      classificationEvidence: [],
      intents: [
        { family: 'DISTRIBUTE', confidence: 0.93, basis: 'EXPLICIT', evidence: [] },
        { family: 'EXPAND', confidence: 0.85, basis: 'EXPLICIT', evidence: [] },
      ],
      has: [
        { type: 'PRODUCT', label: 'Vietnamese coffee', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
        { type: 'LOCATION', label: 'Vietnam', confidence: 0.88, basis: 'EXPLICIT', evidence: [] },
      ],
      wants: [
        { type: 'DISTRIBUTOR', label: 'importers in Australia and New Zealand', confidence: 0.92, basis: 'EXPLICIT', evidence: [] },
        { type: 'MARKET_ACCESS', label: 'Australia and New Zealand', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
      ],
      locationHint: 'Vietnam → Australia / New Zealand',
    };
  }

  if (/melbourne coffee culture is overrated|when i was younger i worked as a barista/i.test(rawText)) {
    return {
      classification: 'NON_COMMERCIAL',
      classificationConfidence: 0.82,
      classificationReason: 'Personal opinion or anecdote without commercial objective.',
      classificationEvidence: [],
      intents: [],
      has: [],
      wants: [],
    };
  }

  if (/looking for commercial security doors supplier|security doors supplier in melbourne/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.9,
      classificationReason: 'Business seeking commercial security doors supplier.',
      classificationEvidence: [],
      intents: [{ family: 'BUY', confidence: 0.92, basis: 'EXPLICIT', evidence: [] }],
      has: [{ type: 'BUSINESS', label: 'construction company', confidence: 0.85, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'SUPPLIER', label: 'commercial security doors supplier', confidence: 0.92, basis: 'EXPLICIT', evidence: [] }],
      locationHint: 'Melbourne',
    };
  }

  if (/grooming cho mèo|pet groomer|dịch vụ grooming/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.86,
      classificationReason: 'Consumer seeking pet grooming service.',
      classificationEvidence: [],
      intents: [{ family: 'BUY', confidence: 0.88, basis: 'EXPLICIT', evidence: [] }],
      has: [],
      wants: [{ type: 'SOLUTION', label: 'cat grooming service', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      locationHint: rawText.match(/Gò Vấp|gò vấp/i)?.[0] ?? null,
    };
  }

  if (/500 custom printed packaging boxes|under \$2 each/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.91,
      classificationReason: 'B2B procurement with quantity and budget constraints.',
      classificationEvidence: [],
      intents: [{ family: 'BUY', confidence: 0.92, basis: 'EXPLICIT', evidence: [] }],
      has: [{ type: 'BUSINESS', label: 'e-commerce brand', confidence: 0.8, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'SUPPLIER', label: 'custom printed packaging boxes', confidence: 0.93, basis: 'EXPLICIT', evidence: [] }],
    };
  }

  if (/food distributor seeking vietnamese manufacturers|premium sauces and noodles/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.9,
      classificationReason: 'Food distributor sourcing Vietnamese manufacturers.',
      classificationEvidence: [],
      intents: [
        { family: 'BUY', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
        { family: 'SUPPLY', confidence: 0.75, basis: 'INFERRED', evidence: [] },
      ],
      has: [
        { type: 'BUSINESS', label: 'Australian food distributor', confidence: 0.88, basis: 'EXPLICIT', evidence: [] },
        { type: 'CAPABILITY', label: 'distribution network', confidence: 0.75, basis: 'INFERRED', evidence: [] },
      ],
      wants: [{ type: 'SUPPLIER', label: 'Vietnamese manufacturers of premium sauces and noodles', confidence: 0.92, basis: 'EXPLICIT', evidence: [] }],
    };
  }

  if (/retailer.*looking for new paint brands|building-material retailer/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.89,
      classificationReason: 'Retailer seeking new paint brands to stock.',
      classificationEvidence: [],
      intents: [{ family: 'BUY', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      has: [{ type: 'BUSINESS', label: 'building-material retailer', confidence: 0.88, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'SUPPLIER', label: 'new paint brands', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      locationHint: rawText.match(/Đà Nẵng|Da Nang/i)?.[0] ?? null,
    };
  }

  if (/painting contractor.*factory-direct|factory-direct paint supply/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.88,
      classificationReason: 'Contractor seeking factory-direct paint supply.',
      classificationEvidence: [],
      intents: [{ family: 'BUY', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      has: [
        { type: 'BUSINESS', label: 'painting contractor', confidence: 0.85, basis: 'EXPLICIT', evidence: [] },
        { type: 'CAPABILITY', label: 'contractor network', confidence: 0.7, basis: 'INFERRED', evidence: [] },
      ],
      wants: [{ type: 'SUPPLIER', label: 'factory-direct paint supply', confidence: 0.92, basis: 'EXPLICIT', evidence: [] }],
      locationHint: 'Bình Dương',
    };
  }

  if (/family office looking for an operating business|business to invest in across/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.91,
      classificationReason: 'Investor seeking operating businesses to invest in.',
      classificationEvidence: [],
      intents: [{ family: 'INVEST', confidence: 0.93, basis: 'EXPLICIT', evidence: [] }],
      has: [{ type: 'CAPITAL', label: 'family office investment capital', confidence: 0.85, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'SOLUTION', label: 'operating business investment opportunities', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
    };
  }

  if (/edtech startup.*seeking investors|fintech startup.*seed investors/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.9,
      classificationReason: 'Startup seeking investors.',
      classificationEvidence: [],
      intents: [{ family: 'INVEST', confidence: 0.92, basis: 'EXPLICIT', evidence: [] }],
      has: [{ type: 'BUSINESS', label: 'startup', confidence: 0.85, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'INVESTOR', label: 'investors', confidence: 0.92, basis: 'EXPLICIT', evidence: [] }],
      locationHint: rawText.match(/Sydney|HCMC/i)?.[0] ?? null,
    };
  }

  if (/angel investor looking for.*startups|early-stage saas startups to invest/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.91,
      classificationReason: 'Angel investor seeking startup investment opportunities.',
      classificationEvidence: [],
      intents: [{ family: 'INVEST', confidence: 0.93, basis: 'EXPLICIT', evidence: [] }],
      has: [{ type: 'CAPITAL', label: 'angel investment capital', confidence: 0.88, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'SOLUTION', label: 'early-stage SaaS startups', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      locationHint: 'Australia',
    };
  }

  if (/experienced sales manager|needs an experienced sales manager/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.88,
      classificationReason: 'Company hiring experienced sales manager.',
      classificationEvidence: [],
      intents: [{ family: 'HIRE', confidence: 0.92, basis: 'EXPLICIT', evidence: [] }],
      has: [{ type: 'BUSINESS', label: 'SaaS company', confidence: 0.8, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'EMPLOYEE', label: 'experienced sales manager', confidence: 0.92, basis: 'EXPLICIT', evidence: [] }],
    };
  }

  if (/looking for warehouse space|warehouse in western melbourne/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.87,
      classificationReason: 'Business seeking warehouse space.',
      classificationEvidence: [],
      intents: [{ family: 'BUY', confidence: 0.88, basis: 'EXPLICIT', evidence: [] }],
      has: [{ type: 'BUSINESS', label: 'logistics startup', confidence: 0.8, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'SOLUTION', label: 'warehouse space 500+ sqm', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      locationHint: 'western Melbourne',
    };
  }

  if (/food creator.*fmcg brands|creator.*looking for.*brands to collaborate/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.88,
      classificationReason: 'Creator seeking brand collaboration opportunities.',
      classificationEvidence: [],
      intents: [{ family: 'PARTNER', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      has: [
        { type: 'AUDIENCE', label: '80k followers', confidence: 0.85, basis: 'EXPLICIT', evidence: [] },
        { type: 'CAPABILITY', label: 'sponsored content creation', confidence: 0.8, basis: 'EXPLICIT', evidence: [] },
      ],
      wants: [{ type: 'PARTNER', label: 'FMCG brands for collaboration', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
    };
  }

  if (/can anyone supply premium australian beef|premium australian beef for our hotel/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.9,
      classificationReason: 'Hotel restaurant seeking premium beef supplier.',
      classificationEvidence: [],
      intents: [{ family: 'BUY', confidence: 0.91, basis: 'EXPLICIT', evidence: [] }],
      has: [{ type: 'BUSINESS', label: 'hotel restaurant', confidence: 0.85, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'SUPPLIER', label: 'premium Australian beef', confidence: 0.92, basis: 'EXPLICIT', evidence: [] }],
      locationHint: 'Da Nang',
    };
  }

  if (/recommend a security door installer|security door installer in melbourne for our renovation/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.84,
      classificationReason: 'Renovation project seeking security door installer recommendation.',
      classificationEvidence: [],
      intents: [{ family: 'BUY', confidence: 0.86, basis: 'EXPLICIT', evidence: [] }],
      has: [],
      wants: [{ type: 'SOLUTION', label: 'security door installer', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      locationHint: 'Melbourne',
    };
  }

  if (/book now|weekend slots|mobile car detailing/i.test(rawText)) {
    return {
      classification: 'COMMERCIAL',
      classificationConfidence: 0.82,
      classificationReason: 'Local service promotion seeking bookings.',
      classificationEvidence: [],
      intents: [{ family: 'PROMOTE', confidence: 0.88, basis: 'EXPLICIT', evidence: [] }],
      has: [{ type: 'SERVICE', label: 'mobile car detailing', confidence: 0.85, basis: 'EXPLICIT', evidence: [] }],
      wants: [{ type: 'CUSTOMER', label: 'weekend booking customers', confidence: 0.85, basis: 'EXPLICIT', evidence: [] }],
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
