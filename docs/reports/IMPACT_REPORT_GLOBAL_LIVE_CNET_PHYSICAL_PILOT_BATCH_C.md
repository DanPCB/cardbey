# IMPACT REPORT — Global Live × Cnet physical pilot (Batch C)

Date: 2026-08-18  
ACK: `ACK GLOBAL_LIVE_CNET_PHYSICAL_PILOT_BATCH_C`  
Worktree: `C:\Projects\cardbey-wt-live-cnet-contract`  
Branch: `feat/global-live-cnet-commercial-contract-a`  
Base: RTMPS v3 `355d54d16`  
Status: **PROCEED** on isolated review/commit/push and dedicated-pilot prep only  
Overall verdict until OBS→Cloudflare→physical screen→QR succeeds: **PARTIAL**

---

## Isolation (mandatory)

| Target | Action |
|--------|--------|
| `C:\Projects\cardbey` dirty WHIP/WHEP tree | **Do not modify** |
| `render.yaml` staging (`cardbey-core-staging`) / production (`cardbey-core`) | **Do not edit, deploy, or migrate** |
| Dedicated `render-global-live-pilot.yaml` | Only blueprint for this batch; `autoDeploy: false` |
| PRs | Draft PRs into RTMPS v3 feat branches — **not** `staging` or `main` |

Owner **Go Live / start-intent must remain CONNECTING**. LIVE only from Cloudflare evidence.

---

## (1) What could break

| Risk | Severity |
|------|----------|
| Merge/PR into `staging`/`main` auto-deploys live services | **Critical** — stop condition |
| Pilot `DATABASE_URL` reused from staging/production | **Critical** — would migrate shared data |
| Cloudflare secrets in git, Vite, logs, or public DTOs | **Critical** — stop condition |
| `render blueprint apply` of repo-root `render.yaml` | **Critical** — would touch staging/prod |
| Owner start-intent marking LIVE without provider evidence | **Critical** — stop condition |
| Combining registrations + online viewers + screen plays in pilot UI | Product-truth — stop condition |
| Billing from a new Render Postgres | High — dedicated DB only; do not attach staging DB |
| Physical TV playing a stored playlist mutation | High — overlay must stay read-time |

---

## (2) Why

Batches A/B are still uncommitted in the isolated worktree. Batch C is the first authorization to publish that branch for **dedicated** pilot services and to rehearse the physical journey. Staging/production remain the live path and must not receive this branch.

---

## (3) Impact scope

**In scope:** commit/push isolated A/B; draft PRs vs RTMPS v3 feat branches; dedicated Render blueprint (`autoDeploy: false`); pilot-only migrate + secrets + flags; physical rehearsal runbook and evidence template.

**Out of scope:** staging/production deploy, WHIP/WHEP, billing/settlement, unique-people claims, claiming `GLOBAL_LIVE_CNET_PHYSICAL_PILOT_READY` before the physical journey succeeds.

---

## (4) Smallest safe patch

1. Commit named A/B files in the worktree + dashboard submodule. No secrets.
2. Push `feat/global-live-cnet-commercial-contract-a` (core) and matching dashboard branch.
3. Open **draft** PRs targeting `feat/cloudflare-stream-rtmps-pilot-v3` / `feat/cloudflare-stream-rtmps-pilot-ui-v3` — never `staging`/`main`.
4. Keep `render-global-live-pilot.yaml` as a separate file; flags default **false**; secrets `sync: false`.
5. Migrations: `prisma migrate deploy` only against a **new** pilot Postgres. Never staging/prod `DATABASE_URL`.
6. Physical OBS/TV/QR steps are operator-executed; this session records PARTIAL until evidence exists.

No edits to live `render.yaml`.
