export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FakeClock implements Clock {
  private current: Date;

  constructor(initial: Date | string | number = new Date('2026-01-01T00:00:00.000Z')) {
    this.current = new Date(initial);
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(next: Date | string | number): void {
    this.current = new Date(next);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
