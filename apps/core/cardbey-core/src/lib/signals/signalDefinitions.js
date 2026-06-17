/**
 * Canonical signal definitions for Signal Configuration UI and API.
 * Keys align with dashboard memorySignals.ts MEMORY_SIGNAL_KEYS.
 */

/** @typedef {import('./signalDefinitions.types.js').SignalDefinition} SignalDefinition */

/** @type {Record<string, SignalDefinition>} */
export const SIGNAL_DEFINITIONS = {
  low_engagement: {
    name: 'Low Engagement',
    description: 'Store or content engagement is below typical levels',
    category: 'business',
    defaultEnabled: true,
    configurable: true,
    effect: 'Diagnostic engagement analysis before campaigns',
  },
  profile_incomplete: {
    name: 'Profile Incomplete',
    description: 'Business profile is missing key information',
    category: 'business',
    defaultEnabled: true,
    configurable: false,
    effect: 'Profile completion steps before publish',
  },
  campaign_failed_recently: {
    name: 'Recent Campaign Failure',
    description: 'A recent campaign launch did not succeed',
    category: 'business',
    defaultEnabled: true,
    configurable: false,
    effect: 'Review step before retrying campaigns',
  },
  requires_confirmation: {
    name: 'Requires Confirmation',
    description: 'Business memory marks actions as confirmation-required',
    category: 'business',
    defaultEnabled: true,
    configurable: false,
    effect: 'Explicit user confirmation for governed actions',
  },
  high_intent: {
    name: 'High Intent',
    description: 'User shows strong purchase or action intent',
    category: 'session',
    defaultEnabled: true,
    configurable: true,
    effect: 'Reduced confirmation friction',
  },
  exit_intent: {
    name: 'Exit Intent',
    description: 'User may be leaving the session soon',
    category: 'session',
    defaultEnabled: true,
    configurable: true,
    effect: 'Fast-path engagement capabilities',
  },
  short_session: {
    name: 'Short Session',
    description: 'Session duration is unusually brief',
    category: 'session',
    defaultEnabled: true,
    configurable: true,
    effect: 'Condensed workflows',
  },
  exploring: {
    name: 'Exploring',
    description: 'User is browsing and discovering features',
    category: 'session',
    defaultEnabled: true,
    configurable: true,
    effect: 'Discovery-oriented capabilities',
  },
  repeat_visitor: {
    name: 'Repeat Visitor',
    description: 'User has visited multiple times',
    category: 'user_behavior',
    defaultEnabled: true,
    configurable: false,
    effect: 'Personalized recommendations',
  },
  power_user: {
    name: 'Power User',
    description: 'Highly active user with many recent actions',
    category: 'user_behavior',
    defaultEnabled: true,
    configurable: true,
    effect: 'Reduced confirmation friction',
  },
  first_time_user: {
    name: 'First Time User',
    description: 'New user with limited activity',
    category: 'user_behavior',
    defaultEnabled: true,
    configurable: false,
    effect: 'Guided tutorials and tooltips',
  },
  stuck_user: {
    name: 'Stuck User',
    description: 'User repeated the same action without progress',
    category: 'user_behavior',
    defaultEnabled: true,
    configurable: true,
    effect: 'Help and unblock suggestions',
  },
  high_value_cart: {
    name: 'High Value Cart',
    description: 'Cart or order value exceeds a high threshold',
    category: 'user_behavior',
    defaultEnabled: true,
    configurable: false,
    effect: 'Extra confirmation for destructive actions',
  },
  new_store: {
    name: 'New Store',
    description: 'Store was created recently',
    category: 'business',
    defaultEnabled: true,
    configurable: false,
    effect: 'Onboarding-focused planning',
  },
  established_store: {
    name: 'Established Store',
    description: 'Mature store with sustained activity',
    category: 'business',
    defaultEnabled: true,
    configurable: true,
    effect: 'Optimization-focused capabilities',
  },
  high_traffic: {
    name: 'High Traffic',
    description: 'Store receives elevated visitor volume',
    category: 'business',
    defaultEnabled: true,
    configurable: true,
    effect: 'Performance and scaling suggestions',
  },
  low_inventory: {
    name: 'Low Inventory',
    description: 'Product inventory is running low',
    category: 'business',
    defaultEnabled: true,
    configurable: true,
    effect: 'Restock and catalog recommendations',
  },
  seasonal_peak: {
    name: 'Seasonal Peak',
    description: 'Business is in a seasonal demand window',
    category: 'business',
    defaultEnabled: true,
    configurable: true,
    effect: 'Campaign prioritization',
  },
  time_pressure: {
    name: 'Time Pressure',
    description: 'User appears to be in a hurry',
    category: 'session',
    defaultEnabled: true,
    configurable: true,
    effect: 'Expedited workflows',
    thresholdConfigurable: true,
    defaultThreshold: 10,
    thresholdUnit: 'minutes',
  },
  distracted_user: {
    name: 'Distracted User',
    description: 'Session shows irregular action pacing',
    category: 'session',
    defaultEnabled: true,
    configurable: true,
    effect: 'Auto-save progress drafts',
  },
  frustrated_user: {
    name: 'Frustrated User',
    description: 'Recent actions suggest user frustration',
    category: 'session',
    defaultEnabled: true,
    configurable: true,
    effect: 'Simplified next steps',
  },
  comparison_mode: {
    name: 'Comparison Mode',
    description: 'User is comparing multiple products or stores',
    category: 'session',
    defaultEnabled: true,
    configurable: true,
    effect: 'Side-by-side guidance',
  },
  weekend_user: {
    name: 'Weekend User',
    description: 'User is active on a weekend day',
    category: 'user_behavior',
    defaultEnabled: true,
    configurable: true,
    effect: 'Batch operations and scheduled publishing',
  },
  mobile_user: {
    name: 'Mobile User',
    description: 'User is on a mobile device',
    category: 'technical',
    defaultEnabled: true,
    configurable: true,
    effect: 'Simplified UI and confirmation on destructive actions',
  },
  night_owl: {
    name: 'Night Owl',
    description: 'User is active late at night',
    category: 'session',
    defaultEnabled: true,
    configurable: true,
    effect: 'Reduced friction and fewer interruptions',
  },
  early_bird: {
    name: 'Early Bird',
    description: 'User is active early in the morning',
    category: 'session',
    defaultEnabled: true,
    configurable: true,
    effect: 'Priority processing and quick actions',
  },
  team_account: {
    name: 'Team Account',
    description: 'Business has multiple team members',
    category: 'user_behavior',
    defaultEnabled: true,
    configurable: true,
    effect: 'Collaboration and approval workflows',
  },
  trial_expiring: {
    name: 'Trial Expiring',
    description: 'Trial period is ending soon',
    category: 'business',
    defaultEnabled: true,
    configurable: true,
    effect: 'Upgrade prompts and feature highlights',
    thresholdConfigurable: true,
    defaultThreshold: 7,
    thresholdUnit: 'days',
  },
  at_risk_churn: {
    name: 'At Risk Churn',
    description: 'User inactivity suggests potential churn',
    category: 'business',
    defaultEnabled: true,
    configurable: true,
    effect: 'Retention offers and outreach',
    thresholdConfigurable: true,
    defaultThreshold: 30,
    thresholdUnit: 'days',
  },
  rapid_growth: {
    name: 'Rapid Growth',
    description: 'Business is growing quickly',
    category: 'business',
    defaultEnabled: true,
    configurable: true,
    effect: 'Capacity upgrade suggestions',
    thresholdConfigurable: true,
    defaultThreshold: 10,
    thresholdUnit: 'users',
  },
  enterprise_tier: {
    name: 'Enterprise Tier',
    description: 'Customer is on an enterprise or business plan',
    category: 'business',
    defaultEnabled: true,
    configurable: false,
    effect: 'Reduced friction and advanced features',
  },
  integration_active: {
    name: 'Integration Active',
    description: 'External services are connected',
    category: 'business',
    defaultEnabled: true,
    configurable: true,
    effect: 'Cross-platform and automation suggestions',
  },
  content_creator: {
    name: 'Content Creator',
    description: 'User produces content frequently',
    category: 'content',
    defaultEnabled: true,
    configurable: true,
    effect: 'Batch upload and template tools',
    thresholdConfigurable: true,
    defaultThreshold: 10,
    thresholdUnit: 'uploads',
  },
  social_active: {
    name: 'Social Active',
    description: 'User is active on social channels',
    category: 'content',
    defaultEnabled: true,
    configurable: true,
    effect: 'Cross-posting and analytics suggestions',
    thresholdConfigurable: true,
    defaultThreshold: 5,
    thresholdUnit: 'posts',
  },
  offer_creator: {
    name: 'Offer Creator',
    description: 'User creates promotions often',
    category: 'content',
    defaultEnabled: true,
    configurable: true,
    effect: 'Offer templates and scheduled campaigns',
    thresholdConfigurable: true,
    defaultThreshold: 3,
    thresholdUnit: 'offers',
  },
  analytics_consumer: {
    name: 'Analytics Consumer',
    description: 'User frequently views dashboards and reports',
    category: 'content',
    defaultEnabled: true,
    configurable: true,
    effect: 'Advanced analytics and custom reports',
    thresholdConfigurable: true,
    defaultThreshold: 5,
    thresholdUnit: 'views',
  },
  support_seeker: {
    name: 'Support Seeker',
    description: 'User has sought help or opened support tickets',
    category: 'content',
    defaultEnabled: true,
    configurable: true,
    effect: 'Proactive help and guided tours',
    thresholdConfigurable: true,
    defaultThreshold: 3,
    thresholdUnit: 'help views',
  },
  slow_connection: {
    name: 'Slow Connection',
    description: 'Network conditions are degraded',
    category: 'technical',
    defaultEnabled: true,
    configurable: true,
    effect: 'Lightweight capabilities and optimized assets',
  },
  low_power_mode: {
    name: 'Low Power Mode',
    description: 'Device battery is low and not charging',
    category: 'technical',
    defaultEnabled: true,
    configurable: false,
    effect: 'Reduced background operations',
  },
  offline_mode: {
    name: 'Offline Mode',
    description: 'User is offline',
    category: 'technical',
    defaultEnabled: true,
    configurable: false,
    effect: 'Queue actions for later sync',
  },
  high_resolution: {
    name: 'High Resolution',
    description: 'User has a large display',
    category: 'technical',
    defaultEnabled: true,
    configurable: true,
    effect: 'Enhanced visuals and information density',
  },
  accessibility_mode: {
    name: 'Accessibility Mode',
    description: 'User prefers reduced motion or high contrast',
    category: 'technical',
    defaultEnabled: true,
    configurable: true,
    effect: 'Accessible UI preferences',
  },
};

export function getSignalDefinitions() {
  return SIGNAL_DEFINITIONS;
}

export function normalizePreferencesRow(row) {
  if (!row) {
    return { enabledSignals: [], disabledSignals: [], customThresholds: {} };
  }
  const parseJsonArray = (value) => {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    }
    return [];
  };
  const parseJsonObject = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    return {};
  };
  return {
    enabledSignals: parseJsonArray(row.enabledSignals),
    disabledSignals: parseJsonArray(row.disabledSignals),
    customThresholds: parseJsonObject(row.customThresholds),
  };
}
