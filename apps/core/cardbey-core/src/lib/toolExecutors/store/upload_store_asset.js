/**
 * UI-first: signals the client to open the logo/asset upload flow (no server upload).
 */

/**
 * @param {object} [input]
 * @param {string} [input.assetType]
 * @param {string} [input.generationRunId]
 * @param {string} [input.storeId]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const assetType = input?.assetType ?? 'logo';
  const generationRunId =
    input?.generationRunId ??
    context?.stepOutputs?.structured_store_build?.generationRunId ??
    null;
  const storeId = input?.storeId ?? context?.storeId ?? null;
  return {
    status: 'ok',
    output: {
      action: 'open_upload_ui',
      assetType,
      generationRunId,
      storeId,
      message: `Ready to upload your ${assetType}. Please select a file.`,
      uploadEndpoint: `/api/stores/temp/upload/avatar`,
    },
  };
}
