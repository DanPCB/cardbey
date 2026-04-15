# Environment Variables Documentation

## Overview

This document lists all environment variables required for Cardbey Core, organized by priority and use case.

---

## 🔴 CRITICAL - Required for Production

These variables **MUST** be set in production or the application will not function correctly.

### `PUBLIC_API_BASE_URL` / `PUBLIC_BASE_URL`

**Type:** String (URL)  
**Required:** Yes (in production)  
**Example (Development):** `http://192.168.1.12:3001`  
**Example (Production):** `https://cardbey-core.onrender.com`

**Description:**
- Full URL of the backend API server (HTTP in dev, HTTPS in production)
- Used for resolving relative asset URLs to absolute URLs
- **CRITICAL** for video playback - videos will fail to load if not set
- `PUBLIC_API_BASE_URL` takes priority over `PUBLIC_BASE_URL` if both are set
- Must use HTTPS in production

**Impact if missing:**
- Video URLs will not resolve correctly
- Asset URLs may be malformed
- ExoPlayer will fail with 404 errors
- Device apps cannot fetch playlists

**Validation:**
- Must start with `https://` in production
- Can use `http://` in development (e.g., `http://192.168.1.12:3001`)
- Must be a valid URL
- Checked on server startup

**Development Setup:**
For local development with devices on the same network:
```bash
PUBLIC_API_BASE_URL=http://192.168.1.12:3001
```
Replace `192.168.1.12` with your machine's local IP address.

---

### `JWT_SECRET`

**Type:** String  
**Required:** Yes (in production)  
**Min Length:** 32 characters  
**Example:** `openssl rand -hex 32`

**Description:**
- Secret key for signing and verifying JWT tokens
- Used for authentication across all protected endpoints
- **CRITICAL** for security - must be unique and secure

**Impact if missing:**
- Authentication will fail
- Users cannot log in
- Protected endpoints will reject requests

**Security Requirements:**
- Must be at least 32 characters
- Must NOT use default values:
  - ❌ `change-me-in-production`
  - ❌ `default-secret-change-this`
  - ❌ `dev-secret-change-in-production`
- Generate with: `openssl rand -hex 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**Validation:**
- Checked on server startup
- Must not be default value in production

---

### `NODE_ENV`

**Type:** Enum  
**Required:** Yes (in production)  
**Values:** `development` | `production` | `test`  
**Default:** `development`

**Description:**
- Node.js environment mode
- Controls behavior of many libraries and frameworks
- Enables/disables production optimizations

**Impact if missing:**
- Development mode may be used in production (security risk)
- Debug routes may be enabled
- Performance optimizations may be disabled

**Validation:**
- Should be `production` in production environment
- Checked on server startup

---

### `DATABASE_URL`

**Type:** String (Connection String)  
**Required:** Yes (always)  
**Example (PostgreSQL):** `postgresql://user:password@host:5432/database`  
**Example (SQLite):** `file:./prisma/dev.db`

**Description:**
- Database connection string
- Required for all database operations
- Format depends on database provider

**Impact if missing:**
- Application cannot start
- All database operations will fail

**Validation:**
- Checked on server startup
- Must be valid connection string

---

## 🟠 HIGH - Recommended for Production

These variables are **highly recommended** for production but have fallbacks.

### `CDN_BASE_URL`

**Type:** String (URL)  
**Required:** No (but recommended)  
**Example:** `https://d1234567890.cloudfront.net`

**Description:**
- Base URL for CloudFront/S3 CDN
- Used to detect CloudFront URLs (prevents modification)
- Improves video delivery performance

**Impact if missing:**
- CloudFront URLs may be incorrectly modified
- Video delivery may be slower
- Fallback: URLs are still served but not optimized

**Validation:**
- Should start with `https://` if set
- Checked on server startup (warning only)

---

## 🟡 MEDIUM - Optional but Useful

### `PORT`

**Type:** Number  
**Required:** No  
**Default:** `3001`

**Description:**
- Port number for the HTTP server
- Usually set by hosting platform (Render, Heroku, etc.)

---

### `ALLOWED_ORIGINS`

**Type:** String (Comma-separated)  
**Required:** No  
**Example:** `https://dashboard.example.com,https://staging.example.com`

**Description:**
- Comma-separated list of allowed CORS origins
- Used for CORS middleware configuration

---

### `SSE_STREAM_KEY` / `TV_STREAM_KEY`

**Type:** String  
**Required:** No (in development)  
**Description:**
- Secure key for SSE stream authentication
- In production, should be a secure random string
- In development, defaults to `'admin'` and `'public'`

---

### `SAM3_MODEL_PATH`

**Type:** String (File Path)  
**Required:** No (only if using SAM-3 segmentation)  
**Example:** `./models/sam3_hiera_large.pt`  
**Default:** Not set (SAM-3 disabled)

**Description:**
- Path to the SAM-3 model file (PyTorch `.pt` format)
- Required for SAM-3 image segmentation features
- Model file must be downloaded from Hugging Face (see `docs/SAM3_SETUP.md`)

**Impact if missing:**
- SAM-3 segmentation will be disabled
- Vision pipeline will fall back to OCR-only mode
- No impact on other features

**Validation:**
- File must exist at the specified path
- File must be a valid PyTorch model (`.pt` extension)

---

### `SAM3_DEVICE`

**Type:** Enum  
**Required:** No (only if using SAM-3)  
**Values:** `cuda` | `cpu`  
**Default:** `cpu`

**Description:**
- Device to run SAM-3 inference on
- `cuda`: Use GPU acceleration (requires CUDA-capable GPU)
- `cpu`: Use CPU (slower but works on all machines)

**Impact if missing:**
- Defaults to `cpu` (slower inference)
- GPU acceleration requires CUDA drivers and PyTorch with CUDA support

**Recommendations:**
- Use `cuda` in production if GPU is available
- Use `cpu` for development/testing on machines without GPU

---

## 🟢 LOW - Optional Features

### SAM-2 / SAM-3 Configuration

**SAM-2 (Public, Available Now):**
```bash
# SAM-2 Model Configuration (optional, public - no access needed)
SAM2_MODEL_PATH=./models/sam2_hiera_large/sam2_hiera_large.pt
SAM2_DEVICE=cuda  # or 'cpu' for development machines
```

**SAM-3 (Requires Access Approval):**
```bash
# SAM-3 Model Configuration (optional, requires Hugging Face access)
SAM3_MODEL_PATH=./models/sam3_hiera_large/sam3_hiera_large.pt
SAM3_DEVICE=cuda  # or 'cpu' for development machines
```

**Recommendation:** Use SAM-2 for immediate setup, upgrade to SAM-3 later if needed.

**Note:** See `docs/SAM3_SETUP.md` for complete setup instructions. See `SAM2_VS_SAM3_COMPARISON.md` for differences.

---

### OAuth Providers

**Facebook:**
- `FACEBOOK_CLIENT_ID`
- `FACEBOOK_CLIENT_SECRET`
- `FACEBOOK_REDIRECT_URI`

**TikTok:**
- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`
- `TIKTOK_REDIRECT_URI`

**Twitter:**
- `TWITTER_CLIENT_ID`
- `TWITTER_CLIENT_SECRET`
- `TWITTER_REDIRECT_URI`

---

## Environment-Specific Configuration

### Development

```bash
NODE_ENV=development
PORT=3001
DATABASE_URL=file:./prisma/dev.db
JWT_SECRET=dev-secret-change-in-production
PUBLIC_API_BASE_URL=http://192.168.1.12:3001
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5174

# SAM-3 Configuration (optional)
SAM3_MODEL_PATH=./models/sam3_hiera_large.pt
SAM3_DEVICE=cpu  # Use 'cpu' for development machines without GPU
```

**Notes:**
- `PUBLIC_API_BASE_URL` can be HTTP in development (use your machine's local IP for device access)
- Replace `192.168.1.12` with your actual local IP address
- `JWT_SECRET` can be shorter/weaker in development
- `SAM3_DEVICE=cpu` recommended for development (no GPU required)
- Debug routes are enabled

---

### Production

```bash
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
JWT_SECRET=<32+ character secure random string>
PUBLIC_API_BASE_URL=https://cardbey-core.onrender.com
CDN_BASE_URL=https://d1234567890.cloudfront.net
ALLOWED_ORIGINS=https://dashboard.example.com
SSE_STREAM_KEY=<secure random string>

# SAM-3 Configuration (optional)
SAM3_MODEL_PATH=./models/sam3_hiera_large.pt
SAM3_DEVICE=cuda  # Use 'cuda' if GPU available, 'cpu' otherwise
```

**Notes:**
- `PUBLIC_API_BASE_URL` **MUST** use HTTPS
- `JWT_SECRET` **MUST** be secure (32+ chars, not default)
- `CDN_BASE_URL` recommended for CloudFront
- `SAM3_DEVICE=cuda` recommended for production (faster inference)
- Debug routes are disabled

---

## Validation

### Automatic Validation

The application validates environment variables on startup:

1. **Server Startup** (`src/server.js`):
   - Validates critical variables
   - Logs warnings for missing recommended variables
   - Logs errors for missing critical variables (but continues startup)

2. **Check Script** (`scripts/check-env.js`):
   - Run with: `npm run check-env`
   - Validates all variables using Zod schema
   - Exits with error code if validation fails
   - Provides actionable error messages

### Manual Validation

Check environment variables:

```bash
# Check all variables
npm run check-env

# Check specific variable
echo $PUBLIC_BASE_URL
echo $JWT_SECRET
echo $NODE_ENV
```

---

## Testing Checklist

### Production Environment

- [ ] `PUBLIC_API_BASE_URL` is set to full HTTPS URL
- [ ] `PUBLIC_API_BASE_URL` starts with `https://`
- [ ] `CDN_BASE_URL` is set if using CloudFront
- [ ] `CDN_BASE_URL` starts with `https://` if set
- [ ] `JWT_SECRET` is set and at least 32 characters
- [ ] `JWT_SECRET` is not a default value
- [ ] `NODE_ENV` is set to `production`
- [ ] `DATABASE_URL` is set and valid

### URL Resolution Testing

- [ ] Test URL resolution with `PUBLIC_API_BASE_URL` set
- [ ] Test URL resolution without `PUBLIC_API_BASE_URL` (should log warning)
- [ ] Verify production URLs use HTTPS
- [ ] Verify CloudFront URLs are not modified
- [ ] Verify device app can fetch playlists using `PUBLIC_API_BASE_URL`

---

## Troubleshooting

### "PUBLIC_BASE_URL not set in production!" or "PUBLIC_API_BASE_URL not set"

**Solution:**
```bash
export PUBLIC_API_BASE_URL=https://your-domain.com
# Or in .env file:
PUBLIC_API_BASE_URL=https://your-domain.com

# For local development with devices:
PUBLIC_API_BASE_URL=http://192.168.1.12:3001
```

### "JWT_SECRET is using a default value"

**Solution:**
```bash
# Generate secure secret
openssl rand -hex 32

# Set in environment
export JWT_SECRET=<generated-secret>
```

### "Video URLs are malformed"

**Causes:**
- `PUBLIC_API_BASE_URL` (or `PUBLIC_BASE_URL`) not set
- `PUBLIC_API_BASE_URL` uses HTTP instead of HTTPS in production
- `PUBLIC_API_BASE_URL` is invalid URL
- Device app `API_BASE_URL` doesn't match backend `PUBLIC_API_BASE_URL`

**Solution:**
- Set `PUBLIC_API_BASE_URL` to full URL (HTTP for dev, HTTPS for prod)
- Verify URL is accessible from device network
- Ensure Android app `API_BASE_URL` matches backend `PUBLIC_API_BASE_URL`
- Check server logs for URL resolution errors

---

## Security Notes

1. **Never commit `.env` files** to version control
2. **Use secure secrets** in production (32+ characters, random)
3. **Use HTTPS** for all production URLs
4. **Rotate secrets** periodically
5. **Use environment-specific values** (dev vs prod)

---

## Related Documentation

- `docs/VIDEO_URL_RESOLUTION_FIX.md` - URL resolution implementation
- `docs/BACKEND_ENVIRONMENT_CONFIG.md` - Environment configuration guide
- `docs/SAM3_SETUP.md` - SAM-3 model setup and configuration guide
- `scripts/check-env.js` - Environment validation script

