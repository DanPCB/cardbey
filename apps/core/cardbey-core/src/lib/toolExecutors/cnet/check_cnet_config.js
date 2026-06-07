// DANH: skill-round5-cnet
/**
 * check_cnet_config — verify C-Net env keys (read-only).
 */

export async function execute(input = {}) {
  // @pure-transform: read-only env inspection; no DB/API side effects by design.
  const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : '';
  const missingKeys = [];

  if (!process.env.CNET_API_KEY?.trim()) missingKeys.push('CNET_API_KEY');
  if (!process.env.CNET_ENDPOINT?.trim()) missingKeys.push('CNET_ENDPOINT');

  return {
    status: 'ok',
    output: {
      configured: missingKeys.length === 0,
      missingKeys,
      storeId: storeId || null,
    },
  };
}

export default execute;
