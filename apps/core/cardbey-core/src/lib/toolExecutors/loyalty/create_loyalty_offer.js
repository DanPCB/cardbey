// AUDIT: create_promotion at promotion/create_promotion.js — one-off promos, not loyalty tiers
// DANH: skill-round4-loyalty
/**
 * create_loyalty_offer — generate offer copy per tier (no DB write).
 * Side effect: none — pure generation.
 */

/**
 * @param {string} category
 * @returns {string}
 */
function rewardLanguageForCategory(category) {
  const c = String(category ?? '').toLowerCase();
  if (/beauty|salon|spa|nail|hair/.test(c)) return 'free treatment';
  if (/food|cafe|restaurant|bakery|bar|f&b/.test(c)) return 'free item';
  if (/fitness|gym|sport/.test(c)) return 'free session';
  if (/retail|fashion|shop/.test(c)) return 'bonus gift';
  return 'loyalty reward';
}

/**
 * @param {Array<{ name: string, minPoints: number, reward: string, color?: string }>} tiers
 * @param {string} [businessCategory]
 * @returns {Array<{ tier: string, headline: string, rewardDescription: string, ctaText: string }>}
 */
export function buildLoyaltyOffers(tiers, businessCategory) {
  const rewardWord = rewardLanguageForCategory(businessCategory);
  const list = Array.isArray(tiers) ? tiers : [];

  return list.map((tier) => {
    const name = String(tier?.name ?? 'Member');
    const reward = String(tier?.reward ?? tier?.rewardDescription ?? rewardWord);
    return {
      tier: name,
      headline: `${name} members unlock ${rewardWord}`,
      rewardDescription: `${reward}. Earn from ${tier?.minPoints ?? 0} points.`,
      ctaText: `Join ${name}`,
    };
  });
}

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  // @pure-transform: deterministic loyalty offer copy; no DB/API side effects by design.
  const tiers = Array.isArray(input?.tiers) ? input.tiers : [];
  const businessCategory =
    typeof input?.businessCategory === 'string' ? input.businessCategory : 'General';

  const offers = buildLoyaltyOffers(tiers, businessCategory);

  return {
    status: 'ok',
    output: {
      offers,
      offerCount: offers.length,
    },
  };
}

export default execute;
