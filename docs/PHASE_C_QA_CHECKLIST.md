# Phase C Campaign Report – QA Checklist

## Overview
Phase C adds a persisted campaign report: mission step "Campaign report" creates/updates a report via POST, and PhaseOutputs displays it via GET. No external channel APIs; deterministic content.

## Prerequisites
- Backend and dashboard running; user signed in.
- Prisma: `npx prisma generate --schema prisma/sqlite/schema.prisma` and `npx prisma db push --schema prisma/sqlite/schema.prisma` from `apps/core/cardbey-core`.
- Campaign mission with steps: Validate campaign scope → Create campaign → Campaign report.

---

## 1. Full mission run

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Mission Console, start a campaign mission | Plan has 3 steps: validate-context, execute-tasks, report. |
| 2 | Run mission; wait for validate-context to complete | PhaseOutputs for validate_scope shows checks/blockers/risk (or validated). |
| 3 | Wait for execute-tasks to complete | PhaseOutputs for create_campaign shows schedules, deployments, offer, creatives. |
| 4 | Wait for report step to complete | Report step handler calls POST report; mission artifacts get reportId. |
| 5 | Open "Campaign report" step in Execution drawer | PhaseOutputs (campaign_report) shows: Summary, Links (clickable), Schedule recap, Next steps. |

---

## 2. Re-run report step

| Step | Action | Expected |
|------|--------|----------|
| 1 | Run the same mission again (or trigger report step only if supported) | POST report is called again. |
| 2 | Check backend / DB | One report row per campaign (upsert); no duplicate report rows. |
| 3 | PhaseOutputs for campaign_report | Same report content (deterministic). |

---

## 3. Auth

| Step | Action | Expected |
|------|--------|----------|
| 1 | POST report without token | 401 Unauthorized. |
| 2 | GET report without token | 401 Unauthorized. |
| 3 | POST/GET report for a campaign belonging to another tenant | 404 (campaign not found / access denied). |

---

## 4. Audit

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create report (POST), then open audit trail for CampaignV2 (admin) | Event `campaign_report_created` with metadata `{ reportId }`. |

---

## 5. Curl examples

Replace `BASE`, `TOKEN`, `CAMPAIGN_ID` with real values.

**POST report (create/update)**

```bash
curl -s -X POST "BASE/api/campaign/CAMPAIGN_ID/report" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"missionId":"optional-mission-id"}'
```

Expected: `200` with `{ "ok": true, "reportId": "...", "report": { "summary": "...", "links": [...], "scheduleRecap": {...}, "nextSteps": [...] } }`.

**GET report**

```bash
curl -s "BASE/api/campaign/CAMPAIGN_ID/report" \
  -H "Authorization: Bearer TOKEN"
```

Expected: `200` with `{ "ok": true, "report": { ... } }` or `404` with `{ "ok": false, "error": "not_found" }` if no report yet.

---

## 6. Screenshot checklist (PhaseOutputs campaign_report)

- [ ] Before report step: "No outputs yet. Run the mission to generate the report."
- [ ] After report step: Summary paragraph visible.
- [ ] Links section: list of clickable links (Storefront, Share link, QR, UTM template).
- [ ] Schedule recap: count + date range (when schedules exist). For 2-week campaign: **8 post(s)** and date range spanning ~14 days.
- [ ] Next steps: bullet list (e.g. Review captions, Connect social accounts, Prepare product photos).

## 6b. Creative Review (append below Campaign report)

- [ ] **Creative Review** section appears below Campaign report content (render `<CampaignReportCreativeReview mission={mission} />` where campaign report is shown).
- [ ] If `mission.report.captions` is set: list of generated captions is shown.
- [ ] If no captions: "No captions yet." is shown.
- [ ] Buttons: **Regenerate copy**, **Make tone: Premium**, **Make tone: Aggressive**, **Make tone: Casual** — each logs `[Campaign] TODO: campaign regenerate endpoint not implemented` in console (stub; no backend call).
- [ ] Campaign mission still completes; store mission and campaign job status logic unchanged.

## 7. Two-week campaign schedule (Create campaign PhaseOutputs)

- [ ] Create campaign outputs show **8 schedules** (not 2). Count comes from API `scheduleCount` (true DB count), not the length of the preview list.
- [ ] Preview list may show only the first 2–5 rows; the header/subtitle must still show the full count (e.g. "8 schedules · N deployments").
- [ ] List of scheduled dates (preview) spans **~14 days** (e.g. Tue/Thu/Sat/Sun at 09:00 UTC across two weeks).
- [ ] Phase C report Schedule recap shows count **8** and firstAt–lastAt range ~14 days. Report is built from DB aggregate (count + min/max scheduledAt), not from a truncated schedules array.

**Schedule recap expectations:** Campaign read responses include `scheduleCount`, `scheduleRange: { firstAt, lastAt }`, and a small `scheduleItems` preview (e.g. take 5). Report builder uses DB-derived count and range so "8 posts" and the 14-day range are correct even when the UI only displays a preview list.

**Schedule engine scenarios (intent-based):** "run 2 week promotion" → 8 schedules; "schedule daily for 2 weeks" → 14 (cap); "3 posts per week for 2 weeks" → 6; "weekends only for 2 weeks" → 4 (Sat/Sun only). Explicit `schedule.times` in API still respected.

---

## 8. Feature flag (optional rollback)

- Set `VITE_MISSION_PHASE_REPORT=false` in env to disable report phase output in PhaseOutputs.
- UI shows "Report phase is disabled." for campaign_report phase.
- Backend has no flag; revert code to remove report routes/handler if needed.
