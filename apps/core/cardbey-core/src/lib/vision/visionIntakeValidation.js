/**
 * Validation helpers for POST /api/vision/intake.
 */

export const MAX_VISION_IMAGES = 5;
export const MAX_VISION_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_PREFIX = 'image/';

/**
 * @param {Express.Multer.File[]} files
 */
export function validateVisionIntakeFiles(files = []) {
  if (!Array.isArray(files)) {
    return { ok: false, code: 'invalid_files', message: 'Invalid file upload.' };
  }
  if (files.length > MAX_VISION_IMAGES) {
    return {
      ok: false,
      code: 'too_many_images',
      message: `Maximum ${MAX_VISION_IMAGES} images per intake.`,
    };
  }
  for (const file of files) {
    const mime = String(file?.mimetype ?? '');
    if (!mime.startsWith(ALLOWED_MIME_PREFIX)) {
      return {
        ok: false,
        code: 'invalid_mime',
        message: 'Only image uploads are supported.',
      };
    }
    const size = Number(file?.size ?? file?.buffer?.length ?? 0);
    if (size > MAX_VISION_IMAGE_BYTES) {
      return {
        ok: false,
        code: 'file_too_large',
        message: `Each image must be under ${MAX_VISION_IMAGE_BYTES / (1024 * 1024)}MB.`,
      };
    }
  }
  return { ok: true };
}

/**
 * @param {object} params
 * @param {Express.Multer.File[]} [params.files]
 * @param {string|null} [params.decodedPayload]
 */
export function validateVisionIntakeRequest({ files = [], decodedPayload = null } = {}) {
  const payload = typeof decodedPayload === 'string' ? decodedPayload.trim() : '';
  const fileList = Array.isArray(files) ? files : [];
  if (!payload && fileList.length === 0) {
    return {
      ok: false,
      code: 'empty_intake',
      message: 'Provide at least one image or a decoded QR/barcode payload.',
    };
  }
  if (fileList.length > 0) {
    const fileCheck = validateVisionIntakeFiles(fileList);
    if (!fileCheck.ok) return fileCheck;
  }
  return { ok: true };
}

/**
 * @param {unknown} raw
 */
export function parseJsonFormField(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}
