/**
 * Validate marketing product claims against the capability registry.
 */

import { getCardbeyCapabilityRegistry } from './capabilityRegistry.js';
import { BLOCKED_CLAIM_PATTERNS, RISK_LEVELS } from './constants.js';

export const VALIDATOR_VERSION = 'marketing_claim_validator_v1';

/**
 * @param {string} text
 * @param {string} [language='en']
 * @returns {{
 *   ok: boolean,
 *   status: 'PASS'|'WARNING'|'BLOCKED'|'VALIDATOR_UNAVAILABLE',
 *   findings: Array<{ severity: string, claim: string, evidence: string, suggestion: string, id?: string, message?: string, risk?: string }>,
 *   risk: string,
 *   validatorVersion: string,
 *   validatedAt: string,
 * }}
 */
export function validateProductClaims(text, language = 'en') {
  const validatedAt = new Date().toISOString();
  try {
    const body = String(text || '');
    const findings = [];
    let maxRisk = RISK_LEVELS.LOW;

    if (!body.trim()) {
      findings.push(
        finding({
          id: 'empty',
          severity: 'BLOCKED',
          claim: 'non_empty_body',
          evidence: 'Content body is empty',
          suggestion: 'Add truthful pilot copy before approval.',
          risk: RISK_LEVELS.MEDIUM,
        }),
      );
      return finalize(false, 'BLOCKED', findings, RISK_LEVELS.MEDIUM, validatedAt);
    }

    for (const rule of BLOCKED_CLAIM_PATTERNS) {
      if (rule.pattern.test(body)) {
        findings.push(
          finding({
            id: rule.id,
            severity: rule.risk === RISK_LEVELS.CRITICAL || rule.risk === RISK_LEVELS.HIGH ? 'BLOCKED' : 'WARNING',
            claim: rule.id,
            evidence: `Blocked claim pattern matched: ${rule.id}`,
            suggestion: 'Remove or rewrite the claim to match the capability registry.',
            risk: rule.risk,
          }),
        );
        maxRisk = higherRisk(maxRisk, rule.risk);
      }
    }

    const registry = getCardbeyCapabilityRegistry();
    const lang = String(language || 'en').toLowerCase();
    if (lang !== 'en' && lang !== 'vi') {
      findings.push(
        finding({
          id: 'unsupported_language',
          severity: 'WARNING',
          claim: 'supported_language',
          evidence: `Language "${lang}" is outside initial EN/VI pilot languages`,
          suggestion: 'Use en or vi for the controlled pilot.',
          risk: RISK_LEVELS.MEDIUM,
        }),
      );
      maxRisk = higherRisk(maxRisk, RISK_LEVELS.MEDIUM);
    }

    if (/\b(finished|complete|autonomous)\s+platform\b/i.test(body) && !/under\s+development/i.test(body)) {
      findings.push(
        finding({
          id: 'missing_under_development',
          severity: 'BLOCKED',
          claim: 'under_development_framing',
          evidence: 'Platform completeness claims require "under development" framing',
          suggestion: 'Add "under development" and avoid finished/autonomous framing.',
          risk: RISK_LEVELS.HIGH,
        }),
      );
      maxRisk = higherRisk(maxRisk, RISK_LEVELS.HIGH);
    }

    if (!registry.readiness.liveMetaVerified && /\blive[- ]verified\b/i.test(body)) {
      findings.push(
        finding({
          id: 'invented_live_verification',
          severity: 'BLOCKED',
          claim: 'live_meta_verified',
          evidence: 'Must not claim live Meta verification',
          suggestion: 'Remove invented live-verification language.',
          risk: RISK_LEVELS.CRITICAL,
        }),
      );
      maxRisk = higherRisk(maxRisk, RISK_LEVELS.CRITICAL);
    }

    const blocked = findings.some((f) => f.severity === 'BLOCKED');
    const warningOnly = !blocked && findings.length > 0;
    const status = blocked ? 'BLOCKED' : warningOnly ? 'WARNING' : 'PASS';
    const ok = !blocked;

    return finalize(ok, status, findings, maxRisk, validatedAt);
  } catch (err) {
    return {
      ok: false,
      status: 'VALIDATOR_UNAVAILABLE',
      findings: [
        finding({
          id: 'validator_error',
          severity: 'BLOCKED',
          claim: 'validator_available',
          evidence: String(err?.message || err),
          suggestion: 'Retry validation or check capability registry.',
          risk: RISK_LEVELS.HIGH,
        }),
      ],
      risk: RISK_LEVELS.HIGH,
      validatorVersion: VALIDATOR_VERSION,
      validatedAt,
    };
  }
}

function finding({ id, severity, claim, evidence, suggestion, risk }) {
  return {
    id,
    severity,
    claim,
    evidence,
    suggestion,
    // compat with prior shape
    message: evidence,
    risk,
  };
}

function finalize(ok, status, findings, risk, validatedAt) {
  return {
    ok,
    status,
    findings,
    risk,
    validatorVersion: VALIDATOR_VERSION,
    validatedAt,
  };
}

function higherRisk(a, b) {
  const order = [RISK_LEVELS.LOW, RISK_LEVELS.MEDIUM, RISK_LEVELS.HIGH, RISK_LEVELS.CRITICAL];
  return order.indexOf(b) > order.indexOf(a) ? b : a;
}

export default validateProductClaims;
