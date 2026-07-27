// AUDIT: no dedicated loyalty tier tool found — new executor (Round 4)
// DANH: skill-round4-loyalty
/**
 * define_loyalty_tiers — pure tier structure from customer count (no DB write).
 * Side effect: none — pure config generation.
 */

/**
 * @param {number} customerCount
 * @returns {Array<{ name: string, minPoints: number, reward: string, color: string }>}
 */
export function buildLoyaltyTiers(customerCount) {
  const count = Math.max(0, Number(customerCount) || 0);

  const bronze = { name: 'Bronze', minPoints: 0, reward: 'Welcome perk on signup', color: '#CD7F32' };
  const silver = { name: 'Silver', minPoints: 100, reward: '10% off next visit', color: '#C0C0C0' };
  const gold = { name: 'Gold', minPoints: 300, reward: '15% off + priority booking', color: '#FFD700' };
  const platinum = {
    name: 'Platinum',
    minPoints: 600,
    reward: '20% off + exclusive offers',
    color: '#E5E4E2',
  };

  if (count <= 10) return [bronze, silver];
  if (count <= 50) return [bronze, silver, gold];
  return [bronze, silver, gold, platinum];
}

/**
 * @param {object} [input]
 * @param {number} [input.customerCount]
 */
export async function execute(input = {}) {
  // @pure-transform: deterministic tier structure; no DB/API side effects by design.
  const customerCount = Math.max(0, Number(input?.customerCount) || 0);
  const tiers = buildLoyaltyTiers(customerCount);

  return {
    status: 'ok',
    output: {
      tiers,
      tierCount: tiers.length,
      customerCount,
    },
  };
}

export default execute;
