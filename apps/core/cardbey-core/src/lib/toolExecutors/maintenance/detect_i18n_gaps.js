import { wrapMaintenanceExecutor } from './wrapMaintenanceExecutor.js';
import { detectI18nGaps } from '../../intake/i18nMaintenanceTools.js';

export const execute = wrapMaintenanceExecutor('detect_i18n_gaps', async () => detectI18nGaps());
