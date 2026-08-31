# Product Ontology — Three Primary Spaces (LOCKED)

**Status:** Locked product ontology — governs platform design  
**Date:** 2026-08-09  
**Cursor rule:** `.cursor/rules/three-primary-spaces.mdc`

---

## 1. What is locked

Cardbey has **three primary product spaces**:

```text
                         CARDBEY
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
     MARKETPLACE        ★ PERFORMER ★       RESOURCES
          │                 │                 │
      Exchange             Work             Supply
      Discover          Coordinate          Knowledge
      Buy / Sell          Execute           Content
      Opportunities       Assist            Assets
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
                           USER
```

| Space | Fundamental question | Role |
|-------|----------------------|------|
| **Marketplace** | What can I get, offer, or exchange? | Commercial / network layer |
| **Performer** | What do I want to accomplish? | Intelligence + work + execution |
| **Resources** | What can be used to accomplish it? | Supply, ownership, reusable value |

**Account** (identity, membership, settings) sits under the triangle as the user anchor. It is **not** a fourth product space.

---

## 2. Design constraint (not a navigation redesign)

This ontology is a **design constraint for the whole platform**.

> Every other feature must exist as a **capability**, **object**, **view**, or **workflow** within one of those spaces—or as a **connection** between them—**not** as another top-level product.

Primary navigation may eventually become:

```text
Marketplace · Performer · Resources
              Account
```

That collapse is a **migration outcome**, not a prerequisite. Lock the ontology first; migrate UI incrementally when workflows are already being touched.

---

## 3. Second locked rule — runway ownership

| Layer | Owns |
|-------|------|
| **Performer** | Canonical **work runway** (understand → plan → produce → review → confirm → execute) |
| **Resources** | **Supply** for that work (material, ownership, reusable value) |
| **Marketplace** | **Exchange** of resulting or available value |

**No supporting capability should take over the Performer runway** unless the user explicitly chooses a specialized / manual / advanced view.

Users must not need to know URI, PIL, CBOS, Content Studio, Campaign Engine, Language Intelligence, Display Engine, etc. as separate products. They say what they want; Performer coordinates capabilities and resources.

---

## 4. The loop

```text
                  MARKETPLACE
                 exchange value
                 ↙           ↘
                ↙             ↘
         RESOURCES ←──────→ PERFORMER
        supply/value          action
             ↑                  │
             │                  │
             └──── outcomes ────┘
```

| Direction | Meaning |
|-----------|---------|
| Resources → Performer | Material and reusable value for work |
| Performer → Resources | New drafts, assets, reusable outcomes |
| Resources → Marketplace | Useful resources become exchangeable |
| Marketplace → Resources | Acquired things become usable |
| Marketplace → Performer | Opportunities become tasks |
| Performer → Marketplace | Prepare / list / operate commercial outcomes |

---

## 5. Module classification test

Use this test before treating any module as a product:

| Module | Correct classification |
|--------|------------------------|
| Universal Library | Content layer of **Resources** (current visual beginning of Resources) |
| Suitcase | Trends toward **My Resources** |
| Content Studio | Creative **capability** for Performer; optional deep view via Resources |
| Creator Studio | Creator management around **Resources → Marketplace** |
| Store Builder | Performer **capability** |
| Promotions / Campaigns | Performer jobs; artifacts may land in Resources / Marketplace |
| Display / Website / Social | **Destinations** Performer can operate |
| CRM / Orders / Loyalty / Catalog | Business **state / capabilities** |
| URI / PIL / CBOS / MI / LLMs | **Internal intelligence** — never top-level products |

If a proposal cannot answer “which space or which edge?”, it fails the ontology test.

---

## 6. Resources is larger than today’s Library

```text
RESOURCES
│
├── Content
│   ├── Images, Video, Audio, Templates, Documents
├── My Resources
│   ├── Uploads, Store assets, Previous creations, Saved
├── Cardbey Resources
│   ├── Originals, Creator resources, Business resources
└── Global Resources
    └── URI Federation (Pexels, Openverse, Wikimedia, …)
```

Later, Resources may include knowledge, reusable business components, capabilities, and services—not only media.

**Implication for current Library work:** do not grow Universal Library into a standalone content application. Build **Resources so Performer always has material**, while keeping Resources visually accessible when humans need to inspect, choose, replace, upload, or manage.

---

## 7. Immediate work pattern (Library / creation)

```text
RESOURCES
Universal Library
      │ supplies
      ▼
PERFORMER
understand → select resources → create
      │ produces
      ▼
DRAFT / ARTIFACT
      ├── refine with Performer
      ├── manual edit (optional capability)
      ├── save → Resources
      └── confirm → execute
                     │
          ┌──────────┼──────────┐
          ↓          ↓          ↓
       Display    Website     Social
                               │
                               ▼
                          Marketplace
                     when exchangeable
```

---

## 8. Migration policy

1. **Now:** ontology locked (this doc + Cursor rule).  
2. **Ongoing:** every new implementation and every touched workflow must respect the two rules.  
3. **Later:** collapse competing top-level nav/products incrementally—never as a big-bang UI rewrite required for correctness.

---

## 9. Related documents

| Doc | Relationship |
|-----|--------------|
| `docs/PLATFORM_CONSTITUTION.md` | Platform laws; product spaces sit above module taxonomy |
| `docs/UNIFIED_PERFORMER_RUNWAY.md` | Execution-path convergence under Performer |
| `docs/IMPACT_REPORT_SINGLE_RUNWAY_CONVERGENCE.md` | Historical runway consolidation |
| Dashboard `docs/PLAN_PERFORMER_ONE_ASSISTANT.md` | One user-facing agent identity |
| `.cursor/rules/safe-execution-governance.mdc` | Confirm before material external effects |
| `.cursor/rules/proactive-intelligence-layer.mdc` | PIL observes/suggests; does not become a product space |

---

## 10. Freeze statement

**Frozen 2026-08-09:**

1. Cardbey has three primary product spaces: **Marketplace**, **Performer**, and **Resources**. Everything else must justify itself as a capability, object, view, or workflow within/between those spaces—not as another top-level product.  
2. **Performer** owns the canonical work runway. **Resources** supplies the work. **Marketplace** exchanges the resulting or available value. No supporting capability takes over the Performer runway unless the user explicitly chooses a specialized/manual view.
