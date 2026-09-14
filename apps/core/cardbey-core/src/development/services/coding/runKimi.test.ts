import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { runKimi } from './runKimi.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

function mockChild(
  exitCode = 0,
  stdoutChunks: string[] = [],
  stderrChunks: string[] = [],
  autoClose = true,
): ReturnType<typeof spawn> & { emitClose: () => void } {
  const child = new EventEmitter() as ReturnType<typeof spawn> & EventEmitter;
  const stdout = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
  const stderr = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;

  child.stdout = stdout;
  child.stderr = stderr;
  child.pid = 12345;
  child.kill = vi.fn();

  const emitClose = (): void => {
    for (const chunk of stdoutChunks) {
      stdout.emit('data', Buffer.from(chunk));
    }
    for (const chunk of stderrChunks) {
      stderr.emit('data', Buffer.from(chunk));
    }
    child.emit('close', exitCode);
  };

  if (autoClose) {
    process.nextTick(emitClose);
  }

  return Object.assign(child, { emitClose });
}

describe('runKimi executable resolution', () => {
  const mockedSpawn = vi.mocked(spawn);
  let originalKimiExecutable: string | undefined;

  beforeEach(() => {
    originalKimiExecutable = process.env.KIMI_EXECUTABLE;
    mockedSpawn.mockReset();
  });

  afterEach(() => {
    if (originalKimiExecutable === undefined) {
      delete process.env.KIMI_EXECUTABLE;
    } else {
      process.env.KIMI_EXECUTABLE = originalKimiExecutable;
    }
  });

  it('uses KIMI_EXECUTABLE when provided, trimming whitespace', async () => {
    process.env.KIMI_EXECUTABLE = '  C:\\Users\\desig\\.kimi-code\\bin\\kimi.exe  ';
    mockedSpawn.mockImplementation(() => mockChild(0, ['ok']));

    const result = await runKimi({
      prompt: 'test prompt',
      cwd: '/workspace',
      kimiHome: '/kimi/home',
      timeoutMs: 1000,
      maxOutputBytes: 1024,
    });

    expect(mockedSpawn).toHaveBeenCalledTimes(1);
    expect(mockedSpawn.mock.calls[0]![0]).toBe('C:\\Users\\desig\\.kimi-code\\bin\\kimi.exe');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('ok');
  });

  it('falls back to "kimi" when KIMI_EXECUTABLE is absent', async () => {
    delete process.env.KIMI_EXECUTABLE;
    mockedSpawn.mockImplementation(() => mockChild(0, ['done']));

    await runKimi({
      prompt: 'test prompt',
      cwd: '/workspace',
      kimiHome: '/kimi/home',
      timeoutMs: 1000,
      maxOutputBytes: 1024,
    });

    expect(mockedSpawn.mock.calls[0]![0]).toBe('kimi');
  });

  it('preserves cwd, args, KIMI_CODE_HOME, shell:false and other behavior', async () => {
    delete process.env.KIMI_EXECUTABLE;
    mockedSpawn.mockImplementation(() => mockChild(0));

    await runKimi({
      prompt: 'hello',
      cwd: '/workspace',
      kimiHome: '/kimi/home',
      timeoutMs: 5000,
      maxOutputBytes: 4096,
      outputFormat: 'stream-json',
    });

    expect(mockedSpawn).toHaveBeenCalledWith(
      'kimi',
      ['-p', 'hello', '--output-format', 'stream-json'],
      expect.objectContaining({
        cwd: '/workspace',
        shell: false,
        env: expect.objectContaining({
          KIMI_CODE_HOME: '/kimi/home',
        }),
      }),
    );
  });

  it('returns telemetry with start time, pid, elapsed time and success reason', async () => {
    delete process.env.KIMI_EXECUTABLE;
    mockedSpawn.mockImplementation(() => mockChild(0, ['ok']));

    const result = await runKimi({
      prompt: 'hello',
      cwd: '/workspace',
      kimiHome: '/kimi/home',
      timeoutMs: 5000,
      maxOutputBytes: 4096,
    });

    expect(result.telemetry).toMatchObject({
      pid: 12345,
      timeoutMs: 5000,
      stdoutBytes: 2,
      stderrBytes: 0,
      completionReason: 'success',
    });
    expect(result.telemetry.startTime).toMatch(/^\d{4}-/);
    expect(result.telemetry.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.telemetry.lastActivityTime).toMatch(/^\d{4}-/);
  });

  it('returns timeout completion reason when killed by timeout', async () => {
    delete process.env.KIMI_EXECUTABLE;
    const child = mockChild(0, ['partial'], [], false);
    mockedSpawn.mockImplementation(() => child);

    const runPromise = runKimi({
      prompt: 'hello',
      cwd: '/workspace',
      kimiHome: '/kimi/home',
      timeoutMs: 1,
      maxOutputBytes: 4096,
    });

    await vi.waitFor(() => expect(child.kill).toHaveBeenCalled());
    child.emitClose();

    const result = await runPromise;
    expect(result.telemetry.completionReason).toBe('timeout');
    expect(result.killedByTimeout).toBe(true);
  });
});
