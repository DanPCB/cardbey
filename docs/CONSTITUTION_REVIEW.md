# Constitution Review

**Status:** Governance playbook (not a fourth constitution)  
**Version:** 1.0.0  
**Date:** 2026-07-09

This document makes the three constitutional documents **living governance** instead of forgotten architecture notes.

Every pull request that touches the kernel, intake authority, runtime contracts, or plugin interfaces must complete a Constitution Review before merge.

---

## When Constitution Review is required

Constitution Review is **mandatory** when a PR:

- modifies `apps/core/cardbey-core/src/lib/kernel/**`
- modifies `performerIntakeV2Routes.js` or other intake authority paths
- changes execution laws, runtime state vocabulary, or mission contract semantics
- changes plugin registration interfaces
- adds mission-family branching outside plugin registration

Constitution Review is **recommended** when a PR:

- adds or changes a mission plugin
- changes dashboard runtime-state handling
- changes artifact completion or publish pipelines

Apply the `kernel-change` label to any PR in the mandatory category.

---

## Constitution Review checklist

Copy this section into the PR description and complete every item.

### Constitution Review

| Check | Question | Answer |
|-------|----------|--------|
| ☐ | **Platform Constitution** — Does this change alter platform philosophy? | |
| ☐ | **Cognitive Constitution** — Does this alter how Cardbey understands reality? | |
| ☐ | **Execution Constitution** — Does this alter execution laws or certification gates? | |
| ☐ | **Plugin Rule** — Could this have been implemented as a plugin instead? | |
| ☐ | **Kernel Change** — Is this really kernel work? If yes, why? | |
| ☐ | **Migration** — Does this require recertification of any mission family? | |

### Kernel design principle (required for kernel-change PRs)

> **The kernel exists to reduce future complexity, not to enable today's feature.**

Answer explicitly:

**Will this make the next ten plugins simpler?**

- [ ] Yes — explain how: `_________________`
- [ ] No — this belongs in a plugin, not the kernel

### kernel-change detail (if applicable)

1. Which execution or cognitive law is affected? `_________________`
2. Which plugin interfaces change? `_________________`
3. Which certified mission families are impacted? `_________________`
4. What is the migration / recertification plan? `_________________`

---

## Anti-patterns (reject or redesign)

These work technically and fail strategically.

### Intake router branching

```javascript
if (mission === 'invoice') {
  // mission-specific execution inside intake router
}
```

**Violation:** Plugin Rule, Execution Constitution (single spine), Platform Constitution (platform vs application).

**Correct approach:** Register an Invoice plugin; route through kernel ingress and certification gates.

### Custom pause flags

```javascript
metadata.needsLoyaltyOwnerReview = true;
```

**Violation:** Execution Constitution (canonical runtime state machine).

**Correct approach:** Expose `awaiting_owner_input` (or another canonical `awaiting_*` state).

### False completion

```javascript
mission.status = 'completed'; // no artifact verified
```

**Violation:** Execution Constitution (artifact completion authority).

**Correct approach:** Resolve artifact authority before completion; otherwise `failed` or a waiting state.

### Contract mutation after freeze

```javascript
metadata.missionFamily = 'campaign'; // after loyalty contract frozen
```

**Violation:** Execution Constitution (frozen mission contract).

**Correct approach:** Pause, clarify, or start a new mission lineage — do not rewrite the contract.

---

## Reviewer responsibilities

Reviewers of `kernel-change` PRs must verify:

1. All checklist items are answered honestly.
2. The plugin rule was considered before kernel modification.
3. Recertification impact is named for any L2+ mission family.
4. Tests cover the constitutional invariant being touched.
5. No new mission-family `if` branches appear in intake authority without plugin registration.

If any constitutional answer is "yes, this alters philosophy/cognition/execution" without strong justification, request redesign as a plugin or interface extension.

---

## Related documents

| Document | Role |
|----------|------|
| [`PLATFORM_CONSTITUTION.md`](./PLATFORM_CONSTITUTION.md) | Platform philosophy |
| [`COGNITIVE_KERNEL_SPEC.md`](./COGNITIVE_KERNEL_SPEC.md) | Cognition laws |
| [`EXECUTION_KERNEL_V1_CERTIFICATION.md`](./EXECUTION_KERNEL_V1_CERTIFICATION.md) | Execution contract |
| [`MISSION_PLUGIN_STATUS.md`](./MISSION_PLUGIN_STATUS.md) | Live plugin maturity board |

---

## PR template

For kernel-touching PRs, use [`.github/PULL_REQUEST_TEMPLATE/kernel_change.md`](../.github/PULL_REQUEST_TEMPLATE/kernel_change.md) when opening the pull request.
