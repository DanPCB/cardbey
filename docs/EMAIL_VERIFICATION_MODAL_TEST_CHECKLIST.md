# Email Verification Modal – Manual Test Checklist

## Env (Core)

- **Require verification to publish:** `ENABLE_EMAIL_VERIFICATION=true`
- **Allow "Publish anyway" (dev only):** `CARD_BEY_ALLOW_UNVERIFIED_PUBLISH=true` (do **not** set in production)
- **Email sending:** `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS` (or equivalent) so verification emails can be sent

## Dev behavior

1. **Send verification email**
   - Log in as user with `emailVerified: false`.
   - Open Store Review, click Publish → verification modal opens.
   - Click "Send verification email" → loading → success toast "Verification email sent. Check your inbox."
   - (Optional) Click again within 10 min → 429 toast "Too many requests. Try again in X minute(s)."

2. **I've verified — Refresh**
   - After verifying via link in email (or DB set `emailVerified: true`), in modal click "I've verified — Refresh".
   - Modal closes and publish is retried; if verified, publish should succeed.

3. **Publish anyway (only when allowed)**
   - With `CARD_BEY_ALLOW_UNVERIFIED_PUBLISH=true`, modal shows "Publish anyway (verify later)".
   - Click it → modal closes and publish runs (backend allows because of env).
   - With `CARD_BEY_ALLOW_UNVERIFIED_PUBLISH` unset/false, button is hidden.

4. **Close**
   - Click Close → modal closes; reminder toast if a pending action was set.

5. **Server enforcement**
   - With `ENABLE_EMAIL_VERIFICATION=true` and `CARD_BEY_ALLOW_UNVERIFIED_PUBLISH` unset, call `POST /api/store/publish` as unverified user → 403 with `code: EMAIL_VERIFICATION_REQUIRED`.
   - UI opens verification modal and shows toast when publish returns `needsEmailVerification`.

## Prod behavior

1. Do **not** set `CARD_BEY_ALLOW_UNVERIFIED_PUBLISH` in production.
2. Set `ENABLE_EMAIL_VERIFICATION=true` so publish requires verified email.
3. Unverified user clicking Publish → modal; only "Send", "Refresh", and "Close" (no "Publish anyway").
4. After verifying, Refresh → close and retry publish → success.

## Audit

- When publish is blocked for unverified email, Core creates `AuditEvent` with `action: 'publish_blocked_unverified'`, `entityType: 'User'`, `entityId: userId`, `metadata: { storeId }`.

## Files touched

- **Core:** `src/routes/stores.js` (email check + audit before `publishDraft`), `src/routes/auth.js` (`allowUnverifiedPublish` on `/me` and `/profile`).
- **Dashboard:** `src/api/storeDraft.ts` (`needsEmailVerification` on 403), `src/components/verification/VerificationRequiredModal.tsx` (onRefetch, onVerified, allowPublishAnyway, rate-limit handling, Refresh loading), `src/features/storeDraft/StoreDraftReview.tsx` (modal props, handle `result.needsEmailVerification`), `src/pages/public/StorePreviewPage.tsx` (modal props).
