# Cardbey System Architecture

> **North star:** [The Cardbey Philosophy](./CARDBEY_PHILOSOPHY.md) — Independence, Opportunity, Capability.
> Major features should state which principle(s) they advance. Filter: *Build → Share → Multiply*.
> Design contract: [IMPACT_REPORT_TEMPLATE.md](./IMPACT_REPORT_TEMPLATE.md) — Principles Advanced, Trade-offs, Platform Capability Added.
>
> **Layers:** Philosophy (stable) → Platform (years) → Applications (continuous).

Visual map of frontend, backend, integration points, and component maturity.

> **Status legend:** 🟢 Running · 🟡 Freezing / Partial · 🔴 Placeholder / Not implemented

---

## Full System Diagram

```mermaid
flowchart TB
    subgraph Legend["Status Legend"]
        L1["🟢 Running / Implemented"]
        L2["🟡 Freezing / Partial / Flag-gated"]
        L3["🔴 Placeholder / Not implemented"]
    end

    subgraph FE["Frontend — cardbey-marketing-dashboard"]
        direction TB
        PUI["Performer Console<br/>/app · intake v2 · missions"]
        CC["Control Center<br/>/marketing · hero + metrics"]
        CCGov["BI Governance<br/>/control-center/*"]
        PIL["PIL Assistant<br/>Discover · Feed · Storefront"]
        AC["Ask Cardbey<br/>RAG panel"]
        LS["Layout Studio<br/>/tools/layout-studio"]
        SF["Storefront<br/>/s/:slug · preview"]
        CT["Control Tower<br/>/app/console/control-tower"]
        LPC["Live Performance<br/>store-scoped BI"]
    end

    subgraph API["Integration Layer"]
        REST["REST /api/*<br/>Vite proxy → Core :3001"]
        SSE1["SSE /api/stream"]
        SSE2["SSE platform activity"]
        SSE3["SSE mission blackboard"]
        GOV["Safe Execution Governance<br/>autoSubmit: false"]
    end

    subgraph BE["Backend — cardbey-core"]
        direction TB

        subgraph Intake["📥 Intake Layer"]
            IV2["Intake V2<br/>POST /api/performer/intake/v2"]
            IV1["Intake V1 shim<br/>deprecated forward"]
            LLMR["LLMReasoner<br/>ENABLE_LLM_REASONER"]
            IR["IntentReasoner<br/>deterministic"]
            RP["ReactPlanner<br/>ask/confirm/execute"]
        end

        subgraph Plan["📋 Planning Layer"]
            DP["Dynamic Planner<br/>ENABLE_DYNAMIC_PLANNER"]
            CP["Capability Proposal<br/>self-building hints"]
        end

        subgraph Exec["⚡ Execution Layer"]
            RK["Runtime Kernel<br/>EXECUTION_MODE=kernel"]
            PR["Performer Runtime<br/>executeRuntimeAction"]
            RMO["Mission Orchestrator<br/>ENABLE_RUNTIME_MISSION_ORCHESTRATOR"]
            TD["Tool Dispatcher<br/>registry → executors"]
            ORCH["Legacy Orchestrator<br/>/api/orchestrator creative"]
        end

        subgraph Mem["🧠 Memory Layer"]
            CE["Context Engine<br/>PerformerSessionContext"]
            EM["Episodic Memory<br/>MissionBlackboard events"]
            RAG["RAG Service<br/>RagChunk embeddings"]
            SM["Semantic Memory<br/>entity + business + user"]
            MF["Memory Facade<br/>POST /api/memory/bundle"]
        end

        subgraph Learn["📈 Learning Layer"]
            FB["Feedback Capture"]
            BA["Behavior Analysis"]
            CAL["Confidence Calibration"]
            PER["Personalization"]
        end

        subgraph Tools["🔧 Tools & Skills"]
            ST["Store Tools"]
            CT2["Campaign Tools"]
            PT["Product Tools"]
            GT["Graphic Tools"]
            SK["Skills API<br/>composable definitions"]
        end
    end

    subgraph DB["💾 Data Layer"]
        PG["SQLite / Postgres<br/>Prisma dual schema"]
        MS["Memory Store<br/>session · learning · blackboard"]
        RS["RAG Store<br/>RagChunk vector bytes"]
    end

    %% Frontend → API
    PUI --> REST
    PUI --> SSE3
    CC --> REST
    CC --> SSE2
    CC --> GOV
    CCGov --> REST
    PIL --> GOV
    AC --> REST
    LS --> REST
    SF --> REST
    CT --> REST
    LPC --> REST

    GOV --> PUI

    %% API → Backend intake
    REST --> IV2
    IV1 -.->|shim| IV2
    IV2 --> CE
    IV2 --> LLMR
    LLMR --> IR
    IV2 --> IR
    IR --> RP
    IR --> Learn
    RP --> DP
    RP --> PR
    DP --> PR
    PR --> RK
    RK --> TD
    RMO --> RK
    TD --> ST
    TD --> CT2
    TD --> PT
    TD --> GT
    SK --> TD

    CE --> IR
    CE --> RP
    EM --> RP
    MF --> CE
    RAG --> LLMR
    LLMR --> RAG

    Learn --> IR
    FB --> BA
    BA --> CAL
    CAL --> PER
    PER --> IR

    IV2 --> PG
    CE --> MS
    EM --> MS
    RAG --> RS
    Learn --> MS

    classDef running fill:#22c55e,stroke:#166534,color:#fff
    classDef freezing fill:#f59e0b,stroke:#92400e,color:#000
    classDef placeholder fill:#ef4444,stroke:#991b1b,color:#fff

    class PUI,CC,CCGov,PIL,AC,LS,SF,LPC,IV2,IR,RP,RK,PR,TD,CE,EM,MF,FB,BA,CAL,PER,ST,CT2,PT,GT,SK,PG,MS,REST,SSE1,SSE2,SSE3,GOV running
    class IV1,LLMR,DP,CP,RMO,ORCH,RAG,SM,CT freezing
```

---

## Integration Flow (Performer Path)

```mermaid
sequenceDiagram
    participant User
    participant Dashboard as Dashboard SPA
    participant Gov as Safe Execution Governance
    participant Core as cardbey-core
    participant Intake as Intake V2
    participant Reason as IntentReasoner
    participant Runtime as Runtime Kernel
    participant Tools as Tool Dispatcher

    User->>Dashboard: Type intent / click CTA
    Dashboard->>Gov: buildGovernedPerformerIntent
    Gov-->>Dashboard: autoSubmit: false if high-impact
    Dashboard->>Core: POST /api/performer/intake/v2
    Core->>Intake: classify + context bootstrap
    Intake->>Reason: processIntake
    Reason->>Runtime: performerRuntime.execute
    Runtime->>Tools: dispatch registered tool
    Tools-->>Core: result + episodic write-back
    Core-->>Dashboard: mission response / checkpoint
    Dashboard->>User: blackboard SSE + UI update
```

---

## Component Status Matrix

| Layer | Component | Status | Notes |
|-------|-----------|--------|-------|
| **Frontend** | Performer Console | 🟢 Running | Primary surface at `/app` |
| | Control Center | 🟢 Running | `/marketing` + operations hero |
| | BI Governance | 🟢 Running | `/control-center/*` workflows |
| | PIL | 🟢 Running | Observe → Confirm → Performer handoff |
| | Storefront | 🟢 Running | Canonical renderer + commerce |
| | Ask Cardbey | 🟢 Running | Hidden on Performer-first surfaces |
| | Layout Studio | 🟢 Running | Standalone layout tool |
| | Control Tower | 🟡 Partial | Overview wired; tabs mock |
| | Console sidebar stubs | 🔴 Placeholder | stores/products/integrations |
| **Intake** | Intake V2 | 🟢 Running | Primary API entry |
| | Intake V1 | 🟡 Freezing | Deprecated shim to V2 |
| | LLMReasoner | 🟡 Freezing | Flag-off by default |
| | IntentReasoner | 🟢 Running | Always-on deterministic path |
| | ReactPlanner | 🟢 Running | ask/confirm/execute layer |
| **Planning** | Dynamic Planner | 🟡 Freezing | Flag-off by default |
| | Capability Proposal | 🟡 Partial | Self-building hints |
| **Execution** | Runtime Kernel | 🟢 Running | Default `EXECUTION_MODE=kernel` |
| | Tool Dispatcher | 🟢 Running | Registry → executors |
| | Mission Orchestrator | 🟡 Freezing | Proactive step sequencing |
| | Legacy Orchestrator | 🟡 Partial | Creative `/api/orchestrator` |
| **Memory** | Context Engine | 🟢 Running | Session workflow state |
| | Episodic Memory | 🟢 Running | Blackboard events |
| | Memory Facade | 🟢 Running | Unified bundle API |
| | RAG | 🟡 Partial | Schema + service; reasoner flag-off |
| | Semantic Memory | 🟡 Partial | Distributed (no single module) |
| **Learning** | Feedback / Analysis / Calibration / Personalization | 🟢 Running | Wired into reasoner |
| **Tools** | Store / Campaign / Product / Graphic | 🟢 Running | Registered executors |
| | Skills | 🟢 Running | Mixed real/stub executors |
| **Data** | SQLite / Postgres | 🟢 Running | Prisma dual schema |
| | Memory Store | 🟢 Running | Context + learning + blackboard |
| | RAG Store | 🟡 Partial | RagChunk exists; usage partial |

---

## Summary Statistics

| Status | Count | Share |
|--------|-------|-------|
| 🟢 Running | 24 | 62% |
| 🟡 Freezing / Partial | 13 | 34% |
| 🔴 Placeholder | 2 | 5% |
| **Overall maturity** | — | **~78% production-ready** |

---

## Key Entry Points

| Concern | Path |
|---------|------|
| Frontend routes | `apps/dashboard/cardbey-marketing-dashboard/src/App.jsx` |
| Performer intake client | `src/app/console/performer/useIntakeV2.ts` |
| Control Center | `src/components/controlCenter/CardbeyControlCenter.tsx` |
| Governance | `src/lib/governance/safeExecutionGovernance.ts` |
| Backend server | `apps/core/cardbey-core/src/server.js` |
| Intake V2 pipeline | `apps/core/cardbey-core/src/routes/performerIntakeV2Routes.js` |
| Feature flags | `apps/core/cardbey-core/.env.example` |

---

## Related Docs

- [CARDBEY_CONTROL_CENTER_AUDIT.md](./CARDBEY_CONTROL_CENTER_AUDIT.md)
- [CONTROL_CENTER_PHASE_E_PIL.md](./CONTROL_CENTER_PHASE_E_PIL.md)
- [UNIFIED_PERFORMER_RUNWAY.md](./UNIFIED_PERFORMER_RUNWAY.md)
- [CONTEXT_ENGINE.md](./CONTEXT_ENGINE.md)
