// DANH: skill-round5-cardscan
/**
 * check_scan_capability — OCR provider availability (OpenAI / Anthropic vision).
 */

function ocrProviderAvailable() {
  return (
    Boolean(process.env.OPENAI_API_KEY?.trim()) ||
    Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  );
}

export async function execute(input = {}) {
  // @pure-transform: read-only env inspection; no DB/API side effects by design.
  const userId = typeof input?.userId === 'string' ? input.userId : null;
  const available = ocrProviderAvailable();

  return {
    status: 'ok',
    output: {
      available,
      provider: available ? 'openai_vision' : null,
      reason: available
        ? null
        : 'OCR requires OPENAI_API_KEY or ANTHROPIC_API_KEY',
      userId,
    },
  };
}

export default execute;
