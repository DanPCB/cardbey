/**
 * Global error handler middleware
 */

export function errorHandler(err, req, res, next) {
  console.error('[Error]', err);
  
  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }
  
  // Don't interfere with SSE connections - they need to stay open
  const contentType = res.getHeader('Content-Type');
  if (contentType && contentType.toString().includes('text/event-stream')) {
    console.warn('[Error] SSE connection error - not closing connection:', err.message);
    // Don't call res.end() or send response - let SSE connection stay open
    return;
  }
  
  // Prisma errors
  if (err.code === 'P2002') {
    return res.status(409).json({ 
      error: 'Duplicate entry',
      field: err.meta?.target?.[0]
    });
  }
  
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }
  
  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: err.details
    });
  }
  
  // Payload too large errors (413)
  if (err.type === 'entity.too.large' || 
      err.status === 413 || 
      err.statusCode === 413 ||
      err.message?.includes('too large') ||
      err.message?.includes('LIMIT_FILE_SIZE')) {
    return res.status(413).json({
      ok: false,
      error: 'payload_too_large',
      message: 'Request body exceeds maximum size limit (50MB). Please reduce image sizes or element count.',
    });
  }
  
  // Default error - ensure JSON format matches API standard
  try {
    const status = err.status || err.statusCode || 500;
    // Strictly test-only debug info (never in production, never via request headers)
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    
    const response = {
      ok: false,
      error: err.code || err.name || 'internal_error',
      message: err.message || 'Internal server error',
    };
    
    // Add debug info ONLY in test mode (strict check - no dev mode, no request-based toggles)
    if (isTestEnv) {
      response.debug = {
        name: err.name,
        message: err.message,
        code: err.code,
        stack: err.stack ? err.stack.split('\n').slice(0, 5).join('\n') : undefined,
        meta: err.meta,
      };
    }
    
    res.status(status).json(response);
  } catch (sendErr) {
    // If sending response fails, log it but don't crash
    console.error('[Error] Failed to send error response:', sendErr);
    try {
      res.end();
    } catch {}
  }
}

