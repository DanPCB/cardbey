\# Cardbey System Contract



Cardbey follows a \*\*Single Runway Architecture\*\*.



The system has three layers only.



---



\# 1. Intent Interface (UI)



Users interact with the system through \*\*Intent\*\*.



Examples:

\- Create store

\- Launch promotion

\- Rewrite descriptions

\- Generate QR

\- Publish feed



UI responsibilities:



\- Collect user intent

\- Create `IntentRequest`

\- Display results

\- Display checkpoints



UI must \*\*never execute AI tasks directly\*\*.



---



\# 2. Orchestrator (Execution Engine)



The \*\*MI Orchestrator\*\* is the only system that executes tasks.



It consumes:

IntentRequest





It produces:





MissionEvent

Artifacts

Signals





Only the orchestrator may call:



\- LLM APIs

\- `/api/mi/orchestra/start`

\- store/draft mutation APIs



---



\# 3. Artifact Surfaces



Artifacts are \*\*viewers only\*\*.



Examples:



\- Draft Review

\- Storefront

\- Slideshow

\- Offer page

\- Intent feed



Artifacts may:





Display results

Request actions





Artifacts must \*\*never execute orchestration\*\*.



If a user action occurs on an artifact page:





Create IntentRequest

→ Mission Execution

→ Orchestrator





---



\# Single Runway Rule



If `missionId` exists:





Artifact UI

→ MUST create IntentRequest

→ MUST NOT call orchestration APIs





All execution runs through \*\*Mission Execution UI\*\*.



---



\# System Truth



The UI must render truth from:



\- `IntentRequest`

\- `MissionEvent`

\- `Artifacts`



Pipeline steps are \*\*labels only\*\*, not the source of truth.



---



\# Result Guarantee



Every completed intent must produce:





intent.result





Containing links to artifacts such as:



\- Draft Review

\- Offer page

\- QR

\- Feed



This prevents "completed but no outputs" states.



---



\# System Loop



Cardbey operates as:





Intent

→ Mission

→ Agents

→ Artifacts

→ Signals

→ Opportunities

→ New Intent





This is the \*\*AI Business Operator Loop\*\*.

