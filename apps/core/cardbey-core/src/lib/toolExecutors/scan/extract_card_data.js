// DANH: skill-round5-cardscan
/**
 * extract_card_data — honest stub when SuperCopilot bridge unavailable.
 */

export async function execute(input = {}) {
  // @pure-transform: honest stub response; no DB/API side effects until OCR bridge is wired.
  const available = input?.available === true;
  const imageUrl = typeof input?.imageUrl === 'string' ? input.imageUrl : null;

  if (!available) {
    return {
      status: 'ok',
      output: {
        extracted: false,
        reason:
          'SuperCopilot bridge not available. Start the bridge at port 7799 to enable card scan',
        setupGuide: 'Run: python main_loop.py --serve --port 7799',
        imageUrl,
      },
    };
  }

  return {
    status: 'ok',
    output: {
      extracted: false,
      reason: 'OCR extraction not wired in this path yet — bridge reachable but stub active',
      imageUrl,
    },
  };
}

export default execute;
