# IMPACT REPORT — Pre-backfill gaps (Elementor social, enrich CLI, staging audit)

Date: 2026-08-25  
Branch: rename target `fix/enrichment-pipeline-e2e`  
Status: Gaps 1–2 code; Gap 3 blocked without Render/staging DB from this agent

## (1) What could break

| Risk | Severity |
|------|----------|
| Broader social regex pulls share buttons or non-profile icon links | Medium |
| Protocol-relative / icon-only social paths change candidate `socialLinks` shape for backfill | Low |
| `--url` enrich path accidentally writes candidates if `--testMode` omitted | High if misused — default dryRun when `--url` |
| Staging audit against wrong DATABASE_URL | High |
| Branch rename while dirty tree / remote delete of old branch | Medium (operator coordination) |

## (2) Why

Anison live HTML shows Elementor social `<a class="elementor-social-icon-*" target="_blank">` **with no href** and phone as `+61 (0) XXX XXX XXX` (no `tel:`). Icon-only + protocol-relative fixes still help correctly configured Elementor/Divi/Beaver sites. CLI needs URL smoke without DB candidate. Staging readiness audit requires Render shell / staging `DATABASE_URL`.

## (3) Impact scope

- `socialLinkExtract.ts`, `webExtractors.ts` (phone debug)
- `scripts/enrich-business-candidates-multisource.ts`
- Tests under enrichment `__tests__`
- No Business / DraftStore / BusinessSeed / User writes

## (4) Smallest safe patch

1. Extend social extract: icon-only anchors, protocol-relative URLs, Elementor class+href any order; keep share filter.
2. `extractPhone`: optional debug of first 5 `tel:` hrefs when `CARDBEY_DEBUG_EXTRACT=1`.
3. CLI: `--url` + `--testMode` → in-memory mock candidate, **force dryRun** (never persist TEST batch).
4. Gap 3: operator runs `pnpm audit:discovery:readiness` on Render with staging DB; paste output before live backfill.
