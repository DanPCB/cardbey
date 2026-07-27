import { describe, it, expect, beforeEach } from 'vitest';
import { emitPlatformActivity } from './platformActivityEmitter.js';
import {
  clearPlatformActivityStoreForTests,
  listPlatformActivityEvents,
  broadcastPlatformActivityEvent,
  addPlatformActivityStreamClient,
} from './platformActivityStore.js';
import { sanitizePlatformActivityEvent } from './platformActivitySanitizer.js';

describe('platformActivity', () => {
  beforeEach(() => {
    clearPlatformActivityStoreForTests();
    process.env.PLATFORM_ACTIVITY_ENABLED = 'true';
  });

  it('emit creates event in store', () => {
    const event = emitPlatformActivity({
      type: 'user_registered',
      severity: 'success',
      actorType: 'user',
      actorId: 'user-1',
      entityType: 'user',
      entityId: 'user-1',
      title: 'New user registered',
      message: 'A new account joined the platform.',
      route: '/admin',
    });
    expect(event).toBeTruthy();
    expect(event?.type).toBe('user_registered');
    expect(event?.category).toBe('user_account');
    expect(event?.actionLabel).toBe('Open Accounts');

    const listed = listPlatformActivityEvents({ limit: 10 });
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(event?.id);
  });

  it('deduplicates noisy repeated events within window', () => {
    const base = {
      type: 'device_paired',
      severity: 'success',
      actorType: 'device',
      actorId: 'dev-1',
      entityType: 'device',
      entityId: 'dev-1',
      title: 'Device paired',
      message: 'TV connected.',
    };
    const first = emitPlatformActivity(base);
    const second = emitPlatformActivity(base);
    expect(first).toBeTruthy();
    expect(second).toBeNull();
    expect(listPlatformActivityEvents({ limit: 10 })).toHaveLength(1);
  });

  it('latest activity returns filtered events', () => {
    emitPlatformActivity({
      type: 'user_registered',
      severity: 'success',
      actorType: 'user',
      actorId: 'u1',
      entityType: 'user',
      entityId: 'u1',
      title: 'New user registered',
      message: 'Joined.',
    });
    emitPlatformActivity({
      type: 'mission_failed',
      severity: 'warning',
      actorType: 'performer',
      actorId: null,
      entityType: 'mission',
      entityId: 'm1',
      title: 'Mission failed',
      message: 'Store creation failed.',
    });

    const warnings = listPlatformActivityEvents({ severity: 'warning', limit: 10 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('mission_failed');

    const userEvents = listPlatformActivityEvents({ category: 'user_account', limit: 10 });
    expect(userEvents).toHaveLength(1);
  });

  it('stream sends event to connected client', () => {
    /** @type {string[]} */
    const chunks = [];
    const res = {
      writableEnded: false,
      destroyed: false,
      write(chunk) {
        chunks.push(String(chunk));
        return true;
      },
      on() {},
    };
    addPlatformActivityStreamClient(res);

    const event = emitPlatformActivity({
      type: 'business_claim_started',
      severity: 'info',
      actorType: 'user',
      actorId: 'u2',
      entityType: 'business_seed',
      entityId: 'seed-1',
      title: 'Business claim started',
      message: 'Sample Business began verification.',
    });
    expect(event).toBeTruthy();
    expect(chunks.some((c) => c.includes('platform-activity'))).toBe(true);
    expect(chunks.join('')).toContain('business_claim_started');

    broadcastPlatformActivityEvent(event);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('sensitive fields are stripped from API responses', () => {
    const event = emitPlatformActivity({
      type: 'user_registered',
      severity: 'success',
      actorType: 'user',
      actorId: 'user-abc',
      entityType: 'user',
      entityId: 'user-abc',
      title: 'New user',
      message: 'Contact user@example.com or call +1 555-123-4567',
      metadata: { password: 'secret123', token: 'bearer abc.def.ghi' },
    });
    const sanitized = sanitizePlatformActivityEvent(event);
    expect(sanitized.message).not.toContain('user@example.com');
    expect(sanitized.message).toContain('[email]');
    expect(sanitized.metadata.password).toBe('[redacted]');
    expect(sanitized.metadata.token).toBe('[redacted]');
  });
});
