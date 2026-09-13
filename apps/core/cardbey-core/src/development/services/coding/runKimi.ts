/**
 * Spawn the Kimi Code CLI non-interactively for a single implementation prompt.
 *
 * This wrapper is isolated so unit tests can mock the process invocation.
 */

import { spawn } from 'node:child_process';

export interface RunKimiInput {
  prompt: string;
  cwd: string;
  kimiHome: string;
  timeoutMs: number;
  maxOutputBytes: number;
  outputFormat?: 'text' | 'stream-json';
}

export interface RunKimiTelemetry {
  /** ISO timestamp when the Kimi process was spawned. */
  startTime: string;
  /** Process identifier of the spawned Kimi child, when available. */
  pid?: number;
  /** Elapsed milliseconds from spawn to process exit. */
  elapsedMs: number;
  /** ISO timestamp of the most recent stdout/stderr activity. */
  lastActivityTime: string;
  /** Bytes captured on stdout. */
  stdoutBytes: number;
  /** Bytes captured on stderr. */
  stderrBytes: number;
  /** Timeout configured for this invocation. */
  timeoutMs: number;
  /** Human-readable completion or failure reason. */
  completionReason: 'success' | 'timeout' | 'size' | 'error' | 'nonzero_exit';
}

export interface RunKimiResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  killedByTimeout: boolean;
  killedBySize: boolean;
  telemetry: RunKimiTelemetry;
}

export async function runKimi(input: RunKimiInput): Promise<RunKimiResult> {
  const outputFormat = input.outputFormat ?? 'text';
  const args = ['-p', input.prompt, '--output-format', outputFormat];

  const executable = process.env.KIMI_EXECUTABLE?.trim() || 'kimi';

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const startIso = new Date(startTime).toISOString();
    let lastActivityTime = startIso;

    const child = spawn(executable, args, {
      cwd: input.cwd,
      env: {
        ...process.env,
        KIMI_CODE_HOME: input.kimiHome,
      },
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;
    let killedBySize = false;
    let processError: Error | undefined;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill('SIGTERM');
    }, input.timeoutMs);

    const updateActivity = (): void => {
      lastActivityTime = new Date().toISOString();
    };

    child.stdout?.on('data', (d) => {
      if (killedByTimeout || killedBySize) return;
      stdout += d.toString();
      updateActivity();
      if (Buffer.byteLength(stdout, 'utf-8') > input.maxOutputBytes) {
        killedBySize = true;
        child.kill('SIGTERM');
      }
    });

    child.stderr?.on('data', (d) => {
      stderr += d.toString();
      updateActivity();
    });

    child.on('error', (err) => {
      processError = err;
      clearTimeout(timer);
      const elapsedMs = Date.now() - startTime;
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const elapsedMs = Date.now() - startTime;
      const exitCode = code ?? 1;
      let completionReason: RunKimiTelemetry['completionReason'];
      if (killedByTimeout) {
        completionReason = 'timeout';
      } else if (killedBySize) {
        completionReason = 'size';
      } else if (exitCode !== 0) {
        completionReason = 'nonzero_exit';
      } else {
        completionReason = 'success';
      }

      resolve({
        stdout,
        stderr,
        exitCode,
        killedByTimeout,
        killedBySize,
        telemetry: {
          startTime: startIso,
          pid: child.pid ?? undefined,
          elapsedMs,
          lastActivityTime,
          stdoutBytes: Buffer.byteLength(stdout, 'utf-8'),
          stderrBytes: Buffer.byteLength(stderr, 'utf-8'),
          timeoutMs: input.timeoutMs,
          completionReason,
        },
      });
    });
  });
}
