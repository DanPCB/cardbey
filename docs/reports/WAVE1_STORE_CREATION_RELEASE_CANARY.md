# WAVE 1 — Golden Path P0 Canaries

**Date:** 2026-09-04  
**Mission:** `CARDBEY_V1_STORE_CREATION_RELEASE_CLOSURE` Wave 1  
**Parent:** `docs/reports/CARDBEY_V1_STORE_CREATION_RELEASE_GAP_REGISTER.md`  
**Harness:** `scripts/wave1-store-creation-release-canary.mjs`  
**Evidence:** `docs/reports/evidence/wave1-store-creation-canary-*.json`

---

## Verdicts

| Task | Verdict | Notes |
|------|---------|-------|
| **W1.1 HP Services full chain** | `PASS_BUILD_PREVIEW_PUBLISH_BLOCKED` | Intake → mission → build → Draft Preview → refresh **PASS**. Publish returns `publish_snapshot_disabled` on live staging (Wave 0 pin not synced to Render yet). |
| **W1.2 Ambiguous / insufficient** | `FAIL` (ambiguous) / `PASS` (insufficient) | Insufficient correctly asks for a clue. Ambiguous names (`Flower Store`, `Spotless…`, `ABC Plumbing`, `Anison Capital`, `CA Handy Man`) incorrectly claim **“Everything looks complete / Ready to create”** with no ASK_USER. No catalog invention at intake. |
| **W1.3 Cohort (~12)** | `PARTIAL` **7/12** under strict scoring | 3× full build+preview PASS; 3× intake OK; 1× insufficient clarify PASS; 5× ambiguous FAIL |

**Wave 1 exit:** `WAVE_1_PARTIAL`  
Core release remains **BLOCKED** (RG-006 + RG-002 live pin).

---

## W1.1 — HP Services (Canary A)

| Step | Result |
|------|--------|
| Guest auth | PASS |
| Name-only intake → mission | PASS |
| `structured_store_build` | PASS (~8–10s) |
| Draft Preview URL | PASS |
| Preview refresh | PASS |
| Publish snapshot | **BLOCKED** — `publish_snapshot_disabled` |

Example preview:  
`https://cardbey-dashboard-staging.onrender.com/preview/website/cmtlzbzmz00irmycx6haok7uh`

Also full-build PASS: MSD URL, Market Lane Coffee URL.

---

## W1.2 — Clarify / no invent

| Input | Expected | Observed | Result |
|-------|----------|----------|--------|
| `Help me start something.` | clarify | “What kind of business…” | **PASS** |
| `Flower Store` | ASK_USER / fail-closed | Ready to create (name only) | **FAIL** |
| `Spotless Cleaning Services` | ASK_USER | Ready to create | **FAIL** |
| `ABC Plumbing` | ASK_USER | Ready to create | **FAIL** |
| `Anison Capital` | ASK_USER | Ready to create | **FAIL** |
| `CA Handy Man Melbourne` | ASK_USER | Ready to create | **FAIL** |

**Root cause (intake):** Day 3 intelligence-first path accepts standalone names as research-eligible drafts without live entity disambiguation (known deferred Day 3 limitation). Mission 001 still fail-closes at research for wrong entity — but owner is invited to create before clarify.

**Minimum fix (do not expand product):** when name is generic/ambiguous (no website, no unique Places match), return `action: clarify` with candidates or a single location/which-business question — reuse existing clarify copy in intake routes. Keep fail-closed offerings.

---

## W1.3 — Cohort matrix (strict)

| ID | Depth | Result | Failure |
|----|-------|--------|---------|
| hp-services | full | PASS (publish blocked) | publish_snapshot_disabled |
| msd-url | full | PASS | — |
| market-lane | full | PASS | — |
| desc-coffee | intake | PASS | — |
| handyman-melb | intake | PASS | — |
| jims-mowing | intake | PASS | — |
| insufficient | clarify | PASS | — |
| flower-store | clarify | FAIL | create_path claims complete |
| spotless | clarify | FAIL | create_path claims complete |
| abc-plumbing | clarify | FAIL | create_path claims complete |
| anison | clarify | FAIL | create_path claims complete |
| ca-handy | clarify | FAIL | create_path claims complete |

---

## Blocker graph update

```
Wave 0 pins (repo) ──► Render sync still required
         │
         ▼
PUBLISH_SNAPSHOT live OFF ──► HP publish canary blocked (RG-002)
         │
         ▼
Ambiguous intake ASK_USER missing ──► RG-006 remains P0
         │
         ▼
Wave 2 publish/edit still waiting on live snapshot + clarify fix
```

---

## Next actions (ordered)

1. **Ops:** Sync Render staging+prod `PUBLISH_SNAPSHOT_V1=true` (and research pins); redeploy; re-run HP with publish.  
2. **Minimal code (Wave 1.2 fix):** Ambiguous name → clarify (smallest safe patch in intake policy / entity resolve). Impact report before change.  
3. Then Wave 2 (publish/republish canary, Quick Edit A–F, CTA honesty).

---

## Commands

```bash
node scripts/wave1-store-creation-release-canary.mjs
node scripts/wave1-store-creation-release-canary.mjs --hp-only
node scripts/wave1-store-creation-release-canary.mjs --skip-publish
```
