/**
 * Logger Service
 * Wrapper for logger utility
 */

import { logger as utilsLogger } from '../../utils/logger.js';

/**
 * Logger service for orchestrator
 */
export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    utilsLogger.info(message, meta);
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    utilsLogger.warn(message, meta);
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    utilsLogger.error(message, meta);
  },
};



