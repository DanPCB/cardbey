# Impact Report: Phase B.2 — CreativeCopy + CreativeAsset (template only)

**Scope:** Extend create-from-plan to optionally add 3 CreativeCopy + 1 CreativeAsset (image_prompt) + creative.generate task + creative_created AuditEvent. Template-based only; no LLM or image generation.

**Risks:**
- **Phase A (validate-scope):** Not touched. No risk.
- **Phase B.1 (scheduling):** Creative step runs after B.1 transaction and after campaign status update. No change to transaction, schedule items, or campaign.create/schedule.create tasks. Campaign status remains driven by those two tasks only. No risk.
- **Draft-store / auth:** No changes. No risk.
- **Failure:** If creative creation or task transition fails, we catch, log, and return response with `creatives: null` so client still gets campaignId, status, schedules, tasks.

**Mitigation:** Additive code only after existing B.1 flow; optional via body (generateCreatives !== false by default); no schema change (CreativeCopy/CreativeAsset already exist).
