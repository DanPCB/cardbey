# Explore Featured Video Upload — impact audit

## What could break

| Area | Risk | Mitigation |
|------|------|------------|
| Explore page layout | Upload button/modal adds header row only | Flex header; no fixed heights; showcase section unchanged |
| Video carousel | API merge changes video list | Registry fallback preserved; carousel logic unchanged |
| Footer spacing | No wrapper changes | Upload modal is portaled `fixed`; page scroll unchanged |
| Performer CTAs | `ctaIntent` optional on uploads | Hide Performer CTA when missing; registry intents unchanged |
| Mobile layout | Upload button crowds title | Title left / button right on `sm+`; stacked on xs |
| Static fallback videos | API failure | `useExploreFeaturedVideos` falls back to `getFeaturedVideos()` |

## Smallest safe patch

- New backend routes under `/api/explore/videos` (JSON store + Prisma when migrated).
- Frontend: hook + upload modal; showcase reads merged list.
- Registry + i18n for static items unchanged.
