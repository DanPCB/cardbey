# R2 / media CDN CORS (hero video playback)

Hero background videos are served from **`https://media.cardbey.com`** (Cloudflare R2 custom domain).
Browsers load them via a cross-origin `<video src="…">`. If the bucket does not return CORS
headers, playback fails with:

- `readyState: 0`, `networkState: 3`, `duration: NaN`
- Firefox: **Cross-Origin Request Blocked** / **OpaqueResponseBlocking**
- Dashboard shows: *"Video saved, but media CDN playback is blocked by CORS."*

Upload and draft persistence can still succeed — only **browser playback** is blocked.

## Required R2 bucket CORS policy

Configure CORS on the **`cardbey-media`** bucket (Cloudflare dashboard → R2 → bucket → Settings → CORS).

```json
[
  {
    "AllowedOrigins": [
      "https://cardbey.com",
      "https://www.cardbey.com",
      "https://cardbey-dashboard.onrender.com",
      "https://cardbey-dashboard-staging.onrender.com",
      "http://localhost:5174",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "HEAD", "OPTIONS"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": [
      "Content-Length",
      "Content-Type",
      "Content-Range",
      "Accept-Ranges",
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

Add any additional dashboard or preview origins you use in production/staging.

### Why these headers matter

| Header | Purpose |
|--------|---------|
| `Access-Control-Allow-Origin` | Must include the page origin (dashboard or public site) |
| `Accept-Ranges` / `Content-Range` | Range requests for video seek/buffer |
| `Content-Length` / `Content-Type` | Metadata for `<video>` element |
| `ETag` | Cache validation |

## Verify after deploy

```bash
curl -I -H "Origin: https://cardbey-dashboard.onrender.com" \
  "https://media.cardbey.com/media/videos/<object-key>.mp4"
```

Expect:

- `HTTP/2 200` (or `206` with `Range: bytes=0-1`)
- `access-control-allow-origin: https://cardbey-dashboard.onrender.com` (or `*`)
- `accept-ranges: bytes`
- `content-type: video/mp4`

## Related env (Core)

| Variable | Example |
|----------|---------|
| `STORAGE_DRIVER` | `s3` |
| `MEDIA_PUBLIC_BASE_URL` | `https://media.cardbey.com` |
| `S3_BUCKET` | `cardbey-media` |

See also: [`DEPLOYMENT_PROMOTION.md`](./DEPLOYMENT_PROMOTION.md) for branch deploy flow.
