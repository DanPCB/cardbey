# Menu Visual Agent - Environment Variables

## Required Configuration

**IMPORTANT:** Environment variables must be set in the **backend** `.env` file:
- **Location:** `apps/core/cardbey-core/.env`
- **Both API server and worker** read from the same file

Add these environment variables to `apps/core/cardbey-core/.env`:

```bash
# Menu Visual Agent Feature Flag
# Set to 'true', '1', 'yes', or 'on' to enable the feature
# Default: false (feature disabled)
ENABLE_MENU_VISUAL_AGENT=true

# Unsplash API (Optional - falls back to OpenAI if not set)
# Get your access key from: https://unsplash.com/developers
UNSPLASH_ACCESS_KEY=your_unsplash_access_key_here

# OpenAI API (Required for AI image generation fallback)
# Already configured in existing setup
OPENAI_API_KEY=your_openai_api_key_here
```

## Feature Flag

The feature is controlled by the `ENABLE_MENU_VISUAL_AGENT` environment variable:

- **`true`**, **`1`**, **`yes`**, or **`on`**: Feature enabled - images will be auto-generated after menu OCR
- **`false`** or **unset**: Feature disabled - no image generation

**Robust Boolean Parsing:**
The system accepts multiple values for "true":
- `ENABLE_MENU_VISUAL_AGENT=true` ✅
- `ENABLE_MENU_VISUAL_AGENT=1` ✅
- `ENABLE_MENU_VISUAL_AGENT=yes` ✅
- `ENABLE_MENU_VISUAL_AGENT=on` ✅

The flag is also exposed via the `/api/v2/flags` endpoint as `menu_visual_agent_v1`.

## Environment File Loading

**How it works:**
1. Both API server (`src/server.js`) and worker (`src/worker.js`) use shared env loader
2. Env loader uses **explicit paths** (not `process.cwd()`):
   - `apps/core/cardbey-core/.env.local` (highest priority, local overrides)
   - `apps/core/cardbey-core/.env` (standard file)
3. Files are loaded in order, later files override earlier ones
4. If `.env` doesn't exist, system uses `process.env` (from system/environment)

**Debug Logging:**
In development mode, the env loader logs:
- Project root path
- Which .env files were loaded
- Which files are missing
- Parsed feature flag values

## API Keys

### Unsplash (Optional)

- **Free tier**: 50 requests/hour
- **Sign up**: https://unsplash.com/developers
- **If not set**: System falls back to OpenAI DALL-E 3

### OpenAI (Required for fallback)

- **Already configured** in existing Cardbey setup
- **Used when**: Unsplash is unavailable or returns no results
- **Model**: DALL-E 3
- **Cost**: ~$0.04 per image (1024x1024)

## Rate Limits

- **Unsplash**: 50 requests/hour (free tier)
- **OpenAI**: Varies by tier (check your OpenAI dashboard)

The system handles rate limits gracefully:
- Unsplash rate limits → Falls back to OpenAI
- OpenAI rate limits → Logs warning, job retries later

## Running the Worker

**CRITICAL:** The worker process must be running for image generation to work.

**Option 1: Separate Terminal (Recommended for Development)**
```bash
# Terminal 1: API Server
cd apps/core/cardbey-core
npm run dev:api

# Terminal 2: Worker Process
cd apps/core/cardbey-core
npm run dev:worker
```

**Option 2: Combined (Both in one command)**
```bash
cd apps/core/cardbey-core
npm run dev:all
```

**Verify Worker is Running:**
Look for this log in worker console:
```
✅ Starting menu image generation worker (30s polling)...
📊 Active Services:
   - Menu Image Generation (30s)
```

## Testing

To test without API keys:

1. Set `ENABLE_MENU_VISUAL_AGENT=true` in `apps/core/cardbey-core/.env`
2. Restart both API server and worker
3. Leave `UNSPLASH_ACCESS_KEY` and `OPENAI_API_KEY` unset
4. System will log warnings but won't crash
5. Jobs will be queued but will fail gracefully (non-blocking)

## Production Checklist

- [ ] `ENABLE_MENU_VISUAL_AGENT=true` set
- [ ] `UNSPLASH_ACCESS_KEY` configured (optional but recommended)
- [ ] `OPENAI_API_KEY` configured (required for fallback)
- [ ] Worker process running (`npm run dev:worker` or `npm run start:worker`)
- [ ] Feature flag endpoint returns `menu_visual_agent_v1: true`

