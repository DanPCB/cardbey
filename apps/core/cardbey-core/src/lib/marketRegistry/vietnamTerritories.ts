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

  // Priority 3–5 municipalities
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
  t({ id: 'vn-dn-hai-chau', kind: 'district', parentId: 'vn-dn', name: 'Hải Châu', nameEn: 'Hai Chau', regionCode: 'DN', priorityGroup: 3, aliases: ['hai chau'] }),
  t({ id: 'vn-dn-thanh-khe', kind: 'district', parentId: 'vn-dn', name: 'Thanh Khê', nameEn: 'Thanh Khe', regionCode: 'DN', priorityGroup: 3, aliases: ['thanh khe'] }),
  t({ id: 'vn-dn-son-tra', kind: 'district', parentId: 'vn-dn', name: 'Sơn Trà', nameEn: 'Son Tra', regionCode: 'DN', priorityGroup: 3, aliases: ['son tra'] }),
  t({ id: 'vn-dn-ngu-hanh-son', kind: 'district', parentId: 'vn-dn', name: 'Ngũ Hành Sơn', nameEn: 'Ngu Hanh Son', regionCode: 'DN', priorityGroup: 3, aliases: ['ngu hanh son'] }),
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
  t({ id: 'vn-hp-hong-bang', kind: 'district', parentId: 'vn-hp', name: 'Hồng Bàng', nameEn: 'Hong Bang', regionCode: 'HP', priorityGroup: 4, aliases: ['hong bang'] }),
  t({ id: 'vn-hp-le-chan', kind: 'district', parentId: 'vn-hp', name: 'Lê Chân', nameEn: 'Le Chan', regionCode: 'HP', priorityGroup: 4, aliases: ['le chan'] }),
  t({ id: 'vn-hp-ngo-quyen', kind: 'district', parentId: 'vn-hp', name: 'Ngô Quyền', nameEn: 'Ngo Quyen', regionCode: 'HP', priorityGroup: 4, aliases: ['ngo quyen'] }),
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
  t({ id: 'vn-ct-ninh-kieu', kind: 'district', parentId: 'vn-ct', name: 'Ninh Kiều', nameEn: 'Ninh Kieu', regionCode: 'CT', priorityGroup: 5, aliases: ['ninh kieu'] }),
  t({ id: 'vn-ct-binh-thuy', kind: 'district', parentId: 'vn-ct', name: 'Bình Thủy', nameEn: 'Binh Thuy', regionCode: 'CT', priorityGroup: 5, aliases: ['binh thuy'] }),

  // Priority 2 Hanoi districts (extend)
  t({ id: 'vn-hn-ba-dinh', kind: 'district', parentId: 'vn-hn', name: 'Ba Đình', nameEn: 'Ba Dinh', regionCode: 'HN', priorityGroup: 2, aliases: ['ba dinh'] }),
  t({ id: 'vn-hn-dong-da', kind: 'district', parentId: 'vn-hn', name: 'Đống Đa', nameEn: 'Dong Da', regionCode: 'HN', priorityGroup: 2, aliases: ['dong da'] }),
  t({ id: 'vn-hn-hai-ba-trung', kind: 'district', parentId: 'vn-hn', name: 'Hai Bà Trưng', nameEn: 'Hai Ba Trung', regionCode: 'HN', priorityGroup: 2, aliases: ['hai ba trung'] }),
  t({ id: 'vn-hn-tay-ho', kind: 'district', parentId: 'vn-hn', name: 'Tây Hồ', nameEn: 'Tay Ho', regionCode: 'HN', priorityGroup: 2, aliases: ['tay ho'] }),

  // Priority 1 HCMC districts (extend)
  t({ id: 'vn-hcm-quan-4', kind: 'district', parentId: 'vn-hcm', name: 'Quận 4', nameEn: 'District 4', regionCode: 'SG', priorityGroup: 1, aliases: ['quan 4', 'district 4', 'q4'] }),
  t({ id: 'vn-hcm-quan-5', kind: 'district', parentId: 'vn-hcm', name: 'Quận 5', nameEn: 'District 5', regionCode: 'SG', priorityGroup: 1, aliases: ['quan 5', 'district 5', 'q5'] }),
  t({ id: 'vn-hcm-quan-7', kind: 'district', parentId: 'vn-hcm', name: 'Quận 7', nameEn: 'District 7', regionCode: 'SG', priorityGroup: 1, aliases: ['quan 7', 'district 7', 'q7'] }),
  t({ id: 'vn-hcm-quan-10', kind: 'district', parentId: 'vn-hcm', name: 'Quận 10', nameEn: 'District 10', regionCode: 'SG', priorityGroup: 1, aliases: ['quan 10', 'district 10', 'q10'] }),
  t({ id: 'vn-hcm-phu-nhuan', kind: 'district', parentId: 'vn-hcm', name: 'Phú Nhuận', nameEn: 'Phu Nhuan', regionCode: 'SG', priorityGroup: 1, aliases: ['phu nhuan'] }),

  // Priority 6 — major cities
  t({ id: 'vn-hue', kind: 'city', parentId: 'vn', name: 'Huế', nameEn: 'Hue', regionCode: 'TTH', priorityGroup: 6, aliases: ['hue', 'thua thien hue'] }),
  t({ id: 'vn-nha-trang', kind: 'city', parentId: 'vn', name: 'Nha Trang', nameEn: 'Nha Trang', regionCode: 'KH', priorityGroup: 6, aliases: ['nha trang', 'nhatrang'] }),
  t({ id: 'vn-vung-tau', kind: 'city', parentId: 'vn', name: 'Vũng Tàu', nameEn: 'Vung Tau', regionCode: 'BRVT', priorityGroup: 6, aliases: ['vung tau', 'vungtau'] }),
  t({ id: 'vn-da-lat', kind: 'city', parentId: 'vn', name: 'Đà Lạt', nameEn: 'Da Lat', regionCode: 'LD', priorityGroup: 6, aliases: ['da lat', 'dalat'] }),
  t({ id: 'vn-hai-duong', kind: 'city', parentId: 'vn', name: 'Hải Dương', nameEn: 'Hai Duong', regionCode: 'HD', priorityGroup: 6, aliases: ['hai duong', 'haiduong'] }),
  t({ id: 'vn-nam-dinh', kind: 'city', parentId: 'vn', name: 'Nam Định', nameEn: 'Nam Dinh', regionCode: 'ND', priorityGroup: 6, aliases: ['nam dinh', 'namdinh'] }),
  t({ id: 'vn-vinh', kind: 'city', parentId: 'vn', name: 'Vinh', nameEn: 'Vinh', regionCode: 'NA', priorityGroup: 6, aliases: ['vinh', 'nghe an'] }),
  t({ id: 'vn-buon-ma-thuot', kind: 'city', parentId: 'vn', name: 'Buôn Ma Thuột', nameEn: 'Buon Ma Thuot', regionCode: 'DL', priorityGroup: 6, aliases: ['buon ma thuot', 'buonmethuot'] }),

  // Priority 8 — provinces (configured nationwide list; discovery still bounded per job)
  t({ id: 'vn-prov-bac-ninh', kind: 'province', parentId: 'vn', name: 'Bắc Ninh', nameEn: 'Bac Ninh', regionCode: 'BN', priorityGroup: 8, aliases: ['bac ninh'] }),
  t({ id: 'vn-prov-bac-giang', kind: 'province', parentId: 'vn', name: 'Bắc Giang', nameEn: 'Bac Giang', regionCode: 'BG', priorityGroup: 8, aliases: ['bac giang'] }),
  t({ id: 'vn-prov-ha-nam', kind: 'province', parentId: 'vn', name: 'Hà Nam', nameEn: 'Ha Nam', regionCode: 'HM', priorityGroup: 8, aliases: ['ha nam'] }),
  t({ id: 'vn-prov-hai-duong', kind: 'province', parentId: 'vn', name: 'Hải Dương', nameEn: 'Hai Duong Province', regionCode: 'HD', priorityGroup: 8, aliases: ['hai duong province'] }),
  t({ id: 'vn-prov-hung-yen', kind: 'province', parentId: 'vn', name: 'Hưng Yên', nameEn: 'Hung Yen', regionCode: 'HY', priorityGroup: 8, aliases: ['hung yen'] }),
  t({ id: 'vn-prov-nam-dinh', kind: 'province', parentId: 'vn', name: 'Nam Định', nameEn: 'Nam Dinh Province', regionCode: 'ND', priorityGroup: 8, aliases: ['nam dinh province'] }),
  t({ id: 'vn-prov-ninh-binh', kind: 'province', parentId: 'vn', name: 'Ninh Bình', nameEn: 'Ninh Binh', regionCode: 'NB', priorityGroup: 8, aliases: ['ninh binh'] }),
  t({ id: 'vn-prov-phu-tho', kind: 'province', parentId: 'vn', name: 'Phú Thọ', nameEn: 'Phu Tho', regionCode: 'PT', priorityGroup: 8, aliases: ['phu tho'] }),
  t({ id: 'vn-prov-quang-ninh', kind: 'province', parentId: 'vn', name: 'Quảng Ninh', nameEn: 'Quang Ninh', regionCode: 'QN', priorityGroup: 8, aliases: ['quang ninh'] }),
  t({ id: 'vn-prov-thai-binh', kind: 'province', parentId: 'vn', name: 'Thái Bình', nameEn: 'Thai Binh', regionCode: 'TB', priorityGroup: 8, aliases: ['thai binh'] }),
  t({ id: 'vn-prov-vinh-phuc', kind: 'province', parentId: 'vn', name: 'Vĩnh Phúc', nameEn: 'Vinh Phuc', regionCode: 'VP', priorityGroup: 8, aliases: ['vinh phuc'] }),
  t({ id: 'vn-prov-thanh-hoa', kind: 'province', parentId: 'vn', name: 'Thanh Hóa', nameEn: 'Thanh Hoa', regionCode: 'TH', priorityGroup: 8, aliases: ['thanh hoa'] }),
  t({ id: 'vn-prov-nghe-an', kind: 'province', parentId: 'vn', name: 'Nghệ An', nameEn: 'Nghe An', regionCode: 'NA', priorityGroup: 8, aliases: ['nghe an'] }),
  t({ id: 'vn-prov-ha-tinh', kind: 'province', parentId: 'vn', name: 'Hà Tĩnh', nameEn: 'Ha Tinh', regionCode: 'HT', priorityGroup: 8, aliases: ['ha tinh'] }),
  t({ id: 'vn-prov-quang-binh', kind: 'province', parentId: 'vn', name: 'Quảng Bình', nameEn: 'Quang Binh', regionCode: 'QB', priorityGroup: 8, aliases: ['quang binh'] }),
  t({ id: 'vn-prov-quang-tri', kind: 'province', parentId: 'vn', name: 'Quảng Trị', nameEn: 'Quang Tri', regionCode: 'QT', priorityGroup: 8, aliases: ['quang tri'] }),
  t({ id: 'vn-prov-thua-thien-hue', kind: 'province', parentId: 'vn', name: 'Thừa Thiên-Huế', nameEn: 'Thua Thien Hue', regionCode: 'TTH', priorityGroup: 8, aliases: ['thua thien hue'] }),
  t({ id: 'vn-prov-quang-nam', kind: 'province', parentId: 'vn', name: 'Quảng Nam', nameEn: 'Quang Nam', regionCode: 'QNa', priorityGroup: 8, aliases: ['quang nam'] }),
  t({ id: 'vn-prov-quang-ngai', kind: 'province', parentId: 'vn', name: 'Quảng Ngãi', nameEn: 'Quang Ngai', regionCode: 'QNg', priorityGroup: 8, aliases: ['quang ngai'] }),
  t({ id: 'vn-prov-binh-dinh', kind: 'province', parentId: 'vn', name: 'Bình Định', nameEn: 'Binh Dinh', regionCode: 'BD', priorityGroup: 8, aliases: ['binh dinh'] }),
  t({ id: 'vn-prov-khanh-hoa', kind: 'province', parentId: 'vn', name: 'Khánh Hòa', nameEn: 'Khanh Hoa', regionCode: 'KH', priorityGroup: 8, aliases: ['khanh hoa'] }),
  t({ id: 'vn-prov-lam-dong', kind: 'province', parentId: 'vn', name: 'Lâm Đồng', nameEn: 'Lam Dong', regionCode: 'LD', priorityGroup: 8, aliases: ['lam dong'] }),
  t({ id: 'vn-prov-dak-lak', kind: 'province', parentId: 'vn', name: 'Đắk Lắk', nameEn: 'Dak Lak', regionCode: 'DL', priorityGroup: 8, aliases: ['dak lak', 'daklak'] }),
  t({ id: 'vn-prov-gia-lai', kind: 'province', parentId: 'vn', name: 'Gia Lai', nameEn: 'Gia Lai', regionCode: 'GL', priorityGroup: 8, aliases: ['gia lai'] }),
  t({ id: 'vn-prov-dong-nai', kind: 'province', parentId: 'vn', name: 'Đồng Nai', nameEn: 'Dong Nai', regionCode: 'DN2', priorityGroup: 8, aliases: ['dong nai'] }),
  t({ id: 'vn-prov-binh-duong', kind: 'province', parentId: 'vn', name: 'Bình Dương', nameEn: 'Binh Duong', regionCode: 'BDu', priorityGroup: 8, aliases: ['binh duong'] }),
  t({ id: 'vn-prov-ba-ria-vung-tau', kind: 'province', parentId: 'vn', name: 'Bà Rịa-Vũng Tàu', nameEn: 'Ba Ria Vung Tau', regionCode: 'BRVT', priorityGroup: 8, aliases: ['ba ria vung tau'] }),
  t({ id: 'vn-prov-long-an', kind: 'province', parentId: 'vn', name: 'Long An', nameEn: 'Long An', regionCode: 'LA', priorityGroup: 8, aliases: ['long an'] }),
  t({ id: 'vn-prov-tien-giang', kind: 'province', parentId: 'vn', name: 'Tiền Giang', nameEn: 'Tien Giang', regionCode: 'TG', priorityGroup: 8, aliases: ['tien giang'] }),
  t({ id: 'vn-prov-an-giang', kind: 'province', parentId: 'vn', name: 'An Giang', nameEn: 'An Giang', regionCode: 'AG', priorityGroup: 8, aliases: ['an giang'] }),
  t({ id: 'vn-prov-kien-giang', kind: 'province', parentId: 'vn', name: 'Kiên Giang', nameEn: 'Kien Giang', regionCode: 'KG', priorityGroup: 8, aliases: ['kien giang'] }),
  t({ id: 'vn-prov-ca-mau', kind: 'province', parentId: 'vn', name: 'Cà Mau', nameEn: 'Ca Mau', regionCode: 'CM', priorityGroup: 8, aliases: ['ca mau'] }),
  t({ id: 'vn-prov-soc-trang', kind: 'province', parentId: 'vn', name: 'Sóc Trăng', nameEn: 'Soc Trang', regionCode: 'ST', priorityGroup: 8, aliases: ['soc trang'] }),
  t({ id: 'vn-prov-tay-ninh', kind: 'province', parentId: 'vn', name: 'Tây Ninh', nameEn: 'Tay Ninh', regionCode: 'TN', priorityGroup: 8, aliases: ['tay ninh'] }),
  t({ id: 'vn-prov-binh-phuoc', kind: 'province', parentId: 'vn', name: 'Bình Phước', nameEn: 'Binh Phuoc', regionCode: 'BP', priorityGroup: 8, aliases: ['binh phuoc'] }),
  t({ id: 'vn-prov-lao-cai', kind: 'province', parentId: 'vn', name: 'Lào Cai', nameEn: 'Lao Cai', regionCode: 'LC', priorityGroup: 8, aliases: ['lao cai'] }),
  t({ id: 'vn-prov-lang-son', kind: 'province', parentId: 'vn', name: 'Lạng Sơn', nameEn: 'Lang Son', regionCode: 'LS', priorityGroup: 8, aliases: ['lang son'] }),
  t({ id: 'vn-prov-thai-nguyen', kind: 'province', parentId: 'vn', name: 'Thái Nguyên', nameEn: 'Thai Nguyen', regionCode: 'TNg', priorityGroup: 8, aliases: ['thai nguyen'] }),
  t({ id: 'vn-prov-son-la', kind: 'province', parentId: 'vn', name: 'Sơn La', nameEn: 'Son La', regionCode: 'SL', priorityGroup: 8, aliases: ['son la'] }),
  t({ id: 'vn-prov-hoa-binh', kind: 'province', parentId: 'vn', name: 'Hòa Bình', nameEn: 'Hoa Binh', regionCode: 'HB', priorityGroup: 8, aliases: ['hoa binh'] }),

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
