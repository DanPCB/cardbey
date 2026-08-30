# Golden Path Day 1 Gate

## Verdict

**CARDBEY_V1_GOLDEN_PATH_DAY1_UNBLOCKED**

Post-deploy live staging verification completed on 2026-08-30 against merge commit `809200d9bfcf6bbf042bb71cb701292a0f9a374d` (PR #279).

## Deploy confirmation

| Check | Result |
|-------|--------|
| Staging commit (`GET /api/runtime/version`) | `809200d9bfcf6bbf042bb71cb701292a0f9a374d` — matches Day 1 merge |
| Staging environment | `staging` |
| Authoritative Render config | Root `render.yaml` → service `cardbey-core-staging` (`rootDir: apps/core/cardbey-core`) |
| Production commit | `ce82e3fe8793eabb2d23e4641540a9257f282415` (different from Day 1) |
| Mission 001 flags in `main` `render.yaml` | **Absent** — production unchanged |

Mission 001 env flags are not exposed on `/api/health`. Live proof uses create-store runtime output and draft provenance.

---

## LIVE STAGING — Scripted store creation

**Endpoint:** `POST https://cardbey-core-staging.onrender.com/api/performer/intake/v2`  
**Guest session:** `X-Guest-Session` (guest create-store path)

### Input

| Field | Value |
|-------|-------|
| Business name | Market Lane Coffee |
| Website | `https://www.marketlane.com.au` |
| Location | Melbourne |
| Payload | `storeCreateForm` + `primaryMode: create` + `freshStoreMission: true` |

### Canonical path

| Stage | Evidence |
|-------|----------|
| Intake | `action: store_mission_started` |
| Mission ID | `cmtf8gud7001gnhczee32g26y` |
| Pipeline step | `structured_store_build` → **completed** |
| Generation run | `cmtf8gur90023nhczm37i17cl` |
| Draft ID | `cmtf8gwef0025nhcz9gwawtf9` |
| Store ID | `cmtf8n6210046nhczk1q6ce04` |
| Post-build state | `awaiting_input` / `blocked_on_checkpoint` (brand assets checkpoint — expected) |

### Research / catalog proof

**Draft fetch:** `GET /api/stores/temp/draft?generationRunId=cmtf8gur90023nhczm37i17cl`

| Metric | Value |
|--------|-------|
| Draft status | `ready` |
| Offering count | **24** |
| `catalogSource` per item | **24 × `research`** |
| Template items | **0** |
| Sample offerings | Wholesale, Coffee, Equipment, Subscriptions, Classes |
| QA `catalogKind` | `product` |
| QA `catalogPass` | `true` |
| Template fallback | **No** — no `TEMPLATE` catalog source observed |

**PASS criterion:** discoverable real offerings did not silently become a template catalog.

---

## LIVE STAGING — Ask→Create smoke

| Test | Input | HTTP | `action` | Response (preview) | Result |
|------|-------|------|----------|-------------------|--------|
| A | `create my business` + `primaryMode: create` | 200 | `create_store` | "Let's set up your store…" | **PASS** |
| B | `create my store` + `primaryMode: create` | 200 | `create_store` | "Let's set up your store…" | **PASS** |
| C | `create a store and a mini website` | 200 | `clarify` | Runway clarify + store/website options | **PASS** |
| Guest | `create my business` (no primaryMode) | 200 | `create_store` | "Let's set up your store…" | **PASS** |

No generic runway dead-end on clear create intents. Ambiguous dual-runway still clarifies safely.

---

## LIVE STAGING — Factory video smoke

| Test | Input | HTTP | `action` | `isVideoOwnedByCreativeFactory` error | Result |
|------|-------|------|----------|--------------------------------------|--------|
| With store context | `Create a promotional video for Market Lane Coffee` + `storeId` + `missionId` | 200 | `approval_required` | **None** | **PASS** |
| NL factory phrase | `Create a 15 second promotional video ad for Market Lane Coffee` + `storeId` | 200 | `approval_required` | **None** | **PASS** |
| Without resolvable store | `create a promotional video for my store` (guest, no store) | 200 | `clarify` (store picker) | **None** | **PASS** (expected clarify, not runtime error) |

Factory-owned routing reaches approval checkpoint; no `is not a function` regression.

---

## LIVE STAGING — Guest creation smoke

Guest `create my business` → `create_store` (PASS).  
Guest Market Lane form submit → `store_mission_started` with mission + draft + 24 research-backed items (PASS).

**Note:** `storeCreateForm` without `location` returns `MISSING_LOCATION` validation — expected Day 3-era form gate, not a Day 1 regression.

---

## LIVE STAGING — Log / error observation

No Render log API access in this verification session. API-level observation:

- No `isVideoOwnedByCreativeFactory is not a function` in any intake response body
- No 5xx on exercised paths
- No template-catalog silent fallback on Market Lane live draft (24/24 `catalogSource: research`)

---

## Pre-merge validation (unchanged)

| Command | Result |
|---------|--------|
| Targeted intake/video unit tests | **11/11 PASS** |
| Store research pipeline tests | **9/9 PASS** |
| `intakeV2.test.js` `normalizePlan` | 2 pre-existing failures (unrelated) |

---

## Scope completed (Day 1 PR #279)

1. Staging Mission 001 / research flag bundle (root `render.yaml` + mirror)
2. Ask→Create first-hop clarify recovery (`intakeShortcutContext.js`)
3. Video ownership export + static factory import (`createVideoOntology.js`, `factoryIntentRouter.js`)

**Out-of-scope changes:** NONE

---

## Remaining known issues (Days 2–6 — not in scope)

1. Entry CTA / surface convergence (Day 2)
2. `computeMissingStoreCreationFields` relaxation — location still required on form submit (Day 3)
3. Post-create redirect to business preview (Day 4)
4. Orchestra convergence (Day 6)
5. Offering reconstruction telemetry not surfaced on guest draft API for Market Lane (items are research-sourced; reconstruction metadata not in draft payload)

---

## Day 2 readiness

**YES** — Day 1 live gate criteria met on staging. Day 2 entry convergence may begin; do not relax missing-field gates until Day 3.
