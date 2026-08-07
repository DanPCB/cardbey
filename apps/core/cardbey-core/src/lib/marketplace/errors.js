export function createMarketplaceError(code, message, statusCode = 422, details = null) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (details != null) {
    error.details = details;
  }
  return error;
}
