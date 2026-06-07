// DANH: skill-round5-cardscan
/**
 * create_product_from_card — honest stub until card OCR pipeline is wired.
 */

export async function execute(input = {}) {
  // @pure-transform: honest stub response; no DB/API side effects until card OCR is wired.
  const extracted = input?.extracted === true;
  const cardData = input?.cardData ?? null;

  if (!extracted) {
    return {
      status: 'ok',
      output: {
        created: false,
        reason: 'No extracted card data — run extract_card_data first',
      },
    };
  }

  return {
    status: 'ok',
    output: {
      created: false,
      reason: 'Product creation from card scan not implemented yet',
      cardData,
      suggestion: 'Wire SuperCopilot OCR output to manage_product_catalog',
    },
  };
}

export default execute;
