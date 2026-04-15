// miTypes.ts

export type MIProductType =
  | 'poster'
  | 'video'
  | 'pdf_report'
  | 'packaging'
  | 'screen_item'
  | 'generic';

export type MIMediaType = 'image' | 'video' | 'pdf' | 'print_layout' | 'text' | '3d';

export type MIBrainRole =
  | 'event_promoter'
  | 'insights_explainer'
  | 'brand_carrier'
  | 'in_store_attractor'
  | 'upseller'
  | 'reminder'
  | 'informer'
  | 'souvenir'
  | 'generic';

export interface MIFormat {
  mediaType: MIMediaType;
  dimensions?: string;       // e.g. "1080x1920"
  orientation?: 'vertical' | 'horizontal' | 'square' | 'flat';
  fileUrl: string;
  previewUrl?: string;
  durationSec?: number;
}

export interface MIOrigin {
  createdByUserId: string;
  createdByEngine: string;   // e.g. "creative_engine_v3"
  sourceProjectId?: string;  // campaign / project / flow id
  createdAt: string;         // ISO
}

export interface MIEnvironmentHints {
  isPhysical?: boolean;
  isOnDeviceEngine?: boolean;
  screenOrientation?: 'vertical' | 'horizontal';
  timeZone?: string;
}

export interface MIContext {
  tenantId?: string;
  storeId?: string;
  campaignId?: string;
  audienceSegments?: string[];
  locales?: string[];        // e.g. ["vi-VN", "en-AU"]
  channels?: string[];       // e.g. ["whatsapp", "facebook", "cnet_screen", "email"]
  environmentHints?: MIEnvironmentHints;
}

export interface MIPersonalisation {
  enabled: boolean;
  modes?: string[];          // "name_injection", "language_switch", ...
}

export interface MILocalisation {
  autoTranslate: boolean;
  fallbackLocale?: string;
}

export interface MIChannelAdaptation {
  enabled: boolean;
  rulesetId?: string;        // e.g. "poster_channel_rules_v1"
}

export interface MIDynamicLayout {
  enabled: boolean;
  allowedVariants?: string[]; // ["1080x1920", "1080x1080", ...]
}

export interface MIDataBinding {
  key: string;               // "event_date"
  source: string;            // "campaign.eventDate"
}

export interface MIDataBindings {
  enabled: boolean;
  bindings?: MIDataBinding[];
}

export interface MICapabilities {
  personalisation?: MIPersonalisation;
  localisation?: MILocalisation;
  channelAdaptation?: MIChannelAdaptation;
  dynamicLayout?: MIDynamicLayout;
  dataBindings?: MIDataBindings;
}

export type MIActionType =
  | 'emit_event'
  | 'notify_orchestrator'
  | 'switch_locale'
  | 'switch_variant';

export interface MIBehaviorAction {
  id?: string;
  condition?: string;        // expression for future rule engine
  action: MIActionType;
  payload?: Record<string, any>;
  cron?: string;             // for onSchedule
}

export interface MIBehaviorRules {
  onView?: MIBehaviorAction[];
  onClick?: MIBehaviorAction[];
  onContextChange?: MIBehaviorAction[];
  onSchedule?: MIBehaviorAction[];
  // For physical / packaging
  onScan?: MIBehaviorAction[];
  // For device/playlist
  onPlaylistEnter?: MIBehaviorAction[];
  onTimeOfDay?: MIBehaviorAction[];
}

export interface MICTA {
  labelKey: string;          // i18n key, e.g. "cta_register_now"
  targetType: 'url' | 'calendar_event' | 'dashboard_link' | 'orchestrator_task';
  targetValue?: string;
  targetValuePath?: string;  // e.g. "campaign.registrationUrl"
}

export interface MICTAPlan {
  primaryCTA?: MICTA;
  secondaryCTAs?: MICTA[];
}

export interface MIAnalyticsPlan {
  kpis?: string[];           // "impressions", "cta_clicks", ...
  attribution?: {
    sourceTag?: string;
    campaignTagPath?: string;
  };
  retention?: {
    eventsTTL?: string;      // "90d"
    aggregatesTTL?: string;  // "1y"
  };
}

export type MIStatus = 'active' | 'paused' | 'expired' | 'draft';

export interface MIRegenerationPolicy {
  autoRegenerate: boolean;
  triggers?: string[];       // "campaign.eventDateChanged"
  regenerationTemplateId?: string;
}

export interface MILifecycle {
  status: MIStatus;
  validFrom?: string;        // ISO
  validTo?: string;          // ISO
  regenerationPolicy?: MIRegenerationPolicy;
}

export interface MIBrain {
  role: MIBrainRole;
  primaryIntent: string;
  secondaryIntents?: string[];
  context?: MIContext;
  capabilities?: MICapabilities;
  behaviorRules?: MIBehaviorRules;
  ctaPlan?: MICTAPlan;
  analyticsPlan?: MIAnalyticsPlan;
  lifecycle?: MILifecycle;
}

export interface MIEntity {
  productId: string;
  productType: MIProductType;
  format: MIFormat;
  origin: MIOrigin;
  miBrain: MIBrain;
}
