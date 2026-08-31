# IMPACT REPORT — Global Live EOI × PIL Phase 1 (post-submit assist)

Date: 2026-08-14  
Scope: Post-EOI success/duplicate UI → governed Performer/PIL handoff (suggest + confirm only)  
Status: **PROCEED** — user authorized Phase 1  
Surface: `/global-live` EOI only (not Live Market session RSVP; not dated reminders)

---

## (1) What could break

| Risk | Severity |
|------|----------|
| Auto-opening Performer on every submit (interruptive / accidental missions) | High — **avoid** |
| `autoSubmit: true` or confirmation-required actions without gate | High — **forbidden** |
| Coupling EOI success UI to Live Market publish / SMS / customer messaging | High |
| i18n key drift (EN/VI mismatch) | Medium |
| Telemetry accidentally including PII in assist open event | Medium |

## (2) Why

EOI already persists + emits PIL telemetry, but success screen only has navigation CTAs. User asked for assistant support to record progress / guide next steps. Dated live reminders remain out of scope (no pilot live date).

## (3) Impact scope

### In scope

- Explicit success/duplicate CTA: “Get help from Cardbey assistant”
- `openProactiveIntelligenceIntent` with `autoSubmit: false`, `proposedAction: recommendation`
- Privacy-safe telemetry `GLOBAL_LIVE_EOI_ASSIST_OPENED`
- EN + VI copy; tests

### Out of scope

- Auto-launch chat on submit
- Calendar / push / email drip reminders for a live date
- Enabling SharedPILAssistantHost route for `/global-live`
- Changing EOI API or confirmation email/SMS

## (4) Smallest safe patch

1. `lib/globalLiveEoi/eoiPilHandoff.ts` — governed handoff helper  
2. Success panel button → handoff (user click only)  
3. Telemetry event + i18n + unit/page tests  

---

## Confirmation

User: **proceed** (Phase 1 post-submit guided handoffs).
