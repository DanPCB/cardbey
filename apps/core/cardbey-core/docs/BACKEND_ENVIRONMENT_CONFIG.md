# Backend Environment Configuration Guide

## Overview

The backend (cardbey-core) now supports multi-environment configuration (DEV/STAGING/PROD) through environment variables.

## Environment Variables

### Core Configuration

```bash
# Environment type (DEV/STAGING/PROD)
ENVIRONMENT=production  # or staging, development

# Node environment
NODE_ENV=production

# Public API base URL (for generating asset URLs and device access)
# Use PUBLIC_API_BASE_URL (preferred) or PUBLIC_BASE_URL (fallback)
PUBLIC_API_BASE_URL=https://cardbey-core.onrender.com
# For local development with devices on same network:
# PUBLIC_API_BASE_URL=http://192.168.1.12:3001
```

### CORS Configuration

```bash
# Comma-separated list of allowed origins
ALLOWED_ORIGINS=https://dashboard.example.com,https://staging-dashboard.example.com

# Or use specific environment variables
DASHBOARD_URL=https://cardbey-marketing-dashboard.onrender.com
DASHBOARD_STAGING_URL=https://staging-dashboard.onrender.com
DASHBOARD_PRODUCTION_URL=https://prod-dashboard.onrender.com

# Legacy support
CORS_WHITELIST=https://example.com,https://another.com
STUDIO_URL=https://studio.example.com
PLAYER_URL=https://player.example.com
PLAYER_ORIGIN=https://player.example.com
FRONTEND_URL=https://dashboard.example.com
```

### SSE Stream Keys

```bash
# Environment-specific stream key (for production/staging)
SSE_STREAM_KEY=your-secure-stream-key-here

# Or use TV_STREAM_KEY (alias)
TV_STREAM_KEY=your-secure-stream-key-here
```

**Security Note:**
- In **production**, use `SSE_STREAM_KEY` with a secure random key
- In **development**, 'admin' and 'public' keys are allowed (NODE_ENV !== 'production')
- Never use 'admin' key in production

### Database

```bash
DATABASE_URL=postgresql://user:password@host:5432/database
```

## Environment-Specific Setup

### Development

```bash
ENVIRONMENT=development
NODE_ENV=development
PUBLIC_API_BASE_URL=http://192.168.1.12:3001
ALLOWED_ORIGINS=http://localhost:5174,http://127.0.0.1:5174
# SSE_STREAM_KEY not needed (uses 'admin' key)
# Note: Replace 192.168.1.12 with your machine's local IP address
```

### Staging

```bash
ENVIRONMENT=staging
NODE_ENV=production
PUBLIC_API_BASE_URL=https://staging-core.onrender.com
DASHBOARD_STAGING_URL=https://staging-dashboard.onrender.com
SSE_STREAM_KEY=staging-secure-key-12345
ALLOWED_ORIGINS=https://staging-dashboard.onrender.com
```

### Production

```bash
ENVIRONMENT=production
NODE_ENV=production
PUBLIC_API_BASE_URL=https://cardbey-core.onrender.com
DASHBOARD_PRODUCTION_URL=https://cardbey-marketing-dashboard.onrender.com
SSE_STREAM_KEY=production-secure-key-67890
ALLOWED_ORIGINS=https://cardbey-marketing-dashboard.onrender.com
```

## API Endpoints

### Environment Info

**GET `/api/env`**

Returns current environment configuration:

```json
{
  "mode": "production",
  "environment": "production",
  "host": "render-host-123",
  "publicBaseUrl": "https://cardbey-core.onrender.com",
  "dashboardUrl": "https://cardbey-marketing-dashboard.onrender.com",
  "db": "configured",
  "openai": "configured",
  "jwt": "configured",
  "port": "3001",
  "sseStreamKey": "configured",
  "allowedOrigins": ["https://cardbey-marketing-dashboard.onrender.com"],
  "timestamp": "2025-11-23T13:00:00.000Z"
}
```

## SSE Stream Connection

### Development

```javascript
// Uses 'admin' key (dev only)
const eventSource = new EventSource('/api/stream?key=admin');
```

### Production/Staging

```javascript
// Uses environment-specific key
const streamKey = process.env.REACT_APP_SSE_STREAM_KEY || 'your-key';
const eventSource = new EventSource(`/api/stream?key=${streamKey}`);
```

## CORS Behavior

### Development

- Allows localhost origins automatically
- Allows 192.168.1.x:5174 (LAN IPs)
- Logs all allowed origins on startup

### Production/Staging

- Only allows origins from:
  - `ALLOWED_ORIGINS` env var
  - `DASHBOARD_URL` / `DASHBOARD_STAGING_URL` / `DASHBOARD_PRODUCTION_URL`
  - `STUDIO_URL` / `PLAYER_URL` / `PLAYER_ORIGIN`
  - Base whitelist (Render domains)

## Player Config Endpoint

**GET `/api/player/config`**

Returns player configuration including SSE URL with correct key:

```json
{
  "ok": true,
  "screenId": "...",
  "sseUrl": "/api/stream?key=your-env-key"
}
```

## Security Best Practices

1. **Never use 'admin' key in production**
   - Set `SSE_STREAM_KEY` in production
   - Use different keys for staging and production

2. **Restrict CORS origins**
   - Only allow known dashboard URLs
   - Don't use wildcards in production

3. **Use HTTPS in production**
   - Set `PUBLIC_BASE_URL` to HTTPS
   - Ensure `HTTPS_ENABLED=true` if needed

4. **Rotate keys regularly**
   - Change `SSE_STREAM_KEY` periodically
   - Update all clients when rotating

## Testing Environment Configuration

1. **Check environment info:**
   ```bash
   curl https://cardbey-core.onrender.com/api/env
   ```

2. **Verify CORS:**
   ```bash
   curl -H "Origin: https://your-dashboard.com" \
        -H "Access-Control-Request-Method: GET" \
        -X OPTIONS \
        https://cardbey-core.onrender.com/api/screens
   ```

3. **Test SSE connection:**
   ```bash
   curl -N "https://cardbey-core.onrender.com/api/stream?key=your-key"
   ```

## Migration from Hardcoded Values

### Before (Hardcoded)

```javascript
// ❌ Hardcoded
const sseUrl = '/api/stream?key=admin';
```

### After (Environment-Aware)

```javascript
// ✅ Environment-aware
const sseUrl = `/api/stream?key=${process.env.SSE_STREAM_KEY || 'admin'}`;
```

## Troubleshooting

### CORS Errors

**Problem:** Dashboard cannot connect to backend

**Solution:**
1. Add dashboard URL to `ALLOWED_ORIGINS` or `DASHBOARD_URL`
2. Check backend logs for `[CORS] Origin not allowed` warnings
3. Verify environment variable is set correctly

### SSE Connection Fails

**Problem:** EventSource connection fails

**Solution:**
1. Check `SSE_STREAM_KEY` is set in production
2. Verify key matches between backend and frontend
3. Check CORS allows the origin
4. Use `/api/env` endpoint to verify configuration

### Wrong Environment Detected

**Problem:** Backend reports wrong environment

**Solution:**
1. Set `ENVIRONMENT` env var explicitly
2. Check `NODE_ENV` matches expected environment
3. Verify `PUBLIC_BASE_URL` matches environment

## Summary

✅ **Fixed:**
- CORS now supports environment-specific dashboard URLs
- SSE stream keys are environment-aware
- Environment info endpoint provides visibility
- Player config uses correct stream keys

❌ **Still Needs Frontend Fixes:**
- Dashboard vite.config.ts proxy configuration
- Dashboard localStorage key consistency
- Dashboard environment indicator UI
- Android pairing QR code URL

