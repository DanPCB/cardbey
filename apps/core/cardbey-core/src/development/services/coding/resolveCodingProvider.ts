/**
 * Select the appropriate CodingProvider for a mission/design pair.
 *
 * Resolution order:
 *   1. DuplicateSidebarCodingProvider for explicit legacy/calibration missions.
 *   2. DeepSeekCodingProvider when ENABLE_DEEPSEEK_DEVELOPMENT_ENGINE_V1=true.
 *   3. KimiCodingProvider as a disabled-by-default rollback provider.
 *   4. Otherwise fail explicitly with UNSUPPORTED_CODING_PROVIDER.
 */

import { DevelopmentError } from '../../errors.js';
import type { CodingProvider, CodingProviderContext } from './CodingProvider.js';
import { duplicateSidebarCodingProvider } from './DuplicateSidebarCodingProvider.js';
import { deepSeekCodingProvider } from './DeepSeekCodingProvider.js';
import { kimiCodingProvider } from './KimiCodingProvider.js';

const providers: CodingProvider[] = [
  duplicateSidebarCodingProvider,
  deepSeekCodingProvider,
  kimiCodingProvider,
];

export function resolveCodingProvider(
  context: Pick<CodingProviderContext, 'mission' | 'design'>,
): CodingProvider {
  for (const provider of providers) {
    if (provider.canImplement(context)) {
      return provider;
    }
  }

  throw new DevelopmentError(
    400,
    'UNSUPPORTED_CODING_PROVIDER',
    `No coding provider available for mission ${context.mission.id} (design ${context.design.id}). ` +
      'The approved design cannot be implemented by the current provider set.',
  );
}