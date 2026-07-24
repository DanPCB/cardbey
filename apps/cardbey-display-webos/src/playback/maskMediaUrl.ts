/** Safe media URL for diagnostics — strip query/signatures. */
export function maskMediaUrl(url: string | undefined): string {
  if (!url) return '—';
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    const bare = url.split('?')[0] ?? url;
    return bare.length > 120 ? `${bare.slice(0, 117)}…` : bare;
  }
}
