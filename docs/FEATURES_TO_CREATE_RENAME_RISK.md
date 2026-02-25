# Features → Create rename — Risk assessment

## 1) Files likely affected

| Concern | File(s) |
|---------|--------|
| Top nav items | `src/components/layout/PublicHeader.tsx` (navbar label + Features link / scroll) |
| Route `/features` | `src/App.jsx` (redirect to `/#features`) |
| Hash scroll logic | `src/pages/public/Homepage.tsx` (effect for `#features`) |
| Section id on Home | `src/pages/public/Homepage.tsx` (`<section id="features">`) |
| isActive / path checks | `PublicHeader.tsx` (isActive for `/features`, path `/features`) |
| Other links to /features | Various (LandingPage, StorePreviewPage, AccountProfilePage, etc.) — leave as `/features` so redirect handles them |

## 2) Potential breakages

- **Links from other pages:** Many places `navigate('/features')` or `<Link to="/features">`. Keeping `/features` route that **redirects (replace) to `/#create`** preserves all existing links; no need to change every caller.
- **SEO:** Old URLs `/features` and `/#features` should redirect to `/#create` once (replace) so bookmarks and crawlers land on the canonical section.
- **Scroll loops:** Scroll helper must stay bounded (same pattern as today: rAF + N retries, cleanup on unmount). No new setInterval or polling.
- **Backward compatibility:** Redirect `/features` → `/#create`. Optionally on Home, if hash is `#features`, normalize once (replace to `#create`) and scroll to `#create`, so old `/#features` links still work.

## 3) Intentional non-changes

- Marketing copy that uses the word "features" in sentences (e.g. "Key features", "See features") is left as-is.
- i18n key names (e.g. `navbar.features`) can be kept and only the **value** changed to "Create", or add a new key `navbar.create` and use it for the nav; either way only the displayed label becomes "Create".
- No backend, auth, API, or store-creation logic changes.

## 4) Minimal change set (implemented)

1. **PublicHeader.tsx:** Nav label `t('navbar.create', 'Create')` (fallback "Create"). Link to `/#create`, scroll target `#create`, isActive when pathname `/` and hash `#create`. handleCreateClick: on Home prevent default and scrollToCreate; else navigate('/#create'). Desktop and mobile nav both handle Create link specially.
2. **Homepage.tsx:** Wrapped second section (FeatureProcessSection) in `<section id="create" aria-label="Create">`. Added useLocation, useNavigate, and scroll effect: when hash is `#create`, bounded retry scroll (rAF + up to 3 attempts, cleanup on unmount). When hash is `#features`, replace with `/#create` once for backward compat.
3. **App.jsx:** Route `/features` now `<Navigate to="/#create" replace />`. Removed FeaturesPage import.
4. **i18n:** Nav label uses `t('navbar.create', 'Create')` so "Create" shows even if key is missing; add `navbar.create` in locale files for proper translation.

## 5) Find-references summary (before edit)

| File | Contains |
|------|----------|
| PublicHeader.tsx | nav label `t('navbar.features')`, path `/features` |
| App.jsx | Route path `/features` → FeaturesPage; isPublicPage check pathname `/features` |
| Homepage.tsx | Second section had no id (FeatureProcessSection with id getting-started inside component) |

Other references to `/features` (navigate or Link) elsewhere in the app were left unchanged; redirect handles them.
