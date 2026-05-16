export const CARD_SIZE_STANDARDS = {
  profile: { w: 85, h: 54, unit: 'mm', dpi: 300 },
  loyalty: { w: 85, h: 54, unit: 'mm', dpi: 300 },
  promo: { w: 1080, h: 1080, unit: 'px', dpi: 96 },
  gift: { w: 85, h: 54, unit: 'mm', dpi: 300 },
  event: { w: 148, h: 210, unit: 'mm', dpi: 300 },
  invitation: { w: 148, h: 210, unit: 'mm', dpi: 300 },
  default: { w: 85, h: 54, unit: 'mm', dpi: 300 },
};

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

export function getCardSize(type, overrides) {
  const t = typeof type === 'string' && type.trim() ? type.trim().toLowerCase() : 'default';
  const base = CARD_SIZE_STANDARDS[t] ?? CARD_SIZE_STANDARDS.default;
  const o = asObject(overrides);
  return {
    w: typeof o.w === 'number' ? o.w : base.w,
    h: typeof o.h === 'number' ? o.h : base.h,
    unit: typeof o.unit === 'string' && o.unit.trim() ? o.unit.trim() : base.unit,
    dpi: typeof o.dpi === 'number' ? o.dpi : base.dpi,
  };
}

