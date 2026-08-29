# Business Space — Social Platform Convergence V1

**Target:** `BUSINESS_SPACE_SOCIAL_LAYER_V1_READY`  
**Date:** 2026-08-29  
**Scope:** Audit + convergence assessment on the shared Global feed runtime  
**Runtime path:** `BusinessSpaceTheatreCanvas` → `PublicFeedShell` → `ArtifactFeed`  
**Verdict (social audit phase):** `BUSINESS_SPACE_SOCIAL_LAYER_V1_PARTIAL` — see [Final verdict](#final-verdict)

**Follow-up (Activity Engagement V1):** `CARDBEY_ACTIVITY_ENGAGEMENT_V1_READY` — see [`CARDBEY_ACTIVITY_LEVEL_ENGAGEMENT_V1.md`](CARDBEY_ACTIVITY_LEVEL_ENGAGEMENT_V1.md)

---

## Executive summary

Business Space already rides the **same** `PublicFeedShell` / `FloatingFeedActionRail` / `useStoreEngagement` stack as Global. Presence convergence (PR #249) wired business-scoped rail profile, share semantics, follow, phone, QR, Performer, and right-rail context modules.

**Operational today (store-scoped):** Follow, Like, Save, Share, Phone, QR, mobile Post (owner), Performer, real follower counts, ConnectedPresence links, Live/Shows timeline projection, SHARE BUSINESS vs SHARE ACTIVITY.

**Not converged / platform gaps:** Activity-level reactions & comments, public Messenger, notifications, business DM, linked-business data, follower lists, desktop Post adaptation, customer reviews.

No new Business feed, theatre redesign, or `SpaceShell` restoration was performed in this phase.

---

## Architecture (locked)

```
Global                          Business Space
──────                          ──────────────
Ranked multi-business stream    One-business chronological stream
PublicFeedShell                 PublicFeedShell (lensId: business-space)
FloatingFeedActionRail          FloatingFeedActionRail (railProfile: business-space)
useFeedRailEngagement           useFeedRailEngagement (entity + activity scopes)
ArtifactFeed                    ArtifactFeed                 ← same component
```

Visit store remains explicit: `/s/:slug` — not confused with `/space/:id`.

---

## Social context (§2) — reuse, do not duplicate

There is **no** `SocialSurfaceContext` type. Equivalent infrastructure already exists; a new type is **not** required for V1.

| Conceptual field | Cardbey equivalent | Location |
|------------------|-------------------|----------|
| `surface: GLOBAL \| BUSINESS_SPACE \| PERSONAL_SPACE` | `ActiveSpaceContext.type` + `inSpaceShell` + `PublicFeedShell` `lensId` | `activeSpaceContext.ts`, theatre overrides |
| `viewerId` | `useCurrentUser().user?.id` + `engagementRequestHeaders()` viewer key | `viewerKey.ts`, `useStoreEngagement` |
| `businessId` / `storeId` | `ActiveSpaceContext.storeId`, `BusinessSpaceRuntime.identity` | `businessSpaceRuntime.ts` |
| `personalId` | `ActiveSpaceContext.personalId` | `activeSpaceContext.ts` |
| `artifactId` | `FeedArtifact.id` (e.g. `timeline:lifecycle:{sourceId}`) | `projectBusinessTimelineToFeedArtifacts.ts` |
| `sourceType` / `sourceId` | `FeedArtifact.sourceType` + `sourceId` → `resolveArtifactEngagement()` | `resolveArtifactInteractionTarget.ts`, `businessTimelineContract.ts` |
| `permissions` | `BusinessSpaceRuntime.viewer.role`, `isOwner`, capability manifest | `SpacePage.tsx`, `businessSpaceCapabilities.ts` |
| Performer handoff envelope | `surfaceContext` / `toPerformerBusinessSpaceSurfaceContext()` | `launchPerformerEntrypoint.ts`, `routeSpacePostAction.ts` |
| Rail capability profile | `FeedRailProfile`: `'global' \| 'business-space'` | `businessSpaceRailProfile.ts` |

**Design constraint for Personal Space (deferred):** Shared components must key off `ActiveSpaceContext` + `FeedRailProfile`, not hard-coded `business` strings.

---

## Social capability matrix (§27)

Status key: **OPERATIONAL** · **PARTIAL** · **UI_ONLY** · **PLACEHOLDER** · **MISSING**

| Capability | Backend model / API | Frontend component | Global | Business Space | Personal Space | Shared source identity | Status |
|------------|---------------------|-------------------|--------|----------------|---------------|------------------------|--------|
| **Follow** | `StoreFollow` · `POST /api/public/store-engagement/:storeId/follow` | `useStoreEngagement`, `SpaceFollowButton`, `FeedRailEngagementStats` | ✓ rail | ✓ rail + right rail | N/A (deferred) | **Store** (`storeId`) | **OPERATIONAL** |
| **Followers** | `followersCount` on engagement summary | `SpaceContextRail` connect module | Count in rail | Count in right rail | — | Store-level count | **PARTIAL** (count only; no list API/UI) |
| **Connections** | `UserConnection` · `/api/connections` (user↔user) | `SpaceConnectionsPanel`, contact-sync | — | Personal route only | ✓ | User graph, not business | **PARTIAL** (wrong domain for business network) |
| **Linked businesses** | — (no store↔store relation API) | `SpaceContextRail` linked module | — | Empty unless `businesses[]` passed | Owner businesses list | — | **PLACEHOLDER** |
| **Like / reaction** | `StoreReaction` (store hero) · `ContentInteractionMetrics` (activity) | `useFeedRailEngagement` → `FeedRailEngagementStats` · `SocialInteractionBar` (shows) | ✓ store hero | ✓ activity on timeline | — | **`sourceType:sourceId`** on timeline; store on hero | **OPERATIONAL** (activity); store hero unchanged |
| **Comment** | `commentsCount` field on metrics; **no POST/GET thread API** | `openComments()` → toast “coming soon” | UI stub | Not on rail | — | — | **UI_ONLY** |
| **Share** | `POST .../share` (store + content) | `FeedRailEngagementStats`, share sheet, `businessSpaceRailProfile` | ✓ activity URL | ✓ SHARE BUSINESS + SHARE ACTIVITY | — | Store share; activity URL via artifact id | **OPERATIONAL** |
| **Save** | `StoreSave` · store-engagement API | `FeedRailEngagementStats` | ✓ store hero | ✓ store hero only | — | Store (activity save deferred — no content-interactions save) | **OPERATIONAL** (entity only) |
| **Message / chat** | `/api/threads` (agent/mission threads) | `ThreadListView`, `FloatingMIChat` | Console/back-office | Performer icon only (not business DM) | — | — | **PARTIAL** |
| **Notifications** | — | `NotificationBell` (console placeholder) | Not in `PublicFeedChrome` | Not in public header | — | — | **PLACEHOLDER** |
| **Messenger** | — | Share-channel label in `SocialIdentityRow` only | Not in public header | Not in public header | — | — | **MISSING** (public inbox) |
| **Phone** | Store phone on public store payload | `FloatingFeedActionRail` phone action | ✓ | ✓ (`storePhoneInput`) | — | Store | **OPERATIONAL** |
| **QR** | — (client-generated) | Rail QR + `SpaceLinksSheet` | ✓ (desktop) | ✓ (mobile prominent) | — | Business or activity URL | **OPERATIONAL** |
| **ConnectedPresence** | Profile social links on store | `ConnectedPresence`, `SpaceLinksSheet` | Store cards | Right rail + links sheet | — | Store profile | **PARTIAL** (links only; not live presence) |
| **Live** | Live market sessions | Timeline `LIVE` artifacts, tab panel | Ranked when public | Stream + Live tab | — | `timeline:live:{sessionId}` | **PARTIAL** |
| **Shows** | Featured works | Timeline `SHOW` + Shows tab | When in global feed | Shows tab + stream | — | `timeline:show:{id}` / `show_item` content API | **PARTIAL** |
| **Post / Create** | `POST /api/stores/:id/space-updates` | `GlobalCreateLauncher`, `SpacePostSheet` | Desktop **Create** (`CreateSheet`) | Mobile **Post** (owner) · Desktop still **Create** | — | Creates `SPACE_UPDATE` timeline row | **PARTIAL** |
| **Performer** | Performer intake / missions | Rail Assistant, `launchPerformerEntrypoint` | Global Assistant nav | Business rail + mobile Assistant | — | `surfaceContext` handoff | **OPERATIONAL** |
| **Location** | Store address fields | `SpaceContextRail` location module, artifact `locationLabel` | ✓ cards | ✓ right rail / About | — | Store | **OPERATIONAL** |
| **Reviews** | — | — | — | — | — | — | **MISSING** |

---

## Integration map

### Global feed

| Layer | Files |
|-------|-------|
| Chrome | `PublicFeedChrome.tsx` — Search, Language, Create, Account (no Messenger/Notifications) |
| Shell | `PublicFeedShell.tsx`, `ArtifactFeed` |
| Rail | `FloatingFeedActionRail.tsx` (`railProfile: 'global'`) |
| Engagement | `useStoreEngagement`, `resolveEngagementStoreId` |
| Create | `GlobalCreateLauncher` variant `header` → `CreateSheet` |

### Business Space theatre

| Layer | Files |
|-------|-------|
| Canvas | `BusinessSpaceTheatreCanvas.tsx` |
| Right rail | `SpaceContextRail` (follow, linked, live, location, connected) |
| Rail | `FloatingFeedActionRail` (`railProfile: 'business-space'`) |
| Share resolver | `businessSpaceRailProfile.ts` |
| Follow | `SpaceFollowButton` (visitors only; owner slot hidden) |
| Post | `GlobalCreateLauncher` `spaceMode` on mobile nav → `SpacePostSheet` |
| Timeline | `projectBusinessTimelineToFeedArtifacts.ts` → `SPACE_UPDATE` / `SHOW` / `LIVE` / `PROMOTION` |

### Legacy SpaceShell (retained, not restored)

`SpaceShell.tsx` still serves personal / locked / fallback paths. Business canonical route uses theatre canvas when `useGlobalTheatreForBusiness` gate passes (`SpacePage.tsx`).

---

## Requirement traceability

### §3 Global chrome

| Control | Global `/` | Business `/space/:id` | Notes |
|---------|------------|----------------------|-------|
| Search | ✓ | ✓ (scoped placeholder) | `PublicFeedChrome` / theatre overrides |
| Language | ✓ | ✓ | `LanguageToggle` |
| Messenger | ✗ | ✗ | Not implemented on public surfaces |
| Notifications | ✗ | ✗ | `NotificationBell` is console placeholder only |
| Account | ✓ | ✓ | `PublicHeaderAuthActions` |

**Assessment:** No regression vs Global — Messenger/Notifications were never on public chrome. Restoration blocked on platform gap, not Business Space fork.

### §4 Create vs Post

| Surface | Desktop header | Mobile nav |
|---------|----------------|------------|
| Global | `+ Create` → `CreateSheet` | Create FAB |
| Owned Business Space | **`+ Create`** (unchanged) | **Post** → `SpacePostSheet` |

`GlobalCreateLauncher` explicitly disables Post semantics for `variant === 'header'` (line 47–48). Visitors never get Post. **Gap:** desktop owner Post entry.

### §5 Follow

- Real API state via `useStoreEngagement` / `StoreFollow`
- Owner: follow button hidden in right rail (`!isOwner` guard)
- Backend does not block owner self-follow if API called directly
- Follower **count** real when API returns; no avatar list

### §6 Business connections

- `linkedBusinesses` in `BusinessSpaceRuntime` defaults to `[]`
- `SpacePage` does not pass `businesses` to business `SpaceContextRail`
- User connection graph is personal-space scoped

### §7–9 Like, comment, share — artifact identity (§13)

**Current behaviour:**

```
FeedArtifact (SPACE_UPDATE)
  id: timeline:lifecycle:{lifecycleSourceId}
  engagement: resolveEngagementStoreId(artifact) → storeId
  → useStoreEngagement(storeId)  // STORE-level, not per-activity
```

| Interaction | Shared across Global ↔ Business? | Identity key |
|-------------|----------------------------------|--------------|
| Follow | ✓ Yes | `storeId` |
| Like / Save | ✓ Yes | `storeId` (not per `SPACE_UPDATE`) |
| Share | ✓ URL differs by profile; counts store-level | `storeId` + artifact URL |
| Comment | ✗ Not operational | — |
| Content love/clap | ✗ Not on feed rail | `contentType` + `contentId` (shows/storefront only) |

**Implication:** Viewing the same business in Global and Business Space shows the **same store engagement state**, but **not** per-activity reaction state. True activity-level convergence requires wiring `content-interactions` with `contentType: 'feed_artifact'` and `contentId: artifact.id`.

### §10 Message

- Global messenger inbox: **missing** on public surfaces
- Business message CTA: rail opens **Performer** (`onOpenPerformer`), not customer↔business DM
- Agent threads exist at `/app/back/threads` (authenticated console)

### §11 Notifications

Platform-wide placeholder. No social event feed wired.

### §12 Social action rail

Single rail, capability profile:

| Action | Global | Business Space |
|--------|--------|----------------|
| Open space | ✓ | Hidden |
| Like / Save / Share / Follow | ✓ | ✓ |
| QR | Desktop | Mobile + links sheet |
| Performer | — | ✓ |
| Connected links | — | ✓ when links exist |
| Phone | When available | ✓ |
| Comment | — | — |

### §14 Business stream

`ArtifactFeed` **is** the social feed. Timeline types: `SPACE_UPDATE`, `SHOW`, `LIVE`, `PROMOTION`. Empty timeline → store hero artifact only (activity-first contract).

### §15–17 Shows, Live, Promotions

Projected into same `ArtifactFeed`. Commerce CTAs (Visit store, Claim, etc.) coexist with store-level social rail. Content-level `SocialInteractionBar` used on storefront show pages, not main feed cards.

### §18–19 Rails

**Right:** Follow/connect, linked businesses (data-empty), live, location, connected presence — empty modules hidden for visitors; owner compact prompts allowed.

**Left:** Categories, Partner Spotlight (external network — not business timeline).

### §20–22 Header / desktop Post / mobile

Mobile nav contract preserved (`Home · Shows · Post · Assistant · Me`). Desktop Post gap noted above.

---

## E2E social round-trip (§25)

**Status:** Not browser-proven end-to-end for full matrix.

| Step | Blocker |
|------|---------|
| Global → see `SPACE_UPDATE` | Staging test stores often empty timeline |
| React / comment round-trip | Comments non-operational; reactions store-scoped |
| Owner Post → Global eligibility | Requires `STAGING_OWNER_EMAIL/PASSWORD`; projection logic unit-tested |
| Follow / Share / Message | Follow+Share operational; Message = Performer only |

**Unit tests (local, 2026-08-29):** 17 passed — `businessSpaceRailProfile`, `businessSpacePresenceConvergence`, `FloatingFeedActionRail`.

**Staging script:** `scripts/business-space-staging-verify.mjs` — extends presence checks; social round-trip steps skipped without creds/timeline data.

---

## Test matrix (§26)

| Viewport | Owner | Visitor | Unauthenticated |
|----------|-------|---------|-----------------|
| 1440 / 1920 | Post gap (desktop Create) | Follow ✓ | Follow requires auth for persistence |
| 390 / 412 / 430 | Post ✓ mobile | Rail actions ✓ | Limited |

| Feature | PASS criteria met? |
|---------|-------------------|
| Header chrome | PARTIAL (no Messenger/Notifications) |
| Post/Create context | PARTIAL (mobile only) |
| Follow | PASS |
| Reaction | PASS (store-level) |
| Comment | FAIL (stub) |
| Share | PASS |
| Message | FAIL (no business DM) |
| Notifications | FAIL |
| QR / Performer | PASS |
| Right rail | PARTIAL (no linked businesses data) |
| Shows / Live | PARTIAL (data-dependent) |
| Visit Store | PASS |

---

## SOCIAL_PLATFORM_CAPABILITY_GAPS

Capabilities genuinely missing or incomplete **platform-wide** (not Business-Space-specific forks):

1. **Comment threads** — no persistence API; `openComments` is toast-only  
2. **Activity-level reactions** — `content-interactions` not wired to `ArtifactFeed` / timeline cards  
3. **Public Messenger** — no inbox in `PublicFeedChrome`  
4. **Social notifications** — `NotificationBell` is KPI placeholder  
5. **Business DM** — no visitor→business conversation surface  
6. **Linked business relationships** — no store↔store backend model  
7. **Follower list** — count only  
8. **Customer reviews** — not implemented  
9. **Desktop Post** for owned Business Space — header locked to Global Create  
10. **`FeedArtifact.sourceType` / `sourceId`** — not propagated for engagement targeting  

---

## Final verdict

### `BUSINESS_SPACE_SOCIAL_LAYER_V1_PARTIAL`

**Converged (existing operational capabilities on Business runtime):**

- Shared feed shell and action rail with `business-space` profile  
- Store-scoped Follow, Like, Save, Share, Phone, QR  
- SHARE BUSINESS (`/space/:id`) vs SHARE ACTIVITY  
- Mobile owner Post → `SPACE_UPDATE` pipeline  
- Real follower counts; no fake avatars  
- ConnectedPresence, Live/Shows timeline projection  
- Performer / Assistant handoff with `surfaceContext`  

**Blockers for READY:**

1. Activity-level shared identity for reaction/comment not wired (store-level only)  
2. Comments, Messenger, Notifications not operational on any public surface  
3. Desktop Post / Create context not adapted for business owners  
4. E2E social round-trip not browser-proven with live `SPACE_UPDATE`  

**Next phase (out of scope for V1):** Wire `content-interactions` to timeline artifact ids; add desktop Post via `GlobalCreateLauncher` header adaptation; implement comment/Messenger/notification platform primitives before requiring READY.

---

## Related docs

- `apps/dashboard/cardbey-marketing-dashboard/docs/BUSINESS_SPACE_TIMELINE_CONTRACT_V1.md`  
- `apps/dashboard/cardbey-marketing-dashboard/docs/reports/IMPACT_REPORT_BUSINESS_SPACE_SOCIAL_COMMERCE_V1.md`  
- `docs/reports/IMPACT_REPORT_BUSINESS_SPACE_SOCIAL_LAYER_V1.md`  
