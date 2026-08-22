/**
 * Vietnam territory registry — configured coverage only (not nationwide complete).
 * Canonical names keep diacritics; aliases include diacritic-stripped forms for matching.
 */

import type { TerritoryRecord } from './types.js';

const VN: TerritoryRecord['countryCode'] = 'VN';

function t(
  partial: Omit<TerritoryRecord, 'countryCode' | 'active' | 'aliases'> & {
    aliases?: string[];
    active?: boolean;
  },
): TerritoryRecord {
  return {
    countryCode: VN,
    active: partial.active !== false,
    aliases: partial.aliases ?? [],
    ...partial,
  };
}

export const VN_TERRITORIES: TerritoryRecord[] = [
  t({
    id: 'vn',
    kind: 'country',
    parentId: null,
    name: 'Việt Nam',
    nameEn: 'Vietnam',
    regionCode: null,
    priorityGroup: 99,
    aliases: ['vietnam', 'viet nam', 'vn', 'viet nam'],
  }),

  // Priority 1 — Ho Chi Minh City
  t({
    id: 'vn-hcm',
    kind: 'municipality',
    parentId: 'vn',
    name: 'Thành phố Hồ Chí Minh',
    nameEn: 'Ho Chi Minh City',
    regionCode: 'SG',
    priorityGroup: 1,
    aliases: ['ho chi minh', 'ho chi minh city', 'hcm', 'hcmc', 'saigon', 'sai gon', 'tp ho chi minh', 'thanh pho ho chi minh'],
    bbox: [106.3, 10.3, 107.1, 11.2],
    defaultRadiusM: 20000,
  }),
  t({
    id: 'vn-hcm-quan-1',
    kind: 'district',
    parentId: 'vn-hcm',
    name: 'Quận 1',
    nameEn: 'District 1',
    regionCode: 'SG',
    priorityGroup: 1,
    aliases: ['quan 1', 'district 1', 'q1'],
  }),
  t({
    id: 'vn-hcm-quan-3',
    kind: 'district',
    parentId: 'vn-hcm',
    name: 'Quận 3',
    nameEn: 'District 3',
    regionCode: 'SG',
    priorityGroup: 1,
    aliases: ['quan 3', 'district 3', 'q3'],
  }),
  t({
    id: 'vn-hcm-binh-thanh',
    kind: 'district',
    parentId: 'vn-hcm',
    name: 'Bình Thạnh',
    nameEn: 'Binh Thanh',
    regionCode: 'SG',
    priorityGroup: 1,
    aliases: ['binh thanh', 'binhthanh'],
  }),
  t({
    id: 'vn-hcm-thu-duc',
    kind: 'district',
    parentId: 'vn-hcm',
    name: 'Thành phố Thủ Đức',
    nameEn: 'Thu Duc City',
    regionCode: 'SG',
    priorityGroup: 1,
    aliases: ['thu duc', 'thuduc', 'tp thu duc'],
  }),

  // Priority 2 — Hanoi
  t({
    id: 'vn-hn',
    kind: 'municipality',
    parentId: 'vn',
    name: 'Hà Nội',
    nameEn: 'Hanoi',
    regionCode: 'HN',
    priorityGroup: 2,
    aliases: ['ha noi', 'hanoi', 'hn'],
    bbox: [105.6, 20.8, 106.1, 21.2],
    defaultRadiusM: 20000,
  }),
  t({
    id: 'vn-hn-hoan-kiem',
    kind: 'district',
    parentId: 'vn-hn',
    name: 'Hoàn Kiếm',
    nameEn: 'Hoan Kiem',
    regionCode: 'HN',
    priorityGroup: 2,
    aliases: ['hoan kiem', 'hoankiem'],
  }),
  t({
    id: 'vn-hn-cau-giay',
    kind: 'district',
    parentId: 'vn-hn',
    name: 'Cầu Giấy',
    nameEn: 'Cau Giay',
    regionCode: 'HN',
    priorityGroup: 2,
    aliases: ['cau giay', 'caugiay'],
  }),

  // Priority 3–5
  t({
    id: 'vn-dn',
    kind: 'municipality',
    parentId: 'vn',
    name: 'Đà Nẵng',
    nameEn: 'Da Nang',
    regionCode: 'DN',
    priorityGroup: 3,
    aliases: ['da nang', 'danang', 'dn'],
    bbox: [108.1, 15.9, 108.3, 16.2],
    defaultRadiusM: 15000,
  }),
  t({
    id: 'vn-hp',
    kind: 'municipality',
    parentId: 'vn',
    name: 'Hải Phòng',
    nameEn: 'Hai Phong',
    regionCode: 'HP',
    priorityGroup: 4,
    aliases: ['hai phong', 'haiphong', 'hp'],
  }),
  t({
    id: 'vn-ct',
    kind: 'municipality',
    parentId: 'vn',
    name: 'Cần Thơ',
    nameEn: 'Can Tho',
    regionCode: 'CT',
    priorityGroup: 5,
    aliases: ['can tho', 'cantho', 'ct'],
  }),

  // Priority 6 — provincial capitals (configured sample)
  t({ id: 'vn-hue', kind: 'city', parentId: 'vn', name: 'Huế', nameEn: 'Hue', regionCode: 'TTH', priorityGroup: 6, aliases: ['hue', 'thua thien hue'] }),
  t({ id: 'vn-nha-trang', kind: 'city', parentId: 'vn', name: 'Nha Trang', nameEn: 'Nha Trang', regionCode: 'KH', priorityGroup: 6, aliases: ['nha trang', 'nhatrang'] }),
  t({ id: 'vn-vung-tau', kind: 'city', parentId: 'vn', name: 'Vũng Tàu', nameEn: 'Vung Tau', regionCode: 'BRVT', priorityGroup: 6, aliases: ['vung tau', 'vungtau'] }),
  t({ id: 'vn-da-lat', kind: 'city', parentId: 'vn', name: 'Đà Lạt', nameEn: 'Da Lat', regionCode: 'LD', priorityGroup: 6, aliases: ['da lat', 'dalat'] }),
  t({ id: 'vn-hai-duong', kind: 'city', parentId: 'vn', name: 'Hải Dương', nameEn: 'Hai Duong', regionCode: 'HD', priorityGroup: 6, aliases: ['hai duong', 'haiduong'] }),
  t({ id: 'vn-nam-dinh', kind: 'city', parentId: 'vn', name: 'Nam Định', nameEn: 'Nam Dinh', regionCode: 'ND', priorityGroup: 6, aliases: ['nam dinh', 'namdinh'] }),
  t({ id: 'vn-vinh', kind: 'city', parentId: 'vn', name: 'Vinh', nameEn: 'Vinh', regionCode: 'NA', priorityGroup: 6, aliases: ['vinh', 'nghe an'] }),
  t({ id: 'vn-buon-ma-thuot', kind: 'city', parentId: 'vn', name: 'Buôn Ma Thuột', nameEn: 'Buon Ma Thuot', regionCode: 'DL', priorityGroup: 6, aliases: ['buon ma thuot', 'buonmethuot'] }),

  // Priority 7 — SME / export clusters (configured)
  t({
    id: 'vn-hcm-sme-export-binh-tan',
    kind: 'sme_cluster',
    parentId: 'vn-hcm',
    name: 'Bình Tân SME / Export Cluster',
    nameEn: 'Binh Tan SME Export Cluster',
    regionCode: 'SG',
    priorityGroup: 7,
    aliases: ['binh tan', 'binhtan', 'binh tan sme'],
  }),
  t({
    id: 'vn-hn-sme-export-cau-giay',
    kind: 'sme_cluster',
    parentId: 'vn-hn',
    name: 'Cầu Giấy SME Cluster',
    nameEn: 'Cau Giay SME Cluster',
    regionCode: 'HN',
    priorityGroup: 7,
    aliases: ['cau giay sme', 'caugiay sme'],
  }),
];
