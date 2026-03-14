# MI Assistant → Mission Execution Wiring (Single Runway)

## 1. MI Assistant entry points found (audit)

| Source | Location | Previous behavior | New behavior when `missionId` present |
|--------|----------|-------------------|----------------------------------------|
| **Improve dropdown** | `ImproveDropdown.tsx` | MISSION_GOALS: `startMissionFromGoal` + navigate; GATED_GOALS: `dispatchMissionIntent` + navigate | All improve goals queue via `createMissionIntent`; toast "Queued in Mission. Open Mission Process to run."; no direct run, no auto-navigate |
| **MI Helper Panel suggestion chips** | `MIHelperPanel.tsx` | Set prompt + intent in store; user could Send (direct `sendMI` → executor) | Chip click → `queueMIAssistantIntent` with mapped intent type + lineage; toast; close panel |
| **MI Helper Panel Send (typed)** | `MIHelperPanel.tsx` | `sendMI()` → DryRun/Real executor (direct) | `submitMIAssistantMessageToMission`; toast; clear prompt |
| **Create Smart Promotion (product card / ambient)** | `StoreDraftReview.tsx` `handleCreatePromotion` | `runWithAuth` → `createPromoDraftAndNavigate` (direct API) | `queueMIAssistantIntent` with `create_smart_promotion`, productId, productName; toast |
| **Rewrite description (Ambient MI)** | `StoreDraftReview.tsx` `onRewriteDescription` | Open edit drawer (read-only) | When `missionId`: `handleAssistantRewriteQueueToMission` → `queueMIAssistantIntent` with `rewrite_descriptions` + productId; toast |
| **Open MI Assistant (ambient)** | `AmbientMIAssistant.tsx` | Opens MI panel or `onCreatePromotion()` | Unchanged; Create Promo path goes through `handleCreatePromotion` (now queues when missionId) |

## 2. Files changed

- **`apps/dashboard/cardbey-marketing-dashboard/src/lib/missionIntent.ts`**
  - Added `MI_PRESET_TO_INTENT_TYPE` (preset id → intent type).
  - Added `QueueMIAssistantIntentParams`, `queueMIAssistantIntent()`.
  - Extended `getIntentLabel` for `fill_missing_images`, `repair_product_images`, `create_smart_promotion`, `add_items`.

- **`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ImproveDropdown.tsx`**
  - When `missionId` is set, all goals in `QUEUE_WHEN_MISSION` (generate_tags, rewrite_descriptions, fill_missing_images, repair_product_images, generate_store_hero) queue via `createMissionIntent` and show toast; no `startMissionFromGoal` or `dispatchMissionIntent` for those.
  - When `missionId` is not set, MISSION_GOALS still use `startMissionFromGoal` and navigate.

- **`apps/dashboard/cardbey-marketing-dashboard/src/features/mi/MIHelperPanel.tsx`**
  - New props: `missionId`, `storeId`, `draftId`, `generationRunId`.
  - When `missionId` is set: suggestion chip click → `queueMIAssistantIntent` (intent from `MI_PRESET_TO_INTENT_TYPE`), toast, close panel.
  - When `missionId` is set: Send (Enter or button) → `submitMIAssistantMessageToMission`, toast, clear prompt.
  - When `missionId` is not set: unchanged (openMI / sendMI).

- **`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`**
  - Import `queueMIAssistantIntent`.
  - `handleCreatePromotion`: when `missionId` and `productId`, queue `create_smart_promotion` with entity context, toast, return.
  - `handleAssistantRewriteQueueToMission`: when `missionId`, queue `rewrite_descriptions` with productId/productName, toast.
  - `MIHelperPanel` receives `missionId`, `storeId`, `draftId`, `generationRunId`.
  - `AmbientMIAssistant` `onRewriteDescription`: when `missionId` use `handleAssistantRewriteQueueToMission`, else `handleAssistantRewriteDescription`.

## 3. Shared mapping table (MI → Mission intent types)

Defined in `missionIntent.ts` as `MI_PRESET_TO_INTENT_TYPE`:

| Preset / suggestion id | Intent type |
|------------------------|-------------|
| tags | generate_tags |
| rewrite | rewrite_descriptions |
| hero | generate_store_hero |
| smart_promo | create_smart_promotion |
| add_items | add_items |
| catalog_autofill | autofill_product_images |
| product_rewrite | rewrite_descriptions |
| category_add_items | add_items |
| category_cleanup | rewrite_descriptions |
| (fallback) | mi_assistant_message |

User-facing labels from `getIntentLabel()` (e.g. for Mission Inbox): Generate tags, Rewrite descriptions, Generate hero, Create smart promotion, Auto-fill missing images, Repair wrong images, Add items, MI Assistant message, etc.

## 4. Intent payload shape

- **`queueMIAssistantIntent`** builds payload with: `source: 'mi_assistant'`, optional `message`, `storeId`, `draftId`, `generationRunId`, `entityType`, `entityId`, `productId`, `productName`, `categoryId`, `categoryLabel`, plus any `params.payload`.
- **`submitMIAssistantMessageToMission`** (typed message): `type: 'mi_assistant_message'`, payload: `message`, `source: 'mi_assistant'`, optional `storeId`, `draftId`, `generationRunId`.
- **ImproveDropdown** payload: `storeId`, `draftId`, `generationRunId`, `productIds`, `source: 'mi_assistant'`.

## 5. Manual verification checklist

- **Flow A — Suggestion chip**  
  1. Open draft/product editing with `?missionId=...` in URL.  
  2. Open MI Assistant, click "Generate tags".  
  3. Expect: toast "Queued in Mission. Open Mission Process to run."; panel closes; no direct execution.  
  4. Open Mission Process / Mission Inbox; expect "Generate tags" (or equivalent) intent.

- **Flow B — Entity-specific promotion**  
  1. Open a product card (e.g. Boutonnière), trigger "Create smart promotion" (card hover or Open MI Assistant → Create Smart Promotion).  
  2. With `missionId` in URL: expect intent queued, toast; payload includes productId/productName.  
  3. Mission Inbox shows entity-specific intent (e.g. Create smart promotion for Boutonnière).  
  4. No read-only dead end; no direct create-promo API from this path when missionId present.

- **Flow C — Typed assistant message**  
  1. Type a custom request in MI Assistant, click Send.  
  2. With `missionId`: expect "Queued in Mission..." toast; no direct sendMI/executor.  
  3. Mission Inbox updated with `mi_assistant_message` (or equivalent).

- **Flow D — No missionId fallback**  
  1. Open draft without `missionId` in URL.  
  2. Click "Generate tags" in Improve dropdown: expect existing behavior (start mission + navigate to Mission Console).  
  3. MI Panel suggestion chip: expect prompt set in panel (no queue).  
  4. Send: expect existing `sendMI()` (dry run / real executor).  
  5. Create Smart Promotion: expect existing flow (createPromoDraftAndNavigate).  
  6. Rewrite description (ambient): expect open edit drawer.

- **Flow E — Lineage integrity**  
  1. With account that has multiple stores, open draft for store A with `missionId`.  
  2. Trigger MI action (e.g. Generate tags, Create smart promotion for a product).  
  3. Expect queued intent payload to contain correct storeId/draftId/generationRunId and product/category when applicable.

## 6. Single Runway guardrails (unchanged)

- `assertNoDirectOrchestraWhenMissionId`: still used in ImproveDropdown before any direct orchestra start when missionId is not set (other goals still can call orchestra when no missionId).
- `assertNoDirectChatScopeWhenMissionId`: available for any chat/resolve-scope path; MI Assistant now queues when missionId.
- No direct orchestra from artifact pages when missionId is present: all Improve actions with missionId now queue only.
- No direct chat scope when missionId present: typed Send and chips use queue path.

## 7. Remaining follow-up / gaps

- **Mission Inbox display**: Backend/ExecutionDrawer already list intents; ensure new intent types (e.g. `create_smart_promotion`, entity-scoped titles) are displayed with labels from `getIntentLabel` and optional evidence (e.g. "Product: Boutonnière"). Any backend changes for intent title/summary are out of scope of this frontend-only wiring.
- **MI Shell V1**: When `MI_SHELL_V1` is true, `MIHelperPanel` is not rendered in StoreDraftReview; if a separate MI Shell panel is used, it should receive `missionId` and lineage and use the same queue path (same bridge and mapping).
- **Optional CTA**: Current UX is toast only. Adding an explicit "Open Mission Process" link/button next to the toast can be a follow-up.
