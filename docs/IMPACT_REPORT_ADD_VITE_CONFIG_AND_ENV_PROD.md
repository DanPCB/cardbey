## Impact Report: Add dashboard `vite.config.ts` and `.env.prod`

### What could break
1. Build output could differ if plugin behavior changes how JSX is transformed.
2. Introducing a new mode env file could alter runtime values if additional `VITE_*` keys are later added.

### Why
Current deploy logs stop during `vite build --mode prod` without a clear fatal line. We are adding explicit Vite React plugin configuration and a minimal prod env file to remove ambiguity in build setup.

### Impact scope
- `apps/dashboard/cardbey-marketing-dashboard/vite.config.ts` (new)
- `apps/dashboard/cardbey-marketing-dashboard/.env.prod` (new)

### Smallest safe patch
1. Add minimal Vite config:
   - `plugins: [react()]`
   - `build.outDir = 'dist'` (existing default behavior)
2. Add minimal `.env.prod` with only:
   - `VITE_CARD_DESKTOP_DOCS_URL=`

### Verification
Run `pnpm build` in `apps/dashboard/cardbey-marketing-dashboard` and ensure build completes.

