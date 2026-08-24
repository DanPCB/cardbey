# Batch 001 Enrichment — Ops Runbook

**Batch:** `MELBOURNE_BATCH001_REAL_LOCAL`  
**Protected (never enrich):** `MELBOURNE_BATCH0_20260617`  
**Last updated:** 2026-08-24

---

## Render environment (core service)

```bash
# Required for enrichment synthesis + BI briefs
ANTHROPIC_API_KEY=<set>

# Hero fallback when no FSQ/website image (recommended)
PEXELS_API_KEY=<set>

# Broader POI sources (OSM + FSQ + Wikimedia + name recovery plan)
# Set 0 while FSQ credits are exhausted OR to force YP/True Local without FSQ
ENRICHMENT_BROADER_SOURCES=0

# Foursquare — optional; when set but out of credits (HTTP 429), agent falls back to YP/TL after deploy of fsq-fallback patch
# FOURSQUARE_API_KEY=<service-key>
# FOURSQUARE_API_VERSION=2025-06-17

# OSM Overpass (optional override)
# OSM_OVERPASS_URL=https://overpass-api.de/api/interpreter

# Persist candidate inventory across pod recycle (recommended)
# BUSINESS_CANDIDATE_DIR=/var/data/businessCandidates
```

Mount a **persistent disk** at `/var/data` (or your chosen path) when using `BUSINESS_CANDIDATE_DIR`.

---

## Known constraints

| Issue | Symptom | Mitigation |
|-------|---------|------------|
| Ephemeral disk | `INVENTORY_EMPTY` after deploy / new shell | Re-run discovery **or** persistent `BUSINESS_CANDIDATE_DIR` |
| Shell pod ≠ web pod | `candidates.json` empty in shell but QA shows 25 | Run CLI on web service shell, or mount shared disk |
| Postgres has no Batch 001 seeds | `batch001: 0` in seed query | Discovery writes JSON only today; export path not yet populated |
| FSQ 429 | `[Foursquare] search HTTP 429` | `ENRICHMENT_BROADER_SOURCES=0` **or** FSQ fallback patch (YP/TL after failed FSQ) |
| YP/TL 403 + Overpass timeout from Render | Thin `sourcesUsed` / no hero | Agent reserves 2 Pexels slots (`heroReserve=2`); expect `pexels` hero when key set |
| Candidate IDs change | Old `e56709e1…` invalid after re-discovery | Always list current IDs from `candidates.json` |

---

## Phase-close workflow

### Step 1 — Inventory check (web service shell)

```bash
cd ~/project/src/apps/core/cardbey-core
node -e "const fs=require('fs'); const p='data/businessCandidates/candidates.json'; const j=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):[]; const b=j.filter(c=>c.batchId==='MELBOURNE_BATCH001_REAL_LOCAL'); console.log({total:j.length, batch001:b.length, sample:b.slice(0,5).map(c=>({id:c.id,name:c.name}))})"
```

If `batch001: 0` → run **Real Local discovery** in admin UI for `MELBOURNE_BATCH001_REAL_LOCAL`, then re-check.

### Step 2 — Dry-run (3 candidates)

```bash
cd ~/project/src
export ENRICHMENT_BROADER_SOURCES=0   # omit after FSQ credits restored

pnpm enrich:candidates -- --batchId=MELBOURNE_BATCH001_REAL_LOCAL --candidateId=<ID_1> --dry-run
pnpm enrich:candidates -- --batchId=MELBOURNE_BATCH001_REAL_LOCAL --candidateId=<ID_2> --dry-run
pnpm enrich:candidates -- --batchId=MELBOURNE_BATCH001_REAL_LOCAL --candidateId=<ID_3> --dry-run
```

**Pass criteria (dry-run JSON line):**

- `sourcesUsed` includes more than `abr_lookup` + `claude_synthesised` (e.g. `yellow_pages`, `true_local`, `openstreetmap`, `pexels`)
- `descriptionLength` trending up vs 12-word baseline
- `heroImageSource` non-null when `PEXELS_API_KEY` set
- Report written under `docs/reports/ENRICHMENT_MULTISOURCE_DRYRUN_*`

### Step 3 — Live pilot (1–3 candidates, explicit approval)

Governance: **do not** bulk-approve QA. Live enrich mutates canonical candidate fields.

```bash
cd ~/project/src
pnpm enrich:candidates -- --batchId=MELBOURNE_BATCH001_REAL_LOCAL --candidateId=<ID> --maxCandidates=1
```

Or HTTP (admin auth, max 3 live):

```http
POST /api/business-candidates/enrich/multi-source
{
  "batchId": "MELBOURNE_BATCH001_REAL_LOCAL",
  "dryRun": false,
  "candidateIds": ["<ID>"],
  "maxCandidates": 1
}
```

### Step 4 — QA review

- Open admin QA for Batch 001
- Review description, category, hero, BI brief
- Approve individually — not bulk Approve on PARTIAL rows

### Step 5 — Persistence (close the ops loop)

Choose one durable path:

**A. Persistent disk (fastest ops fix)**

1. Render → service → disk mount → e.g. `/var/data`
2. `BUSINESS_CANDIDATE_DIR=/var/data/businessCandidates`
3. Re-run discovery once; inventory survives redeploys

**B. Postgres export (when seeds exist)**

```bash
cd ~/project/src
pnpm export:candidates-from-seeds -- --batch-id=MELBOURNE_BATCH001_REAL_LOCAL
```

Today Batch 001 seeds are **not** in Postgres until discovery persistence is wired.

---

## Postgres seed inventory (diagnostic)

```bash
cd ~/project/src/apps/core/cardbey-core
pnpm exec tsx -e "
import { listSeedRecords } from './src/lib/businessIngestion/IngestionRepository.ts';
(async () => {
  const seeds = await listSeedRecords();
  const byBatch = {};
  for (const s of seeds) byBatch[s.batchId || '(null)'] = (byBatch[s.batchId || '(null)'] || 0) + 1;
  console.log({ totalSeeds: seeds.length, byBatch });
})().catch(e => { console.error(e); process.exit(1); });
"
```

---

## Phase acceptance checklist

- [ ] `ENRICHMENT_BROADER_SOURCES=0` set while FSQ credits exhausted (or FSQ fallback deployed + tested)
- [ ] `PEXELS_API_KEY` set on Render
- [ ] 25 candidates present on web pod after discovery
- [ ] Dry-run 3 candidates — improved `sourcesUsed` / description / hero
- [ ] Live enrich 1–3 candidates — operator approved
- [ ] QA reviewed — at least 1 row acceptable to approve
- [ ] Persistence plan chosen (disk mount or future Postgres seed write)

---

## When FSQ credits return

1. Add credits at https://foursquare.com/developers/orgs  
2. Set `ENRICHMENT_BROADER_SOURCES=1` (or unset)  
3. Re-dry-run Braybrook Bakehouse — expect `[Foursquare]` and `foursquare` in `sourcesUsed`  
4. Compare ENRICHED rate vs FSQ-off baseline before batch live enrich
