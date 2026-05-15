function trim(x) {
  return typeof x === 'string' ? x.trim() : '';
}

/**
 * Stub provider search: returns an empty set with an honest disclaimer.
 * This avoids crashing Intake V2 while the real integration is developed.
 */
export async function searchServiceProviders(serviceRequestDraft, locale) {
  const raw = trim(serviceRequestDraft?.rawUserText);
  const loc = locale === 'vi' ? 'vi' : 'en';
  return {
    querySummary: raw ? raw.slice(0, 140) : loc === 'vi' ? 'Yêu cầu dịch vụ' : 'Service request',
    providers: [],
    noResultsReason: loc === 'vi' ? 'Chưa có dữ liệu nhà cung cấp trong bản dev này.' : 'No provider data available in this dev build.',
    source: 'internal_seed',
    dataDisclaimer:
      loc === 'vi'
        ? 'Danh sách nhà cung cấp hiện chưa được tích hợp tự động trong môi trường này.'
        : 'Provider suggestions are not yet integrated in this environment.',
  };
}

/**
 * Seed lookup stub — returns null until seed data exists.
 */
export function resolveSeedProviderCandidateById(providerId) {
  void providerId;
  return null;
}

