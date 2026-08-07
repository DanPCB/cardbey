# The Cardbey Philosophy

This document defines what Cardbey is being built towards. It sits above feature roadmaps and subsystem missions. Every major feature proposal should state which principle(s) it advances.

Philosophy is an **active engineering constraint**, not passive vision text: it opens architecture docs and is encoded in `.cursor/rules/cardbey-philosophy.mdc` so proposals are evaluated against it during implementation.

---

## 1. Independence

**Give everyone the tools to build and control their own digital world.**

People should be able to create, manage and grow their digital presence, business and ideas independently, without unnecessary technical barriers or dependence on specialists.

**Question every feature should answer:** Does this make people more independent?

## 2. Opportunity

**Give everyone a stage to create, share, exchange and grow.**

Everyone should have the opportunity to express their ideas, connect with others, build communities and create economic value from what they do, wherever they are.

**Question every feature should answer:** Does this create more opportunities for people?

## 3. Capability

**Help everyone turn their knowledge, creativity and experience into reusable capabilities that others can discover, use and build upon.**

Knowledge becomes more valuable when it can be reused. Cardbey should help people package what they know—whether it is content, business processes, AI assistants, templates, designs or workflows—so that others can benefit from it while creators retain ownership and receive recognition or compensation where appropriate.

**Question every feature should answer:** Does this help people multiply the value of what they know?

---

## Three layers (separation of concerns)

| Layer | Examples | Change rate |
|---|---|---|
| **Philosophy** | Independence, Opportunity, Capability | Unlikely to change |
| **Platform** | Universal Library, Performer, Business Engine, Marketplace, Content Engine | Evolves over years |
| **Applications** | Store builder, Creator Studio, Digital Signage, Websites, Marketing, AI tools | Evolves continuously |

This separation lets Cardbey adopt new technologies while staying anchored to the same mission. Over multi-year horizons, that consistency is often more valuable than any single feature.

---

## How these principles define architecture

You do not have to invent separate missions for each subsystem. The principles naturally lead to product surfaces:

| Principle | What it naturally leads to |
|---|---|
| Independence | AI Assistant, Business tools, Store builder, Website builder, Digital presence, Automation |
| Opportunity | Marketplace, Social commerce, Universal Library, Discovery, Community, Creator ecosystem |
| Capability | AI agents, Templates, Workflows, Content Engine, Universal Library, Licensing, Knowledge sharing |

Every major feature should fit under one or more of these principles.

---

## Strategic filter (next three years)

Every major proposal can be evaluated with three questions:

1. Does it increase **independence**?
2. Does it create **opportunity**?
3. Does it transform knowledge into reusable **capability**?

If the answer is **no** to all three, it is probably not central to Cardbey.

---

## Architecture review questions

Whenever someone proposes a major feature, ask:

1. **Which principle(s) does this advance?**
2. **Is this a platform capability or just an application feature?**
3. **Can other parts of Cardbey reuse it?**
4. **Will this still make sense in five years** if today's AI models, UI frameworks, or APIs change?

The fourth question keeps architecture focused on enduring concepts rather than transient technologies.

---

## The progression

These principles form an elegant progression:

| Focus | Principle | Product lens |
|---|---|---|
| Individual | Independence | **Build** |
| Community / market | Opportunity | **Share** |
| Long-term compounding value | Capability | **Multiply** |

```
Individual
      ↓
Community
      ↓
Collective Intelligence
```

```
Build
      ↓
Share
      ↓
Multiply
```

This is broader than being an e-commerce platform, a social network, or an AI tool. Cardbey is infrastructure for people to create value, exchange it, and continually build upon what already exists.

---

## Documentation contract (major design docs)

Every major design document (`PLAN_*`, phase architecture maps, and major `IMPACT_REPORT_*` for new capabilities) **must** include the following sections near the top—after a short summary, before implementation detail.

Use the copy-paste skeleton in [IMPACT_REPORT_TEMPLATE.md](./IMPACT_REPORT_TEMPLATE.md).

### Required: Principles Advanced

```markdown
## Principles Advanced

### Independence
✔ Helps users...
<!-- or: — Not addressed in this phase -->

### Opportunity
✔ Creates new opportunities by...
<!-- or: — Not addressed in this phase -->

### Capability
✔ Converts knowledge into reusable capabilities by...
<!-- or: — Not addressed in this phase -->

### Trade-offs
- Which principles are intentionally not addressed?
- Does this proposal reduce or conflict with any existing capability?
```

**Trade-offs** matter: a feature may strengthen one principle while weakening another. Recording that explicitly helps future reviewers understand why a decision was made.

### Required: Platform Capability Added

Not only “what changed,” but **what new platform capability exists** and what it unlocks later:

```markdown
## Platform Capability Added

This phase introduces:

- ...

Future phases enabled:

- ...
```

Example shape:

- Introduces: universal content discovery, canonical asset contracts, provider registry  
- Enables later: creator marketplace, AI enrichment, semantic search, licensing  

Also classify: **platform capability** vs **application feature** (see Architecture review questions).

---

## Documentation placement

1. Keep these three principles at the beginning of architecture and product guides.
2. Require every major feature proposal to complete Principles Advanced + Trade-offs + Platform Capability Added.
3. Keep product decisions aligned even as technology and individual features evolve.

Related:

- Design doc template: [IMPACT_REPORT_TEMPLATE.md](./IMPACT_REPORT_TEMPLATE.md)
- Development process rules: [DEVELOPMENT_PRINCIPLES.md](./DEVELOPMENT_PRINCIPLES.md)
- System map: [system_architecture.md](./system_architecture.md)
