# Uploads and Scanning

## Governed flow (required)

```
Capture or select
  → upload / prepare
  → identify type + entities
  → structured review screen
  → user chooses intent
  → confirmed submission via Performer Runtime
```

**Never** auto-route uploads to store creation.

## Upload endpoints

| Step | API |
|------|-----|
| Create upload | `POST /api/uploads/create` (multipart or base64 JSON) |
| Store branding | `POST /api/stores/:storeId/upload/{hero,logo,avatar}` |
| Runtime UI | `POST /api/performer/runtime/ui-action/upload-*` |

Use response `url` / `publicUrl` — do not rebuild CDN URLs.

## Validation (client)

- MIME allow-list per purpose (image/*, application/pdf, video/*)
- Max size from backend rules (query `/api/uploads/create` metadata when available)
- Sanitize filenames
- Preview before Performer handoff

## Camera / picker (Phase 5)

| Use case | API |
|----------|-----|
| Business card | CameraX → review → optional `POST /api/missions/extract-card` |
| Document | SAF / Photo Picker |
| QR deep link | CameraX ML Kit assist → validate host |
| Product photo | Camera → upload → Performer with user-selected intent |

Local ML Kit is capture assistance only; authoritative extraction is server-side.

## Business card shortcuts (after review)

User must choose:

- Create store draft
- Save contact / enrich profile
- Business lookup
- Attach to existing store

Each routes through intake with explicit `userMessage` + attachment refs.

## Offline

- Queue upload bytes in app storage with `WorkManager` when connectivity returns
- Do not queue Performer intents without user confirmation snapshot

## Permissions (request in context)

| Permission | When |
|------------|------|
| CAMERA | Scan / capture flow |
| RECORD_AUDIO | Voice input in Performer |
| POST_NOTIFICATIONS | After first meaningful notification (Android 13+) |
| — | No broad storage; use Photo Picker / SAF |
