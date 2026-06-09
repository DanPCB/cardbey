/**
 * Pick best Pexels video_files entry for hero background (mp4, avoid huge originals).
 */

/**
 * @param {Array<{ link?: string; quality?: string; file_type?: string; width?: number; height?: number }>} videoFiles
 * @param {{ preferPortrait?: boolean }} [options]
 * @returns {{ url: string; width?: number; height?: number; quality?: string } | null}
 */
export function selectPexelsVideoFile(videoFiles, options = {}) {
  const preferPortrait = options.preferPortrait !== false;
  const files = Array.isArray(videoFiles) ? videoFiles : [];
  const mp4 = files.filter(
    (f) => String(f?.file_type || '').toLowerCase().includes('mp4') && typeof f?.link === 'string' && f.link.trim(),
  );
  if (!mp4.length) return null;

  const score = (f) => {
    const w = Number(f.width) || 0;
    const h = Number(f.height) || 0;
    const q = String(f.quality || '').toLowerCase();
    let s = 0;
    if (q === 'hd' && w > 0 && w <= 1920) s += 100;
    else if (q === 'sd') s += 50;
    else if (q === 'hd') s += 30;
    else s += 10;
    if (preferPortrait && h > w) s += 15;
    if (w > 1920) s -= 25;
    return s;
  };

  const sorted = [...mp4].sort((a, b) => score(b) - score(a));
  const pick = sorted[0];
  return {
    url: pick.link.trim(),
    width: pick.width,
    height: pick.height,
    quality: pick.quality,
  };
}
