# Impact Report: Restore identity auto-display (Space first-only)

## Goal

- **Marketplace `/`:** restore auto-display of avatar + business identity on each centered hero.
- **Space:** auto-display on the **first** hero only; later inline cards stay content-only until click.
- **Keep** partner / NỔI BẬT media classification + `resolveCoreMediaUrl` fix.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Space second card shows identity again | Shared `activateFeedStore` always expands | `expandIdentity` + `identityPolicy: 'manual'` after first Space expand |
| Marketplace loses collapsed pill after 8s | Gating on expanded-only | `identityPolicy: 'auto'` keeps panel while active |
| Storefront `/s/:slug` | Prior content-first change | Restore 600ms auto-reveal for parity (optional; Space/marketplace are primary) |

## Smallest safe patch

1. Extend `feedOverlayState` with `identityPolicy` + `activateFeedStore(id, { expandIdentity })`.
2. `ArtifactFeed` prop `identityAutoExpandPolicy: 'always' | 'first-only'`.
3. Space canvas passes `first-only`; marketplace keeps default `always`.
4. `ArtifactCard` show/click rules honor policy.
5. Keep spotlight media files unchanged.
6. Update unit tests.

## Proceed

Implement and ship dashboard → staging → live.
