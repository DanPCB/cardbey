# Create Page vs Homepage Quick Start — Plan

**Context:** The app has two entry points for creating a store:

| Entry | Route | UI | Backend | Post-generate flow |
|-------|--------|-----|--------|---------------------|
| **Create** (nav) | `/create` | "Create with AI" — single prompt + Quick ideas chips + Generate | `POST /api/draft-store/generate` (mode: 'ai', prompt) | Preview on same page → Continue → workspace with Save bar → commit → onboarding |
| **Quick Start** (homepage) | `/` | QUICK START — Form/Voice/OCR/URL, business name/type/location, Use AI menu + Generate | `POST /api/mi/orchestra/start` (job + draft) | Navigate to `/app/store/temp/review?jobId=...` → progress screen → StoreReviewPage → draft review → publish |

Both produce a draft; they use **different APIs and different next steps**. That can confuse users (“Create” vs “Quick Start”) and duplicate product surface.

---

## Recommended direction: one primary path, one narrative

**Goal:** One clear “start creating” story, with optional “simple” vs “detailed” entry.

### Option A — Create redirects to Quick Start (simplest)

- **Change:** Make the nav “Create” link go to **`/#quick-start`** (or `/` with scroll to Quick Start). Remove or repurpose the `/create` route.
- **Result:** Single entry — homepage Quick Start (Form, Voice, OCR, URL) with business name/type/location and “Use AI menu.” No duplicate flow.
- **Pros:** One path, one API (orchestra/start), one post-flow (progress → store review). Easy to explain.
- **Cons:** No dedicated “one sentence + chips” page unless you add that to the homepage.

### Option B — Differentiate and align the backend (recommended if you keep both)

- **Positioning:**
  - **Homepage Quick Start:** “Structured start” — you know business name, type, location; choose input method (form/voice/OCR/URL). Full control.
  - **Create page:** “Idea-first” — one sentence + quick idea chips; we infer name/type and run the same pipeline.
- **Implementation:**
  1. **Create page** should **reuse the same creation pipeline** as Quick Start: call **`POST /api/mi/orchestra/start`** (or a thin wrapper) with a payload derived from the prompt (e.g. parse or infer businessName, businessType, set menuFirstMode, optional rawInput = prompt).
  2. After a successful start, **navigate to the same review flow**: `/app/store/temp/review?jobId=...&generationRunId=...` (same as Quick Start), instead of staying on Create with preview + Continue → workspace → commit.
  3. Optionally keep a “Quick ideas” / “Quick start” link on the Create page that jumps to `/#quick-start` for the full form.
- **Result:** Two entry points (simple sentence vs full form), **one backend path** (orchestra/start) and **one post-generate flow** (progress bar → store review). “Create” becomes the light-weight funnel; “Quick Start” the power-user path.

### Option C — Single “Create” page with both modes

- **Change:** Make `/create` the **only** creation entry. On that page:
  - **Tab or section 1:** “Describe in one sentence” (current Create with AI + chips) → same API as Option B (orchestra/start with inferred payload) → redirect to store review.
  - **Tab or section 2:** “Use full form” — embed or link to the same Quick Start form (or redirect to `/#quick-start`).
- Homepage then has a hero + single CTA “Start creating” → `/create`.
- **Result:** One URL for creation, two modes (sentence vs form); backend and post-flow as in Option B.

---

## Recommendation

- **Short term (minimal change):** **Option A** — Nav “Create” → `/#quick-start`. Removes duplication and clarifies “create = Quick Start on homepage.” You can later add a “One sentence” block on the homepage that calls orchestra/start with an inferred payload.
- **Medium term (keep both, no duplication of flow):** **Option B** — Keep `/create` as the “one sentence” entry but wire it to **orchestra/start** and **redirect to store review** (same as Quick Start). Add a line on Create: “Prefer name, type & location? Use [Quick Start](#quick-start) on the homepage.”

---

## Concrete steps (Option B)

1. **Create page — use orchestra/start and redirect**
   - On Generate: build payload from `prompt` (e.g. `businessName: prompt.slice(0,80)`, `businessType`/vertical from chips or simple parse; or send as `rawInput` + goal `build_store`).
   - Call `quickStartCreateJob(navigate, { sourceType: 'form', businessName: ..., businessType: inferredOrChip, menuFirstMode: true, ... })` (or equivalent POST to `/api/mi/orchestra/start`).
   - On success, let `quickStartCreateJob` (or your wrapper) **navigate to** `/app/store/temp/review?jobId=...&generationRunId=...`. Remove the Create-specific “preview on page → Continue → workspace → commit” flow for this path.
  2. **Optional:** Add on Create page: “Or use [Quick Start](/) for business name, type, location and Form/Voice/OCR/URL.”
  3. **Docs:** Update any internal docs that describe “Create” vs “Quick Start” so they state: two entry points, one pipeline (orchestra/start), one review flow.

---

## Summary

| Approach | Create page | Homepage Quick Start | Backend | User story |
|----------|-------------|----------------------|---------|------------|
| **A** | Redirect to /#quick-start | Single entry | orchestra/start | “Create = go to homepage and use Quick Start” |
| **B** | One sentence → orchestra/start → store review | Full form → same | orchestra/start | “Simple (Create) or detailed (Quick Start); same flow after.” |
| **C** | Both “sentence” and “full form” on one page | CTA → /create | orchestra/start | “All creation on /create.” |

Choosing **A** or **B** (and then implementing the steps for B if you keep Create) will align “Create” with Quick Start and avoid two competing creation flows.
