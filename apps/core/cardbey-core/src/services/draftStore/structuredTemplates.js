/**
 * Structured templates: categories, imageQueryHints, items (with categoryKey, basePrice, tags).
 * Used to derive TEMPLATE_ITEMS flat lists and for image/category-aware generation.
 */

export const TEMPLATE_FOOD_SEAFOOD = {
  templateId: 'food_seafood',
  label: 'Seafood',
  verticalSlug: 'food.seafood',
  currency: 'AUD',
  categories: [
    { key: 'oysters', label: 'Oysters' },
    { key: 'mains', label: 'Seafood Mains' },
    { key: 'platters', label: 'Platters' },
    { key: 'fish_chips', label: 'Fish & Chips' },
    { key: 'sides', label: 'Sides' },
    { key: 'drinks', label: 'Drinks' },
  ],
  imageQueryHints: {
    oysters: ['fresh oysters on ice', 'oyster platter lemon', 'oysters seafood restaurant'],
    mains: ['grilled fish plate', 'seafood pasta', 'pan seared salmon', 'barramundi fillet'],
    platters: ['seafood platter', 'mixed seafood platter', 'seafood sharing platter'],
    fish_chips: ['fish and chips takeaway', 'crispy battered fish chips', 'fish chips lemon'],
    sides: ['chips side dish', 'salad side dish', 'garlic bread side'],
    drinks: ['sparkling water bottle', 'lemon lime bitters', 'soft drink can'],
  },
  items: [
    { categoryKey: 'oysters', name: 'Natural Oysters (6)', description: 'Freshly shucked oysters served with lemon.', basePrice: 18.0, tags: ['oysters', 'fresh', 'lemon'] },
    { categoryKey: 'oysters', name: 'Natural Oysters (12)', description: 'A dozen freshly shucked oysters with lemon.', basePrice: 34.0, tags: ['oysters', 'fresh', 'share'] },
    { categoryKey: 'oysters', name: 'Kilpatrick Oysters (6)', description: 'Oysters baked with bacon & Worcestershire sauce.', basePrice: 22.0, tags: ['oysters', 'baked', 'bacon'] },
    { categoryKey: 'mains', name: 'Grilled Barramundi', description: 'Grilled barramundi with seasonal salad and chips.', basePrice: 28.0, tags: ['fish', 'grilled', 'barramundi'] },
    { categoryKey: 'mains', name: 'Pan-Seared Salmon', description: 'Crispy skin salmon with greens and lemon butter.', basePrice: 30.0, tags: ['salmon', 'pan-seared', 'butter'] },
    { categoryKey: 'mains', name: 'Seafood Pasta', description: 'Prawns, calamari, mussels in a rich tomato sauce.', basePrice: 32.0, tags: ['pasta', 'prawns', 'mussels'] },
    { categoryKey: 'mains', name: 'Salt & Pepper Calamari', description: 'Lightly seasoned calamari with aioli and lemon.', basePrice: 24.0, tags: ['calamari', 'crispy', 'aioli'] },
    { categoryKey: 'platters', name: 'Seafood Platter (2 ppl)', description: 'Oysters, prawns, calamari, fish, chips & salad.', basePrice: 78.0, tags: ['platter', 'share', 'mixed'] },
    { categoryKey: 'platters', name: 'Seafood Platter (4 ppl)', description: 'A large platter for sharing with mixed seafood.', basePrice: 148.0, tags: ['platter', 'share', 'family'] },
    { categoryKey: 'fish_chips', name: 'Battered Fish & Chips', description: 'Crispy battered fish with chips and tartare sauce.', basePrice: 18.0, tags: ['fish and chips', 'battered', 'tartare'] },
    { categoryKey: 'fish_chips', name: 'Grilled Fish & Salad', description: 'Grilled fish served with fresh salad and lemon.', basePrice: 18.0, tags: ['fish', 'grilled', 'salad'] },
    { categoryKey: 'sides', name: 'Chips', description: 'Golden crispy chips.', basePrice: 7.0, tags: ['chips', 'side'] },
    { categoryKey: 'sides', name: 'Garden Salad', description: 'Fresh seasonal salad with house dressing.', basePrice: 8.0, tags: ['salad', 'side'] },
    { categoryKey: 'sides', name: 'Garlic Bread', description: 'Toasted garlic bread.', basePrice: 6.5, tags: ['bread', 'garlic'] },
    { categoryKey: 'drinks', name: 'Sparkling Water', description: 'Chilled sparkling water.', basePrice: 5.0, tags: ['drink', 'sparkling'] },
    { categoryKey: 'drinks', name: 'Soft Drink', description: 'Choose from available flavours.', basePrice: 4.5, tags: ['drink', 'soft'] },
    { categoryKey: 'drinks', name: 'Lemon Lime & Bitters', description: 'Classic Australian refreshment.', basePrice: 6.5, tags: ['drink', 'refreshing'] },
  ],
};

export const TEMPLATE_FOOD_RESTAURANT_GENERIC = {
  templateId: 'food_restaurant_generic',
  label: 'Restaurant',
  verticalSlug: 'food.restaurant',
  currency: 'AUD',
  categories: [
    { key: 'starters', label: 'Starters' },
    { key: 'mains', label: 'Mains' },
    { key: 'desserts', label: 'Desserts' },
    { key: 'drinks', label: 'Drinks' },
  ],
  imageQueryHints: {
    starters: ['restaurant starter dish', 'sharing plates food', 'appetizer plated'],
    mains: ['restaurant main dish plated', 'grilled chicken plate', 'steak dinner plate'],
    desserts: ['dessert plated restaurant', 'chocolate dessert', 'cheesecake slice'],
    drinks: ['sparkling water bottle', 'soft drink', 'iced tea'],
  },
  items: [
    { categoryKey: 'starters', name: 'Garlic Bread', description: 'Warm garlic bread to share.', basePrice: 9.0, tags: ['starter', 'share'] },
    { categoryKey: 'starters', name: 'Seasonal Soup', description: "Chef's soup served with bread.", basePrice: 12.0, tags: ['starter', 'soup'] },
    { categoryKey: 'starters', name: 'Crispy Calamari', description: 'Lightly fried calamari with aioli.', basePrice: 16.0, tags: ['starter', 'seafood'] },
    { categoryKey: 'mains', name: 'Grilled Chicken', description: 'Grilled chicken with salad and chips.', basePrice: 26.0, tags: ['main', 'chicken'] },
    { categoryKey: 'mains', name: 'Steak (250g)', description: 'Grilled steak with mash and pepper sauce.', basePrice: 34.0, tags: ['main', 'steak'] },
    { categoryKey: 'mains', name: 'Vegetarian Pasta', description: 'Seasonal vegetables in tomato sauce.', basePrice: 24.0, tags: ['main', 'vegetarian'] },
    { categoryKey: 'desserts', name: 'Chocolate Brownie', description: 'Served warm with ice cream.', basePrice: 12.0, tags: ['dessert', 'chocolate'] },
    { categoryKey: 'desserts', name: 'Cheesecake', description: 'Classic cheesecake slice.', basePrice: 12.0, tags: ['dessert', 'cheesecake'] },
    { categoryKey: 'drinks', name: 'Sparkling Water', description: 'Chilled sparkling water.', basePrice: 5.0, tags: ['drink'] },
    { categoryKey: 'drinks', name: 'Soft Drink', description: 'Choose from available flavours.', basePrice: 4.5, tags: ['drink'] },
  ],
};

export const TEMPLATE_FOOD_BAKERY = {
  templateId: 'food_bakery',
  label: 'Bakery',
  verticalSlug: 'food.bakery',
  currency: 'AUD',
  categories: [
    { key: 'breads', label: 'Breads' },
    { key: 'pastries', label: 'Pastries' },
    { key: 'cakes', label: 'Cakes' },
    { key: 'drinks', label: 'Drinks' },
  ],
  imageQueryHints: {
    breads: ['fresh bread loaf bakery', 'artisan sourdough loaf'],
    pastries: ['croissant pastry bakery', 'danish pastry', 'pain au chocolat'],
    cakes: ['cake slice bakery display', 'cheesecake slice', 'chocolate cake'],
    drinks: ['tea cup', 'sparkling water bottle', 'juice bottle'],
  },
  items: [
    { categoryKey: 'breads', name: 'Sourdough Loaf', description: 'Artisan sourdough, baked daily.', basePrice: 9.5, tags: ['bread', 'sourdough'] },
    { categoryKey: 'breads', name: 'Baguette', description: 'Classic baguette with crisp crust.', basePrice: 4.5, tags: ['bread', 'baguette'] },
    { categoryKey: 'pastries', name: 'Butter Croissant', description: 'Flaky, buttery croissant.', basePrice: 5.5, tags: ['pastry', 'croissant'] },
    { categoryKey: 'pastries', name: 'Pain au Chocolat', description: 'Chocolate-filled pastry.', basePrice: 6.0, tags: ['pastry', 'chocolate'] },
    { categoryKey: 'pastries', name: 'Almond Danish', description: 'Sweet danish with almond filling.', basePrice: 6.5, tags: ['pastry', 'almond'] },
    { categoryKey: 'cakes', name: 'Cheesecake Slice', description: 'Classic cheesecake slice.', basePrice: 7.5, tags: ['cake', 'cheesecake'] },
    { categoryKey: 'cakes', name: 'Chocolate Cake Slice', description: 'Rich chocolate cake slice.', basePrice: 7.5, tags: ['cake', 'chocolate'] },
    { categoryKey: 'drinks', name: 'Tea', description: 'Selection of teas.', basePrice: 4.5, tags: ['drink', 'tea'] },
    { categoryKey: 'drinks', name: 'Juice', description: 'Chilled juice bottle.', basePrice: 5.5, tags: ['drink', 'juice'] },
  ],
};

export const TEMPLATE_BEAUTY_NAILS = {
  templateId: 'beauty_nails',
  label: 'Nail Salon',
  verticalSlug: 'beauty.nails',
  currency: 'AUD',
  categories: [
    { key: 'manicure', label: 'Manicure' },
    { key: 'pedicure', label: 'Pedicure' },
    { key: 'extensions', label: 'Extensions' },
    { key: 'nail_art', label: 'Nail Art' },
    { key: 'add_ons', label: 'Add-ons' },
  ],
  imageQueryHints: {
    manicure: ['manicure nails salon', 'gel manicure hands', 'nail polish manicure'],
    pedicure: ['pedicure salon', 'spa pedicure feet', 'pedicure chair'],
    extensions: ['acrylic nails', 'gel extensions nails', 'nail extension salon'],
    nail_art: ['nail art design', 'nail art close up', 'french tip nails'],
    add_ons: ['nail salon tools', 'cuticle care', 'nail removal'],
  },
  items: [
    { categoryKey: 'manicure', name: 'Classic Manicure', description: 'File, shape, cuticle care and polish.', basePrice: 30.0, tags: ['manicure', 'classic'] },
    { categoryKey: 'manicure', name: 'Gel Manicure', description: 'Long-lasting gel polish with cuticle care.', basePrice: 45.0, tags: ['manicure', 'gel'] },
    { categoryKey: 'pedicure', name: 'Classic Pedicure', description: 'Foot soak, exfoliation, cuticle care and polish.', basePrice: 45.0, tags: ['pedicure', 'classic'] },
    { categoryKey: 'pedicure', name: 'Spa Pedicure', description: 'Deluxe pedicure with scrub and massage.', basePrice: 60.0, tags: ['pedicure', 'spa'] },
    { categoryKey: 'extensions', name: 'Acrylic Full Set', description: 'Acrylic extensions with your choice of shape.', basePrice: 80.0, tags: ['extensions', 'acrylic'] },
    { categoryKey: 'extensions', name: 'Acrylic Infill', description: 'Maintenance infill for acrylic extensions.', basePrice: 60.0, tags: ['extensions', 'infill'] },
    { categoryKey: 'nail_art', name: 'French Tips', description: 'Classic French tip finish (add-on).', basePrice: 15.0, tags: ['nail art', 'french'] },
    { categoryKey: 'nail_art', name: 'Simple Nail Art (per nail)', description: 'Minimal design per nail.', basePrice: 5.0, tags: ['nail art', 'simple'] },
    { categoryKey: 'add_ons', name: 'Gel Removal', description: 'Safe removal of gel polish.', basePrice: 15.0, tags: ['add-on', 'removal'] },
    { categoryKey: 'add_ons', name: 'Nail Repair', description: 'Repair for a broken nail (per nail).', basePrice: 8.0, tags: ['add-on', 'repair'] },
  ],
};

export const TEMPLATE_FASHION_BOUTIQUE = {
  templateId: 'fashion_boutique',
  label: 'Fashion Boutique',
  verticalSlug: 'fashion.boutique',
  currency: 'AUD',
  categories: [
    { key: 'tops', label: 'Tops' },
    { key: 'bottoms', label: 'Bottoms' },
    { key: 'outerwear', label: 'Outerwear' },
    { key: 'shoes', label: 'Shoes' },
    { key: 'accessories', label: 'Accessories' },
  ],
  imageQueryHints: {
    tops: ['mens shirt fashion', 'women blouse fashion', 't-shirt on hanger'],
    bottoms: ['denim jeans fashion', 'trousers flat lay', 'skirt fashion product'],
    outerwear: ['jacket fashion product', 'coat fashion', 'hoodie product photo'],
    shoes: ['sneakers product photo', 'boots product photo', 'heels fashion'],
    accessories: ['handbag product photo', 'belt fashion', 'sunglasses product'],
  },
  items: [
    { categoryKey: 'tops', name: 'Classic Tee', description: 'Soft cotton tee for everyday wear.', basePrice: 29.0, tags: ['top', 'tee'] },
    { categoryKey: 'tops', name: 'Button-Up Shirt', description: 'Smart casual shirt with a tailored fit.', basePrice: 59.0, tags: ['top', 'shirt'] },
    { categoryKey: 'bottoms', name: 'Slim Jeans', description: 'Comfort stretch denim, slim fit.', basePrice: 79.0, tags: ['bottoms', 'jeans'] },
    { categoryKey: 'bottoms', name: 'Chino Pants', description: 'Versatile chinos for work or weekend.', basePrice: 75.0, tags: ['bottoms', 'chino'] },
    { categoryKey: 'outerwear', name: 'Lightweight Jacket', description: 'Easy layering jacket for all seasons.', basePrice: 99.0, tags: ['outerwear', 'jacket'] },
    { categoryKey: 'outerwear', name: 'Hoodie', description: 'Relaxed fit hoodie with soft fleece inside.', basePrice: 85.0, tags: ['outerwear', 'hoodie'] },
    { categoryKey: 'shoes', name: 'Everyday Sneakers', description: 'Clean silhouette sneakers for daily wear.', basePrice: 110.0, tags: ['shoes', 'sneakers'] },
    { categoryKey: 'shoes', name: 'Leather Boots', description: 'Durable boots with classic finish.', basePrice: 180.0, tags: ['shoes', 'boots'] },
    { categoryKey: 'accessories', name: 'Leather Belt', description: 'Genuine leather belt.', basePrice: 45.0, tags: ['accessories', 'belt'] },
    { categoryKey: 'accessories', name: 'Sunglasses', description: 'UV-protection sunglasses.', basePrice: 55.0, tags: ['accessories', 'sunglasses'] },
  ],
};

export const TEMPLATE_FASHION_KIDS = {
  templateId: 'fashion_kids',
  label: 'Children Clothing',
  verticalSlug: 'fashion.kids',
  currency: 'AUD',
  categories: [
    { key: 'tops', label: 'Tops' },
    { key: 'bottoms', label: 'Bottoms' },
    { key: 'outerwear', label: 'Outerwear' },
    { key: 'shoes', label: 'Shoes' },
    { key: 'accessories', label: 'Accessories' },
    { key: 'baby_basics', label: 'Baby Basics' },
    { key: 'school', label: 'School Essentials' },
  ],
  imageQueryHints: {
    tops: ['kids t-shirt', 'children top', 'toddler shirt'],
    bottoms: ['kids pants', 'children shorts', 'toddler leggings'],
    outerwear: ['kids jacket', 'toddler hoodie', 'children coat'],
    shoes: ['kids sneakers', 'children shoes', 'toddler shoes'],
    accessories: ['kids hat', 'children backpack', 'kids hair clip'],
    baby_basics: ['baby bodysuit', 'onesie', 'baby romper'],
    school: ['school bag kids', 'kids lunch box', 'school uniform'],
  },
  items: [
    { categoryKey: 'tops', name: 'Kids T-Shirt', description: 'Soft cotton tee for everyday play.', basePrice: 19.0, tags: ['kids', 'tee', 'top'] },
    { categoryKey: 'tops', name: 'Toddler Top', description: 'Comfy top for little ones.', basePrice: 22.0, tags: ['toddler', 'top'] },
    { categoryKey: 'tops', name: 'Kids Long Sleeve Tee', description: 'Warm long sleeve for cooler days.', basePrice: 24.0, tags: ['kids', 'top'] },
    { categoryKey: 'tops', name: 'Children Polo Shirt', description: 'Smart casual polo for kids.', basePrice: 28.0, tags: ['children', 'polo'] },
    { categoryKey: 'bottoms', name: 'Kids Shorts', description: 'Comfortable shorts for play.', basePrice: 22.0, tags: ['kids', 'shorts'] },
    { categoryKey: 'bottoms', name: 'Toddler Leggings', description: 'Stretch leggings for active kids.', basePrice: 20.0, tags: ['toddler', 'leggings'] },
    { categoryKey: 'bottoms', name: 'Kids Jeans', description: 'Durable denim for children.', basePrice: 35.0, tags: ['kids', 'jeans'] },
    { categoryKey: 'bottoms', name: 'Children Joggers', description: 'Soft joggers for comfort.', basePrice: 32.0, tags: ['children', 'joggers'] },
    { categoryKey: 'outerwear', name: 'Toddler Hoodie', description: 'Cozy hoodie for little ones.', basePrice: 38.0, tags: ['toddler', 'hoodie'] },
    { categoryKey: 'outerwear', name: 'Kids Zip Hoodie', description: 'Warm zip-up hoodie.', basePrice: 42.0, tags: ['kids', 'hoodie'] },
    { categoryKey: 'outerwear', name: 'Children Jacket', description: 'Lightweight jacket for kids.', basePrice: 48.0, tags: ['children', 'jacket'] },
    { categoryKey: 'outerwear', name: 'Kids Rain Jacket', description: 'Water-resistant rain jacket.', basePrice: 45.0, tags: ['kids', 'rain'] },
    { categoryKey: 'shoes', name: 'Kids Sneakers', description: 'Comfy sneakers for active kids.', basePrice: 45.0, tags: ['kids', 'sneakers'] },
    { categoryKey: 'shoes', name: 'Toddler First Walkers', description: 'Supportive first walking shoes.', basePrice: 38.0, tags: ['toddler', 'shoes'] },
    { categoryKey: 'shoes', name: 'Children Sandals', description: 'Summer sandals for kids.', basePrice: 28.0, tags: ['children', 'sandals'] },
    { categoryKey: 'shoes', name: 'Kids School Shoes', description: 'Durable school shoes.', basePrice: 42.0, tags: ['kids', 'school'] },
    { categoryKey: 'accessories', name: 'Kids Cap', description: 'Sun-safe cap for children.', basePrice: 18.0, tags: ['kids', 'cap'] },
    { categoryKey: 'accessories', name: 'Children Backpack', description: 'School or day trip backpack.', basePrice: 35.0, tags: ['children', 'backpack'] },
    { categoryKey: 'accessories', name: 'Kids Hair Clips', description: 'Fun hair clips set.', basePrice: 8.0, tags: ['kids', 'accessories'] },
    { categoryKey: 'baby_basics', name: 'Baby Bodysuit', description: 'Soft bodysuit for babies.', basePrice: 16.0, tags: ['baby', 'bodysuit'] },
    { categoryKey: 'baby_basics', name: 'Baby Onesie', description: 'Snap closure onesie.', basePrice: 18.0, tags: ['baby', 'onesie'] },
    { categoryKey: 'baby_basics', name: 'Toddler Romper', description: 'Easy romper for toddlers.', basePrice: 24.0, tags: ['toddler', 'romper'] },
    { categoryKey: 'baby_basics', name: 'Baby Sleepsuit', description: 'Cozy sleepsuit for night.', basePrice: 22.0, tags: ['baby', 'sleepsuit'] },
    { categoryKey: 'school', name: 'School Dress', description: 'School dress for girls.', basePrice: 38.0, tags: ['school', 'kids'] },
    { categoryKey: 'school', name: 'School Shorts', description: 'School shorts for boys.', basePrice: 28.0, tags: ['school', 'kids'] },
    { categoryKey: 'school', name: 'Kids Lunch Box', description: 'Insulated lunch box.', basePrice: 22.0, tags: ['kids', 'school'] },
    { categoryKey: 'school', name: 'School Socks Pack', description: 'Pack of school socks.', basePrice: 12.0, tags: ['school', 'kids'] },
  ],
};

export const TEMPLATE_GAME_CENTRE = {
  templateId: 'game_centre',
  label: 'Game Centre',
  verticalSlug: 'entertainment.game_centre',
  currency: 'AUD',
  categories: [
    { key: 'arcade', label: 'Arcade' },
    { key: 'vr', label: 'VR & Experiences' },
    { key: 'activities', label: 'Activities' },
    { key: 'parties', label: 'Parties & Groups' },
  ],
  imageQueryHints: {
    arcade: ['arcade tokens', 'arcade games', 'kids arcade', 'arcade machine'],
    vr: ['vr experience', 'virtual reality gaming', 'vr headset'],
    activities: ['bowling lane', 'laser tag', 'mini golf', 'trampoline'],
    parties: ['birthday party kids', 'party room', 'group booking'],
  },
  items: [
    { categoryKey: 'arcade', name: 'Arcade Tokens (20)', description: 'Tokens for arcade games.', basePrice: 10.0, tags: ['arcade', 'tokens'] },
    { categoryKey: 'arcade', name: 'Arcade Tokens (50)', description: 'Token pack for longer play.', basePrice: 22.0, tags: ['arcade', 'tokens'] },
    { categoryKey: 'arcade', name: 'Unlimited Arcade (1 hr)', description: 'One hour unlimited arcade play.', basePrice: 18.0, tags: ['arcade', 'unlimited'] },
    { categoryKey: 'arcade', name: 'Prize Redemption', description: 'Redeem tickets for prizes.', basePrice: 0.0, tags: ['arcade', 'prizes'] },
    { categoryKey: 'vr', name: 'VR Session (15 min)', description: 'Virtual reality experience.', basePrice: 25.0, tags: ['vr', 'experience'] },
    { categoryKey: 'vr', name: 'VR Session (30 min)', description: 'Extended VR session.', basePrice: 45.0, tags: ['vr', 'experience'] },
    { categoryKey: 'vr', name: 'VR Party Package', description: 'VR for a group (up to 6).', basePrice: 120.0, tags: ['vr', 'party'] },
    { categoryKey: 'activities', name: 'Bowling Lane (1 hr)', description: 'One lane, up to 6 players.', basePrice: 45.0, tags: ['bowling', 'lane'] },
    { categoryKey: 'activities', name: 'Laser Tag Game', description: 'Single laser tag game session.', basePrice: 15.0, tags: ['laser tag', 'game'] },
    { categoryKey: 'activities', name: 'Laser Tag Party Pack', description: 'Laser tag for group of 10.', basePrice: 120.0, tags: ['laser tag', 'party'] },
    { categoryKey: 'activities', name: 'Mini Golf (18 holes)', description: '18-hole mini golf round.', basePrice: 12.0, tags: ['mini golf', 'round'] },
    { categoryKey: 'activities', name: 'Trampoline Session (1 hr)', description: 'One hour trampoline access.', basePrice: 18.0, tags: ['trampoline', 'session'] },
    { categoryKey: 'parties', name: 'Birthday Party Package', description: 'Party room, arcade tokens, and food package.', basePrice: 280.0, tags: ['birthday', 'party'] },
    { categoryKey: 'parties', name: 'Party Room Hire (2 hr)', description: 'Private party room hire.', basePrice: 150.0, tags: ['party', 'room'] },
    { categoryKey: 'parties', name: 'Group Booking (10+ people)', description: 'Discounted group rate.', basePrice: 0.0, tags: ['group', 'booking'] },
    { categoryKey: 'parties', name: 'School Holiday Pass', description: 'Unlimited visits during school holidays.', basePrice: 55.0, tags: ['pass', 'holidays'] },
  ],
};

export const TEMPLATE_SERVICES_GENERIC = {
  templateId: 'services_generic',
  label: 'General Services',
  verticalSlug: 'services.generic',
  currency: 'AUD',
  categories: [
    { key: 'popular', label: 'Popular Services' },
    { key: 'packages', label: 'Packages' },
    { key: 'callout', label: 'Call-out & Quotes' },
  ],
  imageQueryHints: {
    popular: ['service professional working', 'home service technician', 'clean modern service'],
    packages: ['service package icon', 'service checklist'],
    callout: ['service van', 'service callout'],
  },
  items: [
    { categoryKey: 'popular', name: 'Standard Service', description: 'Core service delivered by our team.', basePrice: 120.0, tags: ['service', 'standard'] },
    { categoryKey: 'popular', name: 'Premium Service', description: 'Extended service with extra care and detail.', basePrice: 180.0, tags: ['service', 'premium'] },
    { categoryKey: 'packages', name: 'Starter Package', description: 'Great for first-time customers.', basePrice: 250.0, tags: ['package', 'starter'] },
    { categoryKey: 'packages', name: 'Business Package', description: 'For ongoing support and priority scheduling.', basePrice: 480.0, tags: ['package', 'business'] },
    { categoryKey: 'callout', name: 'Call-out Fee', description: 'On-site visit and assessment.', basePrice: 80.0, tags: ['callout', 'visit'] },
    { categoryKey: 'callout', name: 'Custom Quote', description: "Tell us what you need and we'll quote it.", basePrice: 0.0, tags: ['quote', 'custom'] },
  ],
};

/** Map structured template items to flat { name, description, price } for getTemplateItems. */
export function structuredItemsToFlat(items) {
  if (!Array.isArray(items)) return [];
  return items.map((i) => ({
    name: i.name,
    description: i.description ?? '',
    price: typeof i.basePrice === 'number' ? `$${i.basePrice.toFixed(2)}` : (i.price ?? ''),
  }));
}
