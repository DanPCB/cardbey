# Implementation Report — Live Public QA Fixes

Date: 2026-08-17  
Status: **COMPLETE in repo** — live [cardbey.com](https://cardbey.com/) will not change until this dashboard/Core build is deployed  
Source: guest QA pass on live public surfaces (18 desktop routes + mobile + HTTP/API probes)

---

## What shipped

Guest-facing bugs from the live audit are fixed in code. No publish, billing, claim, or legal-counsel copy was invented. Safe-execution / PIL paths were not opened.

### 1. Public routing and 404

Unknown guest URLs no longer dump into `/login?returnTo=/app/back`.

| Route | Result |
|-------|--------|
| `/terms`, `/privacy` | Existing pages; now stay public (already routed; catch-all no longer steals them) |
| `/contact`, `/help` | New `ContactPage` (`hello@cardbey.com`) |
| Unknown public URLs | `NotFoundPage` (404) with marketplace / for-business / contact links |
| `/preview/*` unknowns | Same public 404 |
| `/app`, `/dashboard`, `/console`, `/business/`, `/control-center` typos | Still redirect to `/app/back` |

`isPublicPage` includes `/contact` and `/help`. Unknown non-app paths skip dashboard `PageShell` so the 404 is not wrapped in operator chrome.

### 2. Auth, footer, and legal chrome

- Login: “Show Advanced (Raw Tokens)” only in `DEV` or `?admin=1`. Page title is a real `h1`. Document title: `Sign in | Cardbey`.
- Signup password minimum: **8** characters (en/vi copy updated).
- Footer: copyright uses `{{year}}`; ChatGPT tagline and System Guardian chat button removed; commercial tagline only.
- About: unverifiable “100+” / “24/7” / “Join us early” replaced with live-storefront / in-app help / “Get started” (en + vi).
- Pricing Business CTA goes to `/contact` (not `/signup`). Label: “Contact us”.

### 3. Public chrome and copy

- Feed/library kickers: Browse / Contents / Discover (not PUBLICFEED V2, UNIVERSAL LIBRARY, INTENT DISCOVERY).
- `/create` and Features quick-start fields start empty (no Union Road Florist prefills). Features i18n namespace wired so `quickStart.businessName` resolves.
- Public header credits pill: signed-in users only.
- `/for-business`: kicker “For business”; chips rail hidden on large screens; customer-facing launch copy (no Performer/console language).
- Page titles: marketplace, pricing, about, create, contact, help, 404.

### 4. Guest console noise

- Copilot suggestions query: only with a bearer token.
- `buildAuthHeader` warning: development only.
- Console suitcase summary and monitoring health: skipped without a bearer.
- Workspace health indicator and Automation/Manual toggle: signed-in users only (including the non-idle header).

### 5. SEO and HTML shell

- `public/robots.txt` and `public/sitemap.xml` (includes `/contact` and `/help`).
- `index.html`: description, Open Graph, Twitter, canonical; no vite.svg / “Your app entry”.
- `?apiBase=` override allowed only on localhost / 127.0.0.1.

### 6. Feed privacy and HOT badges

- Public sidebar `ownerId` is `null` unless the viewer can manage that store.
- HOT badge threshold raised to activity score **≥ 40**.
- Offer sidebar mapping no longer references `canManage` before it is defined (that 500 would have broken `/api/public-feed/sidebar` offers).

### 7. Health API

Default `GET /api/health` returns `{ ok, status, env, timestamp, version }` — no feature flags or LLM provider dump. `?full=true` is unchanged for the dashboard health UI.

---

## Tests run

| Suite | Result |
|-------|--------|
| Core `healthRoute.contract.test.js` | Pass (3) |
| Core `publicFeedSidebar.test.js` | Pass (7), including guest `ownerId: null` |
| Dashboard `i18nContract.test.ts` | Pass (278) |
| Dashboard `PrivacyPage.test.tsx` | Pass |

`publicFeedStoreClickOwnership.test.tsx` still fails on accessible-name queries (`Recently surfaced — onboarding window`) because the test does not init i18n. That is unrelated to these guest/legal/SEO fixes.

---

## Still ops / legal / data (not code)

These cannot be honestly “fixed” in this repo without counsel, DNS, or production data edits:

1. **`media.cardbey.com` DNS** — still an ops cutover; assets may remain on `r2.dev` until the custom host is live.
2. **Terms & Privacy** — remain `DRAFT` until counsel-approved copy is supplied. Pages are reachable; wording was not invented.
3. **Paid billing** — Starter still “Coming soon”; no payment capture was enabled.
4. **Production store names** — catalog typos (e.g. live listing names) need data QA, not a UI patch.
5. **`GET /api/health?full=true`** — still a rich payload for dashboard health widgets. Default `/api/health` is slim.
6. **Library inventory / Wikimedia** — content catalog quality is a data/ops track.

---

## Deploy note

After merge, ship **dashboard** (routing, copy, robots/sitemap, guest chrome) and **Core** (health + public-feed sidebar) together. Until then, live cardbey.com will still show the audited bugs.
