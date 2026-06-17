# Discovery Data Audit

Generated: 2026-06-17T13:56:53.973Z  
Database: file:C:/Projects/cardbey/apps/core/cardbey-core/prisma/dev-fresh.db?busy_timeout=60000&journal_mode=WAL&synchronous=NORMAL&connection_limit=1  
Ingestion dir: `C:\Projects\cardbey\apps\core\cardbey-core\data\businessIngestion`

---

## Store Audit

Total Stores: **2**

### By Status

- Published: 1
- Retired: 1

### By Source (createdBySource)

- manual: 1
- qa_test: 1

### By Creation Date

- 2026-06-16: 1
- 2026-06-17: 1

### By Activation State

- operating: 2

---

## Discovery Seed Breakdown

Total BusinessSeeds: **90**

| Stage | Count |
|-------|------:|
| Claimable | 11 |
| Claimed (claim started) | 1 |
| Verified | 0 |
| Activated | 0 |
| Rejected | 2 |

### By verificationStatus

- rejected: 2
- seeded_claimable: 11
- seeded_pending_qa: 77

---

## BI Snapshot Breakdown

| Artifact | Count |
|----------|------:|
| BusinessIntelligenceSnapshot | 0 |
| SeedSuitcase | 0 |
| Activation Suitcase (narrative) | 0 |
| Enrichment Candidates | 0 |

---

## Runtime Impact Report (PRESERVE)

Stores with runtime/platform footprint: **0**





---

## Classification Summary

| Bucket | Stores | Seeds | Drafts |
|--------|-------:|------:|-------:|
| **PRESERVE** | 2 | 0 | 2 |
| **Delete Candidates (TEST DATA)** | 0 | 90 | 0 |
| **Review Required** | 0 | 0 | 0 |

**NO deletion performed.** Review this report before running cleanup.

---

## Funnel Baseline

```
Discovery (77)
  ↓
Claimable (11)
  ↓
Claimed (1)
  ↓
Verified (0)
  ↓
Activated (0)
  ↓
Operating (0)
```

---

## Metrics Rebuild Preview

### Control Center

- discoverySeeds: 90
- businesses: 2
- stores: 2
- claims: 1
- verificationPending: 77
- activated: 0
- operating: 0
- preservedStores: 2
- testCandidateStores: 0

### Business Ingestion

- totalSeeds: 90
- claimable: 11
- verified: 0
- active: 0
- rejected: 2
- enrichmentCandidates: 0
- biSnapshots: 0
