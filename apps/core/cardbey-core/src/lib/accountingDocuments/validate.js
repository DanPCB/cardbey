/**
 * Light format validators — no government ABN verification.
 */

export function normalizeDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/** Australian ABN: 11 digits (checksum optional soft check). */
export function isValidAbnFormat(value) {
  const d = normalizeDigits(value);
  if (d.length !== 11) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = d.split('').map(Number);
  digits[0] -= 1;
  const sum = digits.reduce((acc, n, i) => acc + n * weights[i], 0);
  return sum % 89 === 0;
}

export function isValidAcnFormat(value) {
  const d = normalizeDigits(value);
  return d.length === 9;
}

/** BSB: 6 digits (often written XXX-XXX). */
export function isValidBsbFormat(value) {
  return normalizeDigits(value).length === 6;
}

export function isValidBankAccountFormat(value) {
  const d = normalizeDigits(value);
  return d.length >= 6 && d.length <= 10;
}

export function formatBsb(value) {
  const d = normalizeDigits(value);
  if (d.length !== 6) return String(value ?? '').trim();
  return `${d.slice(0, 3)}-${d.slice(3)}`;
}

export function isValidEmail(value) {
  const s = String(value ?? '').trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
