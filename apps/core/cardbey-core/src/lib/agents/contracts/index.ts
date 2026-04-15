export interface GeoContext {
  suburb: string | null;
  state: string | null;
  country: string;
  timezone: string;
}

export interface Competitor {
  name: string;
  priceRange: { low: number; high: number };
  promotionFrequency: 'high' | 'medium' | 'low';
  notes: string | null;
}

export interface MarketReport {
  goal: string;
  location: GeoContext;
  competitors: Competitor[];
  audienceProfile: {
    peakDays: string[];
    peakHours: string[];
    demographics: string;
  };
  pricingBenchmark: { low: number; mid: number; high: number };
  recommendedDiscount: number;
  seasonalFactors: string[];
  confidence: 'high' | 'medium' | 'low';
  generatedAt: string;
}

export interface ScheduledAction {
  day: number;
  offsetHours: number;
  skillName: string;
  input: Record<string, unknown>;
  label: string;
}

export interface ExecutionPlan {
  title: string;
  goal: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  discountPercent: number | null;
  targetProductId: string | null;
  targetProductName: string | null;
  channels: Array<'social' | 'screens' | 'hero' | 'email'>;
  schedule: ScheduledAction[];
  estimatedReach: number | null;
  budget: 'standard' | 'boosted' | 'minimal';
  rationale: string;
  marketReportRef: string | null;
}

export interface SocialPost {
  day: number;
  platform: 'instagram' | 'facebook' | 'tiktok' | 'x';
  copy: string;
  hashtags: string[];
  imagePrompt: string | null;
}

export interface ContentBundle {
  heroHeadline: string;
  heroSubline: string;
  productDescription: string | null;
  socialPosts: SocialPost[];
  emailSubject: string | null;
  emailBody: string | null;
}

export interface CronJob {
  fireAt: string;
  skillName: string;
  input: Record<string, unknown>;
  label: string;
  status: 'pending' | 'fired' | 'failed';
}

export interface ScheduleBundle {
  missionRunId: string;
  cronJobs: CronJob[];
  timezone: string;
}

export interface LeadEntry {
  customerId: string | null;
  customerName: string | null;
  intent: 'purchase' | 'inquiry' | 'complaint' | 'other';
  message: string;
  channel: string;
  autoReplied: boolean;
  flaggedForOwner: boolean;
  createdAt: string;
}

export interface LeadLog {
  missionRunId: string;
  entries: LeadEntry[];
  totalInquiries: number;
  conversionRate: number | null;
}

export interface Ballot {
  voterId: string;
  score: number;
  vote: 'approve' | 'revise' | 'block';
  reasons: string[];
  suggestions: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface ConsensusResult {
  finalScore: number;
  outcome: 'approved' | 'revise' | 'blocked';
  ballots: Ballot[];
  revisionSuggestions: string[];
  roundNumber: number;
  summary: string;
}

// ─── Content plan (Step 5 — Content Creator) ─────────────────────────────────

export interface ContentPlanSocialPost {
  platform: 'instagram' | 'facebook' | 'tiktok';
  copy: string;
  hashtags: string[];
  visualNote?: string;
}

export interface SocialPostSet {
  posts: ContentPlanSocialPost[];
}

export interface EmailCopy {
  subjectLine: string;
  previewText: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl?: string;
}

export interface PromoCopy {
  headline: string;
  subheadline: string;
  terms: string;
  badgeText: string;
}

export interface EmailAndPromoCopy {
  email: EmailCopy;
  promo: PromoCopy;
}

export interface ContentPlan {
  generatedAt: string;
  storeName: string;
  campaignTitle: string;
  social: SocialPostSet;
  emailAndPromo: EmailAndPromoCopy;
  summary: string;
}
