# Control Center Phase E — Platform Intelligence Layer (PIL-ControlCenter)

**Realtime standard:** [REALTIME_SIGNAL_STANDARD.md](../../docs/REALTIME_SIGNAL_STANDARD.md) (platform lane — emit → SSE → alerts → metrics refresh)

## Mission

Evolve the Control Center from **Monitor → Navigate → Resolve** to:

**Observe → Understand → Recommend → Assist → Resolve**

All intelligence derives from live platform metrics (`useControlCenterMetrics`) and the platform activity stream. No mock dashboards or fabricated counts.

## Architecture

```
Platform Signals (metrics + activity)
        ↓
Observation Engine      (`observationEngine.ts`)
        ↓
Intelligence Engine     (`intelligenceEngine.ts`)
        ↓
Recommendation Engine   (`recommendationEngine.ts`)
        ↓
Attention Center V2     (`ControlCenterPhaseE.tsx`)
        ↓
Operator Actions        (Investigate · Open · Assign · Resolve · Launch · Dismiss)
```

## Module location

`apps/dashboard/cardbey-marketing-dashboard/src/lib/controlCenterIntelligence/`

| File | Role |
|------|------|
| `types.ts` | `PlatformObservation`, `PlatformOpportunity`, `PlatformRisk`, briefing types |
| `observationEngine.ts` | Rule-based observations from metrics |
| `intelligenceEngine.ts` | Observations → opportunities + risks |
| `platformBriefing.ts` | Natural-language Platform Cooperator briefing |
| `recommendationEngine.ts` | Snapshot → Attention Center V2 cards |
| `activityEnrichment.ts` | Per-event impact + suggested next step |
| `index.ts` | Public exports |

Hook: `src/hooks/usePlatformIntelligence.ts`

UI: `src/components/controlCenter/ControlCenterPhaseE.tsx`

## Intelligence Rules V1

| Rule | Condition | Output |
|------|-----------|--------|
| 1 | `pendingQa > 50` | QA backlog observation (Warning/Critical), bulk review opportunity |
| 2 | `claimable > 0 && verified === 0` | Verification funnel blocked (Critical risk) |
| 3 | `offlineDevices > 0` | Device network degraded (Warning) |
| 4 | `failedMissions >= 1` | Mission instability (Warning; Critical at ≥3) |

Additional observations: discovery growth, activation bottleneck, claim conversion drop, store/account review backlogs.

## Attention Center V2

Replaces Critical / Warning / Informational with:

- **Growth Opportunities**
- **Operational Risks**
- **Platform Health**

Each card includes: title, why it matters, expected impact, suggested action, expected outcome, and operator actions.

## Platform Cooperator

Template-based briefing grounded in live counts:

- Discovery / QA / claimable / verification stats
- Largest bottleneck inference
- Recommended action + confidence score

## Activity feed enrichment

`mapPlatformActivity.ts` attaches `impact` and `suggestedNextStep` per event type via `enrichActivityWithIntelligence`.

## Governance

- **Recommendations only** — no autonomous execution
- Launch / Open routes navigate to governed surfaces; operators confirm before high-impact actions
- Aligns with `safeExecutionGovernance` and PIL workspace rules (`autoSubmit: false`)

## Tests

`src/lib/controlCenterIntelligence/controlCenterIntelligence.test.ts` — rule engines, briefing, V2 cards, activity enrichment.

`CardbeyControlCenter.test.tsx` — Phase E UI integration.

## Success criteria

Within ~10 seconds on the Control Center, operators can answer:

1. What is broken?
2. What is growing?
3. What needs attention?
4. What should be done next?

Without opening additional pages.

## Living Ecosystem UI (Phase E extension)

`src/components/controlCenter/living/`

| Component | Purpose |
|-----------|---------|
| `PlatformHeartbeatBar` | SSE-driven life strip below executive summary |
| `AgentStatusOrbs` | Discovery / Performer / Control Tower / Device status |
| `CcLivingEcosystemFlow` | Funnel with flow particles and live counters |
| `CcActivityFeedV2` | Grouped feed with icons, slide-in, entity context |
| `CcGeographicIntelligenceLive` | Top regions with animated bars |
| `ControlCenterMicroInteractions` | ActivityPulse, StatusOrb, AttentionGlow, FlowParticle, LiveCounter, HeartbeatIndicator |

Motion: `controlCenterMotion.css` — subtle mission-control animations; respects `prefers-reduced-motion`.

Quick actions expanded in `controlCenterRoutes.ts` (QA, Claims, Businesses, Users, Stores, Discovery, Verification, Devices, Runtime, Performer, Control Tower, Reports).
