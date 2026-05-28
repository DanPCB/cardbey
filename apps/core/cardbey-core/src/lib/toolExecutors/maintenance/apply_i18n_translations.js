import { wrapMaintenanceExecutor } from './wrapMaintenanceExecutor.js';
import { applyI18nTranslations } from '../../intake/i18nMaintenanceTools.js';

export const execute = wrapMaintenanceExecutor(
  'apply_i18n_translations',
  async (input = {}) =>
    applyI18nTranslations({
      gaps: Array.isArray(input.gaps) ? input.gaps : undefined,
      dryRun: Boolean(input.dryRun),
    }),
);
