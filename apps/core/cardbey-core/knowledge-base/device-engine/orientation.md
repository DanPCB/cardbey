# Device Screen Orientation

Cardbey supports **vertical** and **horizontal** layouts for screens.  
Orientation settings affect both images and videos.

## How Orientation Works

1. Each device has a stored `orientation` value:
   - `landscape`
   - `portrait`
2. The dashboard can remotely update this value.
3. The device app:
   - Receives the updated orientation via playlist fetch or SSE.
   - Applies rotation to the render container.

## Vertical (Portrait) Screens

Portrait mode rotates content 90° clockwise or counter-clockwise depending on device type.

Common use cases:
- Menu boards
- Coffee shop screens
- Narrow wall displays

## Horizontal (Landscape) Screens

Landscape is the **default** orientation.  
Videos and images display without any rotation.

## Changing Orientation from the Dashboard

1. Open **Devices**.
2. Select the device.
3. Click **Settings** or **Orientation**.
4. Choose:
   - Portrait
   - Landscape
5. The device will update orientation on next refresh.

## Orientation on TVs (Important)

Some TV devices **lock the physical screen to landscape**.  
In this case:

- Rotating the *root container* instead of the video view may break playback.
- Only rotate the inner content container.
- Do **not** apply rotation on the Android `Activity` for TV.

## Troubleshooting Orientation Issues

### Video rotates incorrectly or disappears
- Confirm that the rotation is applied to the media container, not the root View.
- On TV devices, avoid `setRequestedOrientation()`; use view rotation instead.

### Image is stretched or clipped
- Ensure aspect ratio scaling mode is set to:
  - `CENTER_CROP` or `FIT_CENTER` depending on design.
- Avoid mixing rotation + scale on the same view hierarchy.

### Orientation not updating
- Check that:
  - The device is online.
  - SSE or periodic fetch is receiving updated orientation.
  - The dashboard shows the latest orientation value.
