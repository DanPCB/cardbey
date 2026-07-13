/**
 * Loyalty contract integrity errors — block silent DEFAULT_TEMPLATE substitution.
 */

export class LoyaltyContractError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'LoyaltyContractError';
    this.code = code;
    this.details = details;
    this.statusCode = 409;
  }

  toJSON() {
    return {
      ok: false,
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...this.details,
      },
    };
  }
}

/**
 * @param {import('./loyaltyCreationContractTypes.js').LoyaltyCreationContract | Record<string, unknown>} contract
 */
export function assertSourceDrivenTopologyPresent(contract) {
  const sourceMode = String(contract?.sourceMode ?? '').toUpperCase();
  const evidenceId = contract?.sourceEvidence?.evidenceId ?? contract?.evidenceId;
  const hasTopology = Boolean(
    contract?.cardTopology?.rows &&
      contract?.cardTopology?.columns &&
      Array.isArray(contract?.cardTopology?.cells) &&
      contract.cardTopology.cells.length > 0,
  );

  if (sourceMode === 'SOURCE_DRIVEN' && evidenceId && !hasTopology) {
    throw new LoyaltyContractError(
      'SOURCE_TOPOLOGY_MISSING',
      'Card analysis completed, but its topology was not attached to this mission.',
      {
        evidenceId,
        sourceMode,
        attachmentId: contract?.sourceEvidence?.assetRef ?? contract?.attachmentId ?? null,
      },
    );
  }
}

export default { LoyaltyContractError, assertSourceDrivenTopologyPresent };
