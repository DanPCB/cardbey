# Cardbey AI-First Console — UI Architecture & Refactoring Plan

**Status:** Proposal only — no code execution.  
**Scope:** Unified UI architecture, screen hierarchy, layout, flows, onboarding, mission lifecycle, KPI proposals, design philosophy.  
**Current state:** Fragmented UI (marketing homepage, `/dashboard`, `/app/back`, agent test pages, templates).  
**Target:** Single AI-first Business Operating System with Hero → soft fade → Console.

**Mental model:** Mission-centric, not chat-centric. Conversation is the interface; mission is the unit of work.

---

## 1. UI Architecture Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CARDBEY UI ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  PUBLIC LAYER (unauthenticated)                                           │   │
│  │  Route: /                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐  │   │
│  │  │  HERO SCREEN                                                         │  │   │
│  │  │  • Positioning, value prop, CTA "Start Free"                          │  │   │
│  │  │  • Idle 5s OR click CTA → soft fade to Console (or /login if needed)  │  │   │
│  │  │  • Hover / focus cancels auto-fade timer                             │  │   │
│  │  • Scroll cancels auto-fade permanently for that visit               │  │   │
│  │  └─────────────────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                           │
│                          transition (fade 600–800ms)                             │
│                                      ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  CONSOLE LAYER (authenticated)                                            │   │
│  │  Route: /app                                                               │   │
│  │  ┌────────┬───────────────────────────────────────────────┬──────────────┐  │   │
│  │  │ SIDEBAR│  [Current Mission Context]  ← workspace header  │  EXECUTION   │  │   │
│  │  │(hidden │  CONVERSATIONAL WORKSPACE (resizes when        │  DRAWER      │  │   │
│  │  │ hover  │   drawer open — not overlay)                   │  (structural │  │   │
│  │  │ pin)   │  • Thread + structured blocks                 │   panel;     │  │   │
│  │  │        │  • Multi-line input + mode toggle + attach     │   task graph │  │   │
│  │  │Mission │  • Notification bell (KPI) — top right         │   + report)  │  │   │
│  │  │Logs    │                                                │              │  │   │
│  │  └────────┴───────────────────────────────────────────────┴──────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Supporting (unchanged for this plan): /login, /signup, /p/*, /s/*, /feed, etc.   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Screen Hierarchy

| Level | Screen | Route | Purpose |
|-------|--------|--------|---------|
| **L0** | Hero (public) | `/` | Single public landing; positioning; CTA "Start Free"; gate to console. |
| **L1** | Console | `/app` | Main operational surface. Mission-centric workspace (conversation = interface; mission = unit of work) + sidebar + execution drawer. |
| **L1a** | Console — Mission chat | `/app/missions/:missionId` | Same layout; workspace shows mission thread; drawer shows execution for that mission. |
| **L2** | Mission log detail | `/app/logs/:logId` or drawer/side panel | Versioned mission report; read-only or "Re-run" / "Branch". |
| **L3** | Deep links (unchanged) | `/app/store/:id/review`, `/preview/*`, `/dashboard/*`, etc. | Existing flows; reachable from console via links or sidebar. |

**Consolidation rules:**

- **Dashboard:** Treat current `/dashboard` and `/app/back` as legacy. New canonical "operational home" = `/app` (Console). Migrate links so "Dashboard" points to `/app` or a Console default view.
- **Agent Chat Test / Threads:** Absorb into Console as the default workspace; missions become first-class (Mission Log in sidebar → open in workspace).
- **BackOffice** (`/app/back`): Either redirect `/app/back` → `/app` with workspace + sidebar, or keep as secondary "classic" layout until full migration; plan assumes eventual single entry `/app`.

---

## 3. Layout Structure — Console (`/app`)

### 3.1 Zones (Exact)

| Zone | Position | Width / behavior | Content |
|------|-----------|-------------------|---------|
| **Workspace header** | Top of workspace | Full width of workspace | **Current Mission Context** — shows active mission title or "No active mission." Always visible. Shifts mindset from chat app to mission control. |
| **Sidebar** | Left | Hidden by default; ~56px collapsed rail on hover; expand to ~220px on hover; **pin toggle icon at top of rail** (for long sessions). | Mission Logs, Settings, Account, optional links (minimal nav). No marketing copy. |
| **Workspace** | Center | Flex 1; **when drawer opens, workspace narrows** (drawer does not overlay). Max-width for content column (e.g. 720px) when drawer closed. | Conversation thread; structured blocks. |
| **Chat input** | Bottom of workspace | Full width of workspace; multi-line | Text input, mode toggle (Pipeline / AI Operator), attachment (image, CSV, URL), Send. |
| **Notification bell** | Top-right of workspace (or top bar) | Icon + badge count | KPI-triggered proposals; click opens dropdown (see §7). |
| **Execution drawer** | Right | **Structural panel:** 320–400px; when open, **resizes workspace** (does not overlay). Opens when a mission is running. | Task graph (nodes/edges), status per step, validation (1–2s), Mission Report; link to Mission Log. Feels first-class, not temporary. |

### 3.2 Visual Hierarchy

- **Dominant:** Workspace (mission context header + thread + input). Largest area; mission is the focus.
- **Secondary:** Execution drawer when open — **part of layout** (resizes workspace), not overlay; sidebar when revealed or pinned.
- **Tertiary:** Notification bell; suggestion chips (dismissible).

### 3.3 Layout Sketch (ASCII)

```
[rail] [===== Workspace =====] [ Execution drawer ]
 pin   [ Current Mission     ] [ task graph       ]
  │    [ Context / No active ] [ status           ]
  │    [ ————————————————    ] [ Mission Report   ]
  │    [ messages + blocks    ]   (resizes ws)
  │    [ ————————————————    ]
  │    [ Mode: [Pipe][AI] 📎 ]     ↑ structural,
  └    [ chips (first run)   ]     not overlay
       [🔔]  ← notification bell
```

---

## 4. Interaction Flows

### 4.1 Hero → Console Transition

| Event | Behavior |
|-------|----------|
| Page load at `/` | Show Hero; start idle timer 5s. |
| User clicks "Start Free" | If unauthenticated → navigate to `/login?returnTo=/app`; if authenticated → navigate to `/app` with soft fade. |
| 5s idle (no hover/focus/click/scroll) | Soft fade (600–800ms) to `/app` (or `/login?returnTo=/app` if not authenticated). |
| User hovers or focuses any element | Cancel idle timer; do not auto-fade. |
| **User scrolls Hero** | **Cancel auto-fade permanently for that visit.** Avoids feeling manipulative. |
| User leaves (blur, mouse out) | Optionally restart 5s timer only if scroll has not occurred (one-shot after scroll). |

**Transition animation concept:**  
Opacity fade (Hero 1 → 0) and optional slight scale (1 → 0.98) or blur; then route change to `/app`; then Console fades in (0 → 1). No sliding of entire page to avoid "marketing strip" feel.

### 4.2 Console — Core Interactions

- **Sidebar:** Hidden by default. Hover on left edge (e.g. 24px strip) reveals rail. **Minimal pin toggle icon at top of rail** — when pinned, sidebar stays open (for operators in long sessions). Click Mission Log entry → load that mission in workspace (URL `/app/missions/:missionId`).
- **Input:** User types or uses chips → Send → message added to thread; backend/agent responds; structured blocks rendered below.
- **Mode toggle:** Pipeline = structured pipeline runs (store gen, campaign, etc.); AI Operator = open-ended operator. Affects next submission only (or session default).
- **Attachment:** Button opens picker (image, CSV, URL); attach to next send.
- **Execution drawer:** Opens automatically when a mission run starts; **resizes workspace** (does not overlay). Shows task graph and status; user can close after run; "View in Mission Log" persists. Feels structural, not like a modal.

### 4.3 State Transitions (High-Level)

```
[ Hero ] ──(click / 5s idle)──► [ Login? ] ──(auth)──► [ Console ]
                                     │
[ Console ] ◄────────────────────────┘
     │
     ├── (send message) ──► [ Plan proposal in thread ]
     │                            │
     │                            ├── Confirm ──► [ Validating 1–2s ] ──► [ Executing ] ──► [ Report ] ──► [ Mission Log ]
     │                            ├── Modify ──► (back to thread / edit plan)
     │                            └── Cancel ──► (stay in thread, no run)
     │
     ├── (click KPI notification) ──► [ Proposal card ] ──► "Review Full Plan" ──► (inject into thread or open in workspace)
     │
     └── (sidebar: Mission Log) ──► [ Mission list ] ──► (select) ──► [ Mission in workspace ]
```

---

## 5. First-Time User Onboarding (Console)

### 5.1 Auto-Start System Message

- On first load of `/app` (or first time ever in console): show system message in workspace:
  - **Copy:** "Welcome to Cardbey Console. What would you like to run today?"
- Below message: **3–5 suggestion chips** (e.g. "Create a store", "Run a campaign", "Analyze performance", "Generate social content").

### 5.2 Onboarding Bubbles (3–5)

| # | Target | Message (short) | Placement |
|---|--------|------------------|-----------|
| 1 | Command bar / input | "Type or use chips to run missions." | Above or next to input |
| 2 | Mode toggle | "Switch between Pipeline and AI Operator." | Near toggle |
| 3 | Sidebar hover | "Hover here for Mission Log and settings." | Left edge |
| 4 | Notification bell | "KPI proposals will appear here." | Near bell |
| 5 | Execution drawer | "When a mission runs, the execution appears here." | Right edge (when drawer opens first time) or after first run |

### 5.3 Onboarding Rules

- **Do not block:** User can type and send before dismissing bubbles.
- **Do not repeat:** Each bubble shows at most once per target.
- **Dismissible:** Click outside or "Got it" to dismiss.
- **Never again:** Persist "onboarding completed" (e.g. `cardbey.console.onboarding.v1 = true`) after all dismissed or first mission completed; never show again.

---

## 6. Mission Lifecycle UX

### 6.1 Flow (End-to-End)

1. **User intent** — User types or selects chip in console.
2. **AI structured plan proposal** — Assistant responds with a **Plan proposal block** (see 6.2).
3. **Confirm & Run** — User chooses **Confirm** / **Modify** / **Cancel**.
4. **Final validation** — On Confirm: show **Validation UI** (1–2s real checks); spinner or checklist (e.g. "Validating store context", "Checking permissions").
5. **Execution** — Task graph visible in **Execution drawer**; nodes = steps, edges = dependencies; status (pending / running / done / failed).
6. **Mission Report** — When run completes, show **Structured Mission Report** in drawer (and optionally in thread).
7. **Permanent Mission Log** — One entry per mission; link from report "View in Mission Log"; versioning when mission is modified and re-run.

### 6.2 Plan Proposal UI Block

- **Sections (structured):** Objectives, Steps (numbered), Budget (if applicable), Risk, Confidence (e.g. % or Low/Medium/High), Links (e.g. to store, campaign).
- **Actions:** [Confirm] [Modify] [Cancel]. Modify returns to conversation or inline edit of plan.

### 6.3 Validation UI (Real Checks)

- 1–2 second duration; real backend or client checks (e.g. store exists, permissions).
- Visual: Small checklist or spinner with label "Validating…" and optional step labels. No fake progress.

### 6.4 Execution Graph Layout

- **Drawer:** Vertical or horizontal DAG; nodes = task name + status icon; edges = dependency; highlight current running node. Compact so 5–10 nodes visible without scroll if possible.

### 6.5 Structured Mission Report Layout

- **Sections:** Summary, Steps completed, Artifacts / links, Errors (if any), Next steps (optional).
- **Actions:** "View in Mission Log", "Re-run", "Branch" (new mission from this).

### 6.6 Versioned Mission Log Behavior

- Each mission has an id; each run can create a new "version" (e.g. run timestamp or version number).
- Log list: show mission title + last run time + status; select → open in workspace with full history; version selector to switch between runs (optional in v1).

---

## 7. KPI-Triggered Proposal UX

### 7.1 Console Behavior

- **Notification badge:** Visible on bell icon when there are unread KPI proposals (count or dot).
- **Clicking badge:** Opens **dropdown** (not full page); does **not** auto-inject into chat.

### 7.2 Notification Dropdown Layout

- List of proposal cards (compact).
- Each card: **Anomaly** (short), **Diagnosis**, **Confidence**, **Proposed solution** (one line), **Budget impact** (if any).
- Primary action: **"Review Full Plan"** → moves into conversation (e.g. open thread with this proposal as context, or inject as first assistant message for user to confirm/modify).

### 7.3 Proposal Card Structure (per item)

| Field | Shown in card |
|-------|----------------|
| Anomaly | 1 line |
| Diagnosis | 1–2 lines |
| Confidence | Badge or % |
| Proposed solution | 1 line |
| Budget impact | Optional short line |

### 7.4 KPI Precompute — Lazy LLM Rule

- **Do not compute LLM proposals until the user has opened the Console at least once.** Otherwise background cost grows silently.
- KPI engine may **detect anomalies cheaply** (rules, thresholds, aggregates).
- **Generate LLM proposals lazily** — e.g. when user first loads `/app`, or when user opens the proposals dropdown. This keeps cost predictable and tied to actual usage.

### 7.5 Rate Limiting UX

- If proposals are rate-limited: show "Proposals refresh in X min" or disable "Review Full Plan" with tooltip. No auto-refresh spam.

### 7.6 Dismiss Behavior

- User can dismiss a proposal (card or dropdown) without taking action; mark as read; do not show again in badge count.

### 7.7 Auto-Approve Toggle (Deferred)

- Per proposal type or global: "Auto-approve future similar cases" — **defer until Console core is stable** (see §10 Strategic Risk). When implemented: store in user prefs; clearly label impact.

---

## 8. Design Philosophy (Checklist)

### 8.1 Console Tone

- [ ] **Calm** — No urgency copy; neutral tone.
- [ ] **Executive** — Concise, decision-oriented.
- [ ] **Structured** — Use blocks (objectives, steps, budget, risk, confidence, links).
- [ ] **System-like** — Feels like an OS/console, not a marketing site.
- [ ] **Minimal** — No decorative marketing inside `/app`.

### 8.2 Chat Response Rules

- [ ] Include **structured blocks** where applicable: Objectives, Steps, Budget, Risk, Confidence, Links.
- [ ] Avoid over-enthusiastic language.
- [ ] Avoid emojis (or minimal and subtle only).
- [ ] Avoid long paragraphs; prefer short sentences and lists.

### 8.3 What to Avoid in Console

- [ ] No marketing copy inside `/app`.
- [ ] No mixing Hero CTAs or feature lists in workspace.
- [ ] No fake progress in validation (real 1–2s checks only).

---

## 9. Key UI Components List (Proposed)

| Component | Responsibility |
|-----------|-----------------|
| **HeroScreen** | Public `/`; CTA; idle timer; transition trigger. |
| **ConsoleShell** | Layout for `/app`: sidebar rail + workspace (resizes with drawer) + execution drawer. |
| **WorkspaceHeader** | Always shows "Current Mission Context" or "No active mission." |
| **ConsoleSidebar** | Collapsed rail; hover expand; **pin toggle at top of rail**; Mission Log list; Settings/Account. |
| **ConversationWorkspace** | Thread view; message list; structured blocks renderer. |
| **ChatInput** | Multi-line input; mode toggle; attachment; Send; suggestion chips (first run). |
| **ExecutionDrawer** | Structural right panel (resizes workspace when open); task graph; validation UI; Mission Report; link to log. |
| **PlanProposalBlock** | Renders plan (objectives, steps, budget, risk, confidence); Confirm/Modify/Cancel. |
| **MissionReportBlock** | Summary, steps, artifacts, errors; View log / Re-run / Branch. |
| **KPIProposalDropdown** | Bell dropdown; list of proposal cards; Review Full Plan; dismiss. |
| **KPIProposalCard** | Anomaly, diagnosis, confidence, solution, budget impact; actions. |
| **OnboardingBubbles** | 3–5 bubbles; targets (input, mode, sidebar, bell, drawer); dismiss; persist. |
| **ValidationUI** | 1–2s real validation; checklist or spinner. |
| **MissionLogView** | List/detail of missions; version selector; open in workspace. |

---

## 10. Refactoring Plan (Phased)

### Phase 1 — Routing & Shell (no visual redesign yet)

- Introduce `/app` as **Console** route with **ConsoleShell** (sidebar hidden by default, workspace center, drawer slot right).
- Keep existing `/app/back` and `/dashboard` working; add redirect or nav entry "Console" → `/app`.
- Hero: add idle timer and "Start Free" → `/app` (or login); add transition animation (fade).

### Phase 2 — Workspace & Chat

- Implement **ConversationWorkspace** + **ChatInput** (multi-line, mode toggle, attachment).
- First-time system message + suggestion chips.
- Integrate existing agent/chat backend (e.g. missionId-based thread) so `/app` and `/app/missions/:missionId` render same conversation UI.

### Phase 3 — Mission Lifecycle

- **PlanProposalBlock** in thread; Confirm/Modify/Cancel.
- **ValidationUI** (real 1–2s); **ExecutionDrawer** with task graph and **MissionReportBlock**; Mission Log entry and versioning.

### Phase 4 — Onboarding & KPI

- **OnboardingBubbles** (3–5), dismissible, persist "onboarding completed".
- **KPIProposalDropdown** + **KPIProposalCard**; "Review Full Plan" into conversation; dismiss. **Defer** auto-approve toggle until Console core is stable.

### Phase 5 — Consolidation & Cleanup

- Migrate all "dashboard" entry points to Console where appropriate; deprecate or redirect `/app/back` to `/app`.
- Remove marketing tone from any console views; apply design checklist.
- Documentation and design-token audit for AI-first console.

### Strategic Risk — Do Not Implement Until Console Core Is Stable

- **High cognitive density:** The Console is a dense interface. Avoid over-structuring early.
- **Stick to the phased plan.** Do **not** implement the following until the Console core (Phases 1–3) is stable and in use:
  - **Autonomy ladder** (e.g. levels of AI autonomy)
  - **KPI auto-approve** (auto-approve future similar cases)
  - **Deep version comparison** (rich diff between mission versions)
- Implement these only after the core mission lifecycle and workspace feel solid.

---

## 11. Summary

| Deliverable | Section |
|-------------|---------|
| UI architecture diagram | §1 |
| Screen hierarchy | §2 |
| Layout breakdown (zones, hierarchy, sketch) | §3 |
| Interaction flows (Hero→Console; Console core; state transitions) | §4 |
| Onboarding flow | §5 |
| Mission lifecycle flow (plan → validate → execute → report → log) | §6 |
| KPI proposal flow (badge → dropdown → card → Review Full Plan); lazy LLM rule | §7 |
| Strategic risk (defer autonomy ladder, auto-approve, deep version comparison) | §10 |
| Design principles checklist | §8 |
| Key UI components list | §9 |
| Phased refactoring plan | §10 |

This document is the **refactoring plan only**. No code changes have been made. Implementation should follow the phased approach and the development-safety rule (assess impact, report, minimal safe patches).
