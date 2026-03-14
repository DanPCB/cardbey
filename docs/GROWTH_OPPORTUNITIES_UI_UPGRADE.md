# Growth opportunities UI upgrade — Summary

Display-only upgrade of the "Growth opportunities" block in Mission Execution (ExecutionDrawer). Uses `opportunity.evidence` and severity grouping; Fix/Later/Dismiss behavior unchanged.

---

## Files changed

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/opportunities/formatOpportunity.ts` | **New.** Helpers: `opportunityTitle`, `formatOpportunityEvidence`, `opportunityForecast`, `fixButtonLabel`. |
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/ExecutionDrawer.tsx` | Import helpers; extend opportunity state with `evidence`; group by severity (High impact / Suggested / Optional); render title, summary, evidence line, forecast line; use `fixButtonLabel` for Fix button; add inline note. |

No backend changes.

---

## Before / After

**Before**
- Single flat list of opportunities.
- Each card showed only `summary` and three buttons: "Fix", "Later", "Dismiss".
- No evidence or forecast; no severity grouping.

**After**
- Inline note above the block: *"Cardbey watches visits and scans and suggests the best next actions."*
- Three sections (only rendered if they have items):
  - **High impact** (`severity === "high"`)
  - **Suggested** (`severity === "medium"`)
  - **Optional** (`severity === "low"`)
- Each card shows:
  - **Title** — human-readable (e.g. "Add QR to popular offer", "Grow store traffic", "Recent visitor activity").
  - **Summary** — existing backend summary.
  - **Evidence line** — e.g. "6 views · 0 QR scans (last 7 days)", "1 total signal (last 7 days)", "3 visits in the last 24 hours".
  - **Forecast line** — short italic line (e.g. "Adding a QR code can capture in-person scans.").
- Fix button label by type:
  - `create_qr_for_offer` → "Create QR"
  - `create_offer` → "Launch offer"
  - `publish_intent_feed` → "Publish feed"
  - default → "Queue fix"
- Later and Dismiss unchanged; same accept/PATCH + refetch behavior.

---

## Manual test steps

1. **Data**
   - Use a store mission that has at least one opportunity of each type (`high_views_no_qr`, `low_traffic`, `recent_interest`) and mixed severities so High impact, Suggested, and Optional sections appear.

2. **Titles**
   - Confirm titles are human-readable (no raw strings like `high_views_no_qr`).

3. **Evidence**
   - For `high_views_no_qr`: evidence line shows "X views · Y QR scans (last N days)" with correct counts.
   - For `low_traffic`: "X total signal(s) (last N days)".
   - For `recent_interest`: "X visit(s) in the last 24 hours".

4. **Buttons**
   - Create QR / Launch offer / Publish feed (or "Queue fix") match `recommendedIntentType`.
   - Clicking "Create QR" (or Launch offer / Publish feed) still calls the same accept endpoint and refetches intents + opportunities.

5. **Later / Dismiss**
   - Later removes the item from the list (refetch opportunities).
   - Dismiss removes the item from the list (refetch opportunities).

6. **Empty sections**
   - If there are no high/medium/low opportunities, the corresponding section is not rendered.

7. **Single runway**
   - Fix still queues an IntentRequest (accept); no immediate execution. Messaging remains "queue a mission action".

---

## Polish (v0.1)

- **Queue hint:** Under the primary (Fix) button: *"Queued in Mission (you can run it now)"* so users know the action is queued, not executed immediately.
- **Why? / Show proof:** Collapsed-by-default "Why?" toggle per card; when expanded, shows raw evidence JSON for power users / debugging.
- **Later toast:** On "Later", a toast is shown: *"Snoozed. We'll remind you later."* so the item doesn’t feel like it vanished.
- **Titles (verb + outcome):** Consistent style: "Add QR to popular offer", "Launch an offer to grow traffic", "Publish your feed for discovery".
- **Optional (not implemented):** Dedupe summary vs evidence when summary already contains numbers — left as-is for now.
