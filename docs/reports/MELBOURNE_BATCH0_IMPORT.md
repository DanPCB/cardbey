# Melbourne Batch 0 Import Report

Generated: 2026-06-17T14:58:37.245Z  
Pilot: Melbourne Batch 0  
Batch ID: `MELBOURNE_BATCH0_20260617`  
Campaign ID: `MELBOURNE_BATCH0_20260617`  
Mode: **DRY RUN** (no writes)

---

## Import summary

| Metric | Value |
|--------|------:|
| Records in pilot file | 10 |
| Records fetched | 10 |
| Seeds created | 10 |
| Seeds updated | 0 |
| Seeds skipped (unchanged) | 0 |
| Business stores persisted | 0 |

---

## Acceptance checks

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Discovery seeds | 10 | 10 | PASS |
| All `seeded_pending_qa` | 10 | 10 | PASS |
| No stores created | 0 | 0 | PASS |
| No drafts created | 0 | 0 | PASS |
| batchId tagged | all | 10/10 | PASS |

---

## Post-QA targets (not at import time)

| Stage | Target after QA approve |
|-------|------------------------:|
| Claimable | 10 |
| BI Snapshots | 10 |
| Seed Suitcases | 10 |

BI snapshots and suitcases are generated when seeds are QA-approved via the governed promotion path — not during seed import.

---

## Imported seeds

- **Brunetti Carlton** — `3ef833d3-65b0-447c-8d37-003632a39d1e` — seeded_pending_qa — store:none
- **Pellegrini's Espresso Bar** — `db98e18e-90da-4af1-8afb-1d1df0eeb2ef` — seeded_pending_qa — store:none
- **Readings Carlton** — `e8a6be3d-db56-4560-bd44-dee51a88a08a` — seeded_pending_qa — store:none
- **Heartland Beauty Fitzroy** — `c304793c-3b1e-4632-a604-5fdf67faa48c` — seeded_pending_qa — store:none
- **Grub Food Van** — `dc0b04c4-5975-43a3-a178-76fdb45a9d3c` — seeded_pending_qa — store:none
- **Rose Street Artists Market** — `be672c21-9851-4ef5-b823-9efd6e61bed9` — seeded_pending_qa — store:none
- **Fitzroy Vet Hospital** — `a836af76-4bff-4bd6-a58f-a181354c38b4` — seeded_pending_qa — store:none
- **Yoga 213** — `0cda2aa7-cf77-46d3-b76b-65f0cbf3c621` — seeded_pending_qa — store:none
- **Lune Croissanterie Fitzroy** — `73d8fe8c-f8dd-4501-9f46-0b292b96c2ee` — seeded_pending_qa — store:none
- **Minano Handroll Bar** — `8550558d-5bd8-4361-9f11-00e7a5d7c20e` — seeded_pending_qa — store:none

---

## Runtime Authority

- No `persistStores`
- No activation
- No direct Prisma Business / DraftStore writes
- Seeds only via Business Ingestion pipeline
