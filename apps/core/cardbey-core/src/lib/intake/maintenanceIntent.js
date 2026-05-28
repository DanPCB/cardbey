export const MAINTENANCE_INTENT_PHRASES = [
  'check for errors',
  'check for max depth',
  'fix errors',
  'audit the codebase',
  'what errors are there',
  'check and fix',
  'run maintenance',
  'self patch',
  'fix that',
  'give report',
  'error report',
  'check for bugs',
  'find bugs',
  'max depth error',
  'maximum update depth',
  'what is failing',
  'show me the blockers',
  'what needs fixing',
  'system health',
  'deployment status',
  'control tower',
  'what is broken',
  'overall status',
  'health check',
  'run a health check',
];

export const I18N_MAINTENANCE_PHRASES = [
  'check translation coverage',
  'find missing translations',
  'update translations',
  'sync i18n',
  'translate new strings',
];

export const I18N_SYNC_PHRASES = [
  'update translations',
  'sync i18n',
  'translate new strings',
];

export function isI18nMaintenanceIntent(userMessage) {
  const lower = String(userMessage || '').toLowerCase();
  return I18N_MAINTENANCE_PHRASES.some((phrase) => lower.includes(phrase));
}

/** @returns {'check' | 'sync'} */
export function getI18nSyncMode(userMessage) {
  const lower = String(userMessage || '').toLowerCase();
  const wantsSync = I18N_SYNC_PHRASES.some((phrase) => lower.includes(phrase));
  return wantsSync ? 'sync' : 'check';
}

export function isMaintenanceIntent(userMessage) {
  const lower = String(userMessage || '').toLowerCase();
  if (isI18nMaintenanceIntent(userMessage)) return false;
  return MAINTENANCE_INTENT_PHRASES.some((phrase) => lower.includes(phrase));
}

