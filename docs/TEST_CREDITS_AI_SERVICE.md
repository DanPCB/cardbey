# Test credits for AI service

How to get test credits so you can try the AI service (e.g. AI-generated menu, store content) in development.

## Option 1: Dev endpoint (recommended for local testing)

When the **core API is not running in production** (`NODE_ENV !== 'production'`), a dev-only route is available:

- **Endpoint:** `POST /api/dev/credits/add`
- **Auth:** Required (Bearer token of the user who should receive credits).
- **Body:** `{ "amount": number }` — optional; if omitted, **100** credits are added.

### Steps

1. **Run the core server in development** (so `NODE_ENV` is not `production`):
   - From repo root, start the core app as you usually do (e.g. `npm run dev` in the core app, or your monorepo dev script). Do **not** set `NODE_ENV=production`.

2. **Get an auth token** for the account you use in the dashboard (e.g. log in in the app and copy the JWT from your auth storage / network tab, or use your login flow to obtain a token).

3. **Call the dev endpoint:**
   ```bash
   curl -X POST http://localhost:<CORE_PORT>/api/dev/credits/add \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d "{\"amount\": 100}"
   ```
   Replace `YOUR_JWT_TOKEN` with your token and `CORE_PORT` with your core API port (e.g. `3001`).

4. **Response:** You’ll get something like:
   ```json
   {
     "ok": true,
     "added": 100,
     "aiCreditsBalance": 100,
     "welcomeFullStoreRemaining": 1
   }
   ```

5. Use the app again; the AI flows (e.g. “Generate with AI”) will use this balance until it’s spent.

**Note:** This route returns **404** in production. Use it only in dev/test environments.

---

## Option 2: Trial credits on sign-up (optional)

You can give new users a one-time trial balance when they register:

- **Env:** `TRIAL_AI_CREDITS` (e.g. `TRIAL_AI_CREDITS=50`).
- **Behavior:** On registration, if the user’s `aiCreditsBalance` is 0, it is set to `TRIAL_AI_CREDITS`. This is applied together with the welcome bundle in `creditsService.grantWelcomeBundleOnRegister`.

So for **new** test users, set `TRIAL_AI_CREDITS` in your `.env` (or env used by the core server) and create a new account; they’ll start with that many credits.

---

## Credit usage (reference)

- **Menu (text):** 5 credits per “text unit”.
- **Images:** 1 credit per image.
- **Welcome bundle:** One “full store” generation can use `welcomeFullStoreRemaining` instead of credits when that value is &gt; 0.

For full details see `apps/core/cardbey-core/src/services/billing/creditsService.js` (e.g. `estimateCost`, `canSpend`, `spendCredits`).
