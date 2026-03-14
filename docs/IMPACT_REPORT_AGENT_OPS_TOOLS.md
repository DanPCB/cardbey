# Impact Report: Agent Ops Tools + FIX_IMAGE_MISMATCH

**Date:** 2026-03-02  
**Scope:** Wire mission chat to /api/ops (status, audit-trail, images/detect-mismatch, rebind-by-stable-key); intent routing; single objective FIX_IMAGE_MISMATCH. No API contract changes to /api/draft-store/generate or /commit; no kernel transitions; no UI redesign.

---

## Current flow (discovery)

```
POST /api/agent-messages (requireAuth)
  → missionId, text, (optional imageUrl)
  → canAccessMission(missionId)
  → create AgentMessage (user)
  → broadcastAgentMessage / broadcastThreadMessage
  → if !isSystemDecision:
       scheduleOcrForMessage(missionId, message.id) when content.imageUrl  [OCR always scheduled when image present]
       shouldDispatchOnChatMessage(text) → allowHandleUserTurn
       handleUserTurn(missionId, tenantId, userMessage, threadId, triggerMessageId)  [import from orchestrator/agentChatTurn.js - FILE MISSING in repo]
  → 201 + message

handleUserTurn (intended): creates AgentRun (planner/ocr/research), executeAgentRunInProcess(run.id).

executeAgentRunInProcess(runId) [lib/agentRunExecutor.js]
  → Load run; status must be 'queued'
  → agentKey in: research | planner | ocr | reviewer | (internal tool when runInput.intent in INTERNAL_TOOLS)
  → ocr: runOcrExecutor → resolve image, extractTextWithFallback, post research_result, merge businessProfile, trigger planner
  → planner: runPlannerInProcess or runIntentExecutor(INTENT_V0_SET)
  → internal tool: executeInternalTool(missionId, intent, runInput, run) e.g. store_fix_image_mismatch (repairCatalog)
  → research/reviewer: their executors
```

**OCR gating today:** OCR is scheduled whenever the user message has `content.imageUrl`. There is no intent-based skip; text-only missions get a fallback when no image or OCR unreadable. **research_result** is created by the OCR executor and is not “required” by the route—it’s produced by the run.

**Risks if we change flow:**
- **Draft-store generate/commit:** Not touched; no risk.
- **Preview / publishing:** Not touched; no risk.
- **Image rendering:** Ops rebind only updates `draft.preview` (item imageUrl); ops layer already used in production; no change to rendering pipeline.
- **Auth/session:** Tool calls run server-side with `mission.createdByUserId`; we enforce admin (requireAdmin equivalent) before any ops tool. No cookie forwarding (no HTTP from agent); internal calls with userId for audit.
- **Regression (OCR path):** Intent routing will skip scheduling OCR for MARKETING and FIX_IMAGE_MISMATCH when intent is detected; BUSINESS_CARD_OCR and UNKNOWN keep current behavior (OCR scheduled when image present). Mitigation: intent classifier is keyword-based; only skip OCR when intent is explicitly MARKETING or FIX_IMAGE_MISMATCH.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| **handleUserTurn missing** | Implement minimal `orchestrator/agentChatTurn.js` that creates runs and calls executeAgentRunInProcess; add intent classification and FIX_IMAGE_MISMATCH branch. |
| **Admin bypass** | Ops tools only run after checking user is admin (same as /api/ops); non-admin gets friendly message, no tool calls. |
| **Mass rebind** | Server-side max 200 changes; if proposed changes > 200, stop and ask for confirmation (post message, do not apply). |
| **Audit trail** | /api/ops/images/rebind-by-stable-key already creates AuditEvent; ops tool runner uses same logic; log [AgentOps] with tool, entity, ok, ms, correlationId (no secrets). |
| **MARKETING without OCR** | When intent=MARKETING, do not schedule OCR for the message; planner can still run with existing context. |
| **FIX_IMAGE_MISMATCH without entity** | Single clarifying reply: “Which store/draft should I repair?” then stop (no run). |

---

## List of changed/added files

| File | Change |
|------|--------|
| `docs/IMPACT_REPORT_AGENT_OPS_TOOLS.md` | **New.** Impact report, flow, risks, test harness, QA checklist. |
| `src/lib/agentIntentRouter.js` | **New.** classifyIntent(text), parseEntityFromMessage(text, metadata). |
| `src/lib/opsToolRegistry.js` | **New.** OPS_TOOL_NAMES allow-list, isUserAdmin, executeOpsTool (internal calls), [AgentOps] logging. |
| `src/orchestrator/agentChatTurn.js` | **New.** handleUserTurn: intent routing, FIX_IMAGE_MISMATCH clarifying question or ops run. |
| `src/routes/agentMessagesRoutes.js` | **Changed.** Import intent router; classify intent; allowHandleUserTurn \|\| intent===FIX_IMAGE_MISMATCH; skip scheduleOcrForMessage when intent MARKETING or FIX_IMAGE_MISMATCH. |
| `src/lib/agentRunExecutor.js` | **Changed.** isOps branch; FIX_IMAGE_MISMATCH steps A–F (detect → dryRun → apply if ≤200 → verify), max changes guard, result message. |

---

## Before/After (agent flow)

**Before:**  
- User posts message → OCR scheduled if image present → handleUserTurn creates planner/ocr run → executor runs OCR then planner (or internal tool by intent).  
- No intent routing; no ops tools from agent.

**After:**  
- User posts message → **intent = classifyIntent(text)**.  
- If **FIX_IMAGE_MISMATCH**: no OCR; if no entityType/entityId → post “Which store/draft should I repair?” and stop; if entity + admin → create run agentKey=ops, objective=FIX_IMAGE_MISMATCH → executor runs ops flow (detect → dryRun → apply if ≤200 → verify) and posts result.  
- If **MARKETING**: no OCR scheduled; handleUserTurn can create planner run as before.  
- If **BUSINESS_CARD_OCR** or **UNKNOWN**: unchanged (OCR scheduled when image present).  
- Ops tools (getStatus, getAuditTrail, detectMismatch, rebindByStableKey) callable only from agent run with admin user; all logged with correlationId.

---

## Dev test harness (curl / manual)

**a) FIX_IMAGE_MISMATCH on a known draftStoreId (admin user)**  
```bash
# Replace <admin-jwt> and <missionId> and <draftStoreId>
curl -s -X POST "http://localhost:3001/api/agent-messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-jwt>" \
  -d '{"missionId":"<missionId>","text":"fix image mismatch for draftStore <draftStoreId>"}'
# Expect: 201 + message; then agent run starts; when done, agent message with "Image repair: N mismatch(es) detected; ..."
```

**b) MARKETING request with imageUrl (should not fail due to OCR)**  
```bash
curl -s -X POST "http://localhost:3001/api/agent-messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -d '{"missionId":"<missionId>","text":"suggest a marketing plan for this service","imageUrl":"https://example.com/image.jpg"}'
# Expect: 201; OCR is NOT scheduled (intent=MARKETING); planner may run if AUTO_DISPATCH_ON_CHAT and actionable.
```

**c) Direct ops endpoints (for comparison)**  
```bash
curl -s -H "Authorization: Bearer <admin-jwt>" "http://localhost:3001/api/ops/status?entityType=DraftStore&entityId=<id>"
curl -s -H "Authorization: Bearer <admin-jwt>" "http://localhost:3001/api/ops/audit-trail?entityType=DraftStore&entityId=<id>&limit=50"
curl -s -X POST "http://localhost:3001/api/ops/images/detect-mismatch" -H "Content-Type: application/json" -H "Authorization: Bearer <admin-jwt>" -d '{"entityType":"DraftStore","entityId":"<id>"}'
curl -s -X POST "http://localhost:3001/api/ops/images/rebind-by-stable-key" -H "Content-Type: application/json" -H "Authorization: Bearer <admin-jwt>" -d '{"entityType":"DraftStore","entityId":"<id>","dryRun":true}'
```

---

## Manual QA checklist

1. **Admin user: “fix image mismatch for draftStore &lt;id&gt;”**  
   - Expect: dryRun → apply (if OPS_IMAGE_REBIND_ENABLED=true and changes ≤200) → verify; agent message with counts and “After: 0 remaining” (or remaining count).

2. **Non-admin user: same message**  
   - Expect: agent reply “You don’t have permission to run image repair…”; no ops tool calls; no run or run fails fast.

3. **“suggest a marketing plan for this service” with non-text image**  
   - Expect: no business-card OCR gating; 201; no OCR scheduled; planner may reply if enabled.

4. **Business card OCR flow still works**  
   - Upload card image + “extract phone/address” (or similar BUSINESS_CARD_OCR phrase); expect OCR scheduled, research_result created, flow unchanged.
