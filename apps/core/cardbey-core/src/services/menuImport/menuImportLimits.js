export const MENU_IMPORT_LIMITS = Object.freeze({
  maxFiles: Math.max(1, Number(process.env.MENU_IMPORT_MAX_FILES) || 10),
  maxImageBytes: Math.max(1, Number(process.env.MENU_IMPORT_MAX_IMAGE_BYTES) || 20 * 1024 * 1024),
  maxPdfBytes: Math.max(1, Number(process.env.MENU_IMPORT_MAX_PDF_BYTES) || 50 * 1024 * 1024),
  maxTotalBytes: Math.max(1, Number(process.env.MENU_IMPORT_MAX_TOTAL_BYTES) || 100 * 1024 * 1024),
});

export const MENU_IMPORT_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

/**
 * @param {{ mimetype?: string, size?: number }[]} files
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function validateMenuImportFiles(files) {
  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  if (list.length === 0) {
    return { ok: false, code: 'MENU_UPLOAD_UNSUPPORTED_TYPE', message: 'Upload at least one menu image or PDF.' };
  }
  if (list.length > MENU_IMPORT_LIMITS.maxFiles) {
    return {
      ok: false,
      code: 'MENU_UPLOAD_TOO_LARGE',
      message: `You can upload up to ${MENU_IMPORT_LIMITS.maxFiles} files per import.`,
    };
  }
  let total = 0;
  for (const file of list) {
    const mime = String(file.mimetype || '').toLowerCase();
    if (!MENU_IMPORT_MIMES.has(mime)) {
      return {
        ok: false,
        code: 'MENU_UPLOAD_UNSUPPORTED_TYPE',
        message: 'Unsupported file type. Use JPG, PNG, WEBP, or PDF.',
      };
    }
    const size = Number(file.size) || 0;
    const isPdf = mime === 'application/pdf';
    const max = isPdf ? MENU_IMPORT_LIMITS.maxPdfBytes : MENU_IMPORT_LIMITS.maxImageBytes;
    if (size > max) {
      const mb = Math.round(max / (1024 * 1024));
      return {
        ok: false,
        code: 'MENU_UPLOAD_TOO_LARGE',
        message: isPdf
          ? `This PDF is larger than the ${mb} MB limit.`
          : `This file is larger than the ${mb} MB image limit.`,
      };
    }
    total += size;
  }
  if (total > MENU_IMPORT_LIMITS.maxTotalBytes) {
    const mb = Math.round(MENU_IMPORT_LIMITS.maxTotalBytes / (1024 * 1024));
    return {
      ok: false,
      code: 'MENU_UPLOAD_TOO_LARGE',
      message: `Total upload exceeds the ${mb} MB import limit.`,
    };
  }
  return { ok: true };
}
