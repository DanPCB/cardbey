/**
 * Generation profile — default sections, categories, CTAs for store generation.
 */

/** @param {string} businessType @param {string} corpus @param {string[]} suggestedSubcategories */
export function resolveGenerationProfile(businessType, corpus = '', suggestedSubcategories = []) {
  const text = String(corpus ?? '').toLowerCase();
  const categories = (suggestedSubcategories ?? []).filter((c) => c && c !== 'All');

  switch (businessType) {
    case 'product_retail':
      return {
        defaultSections: ['Hero', 'Products', 'Featured', 'Gallery', 'Reviews', 'Contact'],
        recommendedCatalog: 'product_grid',
        defaultCategories: categories.length ? categories : ['Featured', 'New Arrivals', 'Best Sellers', 'Sale'],
        suggestedServices: [],
        defaultCTAs: { primary: 'Add to cart', secondary: 'View details' },
        heroLayout: 'product_showcase',
        galleryLayout: 'product_grid',
        reviewStyle: 'product_reviews',
      };
    case 'service_fixed_booking':
      return {
        defaultSections: ['Hero', 'Services', 'Staff', 'Gallery', 'Reviews', 'Contact'],
        recommendedCatalog: 'service_booking',
        defaultCategories: categories.length
          ? categories
          : ['Manicure', 'Pedicure', 'Treatments', 'Packages', 'Add-ons'],
        suggestedServices: categories,
        defaultCTAs: { primary: 'Book', secondary: 'View services' },
        heroLayout: 'service_hero',
        galleryLayout: 'portfolio',
        reviewStyle: 'service_reviews',
      };
    case 'service_quote_required':
      return {
        defaultSections: [
          'Hero',
          'Services',
          'Projects',
          'Tile Collections',
          'Pricing Guide',
          'Reviews',
          'Contact',
        ],
        recommendedCatalog: 'service_quote',
        defaultCategories: categories.length
          ? categories
          : ['Bathroom Tiling', 'Floor Tiling', 'Waterproofing', 'Repairs', 'Commercial'],
        suggestedServices: categories,
        defaultCTAs: { primary: 'Request quote', secondary: 'Book inspection' },
        heroLayout: 'trade_project_hero',
        galleryLayout: 'project_portfolio',
        reviewStyle: 'project_reviews',
      };
    case 'food_menu':
      return {
        defaultSections: ['Hero', 'Menu', 'Popular', 'Gallery', 'Reviews', 'Location'],
        recommendedCatalog: 'food_menu',
        defaultCategories: categories.length
          ? categories
          : ['Entrees', 'Mains', 'Drinks', 'Desserts', 'Specials', 'Combos'],
        suggestedServices: [],
        defaultCTAs: { primary: 'Order', secondary: 'Reserve table' },
        heroLayout: 'food_hero',
        galleryLayout: 'food_gallery',
        reviewStyle: 'dining_reviews',
      };
    case 'hybrid':
      return {
        defaultSections: ['Hero', 'Services', 'Products', 'Gallery', 'Reviews', 'Contact'],
        recommendedCatalog: 'mixed_catalog',
        defaultCategories: categories.length ? categories : ['Services', 'Products', 'Packages'],
        suggestedServices: categories.filter((c) => !/product/i.test(c)),
        defaultCTAs: { primary: 'Shop', secondary: 'Book' },
        heroLayout: 'mixed_hero',
        galleryLayout: 'mixed',
        reviewStyle: 'general_reviews',
      };
    default:
      return {
        defaultSections: ['Hero', 'Catalog', 'Contact'],
        recommendedCatalog: 'default',
        defaultCategories: categories,
        suggestedServices: [],
        defaultCTAs: { primary: 'Contact', secondary: 'Learn more' },
        heroLayout: 'default',
        reviewStyle: 'default',
      };
  }
}

/** @param {string} businessType @param {string} corpus */
export function resolvePerformerRecommendations(businessType, corpus = '') {
  switch (businessType) {
    case 'product_retail':
      return [
        'Improve sales conversion',
        'Recover abandoned carts',
        'Inventory and stock suggestions',
        'Highlight best-selling products',
      ];
    case 'service_fixed_booking':
      return [
        'Increase bookings',
        'Fill empty calendar slots',
        'Promote membership or package offers',
        'Reduce no-shows with reminders',
      ];
    case 'service_quote_required':
      return [
        'Improve quote response time',
        'Generate project gallery content',
        'Schedule inspection bookings',
        'Follow up on open quote requests',
      ];
    case 'food_menu':
      return [
        'Promote popular menu items',
        'Increase delivery orders',
        'Fill off-peak table reservations',
        'Launch seasonal specials',
      ];
    case 'hybrid':
      return [
        'Balance product and service promotions',
        'Cross-sell services with products',
        'Segment customer journeys',
      ];
    default:
      return ['Complete store profile', 'Add catalog items', 'Enable customer contact'];
  }
}

/** @param {string} businessType */
export function resolveDashboardWidgets(businessType) {
  switch (businessType) {
    case 'product_retail':
      return ['sales', 'orders', 'inventory', 'abandoned_carts', 'top_products'];
    case 'service_fixed_booking':
      return ['appointments', 'upcoming_bookings', 'no_shows', 'popular_services', 'calendar'];
    case 'service_quote_required':
      return ['quote_requests', 'projects', 'inspection_bookings', 'quote_pipeline', 'portfolio'];
    case 'food_menu':
      return ['orders', 'menu_performance', 'delivery', 'reservations', 'kitchen'];
    case 'hybrid':
      return ['sales', 'appointments', 'quote_requests', 'orders', 'catalog'];
    default:
      return ['overview', 'catalog', 'engagement'];
  }
}
