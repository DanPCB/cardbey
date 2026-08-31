/** @type {import('../../contracts/visualTheme.js').VisualTheme} */
export const MINIMAL_WHITE_THEME = {
  id: 'minimal-white',
  version: 1,
  name: 'Minimal white',
  description: 'Clean, spacious, neutral — works across professional and retail.',
  tokens: {
    palette: {
      primary: '#171717',
      secondary: '#f5f5f5',
      accent: '#525252',
      background: '#ffffff',
      surface: '#fafafa',
      text: '#171717',
    },
    typography: {
      fontFamily: 'Inter, system-ui, sans-serif',
      headingWeight: 600,
    },
    spacing: { sectionY: '4rem', contentGap: '1rem' },
    radius: { card: '0.5rem', button: '0.375rem' },
    shadow: { card: 'none' },
    motion: { durationMs: 180 },
  },
  componentVariants: {
    hero: 'minimal-split',
    cta: 'outline',
  },
  supportedBlueprints: [
    'trade-lead-generation',
    'service-booking',
    'restaurant-menu',
    'retail-commerce',
    'portfolio-showcase',
  ],
  metadata: {
    legacyThemeTemplateIds: ['minimal', 'editorial'],
  },
};
