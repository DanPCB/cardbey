# Draft Review link dedupe — Mission Execution drawer

Single primary CTA for "Open Draft Review"; duplicates removed or demoted.

---

## Files changed

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/ExecutionDrawer.tsx` | Canonical `draftReviewUrl`; step card no longer shows Draft Review or Open preview when `draftReviewUrl` exists; Next-step CTA only; Output primary excludes "Open Draft Review" when `draftReviewUrl` exists; Report primary excludes it and adds small "Draft Review" under Advanced. |
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/missionActionQueue.ts` | `ActionQueueInputs.draftReviewHref` renamed to `draftReviewUrl`; usages updated. |

---

## Before / After

**Before**
- "Open Draft Review" appeared in three places: (1) step card on execute-tasks ("Review products", "Fix warnings") and sometimes report ("Open preview"), (2) Next-step CTA card, (3) Output block primary links and/or Report section links.
- Multiple identical or overlapping CTAs.

**After**
- **Single primary CTA:** "Next step: Review your store before publishing" with one "Open Draft Review" button (only when `draftReviewUrl` exists and mission completed).
- **Step card:** When `draftReviewUrl` exists, no links in the step card (no "Review products", "Fix warnings", no "Open preview" there). When it does not exist, report step can still show "Open preview" if `previewHref` is set.
- **Output block:** "Open Draft Review" is omitted from the primary links list when `draftReviewUrl` exists (so it is not duplicated with the Next-step CTA).
- **Report section:** "Open Draft Review" is removed from report primary links; a small "Draft Review" text link is available under Advanced (with any debug link) so the path remains available without a second prominent CTA.
- **Advanced debug:** Unchanged; pipeline runtime (debug) link still shown where applicable.

---

## Manual test steps

1. **One-click to Draft Review**
   - Open a store mission that has a draft (completed or running). Open the Mission Execution drawer.
   - Confirm a single clear "Open Draft Review" primary action: the **Next step** card ("Next step: Review your store before publishing" with button "Open Draft Review").
   - Click it once and confirm it opens Draft Review.

2. **No duplicate CTAs**
   - In the same mission/drawer, confirm there is no second "Open Draft Review" or "Review products" / "Fix warnings" in the step cards.
   - Confirm the Output block (if shown) does not list "Open Draft Review" when the Next-step CTA is visible.
   - Confirm the Report section (if shown) does not show "Open Draft Review" as a primary link.

3. **Advanced / Draft Review fallback**
   - In the Report section, when report has links, confirm a small "Draft Review" link appears under Advanced (below any debug link).
   - Click it and confirm it opens Draft Review.

4. **Open preview when no Draft Review URL**
   - For a mission where `draftReviewUrl` is not set but `previewHref` is (e.g. storeId without draft), confirm the report step can still show an "Open preview" link in the step card where intended.

5. **Action queue / pending intent**
   - With a pending intent from Draft Review, confirm the action queue still shows "Open Draft Review" as the primary link for that pending item (unchanged behavior).
