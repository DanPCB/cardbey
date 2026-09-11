# IMPACT REPORT — Store Creation Path A: Real Business Detection

**Date:** 2026-09-11  
**Status:** Explicit implementation task — proceed with additive Path A hardening

## Goals

1. Raise match gate to USE (0.55) + phone/website/name-exact signal  
2. Low confidence (0.25–0.55) → blackboard uncertain + Path B fallthrough (no sourced data)  
3. Extract structured fields onto research result / draft for verified matches  
4. Empty catalog on high confidence → website scrape retry → suggested seed with verify flag  
5. Checkpoint prompt surfaces research quality when mode === research  
6. Website-first scrape before Places when URL present (research agent, not classifier)

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Fewer Path A applies | Stricter match rejects weak Places hits | Intended; fallthrough to generative labeled suggested |
| Skip Places when scrape succeeds | May miss GBP hours/phone | Prefer scrape catalog; still merge scrape fields |
| Checkpoint copy wrong for generative | Mode misread | Only change when mode/meta is research |
| Double generative with Mode gate | Already skip research for generative | Path A-only code paths |
| OCR as primary | Must not break generative | OCR already Path A in classifier |

## Explicitly not doing

- Path B / classifyStoreCreationMode logic changes (except website scrape wiring in research agent)  
- Google Places API integration rewrite  
- UX / intake / confirmation flow redesign

## Impact scope

- `sourceConfidenceScorer.js` / `businessResearchAgent.js`  
- `draftStoreService.js` (catalog empty recovery for high-confidence only)  
- Brand checkpoint prompt builder (locate)  
- Blackboard events via `storeCreationBlackboard.js` helpers
