/**
 * Fine-grained SME category extension (Phase 1A).
 * Appended to MARKET_CATEGORIES — does not replace Melbourne pilot labels.
 */

import type { MarketCategoryRecord, MarketCountryCode } from './types.js';

function cat(
  partial: Omit<MarketCategoryRecord, 'regulatedInferenceForbidden' | 'active'> & {
    active?: boolean;
  },
): MarketCategoryRecord {
  return {
    regulatedInferenceForbidden: true,
    active: partial.active !== false,
    ...partial,
  };
}

/** @param {string} id */
function slugTerms(id: string): string[] {
  return id.split('_').filter(Boolean);
}

type FineSpec = {
  id: string;
  displayName: string;
  displayNameVi?: string;
  countries: MarketCountryCode[];
  groupId: string;
  groupLabel: string;
  termsAu?: string[];
  termsVn?: string[];
  osmTags?: string[];
  aliasesEn?: string[];
  aliasesVi?: string[];
  storeCats?: string[];
};

function fine(spec: FineSpec): MarketCategoryRecord {
  const termsAu = spec.termsAu ?? [spec.displayName.toLowerCase(), ...slugTerms(spec.id)];
  const termsVn =
    spec.termsVn ??
    (spec.displayNameVi ? [spec.displayNameVi] : termsAu);
  return cat({
    id: spec.id,
    displayName: spec.displayName,
    displayNameVi: spec.displayNameVi ?? null,
    countryAvailability: spec.countries,
    groupId: spec.groupId,
    groupLabel: spec.groupLabel,
    providerSearchTerms: {
      ...(spec.countries.includes('AU') ? { AU: termsAu } : {}),
      ...(spec.countries.includes('VN') ? { VN: termsVn } : {}),
    },
    osmTags: spec.osmTags ?? [],
    englishAliases: spec.aliasesEn ?? [spec.displayName.toLowerCase(), ...slugTerms(spec.id)],
    vietnameseAliases: spec.aliasesVi ?? (spec.displayNameVi ? [spec.displayNameVi.toLowerCase()] : []),
    cardbeyStoreCategories: spec.storeCats ?? [spec.groupId, spec.id],
  });
}

/** Phase 1A fine-grained AU + shared + VN SME categories (≥25 AU, ≥20 VN labels). */
export const FINE_SME_CATEGORIES: MarketCategoryRecord[] = [
  // Food & Beverage (AU)
  fine({ id: 'bakery', displayName: 'Bakery', displayNameVi: 'Tiệm bánh', countries: ['AU', 'VN'], groupId: 'food_beverage', groupLabel: 'Food & Beverage', osmTags: ['shop=bakery'], storeCats: ['food_drink', 'bakery'] }),
  fine({ id: 'cafe', displayName: 'Cafe', displayNameVi: 'Cà phê', countries: ['AU', 'VN'], groupId: 'food_beverage', groupLabel: 'Food & Beverage', osmTags: ['amenity=cafe'], storeCats: ['cafe', 'food_drink'] }),
  fine({ id: 'restaurant', displayName: 'Restaurant', displayNameVi: 'Nhà hàng', countries: ['AU', 'VN'], groupId: 'food_beverage', groupLabel: 'Food & Beverage', osmTags: ['amenity=restaurant'], storeCats: ['restaurant', 'food_drink'] }),
  fine({ id: 'fast_food', displayName: 'Fast Food', countries: ['AU'], groupId: 'food_beverage', groupLabel: 'Food & Beverage', osmTags: ['amenity=fast_food'] }),
  fine({ id: 'ice_cream', displayName: 'Ice Cream', countries: ['AU'], groupId: 'food_beverage', groupLabel: 'Food & Beverage', osmTags: ['amenity=ice_cream'] }),
  fine({ id: 'grocery', displayName: 'Grocery', displayNameVi: 'Siêu thị', countries: ['AU', 'VN'], groupId: 'food_beverage', groupLabel: 'Food & Beverage', osmTags: ['shop=supermarket', 'shop=convenience'] }),
  fine({ id: 'butcher', displayName: 'Butcher', countries: ['AU'], groupId: 'food_beverage', groupLabel: 'Food & Beverage', osmTags: ['shop=butcher'] }),
  fine({ id: 'seafood', displayName: 'Seafood', displayNameVi: 'Hải sản', countries: ['AU', 'VN'], groupId: 'food_beverage', groupLabel: 'Food & Beverage', osmTags: ['shop=seafood'] }),
  fine({ id: 'bubble_tea', displayName: 'Bubble Tea', displayNameVi: 'Trà sữa', countries: ['AU', 'VN'], groupId: 'food_beverage', groupLabel: 'Food & Beverage', termsVn: ['trà sữa', 'tra sua'] }),
  fine({ id: 'banh_mi', displayName: 'Bánh mì', displayNameVi: 'Bánh mì', countries: ['VN'], groupId: 'food_beverage', groupLabel: 'Food & Beverage', termsVn: ['bánh mì', 'banh mi'], aliasesVi: ['banh mi'] }),
  fine({ id: 'quan_an', displayName: 'Quán ăn', displayNameVi: 'Quán ăn', countries: ['VN'], groupId: 'food_beverage', groupLabel: 'Food & Beverage', termsVn: ['quán ăn', 'quan an'] }),
  fine({ id: 'quan_nhau', displayName: 'Quán nhậu', displayNameVi: 'Quán nhậu', countries: ['VN'], groupId: 'food_beverage', groupLabel: 'Food & Beverage', termsVn: ['quán nhậu', 'quan nhau'] }),

  // Retail
  fine({ id: 'clothing', displayName: 'Clothing', displayNameVi: 'Quần áo', countries: ['AU', 'VN'], groupId: 'retail', groupLabel: 'Retail', osmTags: ['shop=clothes'] }),
  fine({ id: 'shoes', displayName: 'Shoes', displayNameVi: 'Giày dép', countries: ['AU', 'VN'], groupId: 'retail', groupLabel: 'Retail', osmTags: ['shop=shoes'] }),
  fine({ id: 'jewelry', displayName: 'Jewelry', displayNameVi: 'Trang sức', countries: ['AU', 'VN'], groupId: 'retail', groupLabel: 'Retail', osmTags: ['shop=jewelry'] }),
  fine({ id: 'electronics', displayName: 'Electronics', displayNameVi: 'Điện tử', countries: ['AU', 'VN'], groupId: 'retail', groupLabel: 'Retail', osmTags: ['shop=electronics'] }),
  fine({ id: 'bookstore', displayName: 'Bookstore', displayNameVi: 'Sách', countries: ['AU', 'VN'], groupId: 'retail', groupLabel: 'Retail', osmTags: ['shop=books'] }),
  fine({ id: 'florist', displayName: 'Florist', displayNameVi: 'Hoa', countries: ['AU', 'VN'], groupId: 'retail', groupLabel: 'Retail', osmTags: ['shop=florist'] }),
  fine({ id: 'cosmetics', displayName: 'Cosmetics', displayNameVi: 'Mỹ phẩm', countries: ['AU', 'VN'], groupId: 'retail', groupLabel: 'Retail', osmTags: ['shop=cosmetics'] }),
  fine({ id: 'homeware', displayName: 'Homeware', displayNameVi: 'Đồ gia dụng', countries: ['AU', 'VN'], groupId: 'retail', groupLabel: 'Retail', osmTags: ['shop=houseware'] }),
  fine({ id: 'convenience_store', displayName: 'Convenience Store', displayNameVi: 'Cửa hàng tiện lợi', countries: ['VN'], groupId: 'retail', groupLabel: 'Retail', termsVn: ['cửa hàng tiện lợi', 'convenience'] }),
  fine({ id: 'market_stall', displayName: 'Market', displayNameVi: 'Chợ', countries: ['VN'], groupId: 'retail', groupLabel: 'Retail', termsVn: ['chợ', 'cho'] }),

  // Professional services
  fine({ id: 'accounting', displayName: 'Accounting', displayNameVi: 'Kế toán', countries: ['AU', 'VN'], groupId: 'professional_services', groupLabel: 'Professional Services', osmTags: ['office=accountant'] }),
  fine({ id: 'legal', displayName: 'Legal', displayNameVi: 'Pháp lý', countries: ['AU', 'VN'], groupId: 'professional_services', groupLabel: 'Professional Services', osmTags: ['office=lawyer'] }),
  fine({ id: 'real_estate', displayName: 'Real Estate', displayNameVi: 'Bất động sản', countries: ['AU', 'VN'], groupId: 'professional_services', groupLabel: 'Professional Services', osmTags: ['office=estate_agent'] }),
  fine({ id: 'insurance', displayName: 'Insurance', displayNameVi: 'Bảo hiểm', countries: ['AU', 'VN'], groupId: 'professional_services', groupLabel: 'Professional Services', osmTags: ['office=insurance'] }),
  fine({ id: 'it_support', displayName: 'IT Support', displayNameVi: 'Công nghệ', countries: ['AU', 'VN'], groupId: 'professional_services', groupLabel: 'Professional Services', osmTags: ['office=it'] }),
  fine({ id: 'marketing_agency', displayName: 'Marketing', displayNameVi: 'Quảng cáo', countries: ['AU', 'VN'], groupId: 'professional_services', groupLabel: 'Professional Services', osmTags: ['office=advertising_agency'] }),
  fine({ id: 'photography', displayName: 'Photography', countries: ['AU'], groupId: 'professional_services', groupLabel: 'Professional Services', osmTags: ['craft=photographer'] }),
  fine({ id: 'consulting', displayName: 'Consulting', displayNameVi: 'Tư vấn', countries: ['AU', 'VN'], groupId: 'professional_services', groupLabel: 'Professional Services', osmTags: ['office=consulting'] }),
  fine({ id: 'banking', displayName: 'Banking', displayNameVi: 'Ngân hàng', countries: ['VN'], groupId: 'professional_services', groupLabel: 'Professional Services', termsVn: ['ngân hàng', 'ngan hang'] }),
  fine({ id: 'construction', displayName: 'Construction', displayNameVi: 'Xây dựng', countries: ['VN'], groupId: 'professional_services', groupLabel: 'Professional Services', termsVn: ['xây dựng', 'xay dung'] }),
  fine({ id: 'software', displayName: 'Software', displayNameVi: 'Phần mềm', countries: ['VN'], groupId: 'professional_services', groupLabel: 'Professional Services', termsVn: ['phần mềm', 'phan mem'] }),

  // Health
  fine({ id: 'pharmacy', displayName: 'Pharmacy', displayNameVi: 'Nhà thuốc', countries: ['AU', 'VN'], groupId: 'health', groupLabel: 'Health', osmTags: ['amenity=pharmacy'] }),
  fine({ id: 'dental', displayName: 'Dental', displayNameVi: 'Nha khoa', countries: ['AU', 'VN'], groupId: 'health', groupLabel: 'Health', osmTags: ['amenity=dentist'] }),
  fine({ id: 'physiotherapy', displayName: 'Physiotherapy', displayNameVi: 'Vật lý trị liệu', countries: ['AU', 'VN'], groupId: 'health', groupLabel: 'Health' }),
  fine({ id: 'massage', displayName: 'Massage', countries: ['AU', 'VN'], groupId: 'health', groupLabel: 'Health', osmTags: ['shop=massage'] }),
  fine({ id: 'healthcare_vn', displayName: 'Healthcare', displayNameVi: 'Y tế', countries: ['VN'], groupId: 'health', groupLabel: 'Health', termsVn: ['y tế', 'y te'] }),

  // Personal
  fine({ id: 'hairdressing', displayName: 'Hairdressing', displayNameVi: 'Làm tóc', countries: ['AU', 'VN'], groupId: 'personal', groupLabel: 'Personal Services', osmTags: ['shop=hairdresser'] }),
  fine({ id: 'beauty', displayName: 'Beauty', displayNameVi: 'Làm đẹp', countries: ['AU', 'VN'], groupId: 'personal', groupLabel: 'Personal Services', osmTags: ['shop=beauty'] }),
  fine({ id: 'nails', displayName: 'Nails', countries: ['AU', 'VN'], groupId: 'personal', groupLabel: 'Personal Services', osmTags: ['shop=nails'] }),
  fine({ id: 'spa', displayName: 'Spa', displayNameVi: 'Spa', countries: ['AU', 'VN'], groupId: 'personal', groupLabel: 'Personal Services' }),

  // Trade
  fine({ id: 'electrician', displayName: 'Electrician', countries: ['AU'], groupId: 'trade', groupLabel: 'Trade', osmTags: ['craft=electrician'] }),
  fine({ id: 'plumber', displayName: 'Plumber', countries: ['AU'], groupId: 'trade', groupLabel: 'Trade', osmTags: ['craft=plumber'] }),
  fine({ id: 'builder', displayName: 'Builder', countries: ['AU'], groupId: 'trade', groupLabel: 'Trade' }),
  fine({ id: 'painter', displayName: 'Painter', countries: ['AU'], groupId: 'trade', groupLabel: 'Trade', osmTags: ['craft=painter'] }),
  fine({ id: 'carpenter', displayName: 'Carpenter', countries: ['AU'], groupId: 'trade', groupLabel: 'Trade', osmTags: ['craft=carpenter'] }),
  fine({ id: 'cleaning', displayName: 'Cleaning', displayNameVi: 'Vệ sinh', countries: ['AU', 'VN'], groupId: 'trade', groupLabel: 'Trade' }),
  fine({ id: 'repair', displayName: 'Repair', displayNameVi: 'Sửa chữa', countries: ['VN'], groupId: 'trade', groupLabel: 'Trade', termsVn: ['sửa chữa', 'sua chua'] }),

  // Hospitality / tourism / transport / education / events (shared + VN)
  fine({ id: 'hotel', displayName: 'Hotel', displayNameVi: 'Khách sạn', countries: ['AU', 'VN'], groupId: 'hospitality', groupLabel: 'Hospitality', osmTags: ['tourism=hotel'] }),
  fine({ id: 'motel', displayName: 'Motel', countries: ['AU'], groupId: 'hospitality', groupLabel: 'Hospitality', osmTags: ['tourism=motel'] }),
  fine({ id: 'event_venue', displayName: 'Event Venue', displayNameVi: 'Sự kiện', countries: ['AU', 'VN'], groupId: 'hospitality', groupLabel: 'Hospitality' }),
  fine({ id: 'tourism_agency', displayName: 'Tourism', displayNameVi: 'Du lịch', countries: ['AU', 'VN'], groupId: 'tourism', groupLabel: 'Tourism', osmTags: ['shop=travel_agency'] }),
  fine({ id: 'education', displayName: 'Education', displayNameVi: 'Giáo dục', countries: ['AU', 'VN'], groupId: 'education', groupLabel: 'Education', osmTags: ['amenity=school'] }),
  fine({ id: 'language_school', displayName: 'Language School', displayNameVi: 'Trung tâm Anh ngữ', countries: ['AU', 'VN'], groupId: 'education', groupLabel: 'Education' }),
  fine({ id: 'vocational_training', displayName: 'Vocational Training', displayNameVi: 'Đào tạo', countries: ['AU', 'VN'], groupId: 'education', groupLabel: 'Education' }),
  fine({ id: 'transport', displayName: 'Transport', displayNameVi: 'Vận tải', countries: ['VN'], groupId: 'transport', groupLabel: 'Transport', termsVn: ['vận tải', 'van tai'] }),
  fine({ id: 'logistics', displayName: 'Logistics', displayNameVi: 'Logistics', countries: ['VN'], groupId: 'transport', groupLabel: 'Transport' }),
  fine({ id: 'delivery', displayName: 'Delivery', displayNameVi: 'Giao hàng', countries: ['VN'], groupId: 'transport', groupLabel: 'Transport', termsVn: ['giao hàng', 'giao hang'] }),
  fine({ id: 'ride_hailing', displayName: 'Ride-hailing', displayNameVi: 'Xe ôm', countries: ['VN'], groupId: 'transport', groupLabel: 'Transport', termsVn: ['xe ôm', 'xe om'] }),

  // Automotive (AU)
  fine({ id: 'car_dealership', displayName: 'Car Dealership', countries: ['AU'], groupId: 'automotive', groupLabel: 'Automotive', osmTags: ['shop=car'] }),
  fine({ id: 'mechanical', displayName: 'Mechanical', countries: ['AU'], groupId: 'automotive', groupLabel: 'Automotive', osmTags: ['shop=car_repair'] }),
  fine({ id: 'car_wash', displayName: 'Car Wash', countries: ['AU'], groupId: 'automotive', groupLabel: 'Automotive', osmTags: ['amenity=car_wash'] }),
  fine({ id: 'auto_parts', displayName: 'Parts', countries: ['AU'], groupId: 'automotive', groupLabel: 'Automotive', osmTags: ['shop=car_parts'] }),
];
