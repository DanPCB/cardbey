/**
 * Living-document skill capabilities — map ingestion context to performer skills.
 */

/** @type {Array<{ id: string, trigger: string, skill: string, context: string, inputDefaults: (documentContext: object) => object }>} */
export const DOCUMENT_INGESTION_SKILL_CAPABILITIES = [
  {
    id: 'document_ingestion_booking',
    trigger: 'book_product',
    skill: 'booking_management',
    context: 'living_document',
    inputDefaults(documentContext) {
      const products = Array.isArray(documentContext?.products) ? documentContext.products : [];
      return {
        availableDates: products.map((p) => p?.dates).filter(Boolean),
        deadline: products.map((p) => p?.deadline).filter(Boolean),
        contacts: Array.isArray(documentContext?.contacts) ? documentContext.contacts : [],
        source: 'document_ingestion',
      };
    },
  },
];

/**
 * @param {string} trigger
 * @param {object | null | undefined} documentContext
 */
export function resolveIngestionSkillCapability(trigger, documentContext) {
  const entry = DOCUMENT_INGESTION_SKILL_CAPABILITIES.find((c) => c.trigger === trigger);
  if (!entry) return null;
  return {
    capabilityId: entry.id,
    skill: entry.skill,
    context: entry.context,
    input: entry.inputDefaults(documentContext ?? {}),
  };
}
