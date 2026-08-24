# SPACE SOCIAL SHELL V1

**Verdict target:** `SPACE_SOCIAL_SHELL_V1_READY` (after live visual check)  
**Flag:** `VITE_ENABLE_SPACE_CONTEXT_RAILS_V1` (default **on**)  
**Dashboard:** feat/space-social-shell-v1  
**Impact:** `docs/IMPACT_REPORT_SPACE_SOCIAL_SHELL_V1.md`

## Composition

```
PublicFeedChrome (Global header)
└─ SpaceShell theatre
     ├─ SpaceNavRail (Personal | Business + Lists + QR)
     ├─ Center stage (unchanged direction)
     └─ SpaceContextRail (relationship modules — no Store CTA card)
```

## REAL_DATA_MODULES

| Module | Source |
|--------|--------|
| Primary left tabs | `businessSpaceTabs` / `personalSpaceTabs` + archetype commercial label |
| Secondary categories | `projectSpaceCatalogCategories` (grounded only) |
| My businesses (personal rail) | `useCurrentUser().stores` |
| About / Hours / Location | `projectBusinessAbout` / `projectPersonalAbout` |
| Connected social | `getVisibleSocialLinks` — only when linked |
| Live session | `fetchSpaceLiveSession` when present |
| Follow | `SpaceFollowButton` / store-engagement |
| Content / Shows / Services | existing Space projections |
| QR mobile continuation | `InstallQRCode` |

## PLACEHOLDER_MODULES

| Module | Behavior |
|--------|----------|
| Connections (no API list) | Empty copy + Find people (owner); skeleton rings only as UI chrome, **no count** |
| Saved | Owner: "Saved items will appear here." Public: hidden |
| Recently viewed | Owner list nav → placeholder panel |
| Drafts | Owner list nav → placeholder + Ask Performer |
| Linked businesses (business rail) | Empty: "Linked businesses will appear here." |
| Connect social (owner, none linked) | Owner action required — no fake icons marked connected |
| Live (owner, no session) | "No upcoming Live" + Schedule Live |

## BACKEND_REQUIRED_NEXT

- Connection graph list + counts (distinct from contact-sync suggestions)
- Saved collections list API
- Recently viewed Space history
- Drafts list adapter (`/api/draft-store/mine`)
- Linked/sister business graph
- Followers count on Connect module without requiring follow button alone

## HIDDEN_UNAVAILABLE_MODULES

- Public Saved / Drafts / Recently viewed
- Fabricated follower counts
- Store "Visit store" as first right-rail card (removed; hero CTA remains)

## Owner vs public

Owner-only: Lists, Drafts CTA, Schedule Live, Connect social prompts, Ask Performer / Create update.  
Public: Follow, real Connected links, Hours/Location when grounded, no management CTAs.
