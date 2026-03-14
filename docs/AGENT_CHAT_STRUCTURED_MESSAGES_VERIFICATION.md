# Agent Chat structured messages – verification checklist

## Scope

- **MessageRenderer**: switch on `message.messageType` (text, research_result, plan_update, campaign_proposal, approval_required, artifact).
- **Approval flow**: ApprovalCard buttons POST system decision; server accepts `senderType: 'system'`; no orchestrator side effects.
- **Agent helpers**: Research/RAG emit `research_result` with payload; createAgentMessage accepts `messageType` + `payload`.

## Pre-conditions

- Backend: migration applied (`messageType`, `payload` on AgentMessage).
- GET `/api/agent-messages` returns `messageType` and `payload`.
- POST `/api/agent-messages` accepts legacy `{ missionId, text }` and structured/system bodies.

## Manual verification

### 1. Chat send/receive and SSE

- [ ] Open Agent Chat for a mission.
- [ ] Send a text message; it appears and planner (or research) can reply.
- [ ] SSE badge shows "Live" when stream is connected.
- [ ] No layout break; scroll and filter by agent still work.

### 2. Text and research_result

- [ ] Existing text-only messages still render as bubbles (no regression).
- [ ] When Research/RAG runs, new message shows as **ResearchCard** (collapsible details) with summary and "Details" (query, sources/citations).
- [ ] Research/Planner badges and timestamps still show.

### 3. Approval flow

- [ ] Send or seed a message with `messageType: 'approval_required'` and `payload: { prompt: 'Choose', options: [{ id: 'a', label: 'Approve' }, { id: 'b', label: 'Reject' }] }` (e.g. via API or test).
- [ ] ApprovalCard shows prompt and two buttons.
- [ ] Click "Approve": a new system message appears ("Decision: Approve"); buttons disable and "Decision recorded" shows.
- [ ] No planner reply is triggered for that system message (check logs: "System decision recorded").

### 4. Fallback and debug

- [ ] Message with unknown `messageType` or missing payload renders as text bubble (and in development, a short "Debug: …" line).
- [ ] No crash when `payload` is null or malformed for a card type.

### 5. Other card types (when payload present)

- [ ] **plan_update**: payload `{ title, steps: string[], status? }` → PlanCard with steps list.
- [ ] **campaign_proposal**: payload `{ title?, sections: [{ heading, body }] }` → CampaignProposalCard with sections.
- [ ] **artifact**: payload `{ title?, url?, preview? }` → ArtifactCard with preview and "Open" link.

## Screenshots guidance

1. **Agent Chat list** – one text bubble, one ResearchCard (expanded), one ApprovalCard (before/after decision).
2. **ApprovalCard** – before click (buttons enabled) and after (buttons disabled + "Decision recorded").
3. **Fallback** – one message with invalid/missing payload showing text bubble + debug line (dev only).

## API quick checks

- `POST /api/agent-messages` with `{ missionId, text }` → 201, message has `messageType: 'text'`, `payload: null`.
- `POST /api/agent-messages` with `{ missionId, senderType: 'system', text: 'Decision: Yes', payload: { decidedMessageId, optionId, optionLabel } }` → 201, no planner trigger.
- `GET /api/agent-messages?missionId=...` → each message includes `messageType` and `payload`.

## meta.validationError and SSE consistency

- **POST** when validation coerces (e.g. text truncated, payload normalized) → 201 response includes `meta: { validationError: "..." }`; same shape is broadcast on SSE so all clients get it.
- **MessageRenderer**: if `row.meta?.validationError` exists, a subtle warning line appears under the message: "Validation: &lt;message&gt;" (small text, muted, left border).
- **SSE**: `agent-message` event `data` is `{ missionId, message }`; `message` has `messageType`, `payload`, and `meta` when present. In development, missing `messageType` or `payload` on the event logs a console warning.
- **Quick check**: Trigger a validation coercion (e.g. send text &gt; 32KB or approval_required with empty options then fix and send valid); confirm the created message shows the validation line under it and response/SSE include `meta.validationError`.
