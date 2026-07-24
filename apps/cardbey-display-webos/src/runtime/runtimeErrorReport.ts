/**
 * TV-safe runtime failure reporting for Chrome 68 / webOS.
 * Never logs tokens or Authorization headers.
 */

export type RuntimeFailureReport = {
  operation: string;
  name: string;
  message: string;
  stackTruncated: string;
  stackFull: string;
  lifecycleStage?: string;
  sourceFile?: string;
  line?: number;
  column?: number;
  at: string;
};

const LOG_PREFIX = '[Cardbey webOS runtime]';
const MAX_VISIBLE_STACK = 1200;

function safeConsoleMethod(
  method: 'log' | 'warn' | 'error',
  args: unknown[],
): void {
  if (typeof window === 'undefined' || !window.console) return;
  const fn = window.console[method];
  if (typeof fn !== 'function') return;
  try {
    Function.prototype.call.call(fn, window.console, ...args);
  } catch {
    try {
      // Last resort — some engines reject apply/call on console.
      window.console[method](args[0], args[1]);
    } catch {
      // Swallow — diagnostics must never crash the player.
    }
  }
}

export function safeRuntimeLog(...args: unknown[]): void {
  safeConsoleMethod('log', [LOG_PREFIX, ...args]);
}

export function safeRuntimeWarn(...args: unknown[]): void {
  safeConsoleMethod('warn', [LOG_PREFIX, ...args]);
}

export function safeRuntimeError(...args: unknown[]): void {
  safeConsoleMethod('error', [LOG_PREFIX, ...args]);
}

function redact(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
    .replace(/Authorization["']?\s*[:=]\s*["']?[^"',\s]+/gi, 'Authorization:[REDACTED]')
    .replace(/deviceSecret["']?\s*[:=]\s*["']?[^"',\s]+/gi, 'deviceSecret:[REDACTED]');
}

function parseStackLocation(stack: string): {
  sourceFile?: string;
  line?: number;
  column?: number;
} {
  const match =
    stack.match(/(?:at\s+)?(?:.*\()?([^)\s]+):(\d+):(\d+)\)?/) ||
    stack.match(/([^@\s]+)@(\d+):(\d+)/);
  if (!match) return {};
  return {
    sourceFile: match[1],
    line: Number(match[2]),
    column: Number(match[3]),
  };
}

export function buildRuntimeFailureReport(
  operation: string,
  error: unknown,
  extras?: { lifecycleStage?: string },
): RuntimeFailureReport {
  const err = error instanceof Error ? error : new Error(String(error));
  const stackFull = redact(err.stack || '');
  const loc = parseStackLocation(stackFull);
  return {
    operation,
    name: err.name || 'Error',
    message: redact(err.message || String(error)),
    stackTruncated: stackFull.slice(0, MAX_VISIBLE_STACK),
    stackFull,
    lifecycleStage: extras?.lifecycleStage,
    sourceFile: loc.sourceFile,
    line: loc.line,
    column: loc.column,
    at: new Date().toISOString(),
  };
}

export function reportRuntimeFailure(
  operation: string,
  error: unknown,
  extras?: { lifecycleStage?: string },
): RuntimeFailureReport {
  const report = buildRuntimeFailureReport(operation, error, extras);
  safeRuntimeError({
    operation: report.operation,
    name: report.name,
    message: report.message,
    lifecycleStage: report.lifecycleStage,
    sourceFile: report.sourceFile,
    line: report.line,
    column: report.column,
    stack: report.stackFull,
  });
  return report;
}

export function formatFailureForUi(report: RuntimeFailureReport): string {
  const parts = [
    report.operation,
    report.name + ': ' + report.message,
    report.sourceFile
      ? report.sourceFile + ':' + String(report.line || '?') + ':' + String(report.column || '?')
      : '',
  ].filter(Boolean);
  return parts.join(' · ').slice(0, 280);
}
