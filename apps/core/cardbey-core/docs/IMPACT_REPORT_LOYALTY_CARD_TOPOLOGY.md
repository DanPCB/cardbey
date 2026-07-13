# Impact Report — Loyalty Card Topology Detection

## Objective
Preserve physical loyalty-card layout (rows × columns, purchase vs reward cells) instead of collapsing to generic 2×5 / 10-stamp template.

## Source files involved

| Layer | Files |
|-------|-------|
| Vision extract | `src/lib/toolExecutors/loyalty/loyaltyCardVisionExtract.js` |
| Topology lib (new) | `src/lib/loyalty/loyaltyTopologyTypes.js`, `defaultLoyaltyCardTopology.js`, `loyaltyTopologyValidation.js`, `loyaltyRuleInference.js`, `loyaltyTopologyExtraction.js`, `loyaltyTopologyTelemetry.js` |
| Draft / persist | `loyaltyProgramDraft.js`, `persistLoyaltyProgramDraftToStore.js`, `writeLoyaltyProgramFromMission.js`, `generatedLoyaltyProgramService.js`, `loyaltyProgressiveArtifact.js` |
| Mission spine | `loyaltyStageHandlers.js`, `topologyExecutionDraft.js` |
| Prisma | `LoyaltyProgram` in sqlite/postgres/schema |
| Frontend renderer | `DigitalLoyaltyCardPreview.tsx`, `OwnerInputCard.tsx`, `TopologyReviewCardSlot.tsx`, `GeneratedLoyaltyProgramCard.tsx` |
| Frontend lib (new) | `lib/loyalty/loyaltyTopologyTypes.ts`, `renderLoyaltyTopology.ts` |

## Current data contract

- `preseededDraft`: `{ requiredStamps, reward, programName, ... }` — no grid
- `LoyaltyProgram`: `{ name, stampsRequired, reward }` — no topology JSON
- Renderer: `stampThreshold ≤ 10 → 5 cols`, reward on last slot only

## Default template owner

- **Visual**: `DigitalLoyaltyCardPreview.tsx` (`cols = 5` when threshold ≤ 10)
- **Count fallback**: `loyaltyProgramDraft.js` (9/10), persist `?? 9`

## First topology-loss point

**`extractLoyaltyCardFromImage`** (`loyaltyCardVisionExtract.js`) — LLM prompt requests only `stampsRequired` + `rewardDescription`. Physical grid never captured.

**Hard discard**: `persistLoyaltyProgramDraftToStore` / `writeLoyaltyProgramFromMission` write only scalar fields to Prisma.

## Migration requirement

Add nullable fields to `LoyaltyProgram`:
- `ruleJson`, `cardTopologyJson`, `layoutSource`, `layoutConfidence`, `layoutReviewedAt`, `layoutReviewedBy`

Existing rows: unchanged; renderer uses `DEFAULT_LOYALTY_CARD_TOPOLOGY` when `cardTopologyJson` is null.

## Compatibility risks

| Risk | Mitigation |
|------|------------|
| Simple programs without topology break | Fallback to default 2×5 when no `cardTopologyJson` |
| API shape change | Additive `rule` + `cardTopology` on draft/read responses |
| Wrong threshold from total cells | Rule inference uses per-cycle purchase count, not total cells |
| Low-confidence extraction | `reviewRequired: true`; owner can edit or choose simplified layout |

## Smallest safe patch (this implementation)

1. Add topology extraction stage + rule inference (no intake-router branch)
2. Carry `rule` + `cardTopology` through draft artifact
3. Persist JSON on `LoyaltyProgram`
4. Topology-driven renderer with explicit default fallback + telemetry
