/**
 * Mask contact fields for limited public claim preview.
 */

export function maskPhone(phone: string | null | undefined): string | null {
  const s = typeof phone === 'string' ? phone.trim() : '';
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

export function maskEmail(email: string | null | undefined): string | null {
  const s = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!s || !s.includes('@')) return null;
  const [local, domain] = s.split('@');
  if (!local || !domain) return null;
  const maskedLocal = local.length <= 2 ? '**' : `${local[0]}***${local[local.length - 1]}`;
  return `${maskedLocal}@${domain}`;
}
