# IMPACT REPORT — Contact Sync Migration + User Connection (Phase B sketch)

**Date:** 2026-08-26  
**Phase:** Implementation in progress (`feat/contact-sync-connection-abc`)  
**Status:** **ACK Phase A+B+C import** received 2026-08-26  
**Sources:** Bitbucket `caterwin_team/cardbey-api` `@production` (`214624eb`), Core `/api/contacts-sync/*`, Space Social Connection Layer V1

---

## Executive verdict

**Do not port** legacy Laravel contact endpoints (`check-users`, `async-contacts`, `request-contacts`, wallet `/contacts`) into Core as-is.

| Capability | Old Laravel | New Cardbey | Migration stance |
|---|---|---|---|
| Phone/email match | Plaintext `POST check-users` | Hashed `/api/contacts-sync/*` | **Reuse new**; retire old |
| Address-book sync | Client + `async-contacts` diff | Session → upload → results | **Reuse new** |
| Friend / connect graph | `request_contacts` | **Missing** | **Phase B** (this report) |
| Wallet “contacts” (save user/store) | `/contacts` + types | `StoreFollow` / engagement | **Do not merge** into people sync |
| Peer messaging | Not in old API | Deferred (Space) | Out of scope |

**Smallest safe sequence:** Phase A (phone identifier seeding) → Phase B (`UserConnection` graph) → Phase C (optional friendship import + client cutover). No plaintext directory API.

---

## 1. What could break

| Risk | Why | Impact |
|------|-----|--------|
| Phone match still empty after “migration” | Session create seeds **email** `UserIdentifier` only; `User.phone` is never hashed today | Mobile sync “works” but returns no phone matches |
| Privacy / enumeration regression | Recreating `check-users` with raw phones/emails | Abuse, policy, legal; contradicts contacts-sync non-negotiables |
| Dual social graphs | Adding connect while callers still treat suggestions as friendships | Space Connections, Performer card, mobile UX inconsistency |
| Confused with store Follow | Naming “contacts” / “followers” | Wrong tables, wrong counts, CRM leakage |
| Schema drift | Contact-sync models live in `prisma/postgres` + `prisma/sqlite` but **not** root `prisma/schema.prisma` | Local `db push` / migrate mismatch |
| Guest JWT treated as user | `requireAuth` allows guests; contacts-sync already rejects them | Fake connections if Phase B forgets the same guard |
| Notification spam | Emitting on every pending request without rate limits | Notification inbox noise |
| Legacy import corruption | Mapping old integer `user_id`/`target_id` without a verified id map | Wrong friendships, orphan rows |
| Account wipe incomplete | Teardown deletes `userIdentifier` today; new connection rows need cascade/cleanup | Deleted accounts leave stale edges |

---

## 2. Why

1. Old API matched identities in **plaintext** and stored friendships as `request_contacts`.  
2. New Core already invested in **consent + HMAC identifiers + suggestions** (`ContactSuggestion.type = 'connect'`), but **Connect CTA has no persistence target**.  
3. Space docs explicitly deferred `UserConnect` / peer Message — this report is the next additive step after match, not a rewrite of contacts-sync.

---

## 3. Impact scope

| Area | Change |
|------|--------|
| Core Prisma (postgres + sqlite) | Phase A: no new table. Phase B: add `UserConnection` (+ optional notification type) |
| Root `prisma/schema.prisma` | Align contact-sync + new models (drift fix) when implementing |
| `contactsSyncRoutes.js` | Phase A: seed phone hash on session; Phase B: filter suggestions already connected |
| New routes | Phase B: `/api/connections/*` |
| Profile PATCH (`auth.js` phone) | Phase A: upsert/delete `UserIdentifier` phone hash when phone changes |
| Account teardown | Phase B: delete connections involving user |
| Dashboard Space Connections / Performer card | Wire Connect CTA → Phase B (after ACK) |
| Mobile clients | Replace Passport + old routes with JWT + contacts-sync + connections |
| Store engagement / CRM / OAuth social | **No change** |
| Messaging / DMs | **Out of scope** |

---

## 4. Smallest safe patch (phased)

### Phase A — Phone matchability (no new product surface)

**Goal:** Phone-based contact sync actually matches users who have saved a profile phone.

1. On `PATCH` profile when `phone` set/cleared: canonicalize E.164 → HMAC → upsert/delete `UserIdentifier` (`kind: 'phone'`, `source: 'profile'`).  
2. On contacts-sync session create: in addition to email, seed phone identifier from `User.phone` when present and canonicalizable.  
3. Reject non-E.164 phones for hashing (same rules as upload); do not invent country codes server-side in A.  
4. Tests: profile phone → identifier exists; sync match by phone; clear phone removes identifier.  
5. Env: ensure `CONTACT_SYNC_HMAC_SECRET` set in each environment (already gated `503 CONTACT_SYNC_NOT_CONFIGURED`).

**Non-goals for A:** friend requests, invites, legacy import, recreating `check-users`.

### Phase B — User connection graph (parity with old `request_contacts`)

**Goal:** Persist Connect from suggestions (and direct user-id requests) without touching store Follow or plaintext matching.

#### B.1 Schema sketch (Prisma)

```prisma
model UserConnection {
  id          String    @id @default(cuid())
  fromUserId  String
  toUserId    String
  status      String    @default("pending") // pending | accepted | rejected | blocked
  source      String    @default("direct")  // direct | contact_suggestion
  suggestionId String?  // optional ContactSuggestion.id when originated from sync
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  respondedAt DateTime?

  fromUser User @relation("ConnectionFrom", fields: [fromUserId], references: [id], onDelete: Cascade)
  toUser   User @relation("ConnectionTo", fields: [toUserId], references: [id], onDelete: Cascade)

  @@unique([fromUserId, toUserId])
  @@index([toUserId, status])
  @@index([fromUserId, status])
  @@index([status, updatedAt])
}
```

**Rules (application-level):**

- Forbid `fromUserId === toUserId`.  
- Guests forbidden.  
- Only `toUserId` may accept/reject/block a `pending` row.  
- Either party may delete an `accepted` edge.  
- Canonical display of “connected”: `status === 'accepted'` in either direction (or normalize to ordered pair later if needed).  
- MVP: one directed pending row; on accept, keep single row `accepted` (do not invent reverse duplicate).  
- Blocked: optional MVP+; if deferred, omit `blocked` until needed.

Add `User` relation fields only; do **not** put PII on this table.

#### B.2 API sketch

Auth: JWT Bearer, reject guests (same pattern as contacts-sync).

| Method | Path | Behavior |
|--------|------|----------|
| `POST` | `/api/connections` | Body `{ toUserId, suggestionId? }` → create `pending` (idempotent if already pending/accepted) |
| `POST` | `/api/connections/:id/accept` | Target only → `accepted` |
| `POST` | `/api/connections/:id/reject` | Target only → `rejected` or delete (prefer soft `rejected` for audit) |
| `DELETE` | `/api/connections/:id` | Either party if accepted/pending (requester cancel) |
| `GET` | `/api/connections` | Query `status`, `direction=incoming\|outgoing\|mutual` |
| `GET` | `/api/connections/suggestions` | Optional thin wrapper: active `ContactSuggestion` minus already connected |

**Response profile shape** (match contacts-sync results — no email/phone):

```json
{
  "ok": true,
  "connection": {
    "id": "...",
    "status": "pending",
    "fromUser": { "id": "...", "handle": "...", "displayName": "...", "avatarUrl": "..." },
    "toUser": { "id": "...", "handle": "...", "displayName": "...", "avatarUrl": "..." }
  }
}
```

**Rate limits:** create 20/min/user; accept/reject 60/min/user.

**Notifications (optional in B.1):** emit `Notification` type `connection_request` to `toUserId` with meta `{ connectionId }` — only if product wants it in the same PR; otherwise defer to B.2.

#### B.3 Wire into existing sync

After Phase B:

1. Contacts-sync `results.connect[]` should include `connectionStatus: null | 'pending' | 'accepted'` (lookup by pair).  
2. On successful `POST /api/connections` with `suggestionId`, mark suggestion `status: 'acted'` or dismiss.  
3. Space Connections Connect button → `POST /api/connections` (not a no-op).

#### B.4 Explicit non-goals

- No DMs / message threads.  
- No SMS invite for non-users (keep `invite: []` until a separate invite design).  
- No change to `StoreFollow`.  
- No legacy route aliases (`/request-contacts`, `/check-users`).

### Phase C — Cutover / optional data import

1. **Clients:** mobile/web stop calling Laravel Passport contact routes; use JWT + Phase A/B.  
2. **Friendship import (optional):** only if a verified map `oldUserId → newUserId` exists; for each old accepted `request_contacts` pair, insert `UserConnection` `accepted` with `source: 'legacy_import'`.  
3. **Do not import** raw phone lists or recreate plaintext match history.  
4. Users re-consent and re-upload address books to rebuild `ContactIdentifier` / matches under HMAC.

---

## 5. Old → new client migration cheat sheet

| Old endpoint | Replacement |
|---|---|
| `POST /check-users` | `POST /api/contacts-sync/sessions` + upload identifiers + `GET .../results` |
| `GET /async-contacts` | Client-side: compare local list to `results.connect` / local cache |
| `POST /request-contacts`, `POST /many-request-contacts` | `POST /api/connections` (loop or future bulk) |
| `GET /request-contacts`, `GET /my-request`, `GET /my-contacts` | `GET /api/connections?direction=...` |
| `PATCH /request-contacts/:id` | `POST /api/connections/:id/accept` or `reject` |
| `DELETE /request-contacts/:id` | `DELETE /api/connections/:id` |
| `GET/POST/DELETE /contacts` (wallet) | Keep as store/user follow product separately — **not** Phase B |

---

## 6. Implementation checklist (after ACK)

- [x] Confirm Phase A alone vs A+B in one PR — **ACK A+B+C import**
- [x] Branch: `feat/contact-sync-connection-abc` (canonical checkout; dirty unrelated tree left untouched where possible)
- [x] Dual-write Prisma: `postgres` + `sqlite` (+ migration `20260826120000_user_connection`)
- [x] Phase A: `userIdentifierSync.js` + profile PATCH + contacts-sync session seed
- [x] Phase B: `UserConnection` + `/api/connections/*` + `connectionStatus` on sync results + account wipe
- [x] Phase C: `scripts/import-legacy-user-connections.mjs` (+ service dry-run)
- [x] Smoke-tested service layer (vitest deps not installed in this environment)
- [ ] Dashboard/Space Connect CTA (follow-up; Core API ready)
- [ ] Deploy postgres migrate + set `CONTACT_SYNC_HMAC_SECRET` / `ENABLE_CONTACT_SYNC=true` where needed

---

## 7. Rollback

- Phase A: stop seeding phone identifiers; existing hashes remain until revoke/delete.  
- Phase B: feature-flag routes or revert migration; UI falls back to suggestion-only (current behavior).  
- Never roll forward by adding plaintext `check-users`.

---

## 8. ACK gate

Per development-safety rule: **no code changes until explicit acknowledgment** of this report (or a narrowed subset, e.g. “ACK Phase A only”).

Suggested replies:

- `ACK Phase A only` — phone identifier seeding  
- `ACK Phase A+B` — seeding + `UserConnection` API  
- `ACK Phase A+B+C import` — include legacy friendship import (requires id map)
