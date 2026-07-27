# Business Activation Runway V2

## Runtime authority

Business Space creation from discovery **must** use Performer Runtime:

```
Activation UI → POST /api/performer/runtime/ui-action (activate_business_space)
             → executeActivateBusinessSpaceCapability
             → executeActivateBusinessSpaceRunway
             → activateSeedAfterOwnerConfirmation (domain only)
```

Forbidden from UI: `POST /api/business-ingestion/seeds/:id/activate`

## Routes

| Route | Purpose |
|-------|---------|
| `/activate-business/:seedId` | Activation runway page |
| `/claim-business/:seedId` | Alias → same page |
| `GET /activate-business/:businessRef` | Public preview API |
| `POST /api/performer/runtime/capabilities/activate-business-space` | Runtime capability |

## Runway funnel

Discovered → Claimed → Verified → Activated → Operating

Control Center Business Network funnel uses the same five stages.

## V2.1 — Activation timing + activity events

Lifecycle timestamps on ingestion seeds: `firstSeenAt`, `claimStartedAt`, `verifiedAt`, `activatedAt`, `operatingStartedAt`, plus derived `verificationDurationMs` / `activationDurationMs`.

Platform activity types: `business_activation_started`, `ownership_verification_started`, `ownership_verified`, `business_space_activated`, `performer_opened_after_activation`, `activation_failed`.

Control Center surfaces avg verification/activation time, operating conversion %, and stalled activation warnings (72h claim without verify).

Legacy `/claim-business/:seedId` redirects to `/activate-business/:seedId` via `ClaimBusinessRedirect`.

- `ActivationRunwayService.ts` — preview + runway execution
- `executeActivateBusinessSpaceCapability.js` — runtime wrapper
- `ActivateBusinessPage.tsx` — value-first onboarding UI
- `activateBusinessRuntime.ts` — dashboard runtime client
