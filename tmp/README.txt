Draft API capture (Step A + Auth comparison)
---------------------------------------------
draft_before_schema.json  = expected shape / example (hero, avatar, categories in draft.preview).
draft_before.json         = paste your live GET .../draft?generationRunId=... response here to compare.

Auth gating comparison (same jobId/generationRunId):
  draft_authed.json       = GET .../draft response while logged in. Copy from Network → XHR/Fetch.
  draft_anon.json         = GET .../draft response in incognito or with cookies cleared.
  node tmp/diff_draft_payloads.js  = diff authed vs anon (top-level keys, draft presence, draft.preview keys).

See docs/DRAFT_REVIEW_REGRESSION_REPORT.md and docs/AUTH_IMPACT_REPORT.md.
