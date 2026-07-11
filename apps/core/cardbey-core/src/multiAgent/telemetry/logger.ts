/**
 * Structured JSON logger for multi-agent telemetry.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentLevel(): LogLevel {
  const raw = process.env.AGENT_LOG_LEVEL?.trim().toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel()];
}

export interface LogPayload {
  message: string;
  [key: string]: unknown;
}

function write(level: LogLevel, payload: LogPayload): void {
  if (!shouldLog(level)) return;

  const entry = {
    level,
    timestamp: new Date().toISOString(),
    service: 'cardbey-multi-agent',
    ...payload,
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

const logger = {
  debug(payload: LogPayload): void {
    write('debug', payload);
  },
  info(payload: LogPayload): void {
    write('info', payload);
  },
  warn(payload: LogPayload): void {
    write('warn', payload);
  },
  error(payload: LogPayload): void {
    write('error', payload);
  },
};

export default logger;
