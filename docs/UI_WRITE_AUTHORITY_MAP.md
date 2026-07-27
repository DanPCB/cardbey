# UI Write Authority Map — Sprint 2

Inventory of UI-originated write/mutation calls and their runtime authority status.

**Rule (Sprint 2):** Storage upload alone is not execution. State mutation after upload is execution and must route through Performer Runtime.

**Legend**
- **Runtime Routed?** `Yes` = wired through `POST /api/performer/runtime/ui-action` or carries `x-cardbey-runtime-authority` / `runtimeAuthorityContext`.
- **Risk:** `High` = public/customer-facing or durable state; `Medium` = draft-only; `Low` = account/profile.

---

| UI Surface | API Called | Mutation Type | Runtime Routed? | Risk | Action |
| ---------- | ---------- | ------------- | --------------- | ---- | ------ |
| Hero editor (`useHeroUpdate` / `heroMediaPersist`) | `POST /api/performer/runtime/ui-action` (`update_hero_artifact`) | Hero PATCH | **Yes** | High | Primary path via runtime adapter → `updateHeroForStore` |
| Hero upload (`heroMediaUpload`) | `POST /api/stores/:id/upload/hero` or `POST /api/draft-store/:id/upload/hero` | Upload + hero attach | **Yes** (authority header + mission context) | High | Guard on route; UI sends runtime authority |
| Store draft review hero (`StoreDraftReview`) | `update_hero_artifact` via `patchHeroToDraft` | Hero PATCH | **Yes** | High | Sprint 3 — no direct PATCH |
| Draft preview edit (`StoreDraftReview`, onboarding) | `PATCH /api/draft-store/:draftId` | Draft update | No | Medium | Draft-only; not Sprint 2 scope (no publish) |
| Publish snapshot sync | `PATCH /api/draft-store/:id/publish-snapshot` | Snapshot sync | No | Medium | Pre-publish staging; allowed adapter |
| Store publish (`publishSnapshotClient`) | `POST /api/performer/runtime/ui-action` (`publish_store`) | Store publish | **Yes** | High | Routes through runtime → `publishDraft` / snapshot adapter |
| Legacy store publish | `POST /api/stores/publish`, `POST /api/store/publish` | Store publish | **Guarded** | High | Direct route guarded; UI should use runtime |
| Publish draft retry | `POST /api/stores/publish-draft` | Store publish | **Guarded** | High | Guarded; performer console may still call directly |
| Draft-store publish | `POST /api/draft-store/:id/publish` | Store publish | **Guarded** | High | Guarded; snapshot client now uses runtime |
| Mini-website publish modal | `POST /api/performer/runtime/ui-action` (`publish_cardbey` / `publish_custom_domain`) | Hosted site publish | **Yes** | High | Sprint 3 — `source: publish_modal` |
| Signage / playlist publish (`ScreenDeviceCard`, performer) | `POST /api/signage/engine/publish` | Device publish | **Guarded** | High | Guard on route; performer uses `publish_signage` ui-action when wired |
| Campaign launch (performer console) | Intake V2 / `launch_campaign` tool | Campaign publish | **Yes** (runtime-owned dispatch) | High | Via `executeMissionAction` / skill router |
| Campaign deploy tab | Promotion APIs | Campaign state | Partial | High | Channel selection; confirm via proactive-step |
| Explore featured video upload | `POST /api/explore/videos/upload` + authority headers | Explore media | **Yes** (guarded) | High | Sprint 3 — runtime authority on upload/patch/delete |
| Content Studio video render | `render_creative_asset` ui-action | Video render + artifact | **Yes** | High | Sprint 3 — `renderCreativeAssetViaRuntime`; guarded legacy route |
| Slideshow export (client) | Client-side GIF export | Local export | N/A | Low | No server mutation |
| Slideshow generation (performer) | `generate_slideshow` tool | Generated slideshow | **Yes** (runtime) + V1 artifact | High | `registerGeneratedArtifactFromOperational` |
| Video generation (performer) | `video_generate` / `video_execute` | Generated video | **Yes** (runtime) + V1 artifact | High | `registerGeneratedArtifactFromOperational` |
| Raw media upload | `POST /api/uploads/create` | Storage only | **Allowed** | Low | Storage intake — no runtime required |
| Device pairing / playlist CRUD | Device / playlist APIs | Signage config | No | Medium | Phase F / future sprint |
| Social publish | OAuth + social APIs | Social post | Partial | High | Use `publish_social` ui-action from performer |
| Account profile | `PATCH /api/account/*` | Profile | No | Low | Out of store/artifact scope |
| Menu import / extract | `POST /menu/*` | Catalog draft | No | Medium | Draft enrichment; not publish |
| Performer artifact actions | `dispatchPerformerArtifactAction` | Artifact mutation | Partial | High | Unified mode routes some actions; extend ui-action |
| Quick Start / Orchestra | `POST /api/mi/orchestra/start` | Mission create | **Yes** (Sprint 1) | Medium | Runtime adapter |
| Intake V2 submit | `POST /api/performer/intake/v2/*` | Mission pipeline | **Yes** (Sprint 1) | High | Runtime execute |

---

## Upload classification (Sprint 2)

| Path pattern | Classification | Runtime required? |
| ------------ | -------------- | ------------------- |
| `/api/uploads/create` | Storage only | No |
| `/api/stores/*/upload/hero`, `/upload/logo`, `/upload/avatar` | State-changing | **Yes** |
| `/api/draft-store/*/upload/hero` | State-changing | **Yes** |
| `/api/contents/video/render` | State-changing (render + URL) | **Yes** |
| `/api/signage/engine/publish` | State-changing (device state) | **Yes** |

---

## Telemetry

| Event | When |
| ----- | ---- |
| `RUNTIME_AUTHORITY_PATH_USED` | UI write arrives with authority context or via `ui-action` |
| `RUNTIME_AUTHORITY_BYPASS` | Direct UI write without authority (dev: throw; prod: warn) |

---

## Sprint 2 wiring summary

- Backend: `uiWriteAuthorityGuard.js`, `uiRuntimeActionService.js`, `POST /api/performer/runtime/ui-action`
- Dashboard: `uiRuntimeClient.ts`, `heroMediaPersist.ts`, `heroMediaUpload.ts`, `publishSnapshotClient.ts`
- Generated artifacts: `generatedArtifactAuthority.js` (V1 types persisted to `Mission.context.generatedArtifacts`)
