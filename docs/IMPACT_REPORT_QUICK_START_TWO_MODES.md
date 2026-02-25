# Impact Report: Quick Start Two Modes Refactor

**Date:** 2025-02-17  
**Scope:** Draft store creation workflow (draft → review → publish).  
**Risk level:** Medium — core path touched; mitigated by feature flag and additive helpers.

---

## 1. What could break

- **Draft creation fails or returns different preview:** New flow (resolveGenerationParams → buildCatalog → saveDraftBase → finalizeDraft) could produce a different `preview` shape or miss fields (e.g. `preview.meta`, `preview.hero`, `preview.avatar`, readiness).
- **Template mode without `templateId`:** Current code can fall back to AI menu or "Product 1..30". New contract hard-fails when `templateId` is missing/invalid for template mode → callers that omit `templateId` with `mode: 'template'` would get an error.
- **Orchestra / build_store:** Orchestra creates drafts with `mode: 'ai'` and `input: { prompt, businessName, includeImages }` (no `input.mode`). Normalizer must treat draft.mode as fallback so these still resolve to `mode: 'ai'`.
- **Template mode today uses LLM:** `generateBusinessProfile` is called for all modes and still runs AI for colors/tagline/heroText (and optionally name). Switching template to a deterministic profile changes output (no AI) and satisfies "AI Off = zero LLM" but is a behavior change for template users.

---

## 2. Why

- **Single finalize path:** Moving all hero/avatar/image/readiness into `finalizeDraft` removes duplicate branches; any mistake in that one place affects both modes.
- **Strict template contract:** Requiring `templateId` and no fallback removes previous resilience for invalid/missing template.
- **Normalizer changes semantics:** `menuFirstMode`/`useAiMenu` → `mode: 'ai'` and `templateId` → `mode: 'template'` are explicit; legacy callers that relied on implicit behavior might get a different mode if they don’t send `mode`.

---

## 3. Impact scope

- **POST /api/draft-store/generate** — request body unchanged; behavior behind flag.
- **Orchestra build_store job** — creates draft with `mode: 'ai'`, runs `generateDraft`; must receive resolved `mode: 'ai'` from normalizer (via draft.mode fallback).
- **Commit/publish and consumers of draft.preview** — depend on `preview.items`, `preview.categories`, `preview.hero`, `preview.avatar`, `preview.storeName`, `preview.storeType`; new path must produce the same shape and persist `preview.meta` additively.

---

## 4. Smallest safe patch

- **Feature flag:** `USE_QUICK_START_TWO_MODES` (env var, default `'true'` so new path is used; set to `'false'` to keep current `generateDraft` unchanged).
- **Additive code only:**  
  - New: `resolveGenerationParams(input, { draftMode })` (no call-site behavior change until flag on).  
  - New: `buildCatalog(params)` and `buildFromTemplate` / `buildFromAi` / `buildFromOcr` returning `CatalogBuildResult`; template profile via new `getTemplateProfile(templateKey, overrides)` (deterministic, no LLM).  
  - New: `finalizeDraft(draftId, { includeImages })` containing all image/hero/avatar/readiness logic; `saveDraftBase(draftId, catalog)` building preview from catalog + meta.  
- **When flag is on:** `generateDraft` uses `params = resolveGenerationParams(...)` → `buildCatalog(params)` → `saveDraftBase` → `finalizeDraft`; when flag is off, existing `generateDraft` body runs unchanged.
- **Backward compatibility in normalizer:** Precedence: `input.mode` → `draftMode` (from draft.mode) → `menuFirstMode`/`useAiMenu` → `templateId` → ocr → else error. Orchestra drafts (draft.mode = 'ai', no input.mode) still resolve to `mode: 'ai'`.
- **Template mode:** Hard-fail only when **resolved** mode is `'template'` and `templateId` is missing or invalid; no "retail 1..30" fallback for that path. Other modes unchanged.

---

## 5. Proceeding

Implementation follows this report: additive helpers + feature flag; new path exercised by existing and new tests. After validation, flag can be default-on and old path removed in a later change.
