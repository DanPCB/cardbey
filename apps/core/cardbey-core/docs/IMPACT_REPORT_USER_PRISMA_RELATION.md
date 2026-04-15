# Impact Report: User Prisma relation `business` → `businesses` and login query reduction

## 1. What could break

- **Invalid relation name:** Code uses `include: { business: true }` on `User`; the schema defines `businesses Business[]`, not `business`. Prisma would throw or the relation would be missing. Replacing with `businesses` (or removing for auth) fixes the bug.
- **Auth query change:** Reducing login/session lookup to minimal scalar fields (id, email, handle, displayName, passwordHash, role) and removing the `business` include means `req.user` will no longer have a `businesses` array from the auth query. Any code that reads `req.user.businesses?.[0].id` (e.g. in miRoutes for storeId fallback) will get `undefined` instead of the first business id. Those paths already use optional chaining and fallbacks (query/body, dev env); so behavior change: when an authenticated user does not pass storeId/tenantId in query/body, the fallback to “first business id” will no longer happen. Endpoints may still work with tenantId-only or return 400 when storeId is required.

## 2. Why

- Schema has `businesses Business[]`; there is no `business` relation. Using `business` in include/select is invalid.
- Eagerly loading relations on every login is unnecessary for auth and can pull in large data; minimal scalars are sufficient for token validation and session identity.

## 3. Impact scope

- **auth.js:** requireAuth and optionalAuth (login/session lookup). Changed to minimal select; invalid `business` include removed.
- **miRoutes.js:** Uses `req.user.businesses?.[0].id` in a few places for storeId fallback. After change, that will be undefined unless we add a separate lookup or a minimal include. Minimal-diff approach: leave as is (optional chaining); storeId from auth will be null when not in query/body.
- **draftStore.js:** One `prisma.user.findUnique` with select for email/emailVerified only (already minimal); no `business` usage. No change needed.

## 4. Smallest safe patch

- In **auth.js:** Replace both `prisma.user.findUnique` calls (requireAuth and optionalAuth) with a minimal `select`: `id`, `email`, `handle`, `displayName`, `passwordHash`, and `role` (needed for requireAdmin and other checks). Remove `include: { business: true }`. Do not add `businesses` include for login (per “minimal scalar fields only” and “do not eagerly include large relations”).
- No change to miRoutes or draftStore for this patch; optional chaining on `req.user.businesses?.[0].id` will yield undefined when storeId is not in query/body.
