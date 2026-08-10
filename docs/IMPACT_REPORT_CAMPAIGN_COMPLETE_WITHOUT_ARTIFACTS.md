# Impact Report: Campaign “Completed” with no artifacts

**Date:** 2026-08-11  
**Status:** Smallest safe UI/outcome honesty patch

## Symptom

Mission header and topology slot show **Completed / Campaign build complete**, but no campaign package, poster, or assets appear in chat or the inspector Artifacts area. Execution history empty is unrelated (next-step records only).

## Root cause (code-traced)

1. **TopologyReviewCardSlot** completed mode for campaign only renders a green banner (`topologyReviewCompletedMessage`). Loyalty completed mode mounts `LoyaltyProgramDraftCard`; campaign does not mount `CampaignPackageCard`.
2. **Panel hydration** (`isTopologyCompilerCampaignComplete`) requires `campaignPackage` / `campaignArtifact`. If Core marks `multiAgentStatus: completed` without those outputs, the review slot still shows completed while the panel never gets a package.
3. Empty **Execution history** does not indicate missing campaign artifacts.

## What could break

| Risk | Mitigation |
|------|------------|
| True completes with package still look broken | Render `CampaignPackageCard` in the completed campaign slot when package normalizes |
| Incomplete runs stay green “complete” | Campaign completed without package → failed/incomplete + Retry copy |
| Loyalty/store slots unchanged | Gate on `missionKind === 'campaign'` only |

## Smallest safe patch

- Dashboard: show package on campaign complete; if missing, show incomplete/failed chrome instead of false success.
- Do not invent env “persistence” toggles; do not auto-publish.

## Out of scope (follow-up)

- Core: harden campaign terminal outcome to refuse `completed` without a usable campaign package (larger contract change).
