# IMPACT — Create sheet: remove dark quick cards + duplicate Profile

**Date:** 2026-09-03  
**Issue:** Mobile Create sheet showed dark “Create Your Business” + “Create with AI” quick cards above the normal list (duplicates), and **Create Profile** twice.

## Root cause

1. `CreateSheet` projected `group === 'ai' || featured` as dark featured pills, then also rendered `manual` actions → dual Create Your Business / Create with AI.
2. `createActionRegistry` listed `create_profile` twice in `DEFAULT_ACTIONS`.

## Smallest safe patch

1. `CreateSheet`: render only `manual` + `discover` (no featured/AI dark projection). Registry/router unchanged.
2. Remove duplicate `create_profile` registry entry.
3. Unit test: no `create_with_ai` in sheet; single `create_store`; single `create_profile`.

## What could break / scope

- Create with AI no longer appears as a Create-sheet pill (still routable via registry if other surfaces call it).
- Create sheet presentation only; Performer intents and nav routes unchanged.
