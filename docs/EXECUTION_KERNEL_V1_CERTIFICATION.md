# Execution Kernel V1 Certification

**Status:** Constitutional production contract  
**Version:** 1.0.0  
**Date:** 2026-07-09

This document is the **Execution Constitution** for Cardbey. It defines the execution invariants that every mission must satisfy before it is considered production-ready.

It establishes the boundary between the stable **Execution Kernel** and mission-specific **plugins**.

### Constitutional documents (read in order)

| # | Document | Answers |
|---|----------|---------|
| 1 | [`PLATFORM_CONSTITUTION.md`](./PLATFORM_CONSTITUTION.md) | What is Cardbey? Platform philosophy. |
| 2 | [`COGNITIVE_KERNEL_SPEC.md`](./COGNITIVE_KERNEL_SPEC.md) | How does Cardbey understand the world? |
| 3 | **This document** — `EXECUTION_KERNEL_V1_CERTIFICATION.md` | How does Cardbey execute work? |

After certification, kernel changes are restricted to:

- bug fixes
- security
- performance
- plugin interface evolution

Mission-specific behavior must be implemented as plugins rather than kernel modifications.

**Governance:** Kernel-touching PRs require [`CONSTITUTION_REVIEW.md`](./CONSTITUTION_REVIEW.md). Plugin maturity is tracked in [`MISSION_PLUGIN_STATUS.md`](./MISSION_PLUGIN_STATUS.md).

---

## 1. Purpose

This document is not another design note.

It is the production contract that every future mission family must satisfy before it can be called certified.

The goal is to prevent Cardbey from regressing into mission-specific routing, duplicated execution paths, ad hoc runtime semantics, or false completion.

The kernel is stable infrastructure.

Mission families are plugins that must conform to it.

---

## 2. Vision

```text
User Intent
      ↓
Evidence
      ↓
Mission Contract
      ↓
Execution Context
      ↓
Execution Spine
      ↓
Runtime State Machine
      ↓
Artifact Authority
      ↓
Business Asset
      ↓
Suitcase / Publish
      ↓
Reality Stream
```

Every mission follows this lifecycle.

No exceptions.

---

## 3. Execution Laws

These laws are immutable engineering rules for certified execution.

### Law 1 - Evidence Before Decision

Classification, reasoning, and mission selection must not happen before required evidence is ready.

If perception is incomplete, the system must pause in a canonical waiting state such as `awaiting_perception`.

### Law 2 - Frozen Mission Contract

After mission contract freeze, the mission family, evidence lineage, and core execution intent must not be reinterpreted or silently mutated.

If new information is needed, the mission pauses for clarification or owner input. It does not rewrite the contract.

### Law 3 - Single Execution Spine

A mission may execute through one spine only.

No mission may mix topology, checkpoint, legacy dispatch, or side-channel execution for the same `missionId`.

### Law 4 - Canonical Runtime State Machine

Externally visible runtime state must use the canonical execution vocabulary:

`awaiting_perception | awaiting_context | awaiting_approval | awaiting_owner_input | executing | completed | failed`

Mission-specific pause flags are not valid substitutes for runtime state.

### Law 5 - Artifact Completion Authority

A mission may not be marked `completed` unless its expected artifact exists and is usable.

Completion without output is invalid.

### Law 6 - Published Reality Becomes Future Evidence

Published outputs, business changes, approvals, artifacts, and externalized actions must become reality that can be re-observed by future missions.

The system must treat published results as future evidence, not terminal dead ends.

---

## 4. Certification Gates

Execution Kernel V1 is considered certified only after all three gates pass.

### Gate 1 - Backend

Required:

- unit tests
- integration tests
- regression tests

Pass rate:

- `100%`

### Gate 2 - Dashboard

Required:

- runtime states
- approval flows
- owner input
- resume
- artifact rendering

Pass rate:

- `100%`

### Gate 3 - Golden Path Manual Certification

Each certified mission must demonstrate the full lifecycle:

```text
Intent
  ↓
Evidence
  ↓
Context
  ↓
Approval
  ↓
Execution
  ↓
Artifact
  ↓
Suitcase
  ↓
Publish
```

This flow must complete without operator intervention, hidden rerouting, or mission-specific repair steps.

---

## 5. Mission Family Certification

Every mission plugin must complete the following checklist before it may be called certified.

| Requirement | Pass |
|---|---|
| Evidence Gate | ☐ |
| Context Resolution | ☐ |
| Frozen Contract | ☐ |
| Single Execution Spine | ☐ |
| Runtime State Machine | ☐ |
| Owner Review | ☐ |
| Resume Support | ☐ |
| Artifact Authority | ☐ |
| Suitcase Persistence | ☐ |
| Publish Flow | ☐ |

Only after every item passes may the mission family be called **Certified**.

---

## 6. Mission Certification Questions

Every mission family review must answer these questions.

### Intake

Can upload, text, API, and structured entry points enter through the same gate?

### Evidence

Can OCR, perception, or evidence preparation finish before classification and mission selection?

### Context

Can ambiguity resolve once and stay resolved, instead of being re-derived repeatedly?

### Contract

Can the mission family mutate after contract freeze?

It should be impossible.

### Runtime

Do all pauses surface as canonical `awaiting_*` states instead of custom status flags?

### Artifact

Can completion happen without output?

It should be impossible.

### Persistence

Can refresh, resume, and recovery rehydrate the mission without losing state?

### Publish

Can the certified artifact publish through the designated pipeline?

### Suitcase

Can the user retrieve the artifact later as a persistent business asset?

---

## 7. Plugin Rule

Every new business capability must extend the kernel through registration, not modification.

That means the following should be registered through stable interfaces rather than hard-coded into kernel execution:

- perception plugins
- reasoning plugins
- topology builders
- artifact builders
- validators
- publishers

Kernel execution remains unchanged.

This rule is mandatory for architecture review and pull request review.

Every capability proposal must answer:

> Does this extend the kernel through registration, or does it modify the kernel to support one mission family?

If the answer is the latter, the interface must be redesigned before approval.

---

## 8. Kernel Freeze Policy

After **Execution Kernel V1 Certification**:

Kernel changes are limited to:

- correctness
- performance
- security
- plugin interfaces

Kernel changes are not permitted solely to support one mission family.

If adding a mission requires kernel edits, the interface, not the mission, should be redesigned.

This is the operating rule that separates a platform from a collection of custom workflows.

---

## 9. Cardbey 1.0 Definition of Done

Cardbey 1.0 is achieved when any certified mission plugin can execute deterministically through the Execution Kernel, from user intent to persistent business asset, without mission-specific routing, execution, or completion hacks.

---

## 10. Platform Maturity Model

Mission families and capabilities should be described using the following maturity ladder.

| Level | Name | Meaning |
|---|---|---|
| L0 | Prototype | Experimental and not kernel-compliant |
| L1 | Integrated | Uses kernel entry points but is not fully certified |
| L2 | Certified | Passes all Execution Kernel certification gates |
| L3 | Production | Live, monitored, and regression-protected |
| L4 | Autonomous | Eligible for future kernel decision authority and automation |

This replaces vague status language such as "finished" with a measurable platform state.

Examples:

- `Campaign is L2 Certified.`
- `POS is currently L1 Integrated.`
- `Loyalty is L3 Production.`

---

## 11. Certified Milestone

The correct milestone after stabilization is not "more kernel refactoring."

It is:

**Execution Kernel V1 Certified**

Once certified, the roadmap shifts from kernel invention to mission family certification.

Recommended progression:

1. Loyalty Plugin Certification
2. Campaign Plugin Certification
3. Store Plugin Certification
4. Menu Plugin Certification
5. POS / Commerce / C-Net / distribution families

Progress is now measured by how many mission families can execute through the kernel without hacks, not by how many ad hoc capabilities have been added.

---

## 12. Constitutional Boundary

The Execution Kernel is the operating system.

Mission families are certified plugins.

The kernel should change rarely.

Most engineering effort after V1 certification should move into mission plugins, plugin interfaces, regression coverage, and production certification.

If repeated mission work requires repeated kernel edits, that is a signal that the interface design is incomplete.

The solution is to improve the plugin boundary, not to re-open the kernel.

