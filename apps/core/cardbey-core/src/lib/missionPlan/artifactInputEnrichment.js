/**
 * Optional step-output → tool input enrichment keyed by pipeline tool name.
 */
export const ARTIFACT_INPUT_ENRICHMENT_BY_TOOL = {
  propose_website_patch: (stepOutputs) => ({
    patches: stepOutputs['generate_section_patches']?.patches ?? [],
    proposedTheme: stepOutputs['generate_section_patches']?.theme ?? null,
    currentSections: stepOutputs['mini_website_get_sections']?.sections ?? [],
    currentTheme: stepOutputs['mini_website_get_sections']?.theme ?? null,
    storeName: stepOutputs['mini_website_get_sections']?.storeName ?? '',
    slug: stepOutputs['mini_website_get_sections']?.slug ?? '',
  }),
};
