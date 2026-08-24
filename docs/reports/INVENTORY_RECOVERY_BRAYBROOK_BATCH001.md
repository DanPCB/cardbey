## INVENTORY RECOVERY

- Source of recovered records: `prisma/dev-fresh.backup-pre-migrate.db#business_seed(open_data_url,Braybrook)`
- Candidate count: 8
- Batch IDs: `MELBOURNE_BATCH001_REAL_LOCAL`
- Target candidate linkage (Đại Thắng): **NOT_FOUND** — not present in authoritative backup inventory
- Fields preserved: seedId; batchId; externalId; sourceUrl; name; address; suburb; acquisition source (open_data_url); original timestamps; dedupeKey; confidenceScore
- Fields unavailable: website (null on all recovered rows); phone (null); email (null); coordinates (null); Cardbey Business ID link (storeId null); Đại Thắng — NOT PRESENT in acquisition inventory
- Batch 0 protection evidence: PROTECTED_BATCH_IDS=["MELBOURNE_BATCH0_20260617"]; recovered batchId=MELBOURNE_BATCH001_REAL_LOCAL
- Whether any data is synthetic: **false**
- Content hash: `4df47e55463dabb4`
- Candidate IDs: `candidate:3eb6c881-5b55-484d-9521-72998a4e9cf4`, `candidate:145c96c7-fc80-4e74-81df-b52a172bb8fc`, `candidate:f18ebb2f-f14c-4ad9-a146-f957607348c4`, `candidate:6b2328f3-f533-4339-bc78-e69a5578a9cb`, `candidate:be96df17-2989-4494-a8bb-750c1c4377c4`, `candidate:1681ad4c-8032-4d1c-8406-2986d2ce7efc`, `candidate:a1e824e8-9352-47ee-8395-6fc8454d8a98`, `candidate:0c48a3bc-99a7-4992-aef1-6a5e125fb187`
- Seed IDs: `3eb6c881-5b55-484d-9521-72998a4e9cf4`, `145c96c7-fc80-4e74-81df-b52a172bb8fc`, `f18ebb2f-f14c-4ad9-a146-f957607348c4`, `6b2328f3-f533-4339-bc78-e69a5578a9cb`, `be96df17-2989-4494-a8bb-750c1c4377c4`, `1681ad4c-8032-4d1c-8406-2986d2ce7efc`, `a1e824e8-9352-47ee-8395-6fc8454d8a98`, `0c48a3bc-99a7-4992-aef1-6a5e125fb187`

### Classification

- Empty `candidates.json` root cause: **INVENTORY_NOT_PERSISTED** (git history only ever committed `[]`) with **INVENTORY_ENVIRONMENT_SPECIFIC** Braybrook seeds in backup DB and **CANDIDATE_LINK_MISSING** (briefs used `seed:` IDs without candidate rows).
- Public discovered cards can be served from BusinessSeed / UnclaimedStore without BusinessCandidate persistence.
