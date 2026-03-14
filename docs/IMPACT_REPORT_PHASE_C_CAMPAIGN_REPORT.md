# Impact Report: Phase C Campaign Report

## Summary
Add Campaign report (Phase C): persisted report model, POST/GET report API, mission step handler for "Campaign report", and PhaseOutputs UI. Additive only; no changes to Phase A (validate-scope), Phase B (create-from-plan), auth, or draft-store flows.

## Risks and mitigations

| Risk | Why | Mitigation |
|------|-----|------------|
| **Phase A/B break** | New routes or schema could affect existing campaign routes or Prisma usage | New routes use same requireAuth + tenantKey pattern; CampaignReport is new model; no edits to validate-scope or create-from-plan handlers. |
| **Mission wiring break** | Report step handler could fail and block completion | Handler returns ok:false only when campaignId missing or API fails; same pattern as execute-tasks. reportId optional in artifacts. |
| **Auth** | Report endpoints must be tenant-scoped | POST/GET report load campaign by id + tenantKey; 404 if mismatch (same as GET /:campaignId). |
| **Draft-store** | No interaction with draft-store | Report reads CampaignV2 + relations only; no draft or store creation. |
| **Route order** | GET /campaign/:id/report could be matched as :campaignId = "report" | Register GET/POST `/:campaignId/report` *before* `/:campaignId/tasks` and `/:campaignId` so "report" is path segment, not campaignId. |

## Scope
- **In scope:** CampaignReport schema, POST/GET report API, report step handler, PhaseOutputs campaign_report, MissionArtifacts.reportId, assertCampaignModels update, QA doc.
- **Out of scope:** External channel APIs, charts, redesign of Phase A/B.

## Rollback
- Optional feature flag: `VITE_MISSION_PHASE_REPORT=false` to hide report outputs in PhaseOutputs.
- Backend: no feature flag; revert commit to remove report routes and step handler usage.
