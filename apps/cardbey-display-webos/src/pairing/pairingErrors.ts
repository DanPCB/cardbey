import type { DisplayErrorCode } from '@cardbey/display-runtime';

const MESSAGES: Partial<Record<DisplayErrorCode | string, string>> = {
  DISPLAY_NETWORK_ERROR: 'Unable to reach Cardbey. Checking the connection…',
  DISPLAY_REQUEST_TIMEOUT: 'Cardbey is taking longer than expected. Retrying…',
  DISPLAY_PAIRING_EXPIRED: 'This connection code has expired.',
  DISPLAY_PAIRING_FAILED: 'This screen could not be connected.',
  DISPLAY_RESPONSE_INVALID: 'Cardbey returned an unexpected response.',
  DISPLAY_RUNTIME_ERROR: 'Something went wrong on this screen.',
  DISPLAY_API_ERROR: 'Cardbey could not complete the request.',
};

export function userFacingPairingError(errorCode: string, fallback?: string): string {
  return MESSAGES[errorCode] || fallback || MESSAGES.DISPLAY_PAIRING_FAILED || 'Pairing failed.';
}
