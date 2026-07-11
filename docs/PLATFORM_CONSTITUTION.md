# Cardbey Platform Constitution

**Status:** Constitutional — read this first  
**Version:** 1.0.0  
**Date:** 2026-07-09

---

## What Cardbey is

**Cardbey is an AI Operating Platform.**

It is not a chat assistant with features bolted on.

It is not a collection of business workflows connected by a large intake router.

Cardbey observes reality, understands it, executes certified missions through a stable kernel, produces durable business assets, and records what happened so the next mission can build on truth.

---

## The architectural shift

A year ago, Cardbey development often looked like this:

```text
User request
      ↓
Large Intake Router
      ↓
if (store)...
if (campaign)...
if (loyalty)...
if (upload)...
      ↓
Execute
```

Today, after kernel stabilization, it looks like this:

```text
Reality
      ↓
Evidence
      ↓
Mission Contract
      ↓
Execution Kernel
      ↓
Mission Plugin
      ↓
Business Asset
      ↓
Reality
```

Those are fundamentally different architectures.

The first is an application that grows by branching.

The second is a platform that grows by certifying plugins against stable laws.

---

## The three constitutional documents

Cardbey is governed by three documents. Read them in this order.

| Order | Document | Question it answers |
|-------|----------|---------------------|
| 1 | **This document** — `PLATFORM_CONSTITUTION.md` | What is Cardbey? What is the philosophy? |
| 2 | `COGNITIVE_KERNEL_SPEC.md` | How does Cardbey **understand** the world? |
| 3 | `EXECUTION_KERNEL_V1_CERTIFICATION.md` | How does Cardbey **execute** work? |

After these three documents, **stop writing constitutions.**

From here, every new document should be one of:

- a **plugin specification**
- a **certification report**
- an **interface specification**
- an **operational playbook**

Not another constitutional layer. Otherwise Cardbey will architect forever instead of certifying capabilities.

---

## Platform philosophy

### The Cognitive Kernel understands reality

The world arrives as events: uploads, messages, store signals, orders, publishes.

The Cognitive Kernel turns those events into evidence, reasoning, and mission alternatives — without polluting the source of truth at ingest.

**Reality is append-only.** What happened cannot be rewritten.

### The Execution Kernel executes missions

Once a mission is decided and contracted, execution follows one spine, one runtime language, and one completion authority.

The kernel does not care whether the mission is loyalty, campaign, POS, menu, invoice, signage, hiring, or compliance.

It cares that the mission obeys the execution laws.

### Mission plugins extend capabilities

New business capabilities register as plugins — perception, reasoning, topology builders, artifact builders, validators, publishers.

**Plugins extend. The kernel governs.**

Mission-specific behaviour must not be implemented by modifying kernel execution for one family.

### Business assets become new reality

A mission produces a durable artifact: a loyalty program, a campaign package, a store draft, a menu, an invoice.

When published, that asset becomes part of the business and feeds the Reality Stream again.

**Published reality becomes future evidence.**

### Suitcase is the persistent memory of value

Suitcase is where users retrieve what Cardbey created for them — months later, across sessions, across missions.

If a mission cannot persist and be retrieved, it has not fully completed its platform obligation.

### Mission contracts are immutable

After contract freeze, the mission family and core intent do not get reinterpreted mid-flight.

Clarification pauses the mission. It does not silently rewrite what was agreed.

---

## How we measure progress

Cardbey is no longer measured by lines of code, PR count, or “feature shipped.”

It is measured by **certified mission families**.

**Live board:** [`MISSION_PLUGIN_STATUS.md`](./MISSION_PLUGIN_STATUS.md) — update this when a plugin advances maturity.

Conceptually, platform health looks like this:

```text
Cardbey Platform

Execution Kernel     Certified  ✓
Cognitive Kernel     Certified  ✓

Mission Plugins
  Loyalty            L2
  Campaign           L1
  Store              L2
  Menu               L0
  POS                L0
  Invoices           L0
  Bookings           L1
  Commerce           L0
```

Maturity levels (see Execution Certification doc for full definitions):

| Level | Name | Meaning |
|-------|------|---------|
| L0 | Prototype | Experimental, not kernel-compliant |
| L1 | Integrated | Uses kernel entry points, not fully certified |
| L2 | Certified | Passes all certification gates |
| L3 | Production | Live, monitored, regression-protected |
| L4 | Autonomous | Eligible for future automation authority |

Say **“Campaign is L2 Certified”** — not **“Campaign is finished.”**

That language reflects platform maturity, not subjective completion.

---

## How new capabilities are added

**Before:**

```text
Need invoices
      ↓
Add invoice code
```

**After:**

```text
Need invoices
      ↓
Register Invoice Plugin
      ↓
Pass Certification
      ↓
Become L2
```

The planning question is no longer “What’s the next feature?”

It is: **“Which mission family should become the next certified plugin?”**

---

## Kernel change governance

Kernel changes must be rare, deliberate, and justified.

### Kernel design principle

> **The kernel exists to reduce future complexity, not to enable today's feature.**

Every proposed kernel change must answer: **Will this make the next ten plugins simpler?**

If the answer is no, it probably belongs in the plugin instead.

### Review process

Use the `kernel-change` label on any pull request that modifies kernel behaviour, execution laws, or plugin interfaces.

Complete a **Constitution Review** before merge. See [`CONSTITUTION_REVIEW.md`](./CONSTITUTION_REVIEW.md).

Such PRs require answers to:

1. Which execution or cognitive law is affected?
2. Which plugin interfaces change?
3. Which certified mission families are impacted?
4. What is the migration plan?

Kernel changes are permitted for correctness, security, performance, and plugin interface evolution — not solely to support one mission family.

If a mission requires kernel edits, redesign the interface first.

---

## Roadmap from here

### Platform foundation (complete or nearing completion)

- Cognitive Kernel
- Execution Kernel
- Runtime authority
- Certification contract

### Plugin certification (current era)

Each family follows the same gates — not its own execution path:

1. Loyalty (finish to L2 Certified)
2. Campaign
3. Store creation
4. Catalog / Menu
5. Booking
6. POS
7. Invoice & quoting
8. Commerce
9. Signage & C-Net

### Later

Distribution, data economy, cross-border execution — as certified plugins on the same kernel.

---

## Why this matters

For most of Cardbey’s history, there was rarely a moment where the team could say:

> This foundation is complete. From now on, we build on top of it.

That moment is now.

The architecture has become more valuable than any individual feature.

If Cardbey protects the constitutional documents, enforces certification, and holds the plugin discipline, development should become **predictable** instead of feeling like every new capability uncovers another fundamental flaw.

That is the transition from building an application to building a platform.

---

## Constitutional index

| Document | Path |
|----------|------|
| Platform Constitution (this document) | `docs/PLATFORM_CONSTITUTION.md` |
| Cognitive Constitution | `docs/COGNITIVE_KERNEL_SPEC.md` |
| Execution Constitution | `docs/EXECUTION_KERNEL_V1_CERTIFICATION.md` |

### Governance (not constitutions)

| Document | Path |
|----------|------|
| Constitution Review (PR checklist) | `docs/CONSTITUTION_REVIEW.md` |
| Mission Plugin Status (live board) | `docs/MISSION_PLUGIN_STATUS.md` |
| Kernel-change PR template | `.github/PULL_REQUEST_TEMPLATE/kernel_change.md` |
