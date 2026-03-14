# Store Creation Path Audit — Cursor Prompt

**Use this entire document as the prompt when asking Cursor to audit and fix the store creation path in the Cardbey dashboard repo.**

---

## Goal

Audit and fix the full store creation path so it becomes **ONE canonical path** owned by the **Mission Launcher / Mission Execution** flow.

We have **2 related bugs** that indicate path drift and wrong entity linking:

### Bug A — Post-auth draft return bug

**Flow:**
1. Start free / guest
2. Launch new mission
3. Create new store through Mission Launcher
4. Draft preview/edit opens
5. Auth gate asks sign in / sign up
6. User signs in
7. App returns to draft preview/edit

**Problem:** The return flow can lose the correct draft context and land on blank / wrong editing state.

### Bug B — Wrong publish / wrong back-to-edit linkage

**Flow:**
1. Start free / guest
2. Launch mission
3. Create a totally new test store
4. Draft is ready for preview
5. Auth gate asks sign in
6. Sign in using an **existing account that already has stores**
7. Return to draft preview editing
8. Publish the **NEW** fashion store

**Problem:** Publishing or post-publish navigation can link to a **DIFFERENT existing store** in the account. Then "Back to edit" from the published store can lead to yet another existing store instead of the mission-owned draft/store lineage.

This means the store creation path is **not canonical** and is falling back to account-level default/current store selection.

---

## Core requirement

Store creation must follow **ONE path only**:

```
Mission Launcher
  → Mission Execution
  → mission-owned draft
  → draft preview/edit
  → auth gate if needed
  → same draft resumes
  → publish same draft
  → open same published store
  → back to edit returns to same draft/store lineage
```

**Never switch to:**
- account default store
- previously existing store
- latest store in account
- arbitrary published store
- arbitrary draft

---

## What to audit

Audit **ALL** code paths involved in:

### 1) Mission-owned draft creation

- Mission Launcher submit
- Mission creation
- Draft creation / generation
- Mission report / artifacts storing: `draftId`, `generationRunId`, `jobId`, `storeId`, `committedStoreId`

### 2) Draft preview / edit routing

- Draft review URLs
- Preview URLs
- Continue-edit URLs
- Any **"Back to edit"** links
- Any **"Open Draft Review"** links
- Any **"View store"** links
- Any **publish success modal** buttons (e.g. "View store", "Create QR Promo")

### 3) Auth gate / signin / signup return flow

- `returnTo` query param (how it is set, encoded, and restored)
- Local/session storage restore of draft context
- Post-auth redirect logic
- Context hydration after login (how draft/store context is re-established)

### 4) Publish flow

- Which draft is being published (source of `draftId` / `generationRunId`)
- How published `storeId` is resolved
- Whether publish uses **explicit draft lineage** or falls back to account current store

### 5) Store selection / account context

- Any logic that chooses: current store, first store in account, most recent store, store from profile dropdown
- Find any place where this can **override** mission-owned store/draft context

---

## Canonical lineage to enforce

Define and enforce **one canonical lineage object** for the store creation flow:

```ts
{
  missionId,
  draftId,
  generationRunId,
  jobId,
  storeId,
  committedStoreId
}
```

**Rules:**
1. Mission creates and owns the lineage.
2. Preview/edit pages must **always prefer explicit lineage** from URL/state over account defaults.
3. Auth return must **preserve full lineage**.
4. Publish must publish the **exact draft** in lineage.
5. Published-store view after publish must open the **committedStoreId** from lineage.
6. **Back to edit** must return to the draft/store lineage from the **same mission**, not account current store.

---

## Implementation requirements

### PART 1 — Add lineage audit / debug

Add **temporary** debug logging (safe, removable later) around:

- Mission creation result
- Draft preview route entry
- Auth gate redirect save/restore
- Publish action payload / response
- Published store page entry
- Back-to-edit navigation

**Log:** `missionId`, `draftId`, `generationRunId`, `jobId`, `storeId`, `committedStoreId`, route pathname, query params used, fallback source used.

**Goal:** Identify exactly where lineage is lost or overridden.

### PART 2 — Make lineage explicit in URLs and state

For all store creation / preview / edit / publish flows, **preserve explicit params** where available:

- `missionId`, `draftId`, `generationRunId`, `jobId`, `storeId`, `committedStoreId`
- `mode=draft` / `published`
- `from=mission` / `from=preview` / `from=publish`

**Do not rely on account-selected store when explicit lineage exists.**

### PART 3 — Harden restore priority

Wherever a page **restores context**, enforce this order:

**For draft editing pages:**
1. `draftId`
2. `generationRunId`
3. `jobId`
4. MissionId-linked draft/store artifacts
5. **Only if none exist**, fallback to generic account/store logic

**For published store after publish:**
1. `committedStoreId` from publish response / mission lineage
2. Explicit `storeId` from URL
3. **Only if none exist**, fallback to account/store logic

**Document this priority in code comments.**

### PART 4 — Publish must use explicit draft lineage

- Audit the **publish action** so it publishes the **exact draft** created by the mission flow.
- Do **NOT** let publish resolve "current store" from account context if draft/store lineage exists.
- Return and persist **committedStoreId** explicitly.

### PART 5 — Back to edit must be lineage-aware

From published store / preview pages:

- **"Back to edit"** must return to the **same** draft/store lineage.
- If `missionId` exists, preserve it.
- If `draftId` exists, use it.
- **Never** navigate to another existing store because it belongs to current account selection.

### PART 6 — Safe fallback UI instead of wrong linking

If required lineage **cannot** be resolved:

- Do **NOT** silently open another store.
- Show a **recovery state**:
  - Message: "We couldn't reopen the exact store editing session."
  - Buttons: **Back to Mission Process**, **Open My Stores**, **Retry draft restore**

**Wrong store is worse than no store.**

---

## Deliverables required

1. **Root cause summary**  
   Identify exactly where lineage is lost / overridden: post-auth restore? publish path? back-to-edit path? account current store fallback?

2. **Files changed**  
   List exact files changed.

3. **Canonical lineage contract**  
   Write a short code comment / doc block describing the canonical lineage object and fallback order (can live in a shared types file or route/utils).

4. **Manual verification checklist**  
   Cover the flows below.

---

## Manual verification checklist

### Flow A — Guest → auth → continue editing

1. Start as guest
2. Create new store mission
3. Reach draft preview/edit
4. Trigger auth gate
5. Sign in / sign up
6. **Expect:** Exact same draft/session reopens
7. **Expect:** No blank page, no switch to existing store

### Flow B — Guest → auth → publish new store

1. Start as guest
2. Create new store mission
3. Reach draft preview/edit
4. Sign in with account that **already has existing stores**
5. Publish the **NEW** draft
6. **Expect:** The **newly published** store opens
7. **Expect:** Store name / hero / products match the **new** draft, not an old store

### Flow C — Published store → back to edit

1. From newly published store, click **Back to edit** / **Continue Business Setup**
2. **Expect:** Return to **same** draft/store lineage
3. **Expect:** Must **not** open another existing store from account

### Flow D — Account has multiple stores

1. Repeat with account containing **several existing stores**
2. **Expect:** Mission-owned draft/store lineage **always wins** over account default/current store

---

## Constraints

- Keep the **Single Runway** architecture
- **No** second store creation path
- **Minimal** backend changes if possible, but fix correctly
- **Prefer explicit lineage** over implicit account context everywhere
- **Do not** patch only one button; fix the **full path contract**

---

## How to run this audit in Cursor

1. Open the Cardbey dashboard repo in Cursor.
2. Paste or reference this entire document (`docs/STORE_CREATION_PATH_AUDIT_PROMPT.md`) as the prompt.
3. Ask Cursor to: **"Audit and fix the store creation path according to docs/STORE_CREATION_PATH_AUDIT_PROMPT.md. Start with PART 1 (lineage debug logging) to find where lineage is lost, then implement PART 2–6 and deliver the root cause summary, files changed, lineage contract, and verification checklist."**
4. After implementation, run the manual verification flows A–D and fix any remaining issues.
