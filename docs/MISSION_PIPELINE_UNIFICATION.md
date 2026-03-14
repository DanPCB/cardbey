# Mission Pipeline Unification

**Goal:** MI Assistant, Mission Console, and Creative Shell use the same mission execution pipeline (POST /api/mi/orchestra/start) and mission-scoped artifact editing.

## 1. MI Assistant integration

- **When:** User presses Send in MI Assistant (Agent Chat on a mission).
- **Behavior:** The sent text is parsed via `promptToGoal()` (e.g. "Create promotion" → `create_promotion`, "Generate tags" → `generate_tags`). If a goal is inferred:
  - `startMissionFromGoal(goal, context, text)` is called (same API as Mission Console: POST /api/mi/orchestra/start).
  - On success, user is redirected to `/app/missions/:missionId` (new mission).
- **No preview mode** for these actions; user goes straight to the mission.
- **Fallback:** If no goal is inferred, the message is still sent to POST /agent-messages as before.

**Files:** `src/pages/agent-chat/AgentChatView.tsx`, `src/lib/missionOrchestra.ts`.

## 2. Next Mission Launcher (Continue next missions)

- **When:** User clicks a pill or submits the "Type the next mission…" input in the Next Mission Launcher (on a mission detail page).
- **Behavior:** Pill label or typed text is mapped to a goal via `pillLabelToGoal()` / `promptToGoal()`. Then:
  - `startMissionFromGoal(goal, context, title)` is called with context from the current mission (storeId, draftId, campaignId).
  - On success, user is redirected to `/app/missions/:missionId`.
- **Context:** Uses `missionContext.artifacts` (storeId, draftId, campaignId) so the new mission is tied to the same store/draft/campaign when relevant.

**Files:** `src/app/console/missions/NextMissionLauncher.tsx`, `src/lib/missionOrchestra.ts`.

## 3. Creative Shell mission context

- **Routes added:**
  - `/app/missions/:missionId/artifacts/:artifactType` (e.g. `/app/missions/xyz/artifacts/promotion`)
  - `/app/missions/:missionId/artifacts/:artifactType/:artifactId`
- **Behavior:** These routes render `MissionArtifactCreativeShell`, which wraps Creative Shell in `MissionArtifactProvider` with:
  - `missionId`
  - `artifactType` (e.g. `promotion`)
  - `artifactId` (optional, from URL)
- **Usage in editor:** Any component (e.g. Content Studio editor) can call `useMissionArtifact()` to get `{ missionId, artifactType, artifactId }` and attach them when saving so edits update the artifact linked to that mission.

**Files:** `src/App.jsx` (routes), `src/app/console/missions/MissionArtifactCreativeShell.tsx`, `src/app/console/missions/MissionArtifactContext.tsx`.

## 4. Shared mission-orchestra helper

- **`src/lib/missionOrchestra.ts`:**
  - `promptToGoal(text)` – maps natural language to goal (e.g. create_promotion, generate_tags, rewrite_descriptions, build_store, generate_store_hero, launch_campaign, analyze_performance, generate_social).
  - `pillLabelToGoal(label)` – maps pill label to goal.
  - `startMissionFromGoal(goal, context, title?)` – ensures auth, calls POST /api/mi/orchestra/start with goal and context (storeId, draftId, campaignId), creates a client mission with `createMission()`, sets `artifacts.jobId` and execution status, returns `{ ok, missionId, jobId }` for navigation.

## 5. UI unchanged

- No redesign; only wiring of existing components to the mission pipeline.
- Mission Console launcher (Run, pills) unchanged; it already used the same pipeline via `quickStartCreateJob` / orchestra/start.

## 6. Manual verification

- **MI Assistant:** On a mission, send e.g. "Create a promotion". Expect redirect to a new mission and timeline showing the step.
- **Next Mission Launcher:** On a mission, click e.g. "Create promotion" or type "Generate tags" and Send. Expect POST orchestra/start and redirect to new mission.
- **Creative Shell:** Open `/app/missions/:missionId/artifacts/promotion`. Expect Creative Shell to load with mission context; editor can use `useMissionArtifact()` to attach missionId/artifactType/artifactId on save.
