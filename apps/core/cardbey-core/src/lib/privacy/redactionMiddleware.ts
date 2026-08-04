/**
 * PII redaction before prompts leave Cardbey for external LLM providers.
 * Rollback: ENABLE_PII_REDACTION=false
 */

export type RedactionLogEntry = {
  timestamp: string;
  originalLength: number;
  redactedLength: number;
  redactionCount: number;
  purpose?: string;
};

const EMAIL_PATTERN = /\b[\w.+-]+@[\w.-]+\.\w{2,}\b/g;

/** AU mobiles/landlines: 04xxxxxxxx, 0[2378]xxxxxxxx, +61… with optional spaces/dashes */
const PHONE_PATTERN =
  /\b(?:\+?61[\s.-]?|0)(?:(?:4[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{3})|(?:[2378][\s.-]?\d{4}[\s.-]?\d{4}))\b/g;

const ADDRESS_PATTERN =
  /\b\d{1,5}\s+[A-Za-z]+(?:\s+[A-Za-z]+)?\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Court|Ct|Crescent|Cr|Cres|Boulevard|Blvd|Way|Place|Pl|Terrace|Tce)\b/gi;

const CARD_PATTERN = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;

function parseBoolEnv(raw: string | undefined, defaultValue: boolean): boolean {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off') return false;
  if (normalized === 'true' || normalized === '1' || normalized === 'on') return true;
  return defaultValue;
}

/** Phase 1: redaction ON by default. */
export function isPiiRedactionEnabled(): boolean {
  return parseBoolEnv(process.env.ENABLE_PII_REDACTION, true);
}

function logRedaction(
  original: string,
  redacted: string,
  count: number,
  purpose?: string,
): void {
  const entry: RedactionLogEntry = {
    timestamp: new Date().toISOString(),
    originalLength: original.length,
    redactedLength: redacted.length,
    redactionCount: count,
    ...(purpose ? { purpose } : {}),
  };
  console.log('[REDACTION]', entry);
}

function redactString(text: string, purpose?: string): string {
  if (!text) return text;

  let redacted = text;
  let redactionCount = 0;

  redacted = redacted.replace(EMAIL_PATTERN, () => {
    redactionCount += 1;
    return '[EMAIL_REDACTED]';
  });

  redacted = redacted.replace(PHONE_PATTERN, () => {
    redactionCount += 1;
    return '[PHONE_REDACTED]';
  });

  redacted = redacted.replace(ADDRESS_PATTERN, () => {
    redactionCount += 1;
    return '[ADDRESS_REDACTED]';
  });

  redacted = redacted.replace(CARD_PATTERN, () => {
    redactionCount += 1;
    return '[CARD_REDACTED]';
  });

  if (redactionCount > 0 && text !== redacted) {
    logRedaction(text, redacted, redactionCount, purpose);
  }

  return redacted;
}

function redactObject(obj: object, purpose?: string): object {
  if (Array.isArray(obj)) {
    return obj.map((item) => {
      if (typeof item === 'string') return redactString(item, purpose);
      if (typeof item === 'object' && item !== null) return redactObject(item, purpose);
      return item;
    });
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === 'string') {
      result[key] = redactString(value, purpose);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactObject(value, purpose);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Redact sensitive information from text or nested objects.
 */
export function redactPII(input: string | object, purpose?: string): string | object {
  if (!isPiiRedactionEnabled()) {
    return input;
  }
  if (typeof input === 'string') {
    return redactString(input, purpose);
  }
  if (typeof input === 'object' && input !== null) {
    return redactObject(input, purpose);
  }
  return input;
}

export type ChatMessageLike = {
  role: string;
  content: string;
  [key: string]: unknown;
};

/**
 * Redact string content on chat messages before provider calls.
 * Applies to all roles (user/system/assistant/tool) — store context often carries PII in system blocks.
 */
export function redactChatMessages<T extends ChatMessageLike>(
  messages: T[],
  purpose?: string,
): T[] {
  if (!isPiiRedactionEnabled() || !Array.isArray(messages)) {
    return messages;
  }
  return messages.map((msg) => {
    if (typeof msg?.content !== 'string') return msg;
    return {
      ...msg,
      content: redactString(msg.content, purpose),
    };
  });
}
