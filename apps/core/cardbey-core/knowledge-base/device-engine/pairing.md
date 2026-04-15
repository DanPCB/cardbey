# Device Pairing

To pair a new device with Cardbey:

1. Open the **Device App** on the tablet or TV.
2. On the dashboard, go to **Devices → Pair New Device**.
3. Enter the pairing code shown on the device or scan the QR code.
4. When pairing succeeds, the device status will change from `pending` to `online`.

Common issues:

- If the status stays `pending_binding`, check that:
  - The device is online and can reach the Core server.
  - There is no firewall blocking the `/api/device/heartbeat` or `/api/device/playlist/full` endpoints.
- If pairing fails repeatedly, try:
  - Restarting the device app.
  - Regenerating a new pairing code.
