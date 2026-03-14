# Mission Workspace Layout Audit

## What was visually weak before

- **Narrow content**: Main content used `max-w-2xl`, leaving large empty margins on desktop and under-utilizing screen width.
- **Disconnected sections**: Mission summary (PlanProposalBlock) and "Continue next missions" (NextMissionLauncher) had different width constraints and a simple `border-t` separator; they did not feel like one workflow.
- **No mission brief**: The user request (source prompt) was removed; the page did not clearly show "what the mission is" at a glance.
- **Flat hierarchy**: Single card with modest padding (`rounded-lg`, `p-4`), weak section grouping, and loose internal spacing.
- **Excess whitespace**: `py-4` with narrow column created a floating-stack-on-empty-canvas feel.
- **Form and launcher**: Store input area and next-mission pills/input were functional but not aligned to a clear spacing rhythm or card system.

## What is being improved

1. **Workspace container**: Centered `max-w-5xl` (or `max-w-6xl`) with `px-6` / `lg:px-8`, `py-6`, and consistent vertical spacing (`space-y-5`/`space-y-6`) so the page reads as one workspace.
2. **Mission request card**: Reintroduce the user prompt as a polished "Mission brief" card (rounded-2xl, border, shadow-sm, clear title/value) so the screen answers "what the mission is" first.
3. **Mission summary card**: Treat PlanProposalBlock as the primary card—stronger wrapper (rounded-2xl, p-5/p-6), clearer header, `gap-y-4`/`gap-y-5` between status, store input, and actions; form layout with 2-column row on desktop.
4. **Continue next missions**: Redesign NextMissionLauncher as an integrated section with the same width as the cards above, card-style block (rounded-xl/2xl, compact padding), polished pills and compact input row so it feels like a natural continuation.
5. **Spacing rhythm**: Normalize section gap (4–6), card padding (5–6), internal gaps (3–5), pill/form gaps (2–4); remove arbitrary margins.
6. **Responsive**: Same container and padding across breakpoints; form uses 2 columns where appropriate and stacks on small screens; pills wrap cleanly.
7. **Visual polish**: Consistent rounded-2xl, subtle borders, soft backgrounds, restrained shadow, stronger text hierarchy, and clearer primary CTA so the page feels like a high-quality SaaS operator workspace.

## Outcome

The screen communicates in order: (1) what the mission is, (2) what the system is doing/ready to do, (3) what input is needed, (4) what the user can do next—as one unified workflow, with better use of space and no backend or logic changes.
