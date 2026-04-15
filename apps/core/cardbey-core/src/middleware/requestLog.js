/**
 * Request Logging Middleware
 * Log assistant requests for analytics
 */

export function requestLog(req, res, next) {
  const uid = req.user?.id || req.guest?.id || 'anon';
  const timestamp = new Date().toISOString();
  
  console.log(`[Assistant ${timestamp}] ${uid} ${req.method} ${req.path} intent=${req.body?.intent || ''}`);
  
  next();
}

