/**
 * Extract primary brand colors from website HTML (heuristic, low confidence).
 */

export interface BrandColors {
  primary: string | null;
  secondary: string | null;
}

export function extractBrandColors(html: string): BrandColors {
  const source = String(html ?? '');

  const themeColor = source
    .match(/name=["']theme-color["'][^>]*content=["']([^"']+)["']/i)?.[1]
    ?.trim();

  const cssVarPrimary = source.match(
    /--(?:primary|brand|color-primary|main)[^:]*:\s*(#[0-9a-fA-F]{3,6})/i,
  )?.[1];

  const cssVarSecondary = source.match(
    /--(?:secondary|accent|color-secondary)[^:]*:\s*(#[0-9a-fA-F]{3,6})/i,
  )?.[1];

  return {
    primary: themeColor ?? cssVarPrimary ?? null,
    secondary: cssVarSecondary ?? null,
  };
}
