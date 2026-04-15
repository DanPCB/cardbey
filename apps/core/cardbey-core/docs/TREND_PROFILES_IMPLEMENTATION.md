# Trend Profiles Implementation Guide

This document describes the Trend Profiles feature implementation for the AI Design Assistant.

## Overview

Trend Profiles (style brains) allow the AI Design Assistant to generate designs using specific contemporary style trends. Each trend profile contains:
- Color palettes
- Typography recommendations
- Layout patterns
- Style prompt tags

## Backend Implementation (cardbey-core)

### Database Model

The `TrendProfile` model has been added to the Prisma schema:

```prisma
model TrendProfile {
  id        String   @id @default(cuid())
  slug      String   @unique
  name      String
  season    String?  // e.g. "2025-Q1"
  domain    String?  // e.g. "design", "poster", "social"
  goal      String?  // e.g. "poster", "story", etc.
  source    String?  // e.g. "manual", "ai_web_summary"
  isActive  Boolean  @default(true)
  weight    Int      @default(1) // for future ranking
  data      Json     // JSON blob with palettes, typography, layout patterns, etc.
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([slug])
  @@index([isActive, goal])
  @@index([season])
}
```

### API Endpoints

#### GET /api/trends
List active trend profiles with optional filtering.

**Query Parameters:**
- `goal` (optional): Filter by goal (e.g. "poster", "story")
- `search` (optional): Search by name or slug
- `include` (optional): Set to "data" to include full data blob

**Response:**
```json
{
  "ok": true,
  "trends": [
    {
      "id": "...",
      "slug": "2025-q1-neon-tech-poster",
      "name": "Neon Tech 2025 Poster",
      "season": "2025-Q1",
      "goal": "poster",
      "domain": "design",
      "isActive": true,
      "weight": 1
    }
  ],
  "count": 4
}
```

#### GET /api/trends/:idOrSlug
Get a single trend profile by ID or slug (includes full data blob).

**Response:**
```json
{
  "ok": true,
  "trend": {
    "id": "...",
    "slug": "2025-q1-neon-tech-poster",
    "name": "Neon Tech 2025 Poster",
    "season": "2025-Q1",
    "goal": "poster",
    "data": {
      "palettes": [...],
      "typography": {...},
      "layout_patterns": [...],
      "prompt_tags": [...]
    }
  }
}
```

### AI Routes Updated

Both `/api/ai/plan-design` and `/api/ai/generate-design` now accept:
- `trendId` (optional): ID of trend to use
- `trendSlug` (optional): Slug of trend to use

If neither is provided, the backend will auto-select the latest active trend matching the goal.

**Request Body Example:**
```json
{
  "prompt": "futuristic robot poster",
  "goal": "poster",
  "trendId": "clx123..."
}
```

The trend context is:
1. Resolved from the request
2. Logged for analytics
3. Passed to the AI generation service
4. Used to influence colors, typography, and layout

### Seeding

Run the seed script to create starter trends:

```bash
node prisma/seed.trends.js
```

This creates 4 starter trends:
- Neon Tech 2025 Poster
- Warm Bakery 2025
- Minimal Corporate 2025
- Playful Social 2025

## Frontend Implementation (cardbey-marketing-dashboard)

### Step 1: Add API Client

Copy `docs/trends-api-client.ts` to `src/api/trends.api.ts` and adjust the import for your `buildApiUrl` helper.

### Step 2: Add Style Trend Selector

Copy the `StyleTrendSelector` component from `docs/trends-ui-component.tsx` to your components directory, or integrate it directly into your Design Assistant component.

### Step 3: Update Design Assistant

1. Add state for selected trend:
```tsx
const [selectedTrendId, setSelectedTrendId] = useState<string | 'auto'>('auto');
```

2. Add the Style Trend dropdown to your form (after Style Preset section).

3. Include `trendId` in plan/generate requests:
```tsx
const body = {
  ...existingBody,
  ...(selectedTrendId !== 'auto' ? { trendId: selectedTrendId } : {}),
};
```

### Step 4: Persist Trend Choice (Optional)

If your design snapshot stores style preferences, add:
```tsx
{
  trendId: selectedTrendId !== 'auto' ? selectedTrendId : null,
  trendSlug: selectedTrendId !== 'auto' ? trends.find(t => t.id === selectedTrendId)?.slug : null,
}
```

On load, restore the trend:
```tsx
useEffect(() => {
  if (savedDesign?.trendId) {
    setSelectedTrendId(savedDesign.trendId);
  }
}, [savedDesign]);
```

## Testing

### Backend Tests

1. **List trends:**
```bash
curl http://localhost:3001/api/trends
```

2. **Filter by goal:**
```bash
curl http://localhost:3001/api/trends?goal=poster
```

3. **Get specific trend:**
```bash
curl http://localhost:3001/api/trends/2025-q1-neon-tech-poster
```

4. **Test plan-design with trend:**
```bash
curl -X POST http://localhost:3001/api/ai/plan-design \
  -H "Content-Type: application/json" \
  -d '{"prompt": "futuristic robot", "goal": "poster", "trendId": "YOUR_TREND_ID"}'
```

### Frontend Tests

1. Verify trends load in the dropdown
2. Select a trend and generate a design
3. Verify the design uses trend colors/typography
4. Test "Auto" mode (should use default trend for goal)

## Future Enhancements

- Analytics: Track which trends are most used
- Self-learning: Update trend weights based on usage
- Trend recommendations: Suggest trends based on prompt content
- Trend creation UI: Allow admins to create new trends
- Trend versioning: Support multiple versions of the same trend

