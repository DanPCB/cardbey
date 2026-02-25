# Classify Business (Create/QuickStart)

Minimal AI-based "classify + summarize" step at Create/QuickStart. **Does not replace** the main generator; heuristic first, AI only when confidence is low. If classification AI fails or is disabled, the heuristic resolver still works.

## Endpoint

**POST /api/mi/classify-business**

- **Auth:** `optionalAuth` (no credits or welcome bundle consumed).
- **Input (JSON):**
  - `businessName` (optional)
  - `businessType` (optional)
  - `location` (optional)
  - `notes` (optional)
- **Output (JSON):**
  - `verticalSlug` — from strict taxonomy (e.g. `food.seafood`, `beauty.nails`, `fashion.boutique`)
  - `verticalGroup` — e.g. `food`, `beauty`, `fashion`
  - `confidence` — 0–1
  - `businessDescriptionShort` — 1–2 lines, ≤140 chars
  - `keywords` (optional) — matched heuristic keywords

## Logic

1. **Heuristic first:** `resolveVertical({ businessType, businessName, userNotes })` from `verticalTaxonomy.js`.
2. **If confidence ≥ 0.7:** return heuristic result + heuristic short description (no AI).
3. **If confidence < 0.7:** call OpenAI (gpt-4o-mini) with a small JSON-only prompt:
   - Allowed `verticalSlug` list = taxonomy slugs from `VERTICALS`.
   - Instruction: choose one slug and write `businessDescriptionShort` (max 140 chars).
   - Response: `{ "verticalSlug": "...", "businessDescriptionShort": "..." }`.
4. **If AI fails or is disabled:** return heuristic result (same as step 2).

This classification call **does not** spend paid credits or welcome bundle; it is a lightweight helper.

## Prompt (low-confidence AI path)

Strict JSON-only; no markdown, no explanations.

- **System:** You are a strict classifier. You MUST return valid JSON only. No markdown. No explanations. No extra keys.
- **User:** Classify into ONE verticalSlug from the allowed list; write businessDescriptionShort (≤140 chars). Return JSON with keys: verticalSlug, verticalGroup, confidence, businessDescriptionShort, keywords. Allowed verticalSlug values = taxonomy slugs (from VERTICALS). Rules: verticalGroup from ["food","beauty","fashion","retail","services","health","home","auto","education","events","unknown"]; confidence 0..1; businessDescriptionShort plain text, no emojis/quotes/line breaks; keywords 3–8 lowercase. Examples given in prompt for Seafood and Nails & Beauty.

## Validation and fallback

- Parse JSON; ensure verticalSlug is in allowed list; ensure businessDescriptionShort length ≤ 140.
- If invalid output, error, or timeout (2–4 s): fallback to heuristic result (verticalSlug, verticalGroup, confidence, businessDescriptionShort derived or "", keywords = heuristic.matchedKeywords).

## Where verticalSlug and businessDescription are stored and propagated

| Stage | Location | Fields |
|-------|----------|--------|
| Request (QuickStart → orchestra/start) | `orchestraPayload.vertical`, `orchestraPayload.businessDescription` | From classify-business response |
| Orchestra start | `req.body.vertical`, `req.body.businessDescription` | Passed into draft creation |
| Draft input | `DraftStore.input` (JSON) | `verticalSlug`, `businessDescription` |
| Template selection | `selectTemplateId(verticalSlug)` | Template key (e.g. food_seafood, beauty_nails, fashion_boutique) |
| Profile generation | `profileInput.descriptionText`, `profileInput.explicitTagline` | `businessDescription` → tagline when provided |
| Commit/publish | `Business.tagline` | From draft preview tagline (slogan), which can come from `businessDescription` |

- **verticalSlug** is used in orchestra start to set `baseInput.verticalSlug`; if the client sends a valid `vertical`, it is used as `explicitVertical` in `resolveVertical`, so the taxonomy slug is preferred.
- **businessDescription** is stored in draft `input.businessDescription` and used as `descriptionText` and `explicitTagline` in profile generation, so the derived description can appear under the business name in the draft preview and, on publish, in `Business.tagline`.

## Acceptance (test cases)

1. **Seafood** → `verticalSlug` = `food.seafood`
2. **Nails & Beauty** → `verticalSlug` = `beauty.nails`
3. **Fashion** → `verticalSlug` = `fashion.boutique` (or `fashion.mens` / `fashion.womens` when indicated)

See `apps/core/cardbey-core/tests/classify-business.test.js` for automated tests.
