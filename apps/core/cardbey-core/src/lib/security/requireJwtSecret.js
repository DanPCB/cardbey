export function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32) {
      throw new Error('[SECURITY] JWT_SECRET must be set and strong in production');
    }
  }

  return secret || 'dev-secret-only';
}

export function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32) {
      throw new Error('[SECURITY] JWT_SECRET must be set and strong in production');
    }
  }

  return secret || 'dev-secret-only';
}

