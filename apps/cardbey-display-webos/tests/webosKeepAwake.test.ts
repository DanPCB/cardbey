import { describe, expect, it } from 'vitest';
import { startWebOsKeepAwake } from '../src/platform/webosKeepAwake.js';

describe('webosKeepAwake', () => {
  it('rejects Active screensaver requests via WebOSServiceBridge', () => {
    const calls: Array<{ uri: string; params: string }> = [];
    const holder: { cb: ((msg: string) => void) | null } = { cb: null };

    class FakeBridge {
      set onservicecallback(fn: ((msg: string) => void) | null) {
        holder.cb = fn;
      }
      get onservicecallback(): ((msg: string) => void) | null {
        return holder.cb;
      }
      call(uri: string, params: string) {
        calls.push({ uri, params });
      }
    }

    (window as unknown as { WebOSServiceBridge: new () => FakeBridge }).WebOSServiceBridge =
      FakeBridge;

    const handle = startWebOsKeepAwake();
    expect(calls[0]?.uri).toContain('registerScreenSaverRequest');
    expect(holder.cb).not.toBeNull();

    holder.cb!(
      JSON.stringify({
        returnValue: true,
        timestamp: '12345',
        state: 'Active',
      }),
    );

    const respond = calls.find((c) => c.uri.includes('responseScreenSaverRequest'));
    expect(respond).toBeTruthy();
    expect(JSON.parse(respond!.params)).toMatchObject({
      clientName: 'com.cardbey.display',
      ack: false,
      timestamp: '12345',
    });

    handle.setEnabled(false);
    const before = calls.length;
    holder.cb!(
      JSON.stringify({
        returnValue: true,
        timestamp: '999',
        state: 'Active',
      }),
    );
    expect(calls.length).toBe(before);

    handle.stop();
    delete (window as unknown as { WebOSServiceBridge?: unknown }).WebOSServiceBridge;
  });

  it('returns noop when Luna bridge is unavailable', () => {
    delete (window as unknown as { WebOSServiceBridge?: unknown }).WebOSServiceBridge;
    const handle = startWebOsKeepAwake();
    expect(() => {
      handle.setEnabled(false);
      handle.stop();
    }).not.toThrow();
  });
});
