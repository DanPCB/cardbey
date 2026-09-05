# CARDBEY_PROFILE_UI_RULE_V1

**Identity type must never determine public profile layout.**

Creator, User and Business use one **Universal Profile UI**.

Identity type determines only:

- data
- capabilities
- modules
- purpose

## Architecture

```
UniversalProfile (metadata)
        ↓
UniversalProfilePage / UniversalProfileTheatreCanvas
        ↓
PublicFeedShell (canonical Global theatre)
```

Not:

```
Creator data → Creator UI
User data → User UI
Business data → Business UI
```

## Allowed differences

- profile data
- available modules
- available actions/capabilities
- right-rail contextual content

## Forbidden

- Separate structural shells per identity type for public identity
- Owner-type-specific page layouts for the same resource type (video/service/…)
- Conditional `if creator → CreatorPage` shell selection

## Commerce exception (explicit)

Published storefront `/s/:slug` (WebsitePreview) is a **commerce resource destination**, not the identity profile shell. Business **identity** lives on Space theatre (`/space/:id`) / Universal Profile. Store CTA may deep-link to `/s/:slug`.

## Future identities

AI agent, Virtual KOL, Expert, Organisation, Community, Investor, Supplier, Partner enter the same shell via adapters — no new profile layouts.
