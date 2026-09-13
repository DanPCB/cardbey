# Impact Report: Restore Discovery rail on Business Space

## Problem

Right-rail **Discover** (Collections / Nearby / Recently joined) was replaced on Business Space by Follow-only `SpaceContextRail` via `theatreOverrides.discoveryRail`. Marketplace `/` still had Discover; Space looked like marketplace but lost Discover.

## Smallest safe patch

In `BusinessSpaceTheatreCanvas.tsx`: compose compact Follow + `PublicDiscoveryRail` (sidebar API + collections), keep marketplace `/` unchanged.

## Proceed

Ship dashboard submodule bump to staging + live.
