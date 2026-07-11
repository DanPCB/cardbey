/**
 * Thrown when catalog items violate the authoritative commerce profile contract.
 */
export class CatalogContractViolation extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, catalogKind?: string, businessKind?: string, details?: object }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = 'CatalogContractViolation';
    this.code = meta.code ?? 'CATALOG_CONTRACT_VIOLATION';
    this.catalogKind = meta.catalogKind;
    this.businessKind = meta.businessKind;
    this.details = meta.details ?? {};
  }
}
