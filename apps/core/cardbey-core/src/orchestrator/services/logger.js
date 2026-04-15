/**
 * Logger Service
 * Simple logger for orchestrator services
 */

export const logger = {
  info: (message, meta = {}) => {
    console.log(`[Orchestrator] ${message}`, meta);
  },
  warn: (message, meta = {}) => {
    console.warn(`[Orchestrator] ${message}`, meta);
  },
  error: (message, meta = {}) => {
    console.error(`[Orchestrator] ${message}`, meta);
  },
};


