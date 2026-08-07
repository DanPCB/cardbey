const MARKETPLACE_LICENCE_REGISTRY = Object.freeze({
  personal_use: {
    code: 'personal_use',
    label: 'Personal Use',
    summary: 'Private personal use only.',
    allowCreatorSubmit: true,
  },
  commercial_single: {
    code: 'commercial_single',
    label: 'Commercial Single Project',
    summary: 'Commercial use for a single buyer project or campaign.',
    allowCreatorSubmit: true,
  },
  commercial_multi: {
    code: 'commercial_multi',
    label: 'Commercial Multi Project',
    summary: 'Commercial use across multiple buyer projects or channels.',
    allowCreatorSubmit: true,
  },
  editorial_only: {
    code: 'editorial_only',
    label: 'Editorial Only',
    summary: 'Display and editorial context only; no commercial exploitation.',
    allowCreatorSubmit: true,
  },
  custom: {
    code: 'custom',
    label: 'Custom Licence',
    summary: 'Requires admin review and is not enabled for creator self-serve in Phase 1C.',
    allowCreatorSubmit: false,
  },
});

export function listMarketplaceLicences() {
  return Object.values(MARKETPLACE_LICENCE_REGISTRY);
}

export function getMarketplaceLicence(code) {
  const normalized = String(code || '').trim().toLowerCase();
  return MARKETPLACE_LICENCE_REGISTRY[normalized] ?? null;
}

export function normalizeMarketplaceLicenceCode(code) {
  return String(code || '').trim().toLowerCase();
}

export function assertMarketplaceCreatorLicenceAllowed(code) {
  const licence = getMarketplaceLicence(code);
  if (!licence) {
    const error = new Error('Unsupported marketplace licence code.');
    error.code = 'invalid_licence_code';
    error.statusCode = 422;
    throw error;
  }
  if (!licence.allowCreatorSubmit) {
    const error = new Error('Custom marketplace licences require future admin workflow.');
    error.code = 'custom_licence_not_allowed';
    error.statusCode = 422;
    throw error;
  }
  return licence;
}

export { MARKETPLACE_LICENCE_REGISTRY };
