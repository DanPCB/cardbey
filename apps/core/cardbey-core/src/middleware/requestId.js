// src/middleware/requestId.js
// Express middleware to generate and attach request ID for correlation

import { randomBytes } from 'crypto';

/**
 * Generate a short random request ID
 * Format: 8-character hex string
 */
function generateRequestId() {
  return randomBytes(4).toString('hex');
}

/**
 * Middleware to generate and attach request ID
 * Adds req.requestId if not already present
 */
export function requestIdMiddleware(req, res, next) {
  // Use existing request ID from header if present (for distributed tracing)
  req.requestId = req.get('X-Request-ID') || req.get('x-request-id') || generateRequestId();
  
  // Add request ID to response headers for client correlation
  res.setHeader('X-Request-ID', req.requestId);
  
  next();
}


