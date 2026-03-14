# Verification Modal UX: Clear Feedback for Every Outcome

## A. Exact code changes

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/components/verification/VerificationRequiredModal.tsx`

1. **State**
   - Replaced single `sending` with:
     - `sendStatus`: `'idle' | 'sending' | 'sent' | 'alreadySent' | 'error' | 'cooldown'`
     - `cooldownRemaining`: number (seconds)
     - `errorMessage`: string
   - Reset all of the above when modal closes (`useEffect` when `!open`).

2. **Cooldown countdown**
   - `useEffect` when `sendStatus === 'cooldown'`: interval every 1s decrements `cooldownRemaining`; at 0, set `sendStatus` to `'idle'`.

3. **handleSend**
   - Set `sendStatus` to `'sending'`, clear `errorMessage`.
   - `const data = await apiPOST(...)` and cast to `{ ok?, alreadySent?, resent?, reusedToken? }`.
   - **Success:**
     - If `data.ok && data.resent && data.reusedToken`: toast "Verification email sent again. Check your inbox." (success), `setSendStatus('sent')`.
     - Else if `data.ok && data.alreadySent`: toast "A verification email was already sent. Check your inbox." (info), `setSendStatus('alreadySent')`.
     - Else if `data.ok`: toast "Verification email sent. Check your inbox." (success), `setSendStatus('sent')`.
     - Else: `setSendStatus('error')`, `setErrorMessage('We couldn\'t send...')`.
   - **Catch (429):** `retryAfter` from body (default 60), set `cooldownRemaining(sec)`, `sendStatus('cooldown')`, toast with "Try again in X minute(s)." (info).
   - **Catch (other):** toast with backend message or fallback, `sendStatus('error')`, `errorMessage(msg)`.
   - Call `onRefetch?.()` after success.

4. **Inline status (one line below copy)**
   - Rendered only when `sendStatus` is `sent` | `alreadySent` | `error`.
   - **sent:** "Verification email sent. Check inbox, spam, or promotions." (green).
   - **alreadySent:** "A verification email was already sent recently." (muted).
   - **error:** `errorMessage` or "We couldn't send the verification email right now." (destructive).

5. **Primary button**
   - Disabled when `sendStatus === 'sending'` or `sendStatus === 'cooldown'`.
   - Label:
     - `sending` → "Sending…"
     - `cooldown` → "Resend in {cooldownRemaining}s"
     - `sent` or `alreadySent` → "Resend verification email"
     - else → "Send verification email"

6. **"I've verified — Refresh"**
   - Unchanged: same handler, same disabled-while-refreshing, same labels.

---

## B. State mapping

| Backend response              | sendStatus    | Toast (summary)                    | Inline status (summary)                          | Button                          |
|------------------------------|---------------|------------------------------------|--------------------------------------------------|---------------------------------|
| 200 { ok: true }             | sent          | Verification email sent…          | Verification email sent. Check inbox, spam…      | Resend verification email      |
| 200 { ok: true, alreadySent } | alreadySent   | A verification email was already…  | A verification email was already sent recently. | Resend verification email       |
| 200 { ok: true, resent, reusedToken } | sent | Verification email sent again…   | Verification email sent. Check inbox, spam…      | Resend verification email      |
| 429 + retryAfter             | cooldown      | Too many requests. Try again in X min. | (none)                                        | Resend in {n}s (disabled)       |
| 503 / other non-2xx         | error         | Backend message or generic         | Backend message or "We couldn't send…"           | Send verification email         |
| (idle / after cooldown 0)    | idle          | —                                  | (none)                                           | Send verification email         |

---

## C. UX copy

- **Toasts**
  - Sent (first): "Verification email sent. Check your inbox."
  - Sent again (resend): "Verification email sent again. Check your inbox."
  - Already sent: "A verification email was already sent. Check your inbox."
  - 429: "Too many requests. Try again in {mins} minute(s)."
  - 503/other: backend `message` or "Failed to send verification email"

- **Inline status**
  - Success: "Verification email sent. Check inbox, spam, or promotions."
  - Already sent: "A verification email was already sent recently."
  - Error: "We couldn't send the verification email right now." (or backend message)

- **Button**
  - Idle / error: "Send verification email"
  - After success: "Resend verification email"
  - Cooldown: "Resend in {n}s"
  - Sending: "Sending…"

---

## D. Risks

- **Store creation / auth / publish:** No change to when the modal opens, to publish flow, or to auth. Only in-modal state and copy change. **No risk** to store creation or publish workflow.
- **API contract:** Still calling the same `POST /api/auth/verify/request`; we only interpret response body (`ok`, `alreadySent`, `resent`, `reusedToken`) and errors. Backend remains the source of truth.
- **Toast types:** Uses existing `ToastType` ('success' | 'info' | 'error'). 429 uses 'info' (no 'warning' in codebase).
- **Reset on close:** State resets when modal closes so the next open starts from idle; avoids stale "sent" or "cooldown" from a previous session.

---

## E. Manual verification checklist

1. **200 { ok: true }** – Send once; expect success toast, green inline "Verification email sent. Check inbox, spam…", button "Resend verification email". Click Resend again (after cooldown if any); same or "sent again" toast.
2. **200 { ok: true, alreadySent: true }** – If backend returns this; expect info toast "A verification email was already sent…", muted inline "A verification email was already sent recently.", button "Resend verification email".
3. **200 { ok: true, resent: true, reusedToken: true }** – Expect "Verification email sent again" toast, same inline as success, "Resend verification email".
4. **429** – Trigger rate limit; expect info toast with retry time, button "Resend in {n}s" and disabled; countdown to 0 then button "Send verification email" and enabled.
5. **503** – With mail broken or EMAIL_NOT_CONFIGURED; expect error toast with backend message, red inline message, button "Send verification email" (retry allowed).
6. **I've verified — Refresh** – Still works, same behavior and labels.
7. **Close and reopen** – State resets to idle, no leftover sent/error/cooldown.

---

## F. Commit message

```
fix(verification): modal UX – clear feedback for send outcome and cooldown

- Add sendStatus (idle | sending | sent | alreadySent | error | cooldown) and inline status line
- 200 ok: success toast + green inline; button becomes "Resend verification email"
- 200 alreadySent: info toast + muted inline; keep resend available
- 429: info toast, button "Resend in {n}s" disabled until cooldown expires
- 503/other: error toast + red inline with backend message when available
- Cooldown countdown via useEffect; state reset when modal closes
- "I've verified — Refresh" unchanged
```
