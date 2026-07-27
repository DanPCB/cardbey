import { nanoid } from 'nanoid';
import { getStoreContext } from '../../services/storeContext.js';
import { searchPexelsImages } from '../../services/menuVisualAgent/pexelsService.js';
import { getPosterTemplate } from '../../services/poster/posterTemplates.js';
import { composePosterLayout } from '../../services/poster/posterComposer.js';
import { isServiceVertical } from '../../services/draftStore/verticalResolver.js';

function getDefaultSubtitle(businessType, location, isService) {
  const action = isService ? 'Book your appointment' : 'Order now';
  return `${action} in ${location}`;
}

function getDefaultColorScheme(businessType) {
  const schemes = {
    beauty: { bg: '#2C2C2C', accent: '#C9A96E', text: '#FFFFFF' },
    'food & drink': { bg: '#1A1A1A', accent: '#E67E22', text: '#FFFFFF' },
    health: { bg: '#1B4332', accent: '#52B788', text: '#FFFFFF' },
    fashion: { bg: '#0D0D0D', accent: '#E8D5B7', text: '#FFFFFF' },
    sports: { bg: '#0A0A2E', accent: '#4361EE', text: '#FFFFFF' },
    default: { bg: '#1A1A2E', accent: '#E94560', text: '#FFFFFF' },
  };
  const key = Object.keys(schemes).find((k) => businessType?.toLowerCase().includes(k));
  return schemes[key ?? 'default'];
}

/**
 * @param {object} params
 * @param {string} params.storeId
 * @param {string} [params.posterType]
 * @param {string} [params.customTitle]
 * @param {string} [params.customSubtitle]
 * @param {string[]} [params.highlightItems]
 * @param {object} [params.colorScheme]
 * @param {object} [_context]
 */
export async function generatePoster(params = {}, _context = undefined) {
  const {
    storeId,
    posterType = 'promotional',
    customTitle,
    customSubtitle,
    highlightItems,
    colorScheme,
  } = params;

  console.log('[generate_poster] START:', { storeId, posterType });

  const store = await getStoreContext(storeId);
  if (!store) {
    return { ok: false, error: 'store_not_found' };
  }

  const { name: businessName, type: businessType, location, heroImage, products = [] } = store;
  const isService = isServiceVertical(businessType);

  const featuredItems = (
    highlightItems?.length > 0
      ? products.filter((p) => highlightItems.includes(p.id))
      : products.slice(0, 3)
  ).map((p) => ({
    name: p.name,
    price: p.price,
    description: p.description?.slice(0, 60),
    image: p.image,
  }));

  const template = getPosterTemplate({
    businessType,
    posterType,
    isService,
    colorScheme: colorScheme ?? getDefaultColorScheme(businessType),
  });

  let bgImage = heroImage;
  if (!bgImage) {
    const pexelsResult = await searchPexelsImages(`${businessType} ${businessName} professional`, 1);
    bgImage = pexelsResult?.[0]?.url ?? null;
  }

  const itemsWithImages = await Promise.all(
    featuredItems.map(async (item) => {
      if (item.image) return item;
      const imgs = await searchPexelsImages(`${item.name} ${businessType}`, 1);
      return { ...item, image: imgs?.[0]?.url ?? null };
    }),
  );

  const poster = composePosterLayout({
    template,
    data: {
      title: customTitle ?? businessName,
      subtitle: customSubtitle ?? getDefaultSubtitle(businessType, location, isService),
      items: itemsWithImages,
      bgImage,
      phone: store.phone ?? null,
      logo: store.avatarImage ?? null,
      cta: isService ? 'Book now' : 'Order now',
      location,
    },
  });

  console.log('[generate_poster] composed poster:', {
    templateId: template.id,
    itemCount: itemsWithImages.length,
    hasBgImage: !!bgImage,
  });

  return {
    ok: true,
    poster: {
      id: nanoid(),
      storeId,
      businessName,
      templateId: template.id,
      posterType,
      elements: poster.elements,
      title: poster.data.title,
      subtitle: poster.data.subtitle,
      bgImage: poster.data.bgImage,
      items: poster.data.items,
      colorScheme: template.colorScheme,
      dimensions: template.dimensions,
      format: 'poster_v1',
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = undefined) {
  const storeId = input?.storeId ?? context?.storeId ?? null;
  const result = await generatePoster({ ...input, storeId }, context);

  if (!result.ok) {
    return {
      status: 'failed',
      error: {
        code: result.error ?? 'POSTER_GENERATION_FAILED',
        message:
          result.error === 'store_not_found'
            ? 'Store not found — select an active store and try again.'
            : 'Could not generate poster.',
      },
    };
  }

  return {
    status: 'ok',
    output: {
      ok: true,
      poster: result.poster,
      message: `Created promotional poster for ${result.poster.businessName}.`,
    },
  };
}
