/**

 * Map discovery / OSM / social / aggregator signals → Cardbey category + tags.

 * Delegates alias matching to config/categoryTaxonomy.ts (SSOT).

 */



import {

  resolveCategoryFromSignals,

  resolveSubCategory,

  taxonomyTagsForCategory,

} from '../../../config/categoryTaxonomy.js';

import type { CardbeyCategory } from './constants.js';



export type CategoryMappingInput = {

  businessName?: string | null;

  businessType?: string | null;

  placesTypes?: string[] | null;

  osmTag?: string | null;

  igCategory?: string | null;

  fbCategory?: string | null;

  ypCategory?: string | null;

  ypSnippet?: string | null;

  trueLocalSnippet?: string | null;

  websiteNavItems?: string[] | null;

};



export function mapToCardbeyCategory(input: CategoryMappingInput): {

  category: CardbeyCategory;

  tags: string[];

  confidence: number;

} {

  const category = resolveCategoryFromSignals(input);

  const tags = taxonomyTagsForCategory({

    category,

    businessName: input.businessName,

    businessType: input.businessType,

    placesTypes: input.placesTypes,

  });



  const subCategory = resolveSubCategory({

    category,

    businessName: input.businessName,

    businessType: input.businessType,

    placesTypes: input.placesTypes,

    tags,

  });

  if (subCategory) {

    const slug = subCategory
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);

    if (!tags.includes(slug)) tags.unshift(slug);

  }



  const confidence =

    category === 'Other'

      ? 0.5

      : input.placesTypes?.length || input.osmTag

        ? 0.85

        : input.businessName || input.businessType

          ? 0.75

          : 0.6;



  return { category, tags: tags.slice(0, 5), confidence };

}



export function isDefaultOtherCategory(category: string | null | undefined): boolean {

  return !category || category.trim().toLowerCase() === 'other';

}



/** CLI / ops helper — maps name + Google Places types to Cardbey category label. */

export function resolveCategory(

  businessName: string | null | undefined,

  placesTypes?: string[] | null,

): CardbeyCategory {

  return mapToCardbeyCategory({ businessName, placesTypes }).category;

}



export { resolveSubCategory } from '../../../config/categoryTaxonomy.js';


