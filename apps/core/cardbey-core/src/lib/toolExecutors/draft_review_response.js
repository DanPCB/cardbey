/**
 * draft_review_response — suggested reply text for a review (Round 3).
 * DANH: skill-round3-reviews
 *
 * AUDIT:
 * - draft_review_response: not found
 * - edit_artifact: found — artifact copy edits, not review replies
 */

/**
 * @param {object} params
 */
export function draftReviewReply({ review, storeName, brandTone }) {
  if (!review || typeof review !== 'object') {
    return { drafted: false, reason: 'No pending review to respond to' };
  }

  const author = review.author?.trim() || 'there';
  const rating = Number(review.rating);
  const text = review.text?.trim() || '';
  const tone = brandTone?.trim() || 'friendly';
  const store = storeName?.trim() || 'our store';

  let opener = `Hi ${author}, thank you for visiting ${store}!`;
  if (Number.isFinite(rating) && rating >= 4) {
    opener = `Hi ${author}, we're thrilled you enjoyed ${store}!`;
  } else if (Number.isFinite(rating) && rating <= 2) {
    opener = `Hi ${author}, we're sorry your experience at ${store} missed the mark.`;
  }

  const body =
    tone === 'luxury'
      ? 'We appreciate you taking the time to share your feedback.'
      : 'We really appreciate your feedback and hope to welcome you again soon.';

  const detail = text ? ` Regarding your note: "${text.slice(0, 120)}${text.length > 120 ? '…' : ''}" —` : '';
  const suggestion = `${opener}${detail} ${body} — ${store} team`;

  return { drafted: true, suggestion: suggestion.trim() };
}

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  const review = input?.review ?? null;
  const result = draftReviewReply({
    review,
    storeName: input?.storeName,
    brandTone: input?.brandTone,
  });

  // @pure-transform: deterministic text generation from input; no DB/API side effects by design.
  return {
    status: 'ok',
    output: {
      ok: true,
      ...result,
    },
  };
}

export default execute;
