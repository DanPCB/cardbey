
This saves bandwidth and improves performance.

## Troubleshooting Playlist Issues

### Device shows a black screen
- Confirm the playlist contains at least one valid media item.
- Check that the media URL is reachable (no missing `http://` prefix).
- Ensure the device is online and recently sent a heartbeat.

### Playlist stuck in `pending_binding`
- The dashboard may show `pending` when:
  - The device has not acknowledged the playlist yet.
  - The binding was created but the device hasn’t fetched it.
- Restart the device app after assigning a playlist.

### Videos not playing on tablets or TVs
Check that:
- The video codec is supported (H.264 recommended).
- The orientation logic is not rotating the container incorrectly.
- The video URL is fully formed (e.g., `http://...`, not `http/...`).

