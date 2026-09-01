/**
 * Reciprocal match pair cohort — deliberately paired and unpaired nodes.
 */
import type { ReciprocalBand } from '../../marketMatchTypes.js';
import type { MarketIntentAnalysis } from '../../types.js';

export type AnchorG1Override = Partial<{
  classification: MarketIntentAnalysis['classification'];
  classificationConfidence: number;
  classificationReason: string;
  classificationEvidence: MarketIntentAnalysis['classificationEvidence'];
  intents: MarketIntentAnalysis['intents']['items'];
  has: MarketIntentAnalysis['has'];
  wants: MarketIntentAnalysis['wants'];
  actorHint: string | null;
  businessHint: string | null;
  locationHint: string | null;
}>;

export type MatchNodeSpec =
  | { kind: 'demand'; signalId: string; label: string }
  | { kind: 'cohort'; signalId: string; label: string }
  | {
      kind: 'anchor';
      nodeId: string;
      label: string;
      rawText: string;
      sourceType?: string;
      g1Override: AnchorG1Override;
    };

export type MatchPairCase = {
  pairId: string;
  nodeA: MatchNodeSpec;
  nodeB: MatchNodeSpec;
  expectedBand: ReciprocalBand;
  /** Acceptable alternate bands when overlap is borderline */
  acceptableBands?: ReciprocalBand[];
  directionNotes: string;
  critical: boolean;
  category: string;
};

export const ANCHOR_PAINT: MatchNodeSpec = {
  kind: 'anchor',
  nodeId: 'anchor-paint',
  label: 'Paint manufacturer Vietnam nationwide',
  rawText:
    'Nhà máy sơn tại KCN Phú Nghĩa, Chương Mỹ, Hà Nội. Tìm đại lý tỉnh, đại diện vùng, thợ sơn — mở rộng toàn quốc.',
  sourceType: 'social_post_copy',
  g1Override: {
    classification: 'COMMERCIAL',
    classificationConfidence: 0.92,
    classificationReason: 'Paint manufacturer seeking nationwide distributors',
    classificationEvidence: [],
    intents: [{ family: 'DISTRIBUTE', confidence: 0.95, basis: 'EXPLICIT', evidence: [] }],
    has: [
      { type: 'PRODUCT', label: 'paint products', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
      { type: 'LOCATION', label: 'Phu Nghia IZ, Chuong My, Hanoi', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
    ],
    wants: [
      { type: 'DISTRIBUTOR', label: 'provincial distributors nationwide', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
      { type: 'RESELLER', label: 'regional representatives', confidence: 0.85, basis: 'EXPLICIT', evidence: [] },
    ],
    locationHint: 'Hanoi, Vietnam',
  },
};

export const ANCHOR_MSD: MatchNodeSpec = {
  kind: 'anchor',
  nodeId: 'anchor-msd',
  label: 'Modern Security Doors Melbourne',
  rawText: `MODERN SECURITY DOORS
Supply, installation and repair of security doors in Melbourne.
Looking for more customers.`,
  sourceType: 'social_post_copy',
  g1Override: {
    classification: 'COMMERCIAL',
    classificationConfidence: 0.9,
    classificationReason: 'Local security door services',
    classificationEvidence: [],
    intents: [{ family: 'SELL', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
    has: [
      { type: 'BUSINESS', label: 'Modern Security Doors', confidence: 0.95, basis: 'EXPLICIT', evidence: [] },
      { type: 'SERVICE', label: 'Security door supply and installation', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
    ],
    wants: [{ type: 'CUSTOMER', label: 'local customers Melbourne', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
    locationHint: 'Melbourne, Victoria',
  },
};

/** Regression anchor — generic AU seed raise (no hard-coded company or VC names). */
export const ANCHOR_CARDBEY_SEED_AU3M: MatchNodeSpec = {
  kind: 'anchor',
  nodeId: 'anchor-au-marketplace-seed',
  label: 'AU marketplace intelligence platform seed round',
  rawText:
    'Australian marketplace and intelligence platform raising A$3M seed round for product and growth. Seeking seed-stage investors and strategic partners.',
  sourceType: 'manual_entry',
  g1Override: {
    classification: 'COMMERCIAL',
    classificationConfidence: 0.9,
    classificationReason: 'Startup seeking seed capital for marketplace platform',
    classificationEvidence: [],
    intents: [{ family: 'INVEST', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
    has: [
      { type: 'BUSINESS', label: 'marketplace intelligence platform', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
      { type: 'TECHNOLOGY', label: 'commerce and intelligence technology', confidence: 0.85, basis: 'INFERRED', evidence: [] },
      { type: 'CAPABILITY', label: 'supported business evidence network', confidence: 0.8, basis: 'INFERRED', evidence: [] },
    ],
    wants: [
      { type: 'CAPITAL', label: 'A$3M seed round', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
      { type: 'INVESTOR', label: 'seed-stage investors Australia', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
    ],
    locationHint: 'Australia',
  },
};

export const ANCHOR_MEOU: MatchNodeSpec = {
  kind: 'anchor',
  nodeId: 'anchor-meou',
  label: 'Mèo Ú pet care partner/capital',
  rawText: 'Mèo Ú Pet Care Gò Vấp tìm đối tác vốn và đối tác vận hành mở rộng.',
  sourceType: 'social_post_copy',
  g1Override: {
    classification: 'COMMERCIAL',
    classificationConfidence: 0.9,
    classificationReason: 'Pet care partnership expansion',
    classificationEvidence: [],
    intents: [{ family: 'PARTNER', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
    has: [
      { type: 'BUSINESS', label: 'Mèo Ú', confidence: 0.95, basis: 'EXPLICIT', evidence: [] },
      { type: 'SERVICE', label: 'Pet care, grooming, hotel', confidence: 0.85, basis: 'EXPLICIT', evidence: [] },
    ],
    wants: [
      { type: 'CAPITAL', label: 'capital partner', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
      { type: 'PARTNER', label: 'operating partner', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
    ],
    locationHint: 'Gò Vấp',
  },
};

/** 26 deliberate pairs from supplier + demand cohorts */
export const MATCH_PAIR_COHORT: MatchPairCase[] = [
  {
    pairId: 'match-001',
    nodeA: ANCHOR_PAINT,
    nodeB: { kind: 'demand', signalId: 'demand-005', label: 'Building-material retailer Đà Nẵng' },
    expectedBand: 'STRONG_RECIPROCAL',
    directionNotes: 'Paint mfg wants distributors; retailer wants paint brands',
    critical: true,
    category: 'ANCHOR_STRONG_RECIPROCAL',
  },
  {
    pairId: 'match-002',
    nodeA: ANCHOR_PAINT,
    nodeB: { kind: 'demand', signalId: 'demand-006', label: 'Painting contractor Bình Dương' },
    expectedBand: 'ONE_WAY_STRONG',
    acceptableBands: ['POSSIBLE'],
    directionNotes: 'Contractor wants factory-direct paint; mfg wants distributors not contractors',
    critical: true,
    category: 'ANCHOR_ONE_WAY',
  },
  {
    pairId: 'match-003',
    nodeA: ANCHOR_PAINT,
    nodeB: { kind: 'demand', signalId: 'demand-002', label: 'Pet grooming consumer Gò Vấp' },
    expectedBand: 'INSUFFICIENT_EVIDENCE',
    acceptableBands: ['CONTRADICTED'],
    directionNotes: 'No commercial need overlap',
    critical: true,
    category: 'ANCHOR_NEGATIVE',
  },
  {
    pairId: 'match-004',
    nodeA: { kind: 'cohort', signalId: 'cohort-001', label: 'VN sustainable packaging exporter' },
    nodeB: { kind: 'demand', signalId: 'demand-020', label: 'AU packaging distributor seeking VN mfg' },
    expectedBand: 'STRONG_RECIPROCAL',
    directionNotes: 'Export/distribution symmetry across AU-VN',
    critical: true,
    category: 'ANCHOR_STRONG_RECIPROCAL',
  },
  {
    pairId: 'match-005',
    nodeA: { kind: 'demand', signalId: 'demand-021', label: 'Fintech startup seeking seed investors' },
    nodeB: { kind: 'demand', signalId: 'demand-022', label: 'Angel investor seeking SaaS startups' },
    expectedBand: 'STRONG_RECIPROCAL',
    directionNotes: 'Capital flow symmetry',
    critical: true,
    category: 'ANCHOR_STRONG_RECIPROCAL',
  },
  {
    pairId: 'match-006',
    nodeA: { kind: 'demand', signalId: 'demand-021', label: 'Fintech startup seeking seed investors' },
    nodeB: ANCHOR_PAINT,
    expectedBand: 'INSUFFICIENT_EVIDENCE',
    directionNotes: 'Unrelated needs — must not false-positive',
    critical: true,
    category: 'ANCHOR_NEGATIVE',
  },
  {
    pairId: 'match-007',
    nodeA: ANCHOR_MSD,
    nodeB: { kind: 'demand', signalId: 'demand-001', label: 'Construction buyer security doors Melbourne' },
    expectedBand: 'ONE_WAY_STRONG',
    acceptableBands: ['POSSIBLE'],
    directionNotes: 'Buyer wants security doors; supplier wants customers',
    critical: true,
    category: 'ANCHOR_ONE_WAY',
  },
  {
    pairId: 'match-008',
    nodeA: { kind: 'demand', signalId: 'demand-016', label: 'C2C used car seller' },
    nodeB: { kind: 'demand', signalId: 'demand-003', label: 'B2B packaging procurement' },
    expectedBand: 'CONTRADICTED',
    acceptableBands: ['INSUFFICIENT_EVIDENCE'],
    directionNotes: 'Wrong market segment',
    critical: true,
    category: 'ANCHOR_NEGATIVE',
  },
  {
    pairId: 'match-009',
    nodeA: ANCHOR_PAINT,
    nodeB: { kind: 'demand', signalId: 'demand-019', label: 'Competing paint manufacturer Hanoi' },
    expectedBand: 'CONTRADICTED',
    directionNotes: 'Both supply-side seeking same channel — competitors',
    critical: true,
    category: 'COMPETING_SUPPLY',
  },
  {
    pairId: 'match-010',
    nodeA: { kind: 'cohort', signalId: 'cohort-001', label: 'VN packaging exporter' },
    nodeB: { kind: 'demand', signalId: 'demand-004', label: 'AU food distributor seeking VN mfg' },
    expectedBand: 'STRONG_RECIPROCAL',
    acceptableBands: ['POSSIBLE'],
    directionNotes: 'VN supplier ↔ AU distributor (food vs packaging partial domain)',
    critical: false,
    category: 'CROSS_BORDER',
  },
  {
    pairId: 'match-011',
    nodeA: { kind: 'demand', signalId: 'demand-007', label: 'Family office investor' },
    nodeB: { kind: 'demand', signalId: 'demand-008', label: 'Edtech startup Sydney' },
    expectedBand: 'ONE_WAY_STRONG',
    acceptableBands: ['STRONG_RECIPROCAL', 'POSSIBLE'],
    directionNotes: 'Investor ↔ capital seeker',
    critical: false,
    category: 'INVESTMENT',
  },
  {
    pairId: 'match-012',
    nodeA: ANCHOR_MEOU,
    nodeB: { kind: 'demand', signalId: 'demand-009', label: 'Startup seeking technical cofounder' },
    expectedBand: 'POSSIBLE',
    acceptableBands: ['ONE_WAY_STRONG', 'INSUFFICIENT_EVIDENCE'],
    directionNotes: 'Partial partnership overlap — different partner types',
    critical: false,
    category: 'PARTNERSHIP',
  },
  {
    pairId: 'match-013',
    nodeA: ANCHOR_MEOU,
    nodeB: { kind: 'demand', signalId: 'demand-002', label: 'Pet grooming consumer' },
    expectedBand: 'INSUFFICIENT_EVIDENCE',
    acceptableBands: ['CONTRADICTED'],
    directionNotes: 'Commercial pet business vs consumer grooming request',
    critical: false,
    category: 'NEGATIVE',
  },
  {
    pairId: 'match-014',
    nodeA: { kind: 'demand', signalId: 'demand-005', label: 'Paint retailer Đà Nẵng' },
    nodeB: { kind: 'cohort', signalId: 'cohort-001', label: 'VN packaging exporter' },
    expectedBand: 'INSUFFICIENT_EVIDENCE',
    acceptableBands: ['ONE_WAY_STRONG', 'POSSIBLE'],
    directionNotes: 'Different product domains',
    critical: false,
    category: 'NEGATIVE',
  },
  {
    pairId: 'match-015',
    nodeA: { kind: 'demand', signalId: 'demand-014', label: 'Birthday post non-commercial' },
    nodeB: { kind: 'demand', signalId: 'demand-015', label: 'News opinion non-commercial' },
    expectedBand: 'INSUFFICIENT_EVIDENCE',
    directionNotes: 'Non-commercial nodes',
    critical: false,
    category: 'NON_COMMERCIAL',
  },
  {
    pairId: 'match-016',
    nodeA: { kind: 'demand', signalId: 'demand-010', label: 'SaaS hiring sales manager' },
    nodeB: { kind: 'demand', signalId: 'demand-011', label: 'Logistics warehouse Melbourne' },
    expectedBand: 'INSUFFICIENT_EVIDENCE',
    acceptableBands: ['ONE_WAY_STRONG', 'POSSIBLE'],
    directionNotes: 'Unrelated commercial needs',
    critical: false,
    category: 'NEGATIVE',
  },
  {
    pairId: 'match-017',
    nodeA: { kind: 'cohort', signalId: 'cohort-002', label: 'AU spa franchise expansion' },
    nodeB: { kind: 'demand', signalId: 'demand-012', label: 'Food creator seeking brand partners' },
    expectedBand: 'INSUFFICIENT_EVIDENCE',
    acceptableBands: ['ONE_WAY_STRONG', 'POSSIBLE'],
    directionNotes: 'Different partnership domains',
    critical: false,
    category: 'NEGATIVE',
  },
  {
    pairId: 'match-018',
    nodeA: ANCHOR_MSD,
    nodeB: { kind: 'demand', signalId: 'demand-026', label: 'Recommend security door installer' },
    expectedBand: 'POSSIBLE',
    acceptableBands: ['ONE_WAY_STRONG', 'INSUFFICIENT_EVIDENCE'],
    directionNotes: 'Service recommendation vs supplier',
    critical: false,
    category: 'SERVICE',
  },
  {
    pairId: 'match-019',
    nodeA: { kind: 'demand', signalId: 'demand-023', label: 'Mobile car detailing Brisbane' },
    nodeB: { kind: 'demand', signalId: 'demand-024', label: 'Cafe promotion Melbourne' },
    expectedBand: 'INSUFFICIENT_EVIDENCE',
    acceptableBands: ['POSSIBLE'],
    directionNotes: 'Unrelated local services',
    critical: false,
    category: 'NEGATIVE',
  },
  {
    pairId: 'match-020',
    nodeA: { kind: 'cohort', signalId: 'cohort-005', label: 'Skincare LAUNCH supplier' },
    nodeB: { kind: 'demand', signalId: 'demand-012', label: 'Creator seeking FMCG brands' },
    expectedBand: 'POSSIBLE',
    acceptableBands: ['ONE_WAY_STRONG', 'INSUFFICIENT_EVIDENCE'],
    directionNotes: 'Brand partnership partial fit',
    critical: false,
    category: 'COLLABORATION',
  },
  {
    pairId: 'match-021',
    nodeA: { kind: 'demand', signalId: 'demand-001', label: 'Security doors buyer Melbourne' },
    nodeB: { kind: 'demand', signalId: 'demand-002', label: 'Pet grooming consumer' },
    expectedBand: 'INSUFFICIENT_EVIDENCE',
    directionNotes: 'Unrelated demand signals',
    critical: false,
    category: 'NEGATIVE',
  },
  {
    pairId: 'match-022',
    nodeA: { kind: 'cohort', signalId: 'cohort-017', label: 'VN coffee distributor seeking AU' },
    nodeB: { kind: 'demand', signalId: 'demand-004', label: 'AU food distributor VN mfg' },
    expectedBand: 'POSSIBLE',
    acceptableBands: ['STRONG_RECIPROCAL', 'ONE_WAY_STRONG'],
    directionNotes: 'Cross-border food trade partial symmetry',
    critical: false,
    category: 'CROSS_BORDER',
  },
  {
    pairId: 'match-023',
    nodeA: ANCHOR_PAINT,
    nodeB: { kind: 'cohort', signalId: 'cohort-001', label: 'VN packaging exporter' },
    expectedBand: 'INSUFFICIENT_EVIDENCE',
    acceptableBands: ['CONTRADICTED'],
    directionNotes: 'Paint vs packaging — no reciprocal fit',
    critical: false,
    category: 'NEGATIVE',
  },
  {
    pairId: 'match-024',
    nodeA: { kind: 'demand', signalId: 'demand-013', label: 'Ambiguous plumber recommendation' },
    nodeB: { kind: 'demand', signalId: 'demand-018', label: 'Barista story non-commercial' },
    expectedBand: 'INSUFFICIENT_EVIDENCE',
    directionNotes: 'Low-evidence / non-commercial',
    critical: false,
    category: 'NON_COMMERCIAL',
  },
  {
    pairId: 'match-025',
    nodeA: { kind: 'demand', signalId: 'demand-008', label: 'Edtech startup investors' },
    nodeB: { kind: 'demand', signalId: 'demand-022', label: 'Angel investor startups' },
    expectedBand: 'STRONG_RECIPROCAL',
    acceptableBands: ['ONE_WAY_STRONG'],
    directionNotes: 'Second investment reciprocal pair',
    critical: true,
    category: 'ANCHOR_STRONG_RECIPROCAL',
  },
  {
    pairId: 'match-026',
    nodeA: { kind: 'demand', signalId: 'demand-019', label: 'Paint mfg Hanoi' },
    nodeB: { kind: 'demand', signalId: 'demand-005', label: 'Paint retailer Đà Nẵng' },
    expectedBand: 'STRONG_RECIPROCAL',
    directionNotes: 'Demand-cohort supply node ↔ retailer (direction pair A)',
    critical: true,
    category: 'DIRECTION_PAIR',
  },
];

export const CRITICAL_MATCH_PAIRS = MATCH_PAIR_COHORT.filter((p) => p.critical);
