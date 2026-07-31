/** @type {import('../../contracts/visualTheme.js').VisualTheme} */
export const BOLD_DARK_THEME = {
  id: 'bold-dark',
  version: 1,
  name: 'Bold dark',
  description: 'High-impact dark surfaces and large type — premium / industrial.',
  tokens: {
    palette: {
      primary: '#f8fafc',
      secondary: '#1e293b',
      accent: '#38bdf8',
      background: '#0f172a',
      surface: '#1e293b',
      text: '#f8fafc',
    },
    typography: {
      fontFamily: 'Inter, system-ui, sans-serif',
      headingWeight: 800,
    },
    spacing: { sectionY: '4.5rem', contentGap: '1.25rem' },
    radius: { card: '0.25rem', button: '0.25rem' },
    shadow: { card: '0 8px 24px rgba(0,0,0,0.35)' },
    motion: { durationMs: 200 },
  },
  componentVariants: {
    hero: 'cinematic',
    cta: 'solid-accent',
  },
  supportedBlueprints: [
    'portfolio-showcase',
    'trade-lead-generation',
    'retail-commerce',
    'service-booking',
  ],
  metadata: {
    legacyThemeTemplateIds: ['dark', 'dark-luxury'],
  },
};
