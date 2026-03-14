# Impact Report: Internal Marketing Agent Test (E2E)

**Date:** 2026-02-27  
**LOCKED RULE:** Assess whether campaign execution refactor could break existing marketing flows. Warn first.

---

## 1. What is being added

- **Controlled end-to-end internal test flow** for a marketing campaign scenario:
  - Scenario: French Baguette Café – Weekend Coffee Promo
  - Steps: generate campaign draft (via stub “internal agent”), 3 social posts, 1 promo banner prompt, schedule posts (Sat 9AM, Sun 9AM), create loyalty reward (Buy 5 get 1 free), transition campaign DRAFT → SCHEDULED → RUNNING, log all transitions via **AuditEvent**.
- **Delivery:** Standalone **script** in core (`scripts/marketing-agent-test-flow.js`) plus **debug logs** (agent input, agent output, OrchestratorTask status, final scheduled state). No new API routes for production campaign execution.

---

## 2. What could break

| Risk | Likelihood | Notes |
|------|------------|--------|
| **Existing campaign execution** | None | No existing campaign “execution” path was found in core (no routes that run campaigns by status). Campaign model exists; workflows.js has from-prompt only. This add-on is a **script-only** test; it does not hook into any current campaign runner. |
| **OrchestratorTask / orchestra** | Low | New script uses a **dedicated** `entryPoint: 'marketing_agent_test'`. It does not use `build_store` or existing job handlers. OrchestratorTask creation and transitions follow the same pattern as orchestra (transitionOrchestratorTaskStatus + AuditEvent). No change to miRoutes or runBuildStoreJob. |
| **Loyalty / Campaign tables** | Low | Script **creates** Campaign and LoyaltyProgram rows. If no cleanup, test data accumulates. Mitigation: document that this is for internal/dev use; optional cleanup step or use a test DB. |
| **AuditEvent volume** | Low | Each run adds several AuditEvents (OrchestratorTask transitions + Campaign status_transition). Acceptable for an internal test. |

---

## 3. Impact scope

- **Campaign flows:** Additive only. No change to Campaign list/detail APIs or any existing “run campaign” logic (none found).
- **Marketing flows:** No change to promo creation, Smart Object wizard, or content studio. Test does not touch those paths.
- **OrchestratorTask:** New task type only; existing `build_store` and other entry points unchanged.
- **Kernel transitions:** Only OrchestratorTask transitions are used (via existing `transitionOrchestratorTaskStatus`). Campaign status changes are implemented as **direct updates + AuditEvent create** (no new kernel transition for Campaign), so no change to transition service or rules.

---

## 4. Smallest safe approach

- Implement the scenario as a **single standalone script** (e.g. `apps/core/cardbey-core/scripts/marketing-agent-test-flow.js`).
- Script:
  - Creates one OrchestratorTask with `entryPoint: 'marketing_agent_test'`, status `queued`.
  - Uses existing `transitionOrchestratorTaskStatus(queued→running)` then `(running→completed)` (or `failed` on error).
  - Uses **stub “agent”** outputs (no external AI or agent service) so the flow is deterministic and runnable without new services.
  - Creates Campaign (DRAFT → SCHEDULED → RUNNING) and one LoyaltyProgram (Buy 5 get 1 free); after each campaign status change, creates an AuditEvent with `entityType: 'Campaign'`, `action: 'status_transition'`.
  - Writes debug logs: agent input, agent output, OrchestratorTask status, final scheduled state.
- **No new API routes** for production. No change to existing campaign or marketing UI/API behavior.

---

## 5. Conclusion

**Safe to proceed:** Additive, script-only, dedicated task type and AuditEvent logging. No change to existing campaign execution or marketing flows. Proceed with implementation as above.
