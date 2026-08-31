/**
 * Re-export EOI confirmation builders from the Global Live EOI module.
 * Prefer importing from `lib/globalLiveEoi/confirmationEmailTemplates.js`.
 */

export {
  buildEoiConfirmationEmail,
  buildEoiConfirmationEmailV2,
} from '../../../lib/globalLiveEoi/confirmationEmailTemplates.js';
export {
  isEoiApplicantTrackingEnabled,
  isEoiConfirmationEmailV2Enabled,
} from '../../../lib/globalLiveEoi/flags.js';
