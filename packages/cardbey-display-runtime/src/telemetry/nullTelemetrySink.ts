import type { TelemetrySink } from './telemetryTypes.js';

export const nullTelemetrySink: TelemetrySink = {
  async send(): Promise<void> {
    // intentionally no-op — Device V2 telemetry upload is incomplete
  },
};
