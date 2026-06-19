# Language Self-Fixing — Phase 1

## What Was Built

- **Read-only language validator** (`apps/core/cardbey-core/src/services/language/languageValidator.js`)
  - Vietnamese quality checks (untranslated en copy, mixed language)
  - Key parity between `en` and `vi` in `i18n.js` (`translation` + `dashboard` namespaces)
- **Preview-only orchestrator** (`languageAgent.js`)
  - Scans i18n + hardcoded gaps via existing `detectI18nGaps()`
  - Generates preview fixes (glossary + optional Groq LLM) — **never writes files**
- **Admin API** (`/api/language/*`, `requireAuth` + `requireAdmin`)
  - `GET /status`, `POST /scan`, `POST /preview`, `GET /previews`, `DELETE /previews`
- **Dashboard hook** (`useLanguageAgent.ts`) — React Query polling + mutations
- **Review UI** (`LanguageFixReview.tsx`) — scan + preview queue (read-only)

## What Was NOT Built (Phase 2+)

- Auto-apply fixes
- Source mutation / `i18n.js` writes
- Component wiring (`wireI18nString`, repair agent integration)
- Scheduled scans
- Fix history persistence (DB)

## Safety Guarantees

| Guarantee | Phase 1 |
|-----------|---------|
| Source mutation | **No** — validator uses read-only file parse; agent never calls apply/repair scripts |
| Auto-apply | **No** — `LANG_AUTO_FIX` defaults to `false`; previews stored in memory only |
| Component wiring | **No** |
| Human approval required for changes | **Yes** (Phase 2+) |

## Environment Variables (observed only in Phase 1)

| Variable | Default | Purpose |
|----------|---------|---------|
| `LANG_AUTO_FIX` | `false` | Gate for future auto-apply (not used in Phase 1) |
| `LANG_AUTO_FIX_THRESHOLD` | `0.9` | Confidence threshold for future auto-apply |
| `GROQ_API_KEY` | — | Optional LLM previews via `groqAdapter` |

## Verification Checklist

| Check | Status |
|-------|--------|
| LanguageValidator validates Vietnamese | ✅ Unit tests |
| LanguageValidator detects mixed language | ✅ Unit tests |
| LanguageAgent runs scan (read-only) | ✅ Route test |
| LanguageAgent generates previews (read-only) | ✅ Route test |
| LanguageRoutes accessible (admin only) | ✅ Auth middleware |
| useLanguageAgent hook works | ✅ Dashboard hook |
| LanguageFixReview UI renders | ✅ Component |
| No source mutation occurs | ✅ No write APIs or apply paths |

## Usage

1. Platform admin opens Control Center → Intelligence Diagnostics (embed `LanguageFixReview` when wired).
2. **Run Scan** — validates `i18n.js` and runs `i18n-detect.mjs` for hardcoded strings.
3. **Preview fix** on an issue — returns suggested Vietnamese copy; stored in server memory until restart.
4. Phase 2 will add approve/reject → governed apply via: rollback.

## Related Tools (existing)

- `apps/dashboard/.../scripts/i18n-detect.mjs` — hardcoded string gaps
- `apps/core/.../src/lib/intake/i18nMaintenanceTools.js` — maintenance bridge
- `apps/core/.../scripts/i18n-repair-agent.mjs` — **not used in Phase 1** (live mutation; separate pipeline)
