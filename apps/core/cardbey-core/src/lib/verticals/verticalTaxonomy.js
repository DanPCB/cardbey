/**
 * Vertical taxonomy: single source of truth for vertical slugs and keyword-based resolution.
 * Resolver maps businessType/name hints to verticalGroup + verticalSlug with confidence.
 * Priority: food > beauty > fashion > retail > services. Within food, seafood outranks cafe.
 */

export const VERTICALS = [
  { slug: 'food.cafe', group: 'food', label: 'Cafe', keywords: ['cafe', 'coffee', 'espresso', 'latte', 'cappuccino', 'flat white', 'mocha', 'barista', 'iced coffee', 'cold brew', 'tea', 'matcha', 'chai', 'pastry', 'croissant', 'muffin', 'brunch', 'breakfast', 'toast', 'sandwich', 'bagel'] },
  { slug: 'food.seafood', group: 'food', label: 'Seafood', keywords: ['seafood', 'fish', 'oyster', 'oysters', 'prawn', 'prawns', 'shrimp', 'crab', 'lobster', 'mussel', 'mussels', 'clam', 'clams', 'scallop', 'scallops', 'barramundi', 'salmon', 'tuna', 'snapper', 'calamari', 'octopus', 'squid', 'sashimi', 'fish & chips', 'fish and chips'] },
  { slug: 'food.restaurant', group: 'food', label: 'Restaurant', keywords: ['restaurant', 'dine', 'dining', 'grill', 'bistro', 'steak', 'bbq', 'barbecue', 'menu', 'entree', 'entrée', 'main', 'dessert', 'chef', 'table', 'booking'] },
  { slug: 'food.fast_food', group: 'food', label: 'Fast Food', keywords: ['fast food', 'takeaway', 'take away', 'burger', 'fries', 'chips', 'wrap', 'kebab', 'hotdog', 'fried chicken'] },
  { slug: 'food.bakery', group: 'food', label: 'Bakery', keywords: ['bakery', 'bread', 'bake', 'baked', 'cake', 'cupcake', 'cookies', 'cookie', 'donut', 'doughnut', 'pastry', 'pie', 'tart', 'sweets', 'dessert', 'desserts', 'confectionery', 'chocolate', 'candy', 'lolly'] },
  { slug: 'food.vietnamese', group: 'food', label: 'Vietnamese', keywords: ['vietnamese', 'banh mi', 'bánh mì', 'pho', 'phở', 'bun bo', 'bún bò', 'spring roll', 'goi cuon', 'gỏi cuốn', 'lemongrass'] },
  { slug: 'food.asian', group: 'food', label: 'Asian Cuisine', keywords: ['asian', 'thai', 'korean', 'japanese', 'sushi', 'ramen', 'chinese', 'dumpling', 'noodle', 'wok', 'bento'] },
  { slug: 'food.beverage', group: 'food', label: 'Beverage Bar', keywords: ['juice', 'smoothie', 'bubble tea', 'boba', 'milk tea', 'soda', 'soft drink', 'kombucha'] },
  { slug: 'beauty.nails', group: 'beauty', label: 'Nail Salon', keywords: ['nail', 'nails', 'manicure', 'pedicure', 'gel', 'acrylic', 'sns', 'dip powder', 'nail art', 'cuticle', 'polish'] },
  { slug: 'beauty.hair_salon', group: 'beauty', label: 'Hair Salon', keywords: ['hair', 'haircut', 'hair cut', 'stylist', 'blowdry', 'blow dry', 'colour', 'color', 'highlights', 'balayage', 'treatment'] },
  { slug: 'beauty.barber', group: 'beauty', label: 'Barber', keywords: ['barber', 'fade', 'clipper', 'beard', 'shave', 'razor', 'mens cut', "men's cut"] },
  { slug: 'beauty.spa', group: 'beauty', label: 'Spa & Beauty', keywords: ['spa', 'facial', 'massage', 'aroma', 'aromatherapy', 'skin', 'skincare', 'beauty', 'treatment room'] },
  { slug: 'beauty.lashes_brows', group: 'beauty', label: 'Lashes & Brows', keywords: ['lash', 'lashes', 'eyelash', 'lash lift', 'lash extension', 'brow', 'brows', 'brow lamination', 'tint', 'threading'] },
  { slug: 'beauty.waxing', group: 'beauty', label: 'Waxing', keywords: ['wax', 'waxing', 'brazilian', 'legs', 'arms', 'underarm', 'hair removal'] },
  { slug: 'health.fitness', group: 'health', label: 'Fitness', keywords: ['gym', 'fitness', 'workout', 'personal training', 'pt', 'yoga', 'pilates', 'crossfit', 'bootcamp'] },
  { slug: 'health.clinic', group: 'health', label: 'Clinic', keywords: ['clinic', 'physio', 'physiotherapy', 'chiro', 'chiropractic', 'dental', 'doctor', 'medical', 'massage therapy'] },
  { slug: 'fashion.mens', group: 'fashion', label: 'Mens Fashion', keywords: ['mens', "men's", 'menswear', 'suit', 'suits', 'shirt', 'shirts', 'tie', 'ties', 'jacket', 'jackets', 'pants', 'trousers', 'formal'] },
  { slug: 'fashion.womens', group: 'fashion', label: 'Womens Fashion', keywords: ['womens', "women's", 'dress', 'dresses', 'skirt', 'skirts', 'blouse', 'heels', 'handbag', 'bags'] },
  { slug: 'fashion.kids', group: 'fashion', label: 'Children Clothing', keywords: ['children', 'kids', 'kid', 'baby', 'toddler', 'youth', 'school', 'onesie', 'bodysuit', 'romper', 'kids sneakers', 'kids t-shirt', 'toddler hoodie', 'baby clothing', 'children clothing', 'child', 'junior'] },
  { slug: 'fashion.boutique', group: 'fashion', label: 'Boutique', keywords: ['fashion', 'boutique', 'apparel', 'clothing', 'streetwear', 'outfit', 'wardrobe'] },
  { slug: 'retail.flower', group: 'retail', label: 'Florist', keywords: ['florist', 'flowers', 'bouquet', 'roses', 'lily', 'tulip', 'arrangement', 'wedding flowers'] },
  { slug: 'retail.furniture', group: 'retail', label: 'Furniture', keywords: ['furniture', 'sofa', 'couch', 'table', 'chair', 'desk', 'bed', 'wardrobe', 'cabinet', 'dining table', 'bookshelf', 'outdoor furniture', 'office furniture'] },
  { slug: 'retail.grocery', group: 'retail', label: 'Grocery', keywords: ['grocery', 'groceries', 'supermarket', 'fruit', 'vegetable', 'veg', 'meat', 'deli'] },
  { slug: 'retail.electronics', group: 'retail', label: 'Electronics', keywords: ['electronics', 'phone', 'laptop', 'computer', 'camera', 'gadget', 'charger', 'accessory'] },
  { slug: 'services.construction', group: 'services', label: 'Construction', keywords: [
    'construction',
    'construct',
    'builder',
    'builders',
    'building',
    'renovation',
    'renovations',
    'contractor',
    'contractors',
    'trades',
    'trade',
    'architecture',
    'architect',
    'carpentry',
    'carpenter',
  ] },
  { slug: 'services.cleaning', group: 'services', label: 'Cleaning', keywords: ['cleaning', 'cleaner', 'house cleaning', 'office cleaning', 'bond clean', 'end of lease', 'deep clean'] },
  { slug: 'services.plumbing', group: 'services', label: 'Plumbing', keywords: ['plumbing', 'plumber', 'pipe', 'leak', 'blocked drain', 'tap', 'toilet', 'hot water'] },
  { slug: 'services.electrician', group: 'services', label: 'Electrician', keywords: ['electrician', 'electrical', 'lighting', 'power point', 'switchboard', 'wiring'] },
  { slug: 'services.photography', group: 'services', label: 'Photography', keywords: ['photography', 'photographer', 'photoshoot', 'wedding photo', 'portrait', 'event photo', 'studio shoot'] },
  { slug: 'services.marketing', group: 'services', label: 'Marketing', keywords: ['marketing', 'seo', 'ads', 'social media', 'campaign', 'lead generation', 'branding'] },
  { slug: 'home.real_estate', group: 'home', label: 'Real Estate', keywords: ['real estate', 'property', 'house', 'apartment', 'rental', 'lease', 'agent', 'inspection'] },
  { slug: 'auto.repair', group: 'auto', label: 'Auto Repair', keywords: ['mechanic', 'auto repair', 'car service', 'logbook service', 'tyre', 'tire', 'brake', 'engine', 'battery'] },
  { slug: 'auto.detailing', group: 'auto', label: 'Car Detailing', keywords: ['detailing', 'car wash', 'wash', 'ceramic coating', 'polish', 'interior clean'] },
  { slug: 'education.tutoring', group: 'education', label: 'Tutoring', keywords: ['tutoring', 'tutor', 'lesson', 'classes', 'math', 'english', 'study', 'homework'] },
  { slug: 'events.catering', group: 'events', label: 'Catering', keywords: ['catering', 'event', 'party', 'platter', 'canape', 'canapé', 'function', 'corporate catering'] },
  { slug: 'entertainment.game_centre', group: 'entertainment', label: 'Game Centre', keywords: ['game centre', 'game center', 'arcade', 'kids arcade', 'bowling', 'laser tag', 'vr', 'virtual reality', 'birthday party', 'party room', 'fun centre'] },
  { slug: 'services.generic', group: 'services', label: 'General Services', keywords: ['service', 'services', 'appointment', 'booking', 'quote'] },
  { slug: 'retail.generic', group: 'retail', label: 'General Retail', keywords: ['shop', 'store', 'retail', 'buy', 'sale', 'product'] },
];

/** Group priority for tie-break: lower index = higher priority. food > beauty > fashion > entertainment > retail > services */
const GROUP_PRIORITY = ['food', 'beauty', 'health', 'fashion', 'entertainment', 'retail', 'home', 'auto', 'education', 'events', 'services'];

const KIDS_AUDIENCE_KEYWORDS = ['children', 'kids', 'kid', 'baby', 'toddler', 'youth'];

/**
 * Resolve audience for fashion (and future verticals): kids vs adults vs unisex.
 * Used to select kids template and constrain product set.
 * @param {{ businessType?: string, businessName?: string }} opts
 * @returns {'kids'|'adults'|'unisex'}
 */
export function resolveAudience(opts = {}) {
  const { businessType = '', businessName = '' } = opts;
  const combined = `${(businessType || '').toString()} ${(businessName || '').toString()}`;
  const text = normalizeText(combined);
  for (const kw of KIDS_AUDIENCE_KEYWORDS) {
    if (text.includes(normalizeText(kw))) return 'kids';
  }
  return 'adults';
}

/**
 * Normalize text for matching: lowercase, strip non-word chars, collapse spaces.
 * @param {string} [str]
 * @returns {string}
 */
export function normalizeText(str) {
  if (str == null || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score a vertical by counting keyword matches (word-boundary or substring).
 * @param {string} text - normalized combined text
 * @param {string[]} keywords
 * @returns {{ count: number, matched: string[] }}
 */
function scoreVertical(text, keywords) {
  const matched = [];
  for (const kw of keywords) {
    const n = normalizeText(kw);
    if (!n) continue;
    if (text.includes(n)) matched.push(kw);
  }
  return { count: matched.length, matched };
}

const BUSINESS_TYPE_WEIGHT = 3;
const BUSINESS_NAME_WEIGHT = 1;
/** If businessType has >= this many keyword matches or typeScore >= 3, lock to type-based choice (businessName must not override). */
const TYPE_LOCK_MIN_MATCHES = 2;
const TYPE_LOCK_MIN_SCORE = 3;

/**
 * Resolve vertical from business hints. businessType is PRIMARY (weight 3), businessName SECONDARY (weight 1).
 * If businessType has a clear winner (>=2 matches or score >=3), lock to it — do not let businessName override.
 * @param {{ businessType?: string, businessName?: string, userNotes?: string, explicitVertical?: string }} opts
 * @returns {{ group: string, slug: string, confidence: number, matchedKeywords: string[] }}
 */
export function resolveVertical(opts = {}) {
  const { businessType = '', businessName = '', userNotes = '', explicitVertical = '' } = opts;
  const textType = normalizeText((businessType || '').toString());
  const textName = normalizeText((businessName || '').toString());
  const combined = [businessType, businessName, userNotes, explicitVertical].filter(Boolean).join(' ');
  const text = normalizeText(combined);

  if (explicitVertical && typeof explicitVertical === 'string') {
    const slug = explicitVertical.trim().toLowerCase().replace(/\s+/g, '.');
    const found = VERTICALS.find((v) => v.slug === slug || v.slug.replace(/\./g, '_') === slug);
    if (found) {
      return { group: found.group, slug: found.slug, confidence: 1, matchedKeywords: [explicitVertical] };
    }
  }

  const scored = VERTICALS.map((v) => {
    const { count: countType, matched: matchedType } = scoreVertical(textType, v.keywords);
    const { count: countName, matched: matchedName } = scoreVertical(textName, v.keywords);
    const matchScoreType = countType * BUSINESS_TYPE_WEIGHT;
    const matchScoreName = countName * BUSINESS_NAME_WEIGHT;
    const totalScore = matchScoreType + matchScoreName;
    const typeLock = countType >= TYPE_LOCK_MIN_MATCHES || matchScoreType >= TYPE_LOCK_MIN_SCORE;
    const confidence = v.keywords.length ? Math.min(1, (countType + countName) / Math.min(v.keywords.length, 8)) : 0;
    return {
      vertical: v,
      count: countType + countName,
      matched: [...matchedType, ...matchedName],
      matchedType,
      matchedName,
      matchScoreType,
      matchScoreName,
      totalScore,
      typeLock,
      confidence: Math.min(1, confidence),
    };
  }).filter((s) => s.count > 0);

  if (scored.length === 0) {
    // Safety fallback: ensure businessName-only signals still classify when businessType is generic/Other
    // or when upstream passes a coarse type that doesn't include useful keywords.
    if (textName && /\b(construct|builder|building|renovation|contractor|trades|trade|architecture|architect)\b/.test(textName)) {
      return {
        group: 'services',
        slug: 'services.construction',
        confidence: 0.35,
        matchedKeywords: ['construction_name_fallback'],
      };
    }
    return { group: 'services', slug: 'services.generic', confidence: 0, matchedKeywords: [] };
  }

  const typeLocked = scored.filter((s) => s.typeLock);
  const candidates = typeLocked.length > 0 ? typeLocked : scored;
  candidates.sort((a, b) => {
    if (typeLocked.length > 0) {
      if (b.matchScoreType !== a.matchScoreType) return b.matchScoreType - a.matchScoreType;
    } else {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    }
    const pa = GROUP_PRIORITY.indexOf(a.vertical.group);
    const pb = GROUP_PRIORITY.indexOf(b.vertical.group);
    if (pa !== pb) return pa - pb;
    if (a.vertical.group === 'food' && b.vertical.group === 'food') {
      if (a.vertical.slug === 'food.seafood' && b.vertical.slug === 'food.cafe') return -1;
      if (a.vertical.slug === 'food.cafe' && b.vertical.slug === 'food.seafood') return 1;
    }
    if (a.vertical.group === 'fashion' && b.vertical.group === 'fashion') {
      if (a.vertical.slug === 'fashion.kids' && b.vertical.slug !== 'fashion.kids') return -1;
      if (a.vertical.slug !== 'fashion.kids' && b.vertical.slug === 'fashion.kids') return 1;
    }
    return 0;
  });

  const best = candidates[0];
  if (process.env.NODE_ENV !== 'production') {
    console.log('[resolveVertical]', {
      businessType: (businessType || '').toString().slice(0, 60),
      businessName: (businessName || '').toString().slice(0, 60),
      chosenSlug: best.vertical.slug,
      matchedKeywordsType: best.matchedType?.slice(0, 8),
      matchedKeywordsName: best.matchedName?.slice(0, 8),
    });
  }
  return {
    group: best.vertical.group,
    slug: best.vertical.slug,
    confidence: best.confidence,
    matchedKeywords: best.matched,
  };
}
