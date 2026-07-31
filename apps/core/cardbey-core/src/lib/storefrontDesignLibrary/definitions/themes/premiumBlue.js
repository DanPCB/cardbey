/** @type {import('../../contracts/visualTheme.js').VisualTheme} */
export const PREMIUM_BLUE_THEME = {
  id: 'premium-blue',
  version: 1,
  name: 'Premium blue',
  description: 'Professional navy/blue, high-contrast CTAs — trades and corporate services.',
  tokens: {
    palette: {
      primary: '#1e3a8a',
      secondary: '#dbeafe',
      accent: '#2563eb',
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
    },
    typography: {
      fontFamily: 'Inter, system-ui, sans-serif',
      headingWeight: 700,
    },
    spacing: { sectionY: '3.5rem', contentGap: '1.25rem' },
    radius: { card: '0.75rem', button: '0.5rem' },
    shadow: { card: '0 1px 3px rgba(15,23,42,0.12)' },
    motion: { durationMs: 220 },
  },
  componentVariants: {
    hero: 'split-image',
    cta: 'high-contrast',
  },
  supportedBlueprints: [
    'trade-lead-generation',
    'service-booking',
    'portfolio-showcase',
    'retail-commerce',
  ],
  metadata: {
    legacyThemeTemplateIds: ['bold'],
  },
};
