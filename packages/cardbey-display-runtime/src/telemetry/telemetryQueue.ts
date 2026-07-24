import { createId } from '../platform/platformAdapter.js';
import type { Clock } from '../platform/clock.js';
import type {
  DisplayTelemetryEvent,
  DisplayTelemetryEventType,
  TelemetrySink,
} from './telemetryTypes.js';

export type TelemetryQueueOptions = {
  sink: TelemetrySink;
  clock: Clock;
  maxQueueSize?: number;
  /** drop_oldest (default) | drop_newest */
  overflow?: 'drop_oldest' | 'drop_newest';
};

export class TelemetryQueue {
  private queue: DisplayTelemetryEvent[] = [];
  private readonly maxQueueSize: number;
  private readonly overflow: 'drop_oldest' | 'drop_newest';

  constructor(private readonly options: TelemetryQueueOptions) {
    this.maxQueueSize = options.maxQueueSize ?? 200;
    this.overflow = options.overflow ?? 'drop_oldest';
  }

  enqueue(
    type: DisplayTelemetryEventType,
    partial: Omit<DisplayTelemetryEvent, 'id' | 'type' | 'occurredAt'> = {},
  ): DisplayTelemetryEvent {
    const event: DisplayTelemetryEvent = {
      id: createId(),
      type,
      occurredAt: this.options.clock.now().toISOString(),
      ...partial,
    };
    if (this.queue.length >= this.maxQueueSize) {
      if (this.overflow === 'drop_oldest') this.queue.shift();
      else return event;
    }
    this.queue.push(event);
    return event;
  }

  size(): number {
    return this.queue.length;
  }

  peek(): DisplayTelemetryEvent[] {
    return [...this.queue];
  }

  async flush(limit = this.queue.length): Promise<number> {
    if (this.queue.length === 0) return 0;
    const batch = this.queue.slice(0, limit);
    await this.options.sink.send(batch);
    this.queue = this.queue.slice(batch.length);
    return batch.length;
  }
}
