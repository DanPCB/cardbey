# Impact Report: Guest Access to Contents (GET/PUT /api/contents/:id)

## 1. What Could Break

| Risk | Description |
|------|-------------|
| Store creation regression | Changing contents auth could affect store creation flow. |
| Auth user content access | Switching from requireAuth to optionalAuth could weaken access control for authenticated users. |
| Other contents endpoints | GET list, POST, DELETE could be accidentally weakened. |

## 2. Why (Mitigation)

- **Store creation**: Contents API is separate from store creation (orchestra, draft-store, stores, commit). No overlap. **No impact.**
- **Auth user access**: We keep the same allow rule: `req.userId === content.userId`. Authenticated users continue to access only their own content. **No regression.**
- **Other endpoints**: Only GET `/:id` and PUT `/:id` change. GET `/`, POST `/`, DELETE `/:id` remain `requireAuth`. **Scoped change.**

## 3. Impact Scope

- **Backend**: `contents.js` — GET and PUT for single content by ID only
- **Middleware**: Add `optionalAuth` + `guestSessionId` for those two routes
- **Cookie**: `guestSessionId` already uses `path: '/'`; no change needed for `/app/creative-shell/*`

## 4. Smallest Safe Patch

1. For GET `/api/contents/:id` and PUT `/api/contents/:id`:
   - Replace `requireAuth` with `optionalAuth, guestSessionId`
   - Fetch content by ID first (no userId filter)
   - Allow if: `req.userId === content.userId` OR `(req.guestSessionId && content.userId === 'guest_' + req.guestSessionId)`
   - Otherwise return 403
2. Keep GET `/`, POST `/`, DELETE `/:id` unchanged with `requireAuth`.

## 5. Not Changing

- Store creation / orchestra / draft-store / stores flows
- POST /api/contents, GET /api/contents (list), DELETE /api/contents/:id
- Cookie path/domain (already correct)
