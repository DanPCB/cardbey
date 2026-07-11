# Mission Plugin Status

**Status:** Operational tracker (updated with each certification)  
**Last updated:** 2026-07-09 (Loyalty EQ pass recorded)

This is the public maturity board for Cardbey — like CI status, but for platform capabilities.

Progress is measured by **certified mission families**, not features shipped or lines of code.

See maturity definitions in [`EXECUTION_KERNEL_V1_CERTIFICATION.md`](./EXECUTION_KERNEL_V1_CERTIFICATION.md#10-platform-maturity-model).

---

## Platform foundation

| Component | Level | Status |
|-----------|-------|--------|
| Cognitive Kernel | Certified | 🟢 Constitutional spec + stabilization phases 0–3 |
| Execution Kernel | Certified | 🟢 V1 invariants enforced; certification gates in progress |
| Runtime Authority | Certified | 🟢 Canonical runtime states wired (backend + dashboard) |
| Certification Contract | Active | 🟢 `EXECUTION_KERNEL_V1_CERTIFICATION.md` |

---

## Mission plugins

| Plugin | Level | Status | Reference | Notes |
|--------|-------|--------|-----------|-------|
| **Loyalty** | L1 → L2 | 🟡 EQ PASS | ⭐ Candidate | **EQ 46/46 backend + 19/19 dashboard.** OQ/RQ/PQ pending. [Certification review](./certification/LOYALTY_L2_CERTIFICATION_REVIEW.md) |
| Campaign | L1 | 🟡 Integrated | — | Uses compiler topology; not yet fully certified end-to-end |
| Store | L1 | 🟡 Integrated | — | Store creation path on kernel; certification report pending |
| Menu / Catalog | L0 | ⚪ Prototype | — | Not kernel-certified |
| Booking | L1 | 🟡 Integrated | — | Partial integration |
| POS | L0 | ⚪ Prototype | — | Not started as certified plugin |
| Invoice & Quoting | L0 | ⚪ Prototype | — | Not started as certified plugin |
| Commerce | L0 | ⚪ Prototype | — | Not started as certified plugin |
| Signage & C-Net | L0 | ⚪ Prototype | — | Legacy paths; not certified |

### Reference Plugin

Only **one** L2 plugin carries ⭐ **Reference Implementation** at a time. Future plugins should be built the way the reference was built.

| Designation | Plugin | Kernel |
|-------------|--------|--------|
| ⭐ Reference Implementation (pending) | Loyalty | Execution Kernel V1 |

### Legend

| Symbol | Meaning |
|--------|---------|
| 🟢 | L2+ Certified or platform component certified |
| 🟡 | L1 Integrated — uses kernel entry points, certification incomplete |
| ⚪ | L0 Prototype — experimental or not kernel-compliant |

---

## Active certification target

### Loyalty Plugin → L2 Certified — Reference Implementation

**Formal record:** [`certification/LOYALTY_L2_CERTIFICATION_REVIEW.md`](./certification/LOYALTY_L2_CERTIFICATION_REVIEW.md)

**Why first:** Loyalty exercises nearly every part of the kernel. If Loyalty reaches L2 Reference Implementation, Campaign and others become certification exercises — not kernel reinventions.

**Four qualifications (aircraft-style):**

| Qualification | Code | Status |
|---------------|------|--------|
| Engineering | EQ | 🟢 PASS (46 backend + 19 dashboard) |
| Operational | OQ | ☐ PENDING — full manual golden path |
| Recovery | RQ | ☐ PENDING — refresh / restart / disconnect |
| Replay | PQ | ☐ PENDING — Reality Stream + Mission Contract |

**Certification decision:** Provisionally Certified (EQ pass only). Not L2 until OQ + RQ + PQ pass.

```text
EQ  PASS   ✓
OQ  PASS   ☐
RQ  PASS   ☐
PQ  PASS   ☐
      ↓
L2 Certified — Reference Implementation
```

---

## Certification queue (after Loyalty)

1. Campaign
2. Store creation
3. Menu / Catalog
4. Booking
5. POS
6. Invoice & Quoting
7. Commerce
8. Signage & C-Net

Do **one** plugin properly before parallelizing certification.

---

## How to update this document

1. Complete certification gates for a mission family.
2. Write or update a certification record under `docs/certification/` (EQ/OQ/RQ/PQ format).
3. Update the plugin row in this file (level, status emoji, notes).
4. If kernel interfaces changed, ensure Constitution Review was completed on the enabling PR.
