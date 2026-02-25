# Publish hero/avatar consistency – manual test checklist

After implementing Option A (persist hero/avatar before publish + preview API uses `stylePreferences.heroImage`).

## 1. Happy path (publish-review → public matches)

- [ ] **Draft review:** Set hero image and avatar/logo (upload or choose from product).
- [ ] Click **Publish Store** → navigate to publish-review. Confirm hero and avatar match draft review.
- [ ] Click **Publish to live** → success overlay → redirect to public page (with or without `postPublish=1`).
- [ ] Open **new tab**, go to `/preview/store/<storeId>?view=public` with **no** `visualUrl` (or `heroUrl`/`avatarUrl`) query params.
- [ ] **Pass:** Hero and avatar on the public page match what was shown on publish-review.

## 2. Persistence

- [ ] After a successful publish, confirm (DB or API) that the Business record has:
  - `stylePreferences.heroImage` = the hero URL that was displayed on publish-review.
  - `logo` (or parsed logo.url) = the avatar URL that was displayed.

## 3. Regression (old / no hero in stylePreferences)

- [ ] Open the public page for a store that was published **before** this change (or has no `stylePreferences.heroImage`).
- [ ] **Pass:** A fallback hero still appears (e.g. logo or first product image). No blank or broken hero.

## 4. visualUrl (keep for now)

- [ ] **View Public Storefront** from publish-review still opens `/preview/store/:id?view=public` (with optional `visualUrl`). Link works.
- [ ] Optional follow-up: After 1–3 pass, remove `visualUrl` append in a later PR and re-run 1.
