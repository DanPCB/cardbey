/**
 * Compose a canvas-ready element tree from a poster template and store data.
 */

export function composePosterLayout({ template, data }) {
  const { slots, colorScheme, dimensions } = template;
  const { title, subtitle, items, bgImage, phone, logo, cta } = data;

  const elements = [];

  if (slots.background) {
    elements.push({
      id: 'background',
      type: 'image',
      ...slots.background,
      src: bgImage,
      style: { objectFit: 'cover', opacity: 0.7 },
    });
  }

  elements.push({
    id: 'overlay',
    type: 'rect',
    x: 0,
    y: 0,
    w: dimensions.w,
    h: dimensions.h,
    style: {
      fill: colorScheme.bg,
      opacity: 0.5,
    },
  });

  if (slots.logo && logo) {
    elements.push({
      id: 'logo',
      type: 'image',
      ...slots.logo,
      src: logo,
      style: { objectFit: 'contain' },
    });
  }

  if (slots.title) {
    elements.push({
      id: 'title',
      type: 'text',
      ...slots.title,
      content: title,
      style: {
        color: colorScheme.text,
        fontSize: slots.title.fontSize,
        fontWeight: slots.title.fontWeight ?? 'normal',
        fontFamily: 'Playfair Display, serif',
        align: slots.title.align,
      },
    });
  }

  if (slots.subtitle && subtitle) {
    elements.push({
      id: 'subtitle',
      type: 'text',
      ...slots.subtitle,
      content: subtitle,
      style: {
        color: colorScheme.text,
        fontSize: slots.subtitle.fontSize,
        opacity: 0.8,
        align: slots.subtitle.align,
      },
    });
  }

  const photoSlots = ['photo_1', 'photo_2', 'photo_3', 'photo_4'];
  photoSlots.forEach((slotKey, i) => {
    if (!slots[slotKey]) return;
    const item = items[i];
    if (!item?.image) return;
    elements.push({
      id: slotKey,
      type: 'image_circle',
      ...slots[slotKey],
      src: item.image,
      style: {
        borderColor: colorScheme.accent,
        borderWidth: 3,
      },
    });
  });

  if (slots.item_panel) {
    elements.push({
      id: 'item_panel',
      type: 'rect',
      ...slots.item_panel,
      style: {
        fill: colorScheme.bg,
        opacity: slots.item_panel.bgOpacity ?? 0.8,
        borderRadius: 16,
      },
    });
  }

  const itemSlots = ['item_1', 'item_2', 'item_3'];
  itemSlots.forEach((slotKey, i) => {
    if (!slots[slotKey] || !items[i]) return;
    const item = items[i];
    elements.push({
      id: slotKey,
      type: 'service_row',
      ...slots[slotKey],
      content: {
        icon: '✂',
        name: item.name,
        price: item.price != null && item.price !== '' ? `$${item.price}` : null,
        description: item.description,
      },
      style: {
        color: colorScheme.text,
        accentColor: colorScheme.accent,
        fontSize: 26,
      },
    });
  });

  if (slots.cta_bar) {
    elements.push({
      id: 'cta_bar',
      type: 'rect',
      ...slots.cta_bar,
      style: {
        fill: colorScheme.accent,
        borderRadius: 12,
      },
    });
  }

  if (slots.cta_button && cta) {
    elements.push({
      id: 'cta_button',
      type: 'text',
      ...slots.cta_button,
      content: cta,
      style: {
        color: colorScheme.bg,
        fontSize: 28,
        fontWeight: 'bold',
        align: 'center',
      },
    });
  }

  if (slots.phone && phone) {
    elements.push({
      id: 'phone',
      type: 'text',
      ...slots.phone,
      content: `📞 ${phone}`,
      style: {
        color: colorScheme.bg,
        fontSize: slots.phone.fontSize,
        fontWeight: 'bold',
      },
    });
  }

  return {
    elements,
    data: { title, subtitle, bgImage, items, colorScheme },
  };
}
