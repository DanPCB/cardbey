# Impact Report — Live Market Storefront Scheduled Publication

**Status:** Core + dashboard storefront publication slice implemented; streaming not operational  
**Date:** 2026-08-13  
**Verdict:** `PARTIAL` until a real scheduled session is published from back office and verified on `/s/:slug` with consume flag on → then `LIVE_MARKET_STOREFRONT_SCHEDULED_PILOT_READY`

## (1) What could break

- Public live-market session GET that currently exposes SCHEDULED without publication gate
- Owner session DTO shape (new publication fields)
- Prisma client / disposable IT DBs after additive column
- Storefront layout if Live card mounts without flag

## (2) Why

Separate editorial publication (`HIDDEN|PUBLISHED|WITHDRAWN`) from media lifecycle. Publish ≠ Live. No Cloudflare/video in this slice.

## (3) Impact scope

- Core: domain, service, routes, flags, Prisma schemas + migrations, tests, docs
- Dashboard: flags, API client, owner control-room actions, ScheduledLiveCard on `/s/:slug`
- Creator Studio / Cloudflare Slice A: untouched behaviorally

## (4) Smallest safe approach

1. Additive `storefrontPublicationStatus` (+ optional publishedAt)  
2. Publish/withdraw APIs + public slug read  
3. Gate public DTO on PUBLISHED + ACTIVE enrolment  
4. Flag-gated owner UI + storefront card/countdown  
5. Cancel → auto-withdraw  

**Streaming remains not operational.**
