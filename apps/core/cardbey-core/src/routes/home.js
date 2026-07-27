/**
 * Home & Demo Data Routes
 * Provides lightweight demo data for development
 */

import express from 'express';
import { getFeatureFlag } from '../env/loadEnv.js';

const router = express.Router();

// Demo data - Replace with DB queries later
// For now, provides immediate content for development
const demo = {
  food: [
    { 
      id: 'f1', 
      title: 'Bánh mì Saigon', 
      subtitle: 'Fresh Vietnamese baguette',
      price: 8.5, 
      city: 'Sydney', 
      imageUrl: 'https://images.unsplash.com/photo-1598511726623-d2e9996892f0?w=800&q=80',
      storeId: 'demo-store-1'
    },
    { 
      id: 'f2', 
      title: 'Phở bò Hà Nội', 
      subtitle: 'Traditional beef noodle soup',
      price: 14, 
      city: 'Sydney', 
      imageUrl: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=800&q=80',
      videoUrl: 'https://d2pj1uqw9p1zhj.cloudfront.net/demo/pho.mp4',
      storeId: 'demo-store-2'
    },
    { 
      id: 'f3', 
      title: 'Gỏi cuốn tôm thịt', 
      subtitle: 'Fresh spring rolls',
      price: 9.5, 
      city: 'Melbourne', 
      imageUrl: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=800&q=80',
      storeId: 'demo-store-3'
    },
  ],
  products: [
    { 
      id: 'p1', 
      title: 'Reusable Coffee Cup', 
      subtitle: 'Eco-friendly bamboo cup',
      price: 12.9, 
      imageUrl: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=800&q=80',
      storeId: 'demo-store-4'
    },
    { 
      id: 'p2', 
      title: 'Leather Tote Bag', 
      subtitle: 'Handcrafted genuine leather',
      price: 89, 
      imageUrl: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=800&q=80',
      storeId: 'demo-store-5'
    },
  ],
  services: [
    { 
      id: 's1', 
      title: 'Nail Spa - Classic Manicure', 
      subtitle: 'Professional nail care',
      price: 35, 
      city: 'Sydney',
      imageUrl: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&q=80',
      storeId: 'demo-store-6'
    },
    { 
      id: 's2', 
      title: 'Hair Styling - Cut & Color', 
      subtitle: 'Expert stylists',
      price: 120, 
      city: 'Melbourne',
      imageUrl: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80',
      storeId: 'demo-store-7'
    },
  ],
};

/**
 * GET /api/v2/home/sections
 * Returns demo sections for homepage
 */
router.get('/v2/home/sections', (req, res) => {
  const { region } = req.query;
  
  console.log(`[Home] GET /v2/home/sections?region=${region || 'all'}`);
  
  // Filter by region if specified (simple demo logic)
  const filterByRegion = (items) => {
    if (!region) return items;
    return items.filter(item => !item.city || item.city.toLowerCase().includes(region.toLowerCase()));
  };
  
  res.json({
    sections: [
      { 
        key: 'food', 
        title: 'Food near you', 
        items: filterByRegion(demo.food).map(mapToPlaylistItem)
      },
      { 
        key: 'products', 
        title: 'Trending products', 
        items: demo.products.map(mapToPlaylistItem)
      },
      { 
        key: 'services', 
        title: 'Local services', 
        items: filterByRegion(demo.services).map(mapToPlaylistItem)
      },
    ]
  });
});

/**
 * GET /api/v2/flags
 * Returns feature flags
 */
router.get('/v2/flags', (req, res) => {
  res.json({
    enableSSE: true,
    enableV2API: true,
    enableFeaturedSubmissions: true,
    business_builder_v1: true,
    menu_visual_agent_v1: getFeatureFlag('ENABLE_MENU_VISUAL_AGENT', false),
    EXPERIMENTS: {
      HOME_SECTIONS_V2: true,
      OAUTH_INTEGRATION: false
    }
  });
});

/**
 * Helper: Map demo item to PlaylistItem format
 */
function mapToPlaylistItem(item) {
  return {
    id: item.id,
    type: item.videoUrl ? 'VIDEO' : 'IMAGE',
    url: item.videoUrl || item.imageUrl,
    durationMs: item.videoUrl ? undefined : 5000,
    storeId: item.storeId,
    meta: {
      brand: item.title,
      headline: item.subtitle || item.title,
      price: item.price,
      city: item.city
    },
    cta: {
      kind: 'OPEN',
      label: item.price ? `$${item.price}` : 'View'
    }
  };
}

export default router;

