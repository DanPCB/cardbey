// src/lib/toolExecutors/i18n/reportI18nProgress.js
import { setBlackboardKey } from '../../missionBlackboard.js'

export async function reportI18nProgress({
  missionId,
  filesScanned,
  filesFixed,
  stringsFound,
  stringsWired,
  keysAdded,
  skipped,      // strings flagged for human review
  errors,
  locales,      // locales covered
}) {
  const summary = {
    filesScanned,
    filesFixed,
    stringsFound,
    stringsWired,
    keysAdded,
    skippedForReview: skipped,
    errors,
    localesCovered: locales,
    completionRate: Math.round((stringsWired / stringsFound) * 100),
    updatedAt: new Date().toISOString(),
  }

  await setBlackboardKey(missionId, 'i18n.repairProgress', summary)
  
  console.log('[I18N_PROGRESS]', summary)
  return { ok: true, summary }
}