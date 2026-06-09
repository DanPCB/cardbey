/**
 * Allowed telemetry issue categories for Path A + self-healing bridges.
 * Re-exported from JS guardrails module for TS consumers.
 */

export {
  ALLOWED_TELEMETRY_ISSUE_CATEGORIES,
  PATH_A_CODE_FIX_GUARDRAILS,
  validateCodeFixGuardrails,
  validatePlaybookShape,
  validateTelemetryIssueShape,
  buildTelemetryCodeFixDescription,
} from './telemetryCodeFixGuardrails.js';
