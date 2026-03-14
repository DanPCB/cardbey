# Mission Console Launcher UI Redesign

## Where to see the new UI

The new launcher lives in **`MissionLauncherView.tsx`** and is **not mounted on any route** in the current codebase. To see it:

1. **Mount it on your console home route** (e.g. `/app`) where you currently show the old pills + input. Replace that content with:
   ```tsx
   import MissionLauncherView from '@/app/console/MissionLauncherView';
   // ...
   <MissionLauncherView
     onMissionCreated={(mission) => {
       navigate(`/app/missions/${mission.id}`);  // or window.location.assign(`/app/missions/${mission.id}`)
     }}
   />
   ```
2. **Temporary test route:** If you have a router, add a route (e.g. `path="/app/launcher"`) whose element is the same `<MissionLauncherView ... />` and open **`http://localhost:5174/app/launcher`** (or your dev origin + path).

The component has no dependency on React Router; use `onMissionCreated` to navigate after a mission is created.

---

## Goal

Make the **input field** the main place to launch every type of mission. The pills (Create store, Launch campaign, etc.) are **quick options** only—they prefill the input and do not create missions. Only submitting the input (Run) creates a mission.

## File Added

| File | Purpose |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/MissionLauncherView.tsx` | Input-first launcher: title → "What would you like to run?" → Mode (Pipeline / AI Operator) → **primary input** ("Describe what you want to run...") → **Try quick options** (pills that prefill only). |

## Layout (matches 3rd photo)

1. **Mission Console** — title  
2. **Run missions from home or create one below.** — subtitle  
3. **What would you like to run?** — prompt  
4. **Primary input** — large, bordered, placeholder "Describe what you want to run...", attachment + send. **This is the only control that creates a mission (on submit).**  
5. **Try quick options** — label + pills (Create store, Launch campaign, Generate social content, Deploy C-Net, Analyze performance). Clicking a pill **prefills** the input and focuses it; it does **not** create a mission.

No Mode toggle: the console only launches intents; Mission Execution / Orchestrator decides the engine (IntentRequest → Mission Execution → Orchestrator → Agents).

## Behavior

- **Submit (send button or Enter):** Calls `createMissionFromLauncher(prompt)` then `onMissionCreated(mission)`. Parent should navigate to `/app/missions/:missionId`.
- **Pill click:** Sets input value to the pill’s prefill text and focuses the input. User can edit and then submit.
- **Single runway:** Missions are created only from the launcher input submit path (see `missionLauncher.ts`).

## Integration

Wherever the Mission Console home is rendered (e.g. route `/app` or `/app/back`):

```tsx
import MissionLauncherView from '@/app/console/MissionLauncherView';

// In your console home page:
function ConsoleHomePage() {
  const navigate = useNavigate(); // or your router

  return (
    <MissionLauncherView
      onMissionCreated={(mission) => {
        navigate(`/app/missions/${mission.id}`);
      }}
      defaultMode="pipeline"
    />
  );
}
```

If you don’t use React Router, use `window.location.assign(`/app/missions/${mission.id}`)` or your app’s navigation API inside `onMissionCreated`.

## Before / after

- **Before:** Pills could appear as the main gate; input might feel secondary.  
- **After:** One clear primary control (the input); pills are explicitly "Try quick options" and only prefill. No mission is created until the user submits the input.
