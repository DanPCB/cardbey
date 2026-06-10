/**
 * Storage driver configuration (local filesystem vs S3-compatible R2).
 */

/** @typedef {'local' | 's3'} StorageDriver */

/**
 * @returns {StorageDriver}
 */
export function resolveStorageDriver() {
  const raw = String(process.env.STORAGE_DRIVER ?? 'local').trim().toLowerCase();
  if (raw === 's3') return 's3';
  return 'local';
}

/**
 * @returns {string | null}
 */
export function resolveMediaPublicBaseUrl() {
  const candidates = [
    process.env.MEDIA_PUBLIC_BASE_URL,
    process.env.CDN_BASE_URL,
  ];
  for (const value of candidates) {
    const trimmed = String(value ?? '').trim();
    if (trimmed) {
      return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
    }
  }
  return null;
}

/**
 * @returns {{
 *   driver: StorageDriver,
 *   bucket: string | null,
 *   region: string,
 *   endpoint: string | null,
 *   accessKeyId: string,
 *   secretAccessKey: string,
 *   publicBaseUrl: string | null,
 * }}
 */
export function getStorageConfig() {
  const driver = resolveStorageDriver();
  const bucket =
    String(process.env.S3_BUCKET ?? process.env.S3_BUCKET_NAME ?? '').trim() || null;
  const region = String(process.env.S3_REGION ?? process.env.AWS_REGION ?? 'auto').trim() || 'auto';
  const endpoint = String(process.env.S3_ENDPOINT ?? '').trim() || null;
  const accessKeyId = String(
    process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? '',
  ).trim();
  const secretAccessKey = String(
    process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? '',
  ).trim();
  const publicBaseUrl = resolveMediaPublicBaseUrl();

  return {
    driver,
    bucket,
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
  };
}

/**
 * @returns {boolean}
 */
export function isS3StorageEnabled() {
  const { driver, bucket, accessKeyId, secretAccessKey, publicBaseUrl } = getStorageConfig();
  return (
    driver === 's3' &&
    Boolean(bucket) &&
    Boolean(accessKeyId) &&
    Boolean(secretAccessKey) &&
    Boolean(publicBaseUrl)
  );
}

/**
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function validateS3StorageConfig() {
  const { driver, bucket, accessKeyId, secretAccessKey, publicBaseUrl, endpoint } = getStorageConfig();
  if (driver !== 's3') {
    return { ok: true, missing: [] };
  }
  const missing = [];
  if (!bucket) missing.push('S3_BUCKET');
  if (!accessKeyId) missing.push('S3_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('S3_SECRET_ACCESS_KEY');
  if (!publicBaseUrl) missing.push('MEDIA_PUBLIC_BASE_URL');
  if (!endpoint) missing.push('S3_ENDPOINT');
  return { ok: missing.length === 0, missing };
}
