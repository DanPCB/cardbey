# Dev credits (testing top-up)

In **non-production** only, you can add credits to the current user for testing the "Get credits" / top-up flow.

## Endpoint

- **POST** `/api/dev/credits/add`
- **Auth:** Required (same as billing: Bearer token or session).
- **Body (optional):** `{ "amount": 100 }` — credits to add (default **100**).
- **Response:** `{ ok: true, added: 100, aiCreditsBalance: 100, welcomeFullStoreRemaining: 0 }`

## Example (curl)

With the core running on port 3001 and a valid JWT:

```bash
curl -X POST http://localhost:3001/api/dev/credits/add \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"amount": 100}'
```

If the dashboard proxies `/api/*` to the core, you can call from the browser (same origin) with the app’s auth; or use the core URL and the token from DevTools (e.g. from the request headers of any authenticated call).

## Notes

- Only registered when `NODE_ENV !== 'production'` (returns 404 in production).
- Credits are added to the **authenticated user** (`req.userId`).
- Use this to test "Insufficient credits" → "Get credits" → top-up and retry without real payment.
