# Cardbey UI Map

Single Runway architecture: how intents flow from UI through execution to artifacts and back.

---

## How to read this map

### Single Runway

- **Only Mission Console and Global Interface create IntentRequests.**
- **Only Mission Execution runs intents** (via Inbox → `/run`).
- No other UI executes AI tasks.

### Results Surfaces

- Draft Review / Storefront / Slides / Campaigns are **viewers**.
- They can request actions, but **only by creating intents** (e.g. queue in Mission Inbox).

### Intent Capture

- Every offer becomes a **public page + QR + feed**.
- That captures demand from:
  - Google
  - AI assistants
  - Social links
  - Maps
  - QR scans (offline)

### Growth Loop

- **Signals** generate **IntentOpportunities**.
- Opportunities become new intents (queue fix).
- Agents run → artifacts improve → traffic grows.

---

## The one-sentence architecture rule

**UI submits intents → Orchestrator executes → Artifacts display → Signals feed opportunities → New intents.**

---

*See also: [SINGLE_RUNWAY_GUARDRAILS.md](./SINGLE_RUNWAY_GUARDRAILS.md), [MISSION_CONSOLE_LAUNCHER_UI_REDESIGN.md](./MISSION_CONSOLE_LAUNCHER_UI_REDESIGN.md).*
