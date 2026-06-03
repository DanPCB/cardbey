## Impact report: `/uploads/media/:filename` Range streaming route

### (1) What could break
- **Media downloads could regress**: if the new handler mishandles Range parsing, status codes, or headers, browsers may fail to decode video or may download the entire file.
- **Caching / CDN assumptions**: changing headers or response shape for `/uploads/media/*` could affect any downstream caching behavior.
- **Non-media `/uploads/*`**: if the handler accidentally matches broader paths, it could interfere with images and other static assets.

### (2) Why
- Video elements are sensitive to **byte-range streaming** and require correct `206` semantics (`Content-Range`, `Content-Length`, `Accept-Ranges`, correct `Content-Type`).
- A route placed before `express.static` changes which code path serves requests.

### (3) Impact scope
- **Only** URLs under **`/uploads/media/*`** (hero videos, uploaded media videos) when running Core.
- No changes to `/uploads/optimized/*`, `/uploads/*` outside `media`, API routes, auth, drafts, or publish flows.

### (4) Smallest safe patch
- Add a **narrow** `GET/HEAD /uploads/media/:filename` route before `express.static` that:
  - Uses `path.basename()` to avoid traversal
  - Streams from `uploads/media/`
  - Implements Range handling for `bytes=start-end`
  - Sets minimal required headers (`Content-Type`, `Accept-Ranges`, `Content-Range`, `Content-Length`, CORS expose headers)
  - Logs `[media-video] request` and `[media-video] response`
- Leave existing `app.use('/uploads', express.static(...))` in place for all other `/uploads/*`.

