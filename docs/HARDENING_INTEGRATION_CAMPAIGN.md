# Cardbey Hardening — Integration & Release Campaign

**Status:** `IMPLEMENTATION_ASSEMBLED` → integration in progress

Parallel feature-style hardening is **stopped**. Remaining work is prove-then-release.

---

## Acceptance (Phase 0 envelope)

Program passes only when all five are true:

1. Broken code cannot deploy
2. Deployed code identity is provable
3. Critical journeys work against deployed system
4. Failures are represented and recovered truthfully
5. Bad release can be contained/rolled back before broad user impact

**Verdict when closed:** `CARDBEY_HARDENING_PHASE_0_PRODUCTION_ENVELOPE_VERIFIED`

---

## Integration stages

| Stage | Owner | Scope | Exit |
|-------|-------|-------|------|
| **A1** | Core Integration | W1 + W3 + W6 + journey gates + W7 scale hook only | Clean diff, Core gates green |
| **A2** | Dashboard Integration | W2 + W5 only | Dashboard tests/build green |
| **A3** | Canary-B Specialist | `cardExtraction` → `belief.lastUpload.businessName` if still broken on deployed path | HP Services identity-aware Ask → build |
| **A4** | Golden Path QA | Release matrix: guest/authed × text/name/URL/card × success/failure/retry | No critical untested handoff |
| **A5** | Release/Deploy | Predeploy import + schema gates, build metadata, SHA parity | Prod cannot deploy broken graph/schema |
| **A6** | Recovery/Observability | Fault-inject generate failure → draft `failed`, truthful timeline, safe retry | No stuck `generating`; no false success |
| **A7** | Architecture/Scale | Validate cohort limit + canonical docs; **identify only** Growth `/investors/admit` retirement | No new duplicate path |

**Out of scope this release:** Growth/Fundraising convergence implementation, Performer/MI/Launchpad redesign.

---

## Sequential production gates

```
A1 Curate Core → Core CI/gates → Merge Core → Deploy Core
    → Verify exact SHA
    → Canary A (direct create → preview)
    → Canary B (HP Services → preview)
A2 Curate/Merge Dashboard → Deploy Dashboard
    → Repeat Canary A + B
A6 Failure/recovery canary
    → Record evidence
    → PHASE 0 CLOSED
```

Agents may work concurrently **only through local verification**. Promotion is **strictly sequential**.

---

## Hard stop conditions

Stop promotion immediately if:

- Deployed SHA ≠ expected
- Import or schema gate fails
- Canary A does not reach preview
- Canary B loses HP Services identity
- Unexpected `tool.dispatch.failed`
- Timeline reports success for failure
- Draft remains `generating`
- Staging passes, identical production input fails
- Rollback procedure cannot be executed

---

## Phase 2 (deferred)

First convergence task after Phase 0: retire `POST /api/executive/growth/investors/admit` in favor of Fundraising `admit-handoff`. Document only in this release.
