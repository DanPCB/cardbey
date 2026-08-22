# Impact Report: Performer Canonical Understanding Phase 1

**Date:** 2026-07-28  
**Status:** Implementation (Phase 1 foundation + create-store gate wiring)  
**Branch:** `fix/canonical-understanding-create-store`

---

## 1. Why this exists

Scoped delivery (`IMPACT_REPORT_PERFORMER_FAKE_UNDERSTANDING_FIX.md`) fixed UI honesty + stale seed only. Production still lacks:

- Single create-store identity SOT bound to cryptographic image hash  
- Validation before create-store execution  
- Audit trail of understanding decisions  
- BUE as primary understanding enrichment (Core flag previously defaulted off)

Enforcement request: implement CanonicalUnderstanding SOT, hard validation, audit, BUE defaults on — **without** rewriting Kernel / Mission Runtime / inventing a parallel product stack.

---

## 2. What could break

| Risk | Why | Impact scope |
|------|-----|--------------|
| Hard-block create-store when name/category/location incomplete | STRICT mode rejects POST until fields pass | Upload → Ask → Create store; logo-only cards |
| SHA-256 hash vs length+head/tail fingerprint | Session keys / stale detection semantics change | Any in-flight Performer tab with old fingerprint |
| BUE_PIPELINE_ENABLED default `true` | Extra LLM/vision work on attachment analysis | Loyalty + create-store attachment analysis; Core cost/latency |
| Seeding only from CanonicalUnderstanding | Handoff OCR ignored if not migrated/saved | Prefill of `storeCreateForm` |
| New sessionStorage keys | Quota / private mode | Understanding cache + audit ring buffer |

---

## 3. Constraints honored (why not verbatim master prompt)

| Locked rule | How we comply |
|-------------|----------------|
| Wrap, don’t rewrite | Dashboard `CanonicalBusinessUnderstanding` is a **create-store projection** over handoff `cardExtraction` / `storeCandidate` + optional Core BUE bundle. Core `CanonicalUnderstandingBundle` stays the BUE contract. |
| Automation by Default | `UNDERSTANDING_MODE=PERMISSIVE` allows proceed-with-warnings (draft/checkpoint). Default **STRICT** blocks invalid create-store POSTs from upload Ask — consequence-driven (wrong business identity), not a wizard. |
| Keep StoreCandidate | Migration helper only; no deletion of Core/storeCandidate paths. |
| Gradual migration | Repo + gate sit beside existing `imageBoundStoreIdentity`; fingerprint retained as sync fallback until SHA-256 resolves. |

**Not in Phase 1:** Full pipeline rewrite, CreateStoreReview UI surface as mandatory wizard, Understanding quality dashboard, deleting Core BUE env vars (aliases kept; defaults flipped ON), decision-loop authority revival.

---

## 4. Smallest safe patch

1. **Dashboard** — New `src/lib/businessUnderstanding/*` + `src/lib/crypto/ImageHasher.ts`.  
2. **Extend** `imageBoundStoreIdentity` to prefer SHA-256, migrate handoff → CanonicalUnderstanding, expose validation-aware assessment + progress.  
3. **Wire** `useIntakeV2` upload Ask Create store: audit steps, STRICT block before `postIntakeV2`, progress from ProgressTracker.  
4. **Core** — Default `BUE_PIPELINE_ENABLED` / `BUE_BRAND_VISION_ENABLED` to **true** (still overridable via env). Document in `.env.example`.  
5. **Config** — `VITE_UNDERSTANDING_MODE` (`STRICT` \| `PERMISSIVE`), `VITE_UNDERSTANDING_DEBUG`, `VITE_MIN_CONFIDENCE` (default 70).

---

## 5. No-parallel-stack proof

| Concern | Proof |
|---------|--------|
| Second Intent Runtime? | No — only create-store identity cache + validation. |
| Second BUE? | No — dashboard type mirrors create-store fields; Core BUE bundle remains authority for loyalty/brand contracts. |
| Replaces StoreCandidate? | No — `migrateFromStoreCandidate` / handoff migration only. |
| New mandatory screens? | No — agent stream messages + existing create_store form checkpoint. |

---

## 6. Rollout

| Env | Mode | BUE |
|-----|------|-----|
| Local / staging | STRICT (default) | ON (default) |
| Production canary | Set `VITE_UNDERSTANDING_MODE=PERMISSIVE` if needed | Keep ON; set `BUE_PIPELINE_ENABLED=false` only as emergency kill |

---

## 7. Success checks (Phase 1)

- [ ] Unit: hasher, repo CRUD, validation edges, audit append  
- [ ] Identity: PTH / Handyman / Coffee hashes distinct; stale clears prior understanding  
- [ ] STRICT: missing name blocks upload Ask Create store POST  
- [ ] PERMISSIVE: same case logs warning and proceeds  
- [ ] Progress never shows fake “Reading business details from your image…”  
