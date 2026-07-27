// Simple structured logger wrapper
// Provides logger.info/warn/error with consistent tag and JSON payload
export const logger = {
  info(message, meta = {}) {
    try {
      console.log(message, meta && Object.keys(meta).length ? meta : undefined);
    } catch {
      console.log(message);
    }
  },
  warn(message, meta = {}) {
    try {
      console.warn(message, meta && Object.keys(meta).length ? meta : undefined);
    } catch {
      console.warn(message);
    }
  },
  error(message, meta = {}) {
    try {
      console.error(message, meta && Object.keys(meta).length ? meta : undefined);
    } catch {
      console.error(message);
    }
  },
};


