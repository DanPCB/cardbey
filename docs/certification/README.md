# Mission Plugin Certification Records

Formal certification records for mission families against Execution Kernel V1.

Certification is **not** a test pass. It is a platform claim requiring four qualifications:

| Code | Name | Meaning |
|------|------|---------|
| EQ | Engineering Qualification | Automated tests + architecture invariants |
| OQ | Operational Qualification | Full manual golden path |
| RQ | Recovery Qualification | Interruption, refresh, restart, failure recovery |
| PQ | Replay Qualification | Reconstruct from Reality Stream + Mission Contract |

Only when EQ + OQ + RQ + PQ pass may a plugin be marked **L2 Certified**.

One plugin may hold **Reference Implementation** status at a time — the example future plugins copy.

## Records

| Plugin | Record | Status |
|--------|--------|--------|
| Loyalty | [`LOYALTY_L2_CERTIFICATION_REVIEW.md`](./LOYALTY_L2_CERTIFICATION_REVIEW.md) | EQ PASS — OQ/RQ/PQ pending |

## Live board

See [`MISSION_PLUGIN_STATUS.md`](../MISSION_PLUGIN_STATUS.md) for current maturity levels.
