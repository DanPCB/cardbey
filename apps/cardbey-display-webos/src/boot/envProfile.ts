export type DisplayEnvProfile = 'local' | 'staging' | 'production';

export function resolveEnvProfile(
  raw: string | undefined,
  mode: string | undefined,
): DisplayEnvProfile {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'local' || value === 'staging' || value === 'production') return value;
  if (mode === 'development') return 'local';
  if (mode === 'production') return 'production';
  return 'local';
}

/**
 * Pairing defaults by profile. Explicit VITE_ENABLE_PAIRING always wins when set.
 * Production stays off unless explicitly enabled.
 */
export function defaultPairingEnabled(
  profile: DisplayEnvProfile,
  explicit?: string,
): boolean {
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  if (profile === 'production') return false;
  if (profile === 'staging') return false; // intentional opt-in
  return false; // local also opt-in unless fixture/dev flag
}
