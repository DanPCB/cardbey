\# ADR-000: MI-First Architecture



\## Status

Accepted (Permanent)



\## Context

Cardbey experienced repeated regressions caused by:

\- UI-driven business logic

\- Manual-first workflows

\- Feature additions without MI orchestration

\- Diverging mental models of “what Cardbey is”



This caused forward/backward development cycles and systemic instability.



\## Decision

Cardbey SHALL be built as a \*\*Business Agent with Merged Intelligence (MI)\*\*.



MI owns:

\- Intent

\- Planning

\- Execution

\- Validation

\- Progress

\- Readiness



UI acts only as a console and override surface.



\## Consequences

\- Features without MI EntryPoints are rejected

\- Manual flows are secondary

\- Scalability is enforced by design

\- Rollbacks are preferred over drift



This decision overrides speed, convenience, and sunk cost.



