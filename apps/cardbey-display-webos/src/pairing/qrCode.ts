import QRCode from 'qrcode';

export type QrRenderResult =
  | { ok: true; dataUrl: string; value: string }
  | { ok: false; value: string; error: string };

/**
 * Local QR generation only — never call a remote QR service.
 */
export async function renderClaimQr(value: string): Promise<QrRenderResult> {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, value: '', error: 'empty_qr_value' };
  }
  try {
    const dataUrl = await QRCode.toDataURL(trimmed, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 280,
      color: {
        dark: '#0b0b0c',
        light: '#ffffff',
      },
    });
    return { ok: true, dataUrl, value: trimmed };
  } catch (err) {
    return {
      ok: false,
      value: trimmed,
      error: err instanceof Error ? err.message : 'qr_render_failed',
    };
  }
}
