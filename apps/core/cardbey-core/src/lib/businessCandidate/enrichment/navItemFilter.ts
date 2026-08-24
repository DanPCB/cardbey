/**
 * Nav chrome / contact-string filters for enrichment catalog extraction.
 */

const NAV_ITEM_BLOCKLIST_EXACT = new Set([
  'home',
  'about',
  'about us',
  'our story',
  'who we are',
  'blog',
  'news',
  'insights',
  'articles',
  'resources',
  'media',
  'contact',
  'contact us',
  'get in touch',
  'reach us',
  'faq',
  'faqs',
  'help',
  'support',
  'privacy',
  'privacy policy',
  'terms',
  'terms of service',
  'sitemap',
  'accessibility',
  'login',
  'log in',
  'sign in',
  'sign up',
  'register',
  'my account',
  'dashboard',
  'portal',
  'cart',
  'checkout',
  'bag',
  'search',
  'find',
  'menu',
  'navigation',
  'back',
  'next',
  'previous',
  'view all',
  'see all',
  'read more',
  'learn more',
  'explore',
  'subscribe',
  'newsletter',
  'join',
  'book a call',
  'book now',
  'book a demo',
  'get started',
  'download',
  'brochure',
  'services',
  'our services',
  'what we do',
  'solutions',
  'sell your business',
  'business for sale',
  'explore all advisory services',
  'service station',
]);

const NAV_ITEM_BLOCKLIST_PATTERNS = [
  /^(tel:|mailto:)/i,
  /^\+\d[\d\s\-().]{6,}$/,
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  /^\$[\d,]+/,
  /^#/,
];

export function decodeBasicEntities(text: string): string {
  return String(text ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function isNavItem(text: string): boolean {
  const trimmed = decodeBasicEntities(String(text ?? ''))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (trimmed.length === 0) return true;
  if (NAV_ITEM_BLOCKLIST_EXACT.has(trimmed)) return true;
  return NAV_ITEM_BLOCKLIST_PATTERNS.some((p) => p.test(trimmed));
}

export function isContactString(text: string): boolean {
  const trimmed = decodeBasicEntities(String(text ?? '')).trim();
  return (
    /^\+\d[\d\s\-().]{6,}$/.test(trimmed) ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ||
    /^tel:/i.test(trimmed) ||
    /^mailto:/i.test(trimmed)
  );
}
