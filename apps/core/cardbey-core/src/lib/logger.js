// src/lib/logger.js
// Structured logging utility for Cardbey Core

/**
 * Log levels
 */
const LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

/**
 * Format log line
 * Format: [timestamp] [LEVEL] [COMPONENT] message {metadata}
 * 
 * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
 * @param {string} component - Component name (e.g., "UPLOAD", "PLAYLIST")
 * @param {string} message - Log message
 * @param {object} metadata - Optional metadata object
 * @param {string} requestId - Optional request ID for correlation
 * @returns {string} Formatted log line
 */
function formatLogLine(level, component, message, metadata = null, requestId = null) {
  const timestamp = new Date().toISOString();
  const parts = [
    `[${timestamp}]`,
    `[${level}]`,
    `[${component}]`,
    message,
  ];
  
  // Add metadata if provided
  if (metadata || requestId) {
    const meta = { ...metadata };
    if (requestId) {
      meta.requestId = requestId;
    }
    parts.push(JSON.stringify(meta));
  }
  
  return parts.join(' ');
}

/**
 * Log at INFO level
 * 
 * @param {string} component - Component name
 * @param {string} message - Log message
 * @param {object} metadata - Optional metadata
 * @param {string} requestId - Optional request ID
 */
export function info(component, message, metadata = null, requestId = null) {
  console.log(formatLogLine(LEVELS.INFO, component, message, metadata, requestId));
}

/**
 * Log at WARN level
 * 
 * @param {string} component - Component name
 * @param {string} message - Log message
 * @param {object} metadata - Optional metadata
 * @param {string} requestId - Optional request ID
 */
export function warn(component, message, metadata = null, requestId = null) {
  console.warn(formatLogLine(LEVELS.WARN, component, message, metadata, requestId));
}

/**
 * Log at ERROR level
 * 
 * @param {string} component - Component name
 * @param {string} message - Log message
 * @param {object} metadata - Optional metadata
 * @param {string} requestId - Optional request ID
 */
export function error(component, message, metadata = null, requestId = null) {
  console.error(formatLogLine(LEVELS.ERROR, component, message, metadata, requestId));
}

/**
 * Log at DEBUG level
 * 
 * @param {string} component - Component name
 * @param {string} message - Log message
 * @param {object} metadata - Optional metadata
 * @param {string} requestId - Optional request ID
 */
export function debug(component, message, metadata = null, requestId = null) {
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
    console.debug(formatLogLine(LEVELS.DEBUG, component, message, metadata, requestId));
  }
}

/**
 * Create a logger instance with a default component and request ID
 * Useful for middleware or request-scoped logging
 * 
 * @param {string} defaultComponent - Default component name
 * @param {string} requestId - Optional request ID
 * @returns {object} Logger instance with component and requestId bound
 */
export function createLogger(defaultComponent, requestId = null) {
  return {
    info: (message, metadata = null) => info(defaultComponent, message, metadata, requestId),
    warn: (message, metadata = null) => warn(defaultComponent, message, metadata, requestId),
    error: (message, metadata = null) => error(defaultComponent, message, metadata, requestId),
    debug: (message, metadata = null) => debug(defaultComponent, message, metadata, requestId),
  };
}


