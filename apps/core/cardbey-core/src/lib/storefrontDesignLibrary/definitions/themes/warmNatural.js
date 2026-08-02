/** @type {import('../../contracts/visualTheme.js').VisualTheme} */
export const WARM_NATURAL_THEME = {
  id: 'warm-natural',
  version: 1,
  name: 'Warm natural',
  description: 'Earthy, friendly, soft imagery — hospitality and wellness.',
  tokens: {
    palette: {
      primary: '#c2410c',
      secondary: '#ffedd5',
      accent: '#ea580c',
      background: '#fffbeb',
      surface: '#ffffff',
      text: '#431407',
    },
    typography: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      headingWeight: 600,
    },
    spacing: { sectionY: '3rem', contentGap: '1.5rem' },
    radius: { card: '1rem', button: '999px' },
    shadow: { card: '0 2px 8px rgba(67,20,7,0.08)' },
    motion: { durationMs: 260 },
  },
  componentVariants: {
    hero: 'warm-photo',
    cta: 'soft-pill',
  },
  supportedBlueprints: [
    'service-booking',
    'restaurant-menu',
    'retail-commerce',
    'portfolio-showcase',
  ],
  metadata: {
    legacyThemeTemplateIds: ['warm'],
  },
};
