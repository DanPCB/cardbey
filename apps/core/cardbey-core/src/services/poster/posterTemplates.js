const TEMPLATES = {
  service_vertical: {
    id: 'service_vertical',
    dimensions: { w: 1080, h: 1920 },
    colorScheme: null,
    layout: 'circles_left_list_right',
    slots: {
      background: { type: 'image', x: 0, y: 0, w: 1080, h: 1920 },
      logo: { type: 'image', x: 40, y: 60, w: 120, h: 60 },
      title: { type: 'text', x: 520, y: 200, w: 500, h: 120, fontSize: 52, fontWeight: 'bold' },
      subtitle: { type: 'text', x: 520, y: 340, w: 500, h: 60, fontSize: 24 },
      photo_1: { type: 'image_circle', x: 60, y: 180, size: 200 },
      photo_2: { type: 'image_circle', x: 60, y: 430, size: 200 },
      photo_3: { type: 'image_circle', x: 60, y: 680, size: 200 },
      photo_4: { type: 'image_circle', x: 60, y: 930, size: 200 },
      item_panel: { type: 'panel', x: 300, y: 430, w: 740, h: 800, bgOpacity: 0.85 },
      item_1: { type: 'service_row', x: 320, y: 460, w: 700 },
      item_2: { type: 'service_row', x: 320, y: 620, w: 700 },
      item_3: { type: 'service_row', x: 320, y: 780, w: 700 },
      cta_bar: { type: 'cta_bar', x: 300, y: 1280, w: 740, h: 80 },
      phone: { type: 'text', x: 380, y: 1295, w: 580, h: 50, fontSize: 28 },
    },
  },

  product_square: {
    id: 'product_square',
    dimensions: { w: 1080, h: 1080 },
    layout: 'hero_top_items_bottom',
    slots: {
      background: { type: 'image', x: 0, y: 0, w: 1080, h: 1080 },
      title: { type: 'text', x: 60, y: 60, w: 960, h: 100, fontSize: 64, fontWeight: 'bold' },
      subtitle: { type: 'text', x: 60, y: 180, w: 960, h: 60, fontSize: 28 },
      item_grid: { type: 'grid', x: 60, y: 600, w: 960, h: 380, cols: 3 },
      cta_button: { type: 'button', x: 390, y: 980, w: 300, h: 70 },
    },
  },

  promo_story: {
    id: 'promo_story',
    dimensions: { w: 1080, h: 1920 },
    layout: 'centered_hero',
    slots: {
      background: { type: 'image', x: 0, y: 0, w: 1080, h: 1920 },
      overlay: { type: 'gradient', x: 0, y: 0, w: 1080, h: 1920 },
      logo: { type: 'image', x: 440, y: 200, w: 200, h: 100 },
      title: { type: 'text', x: 60, y: 700, w: 960, h: 200, fontSize: 72, fontWeight: 'bold', align: 'center' },
      subtitle: { type: 'text', x: 60, y: 920, w: 960, h: 100, fontSize: 32, align: 'center' },
      offer_badge: { type: 'badge', x: 390, y: 1100, w: 300, h: 300 },
      cta_button: { type: 'button', x: 290, y: 1500, w: 500, h: 90 },
    },
  },
};

/**
 * @param {{ businessType?: string; posterType?: string; isService?: boolean; colorScheme?: object }} opts
 */
export function getPosterTemplate({ businessType, posterType, isService, colorScheme }) {
  let templateId = 'service_vertical';

  if (!isService) templateId = 'product_square';
  if (posterType === 'story') templateId = 'promo_story';
  if (posterType === 'offer') templateId = 'promo_story';

  const template = { ...TEMPLATES[templateId], slots: { ...TEMPLATES[templateId].slots } };
  template.colorScheme = colorScheme;
  return template;
}
