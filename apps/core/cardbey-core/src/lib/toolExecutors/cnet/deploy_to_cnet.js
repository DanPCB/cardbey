// DANH: skill-round5-cnet
/**
 * deploy_to_cnet — honest stub until CNET_API_KEY is provided.
 */

export async function execute(input = {}) {
  // @pure-transform: honest stub response; no DB/API side effects until C-Net is wired.
  const payload = input?.payload ?? input?.preparedPayload ?? null;
  const configured = input?.configured === true;

  if (!configured) {
    return {
      status: 'ok',
      output: {
        deployed: false,
        reason: 'C-Net deployment requires CNET_API_KEY in .env',
        prepared: payload,
      },
    };
  }

  return {
    status: 'ok',
    output: {
      deployed: false,
      reason: 'C-Net deployment endpoint not wired yet',
      prepared: payload,
      suggestion: 'Set CNET_ENDPOINT and implement push client',
    },
  };
}

export default execute;
