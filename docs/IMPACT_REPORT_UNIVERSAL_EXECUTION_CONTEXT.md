# IMPACT REPORT — Universal Execution Context + Loyalty Deliverable UX

## Goal
Promote `resolveExecutionContext` to the only pre-compile store gateway for store-scoped missions, then complete loyalty UX phases (mission identity, brand preview, owner-input card, progressive artifact, smart defaults, completion deliverable).

## What could break
1. **Campaign / offer / promotion intake** — if the generic store gate returns a different clarify shape, chip replay or empty-options clarify could fail.
2. **Loyalty hard-route** — if active-space confirm is too aggressive, users with a session store may get an extra click before compile.
3. **OwnerInputCard** — field submit contract (`POST /owner-input`) must stay identical; only UI changes.
4. **Topology completion** — progressive artifact must not mark mission complete early or skip `present_review`.
5. **Attachment missing-fields clarify** — smart defaults must not skip owner confirmation when confidence is low.

## Why
- Multiple store resolvers (`resolveStoreAmbiguity`, `tryAutoResolveSingleStoreId`, campaign empty clarify) diverge from loyalty’s richer gateway.
- Mission header / owner-input / completion still feel like workflow steps, not a branded deliverable.

## Impact scope
| Area | Risk |
|------|------|
| Intake V2 store gate (all `requiresStore` tools) | Medium |
| Campaign / multi-agent compiler dispatch | Medium |
| Loyalty spine (compile → topology → artifact) | Medium |
| Dashboard: mission header, OwnerInputCard, loyalty cards | Low–Medium |
| Suitcase / publish actions | Low (reuse existing) |

## Smallest safe patch (phased)
1. **Kernel helper** wrapping `resolveExecutionContext` + hydrate hint; replace intake generic block + campaign dispatch store gap.
2. **Mission header** reads `selectedStore` / `executionContext` from mission metadata / intake response.
3. **Brand preview** on store picker (already partial) + header strip after lock.
4. **OwnerInputCard** loyalty miniature preview; same submit API.
5. **Progressive artifact** metadata updates on loyalty node completion (SSE), UI hydrates partial card.
6. **Smart defaults** — skip owner ask when attachment confidence high for reward/stamps; confirm summary when both known.
7. **Completion** — polish `GeneratedLoyaltyProgramCard` actions (Download / Print placeholders where assets missing).

## Proceed
User requested full implementation through finish + testing report.
