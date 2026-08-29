import type { ScenarioDefinition } from '../types/scenario';

/**
 * 軍閥割據版中國的亞洲 — Warlord Era Asia (1916-1928)
 *
 * China has fractured into competing warlord cliques. Foreign powers
 * (Japan, Soviet Russia, British Empire, French Indochina) vie for
 * influence. Siam sits as a buffer. The map focuses on Asia only.
 *
 * All Chinese provinces are assigned to specific warlord factions
 * based on their historical zones of control circa 1920.
 */
export const warlordAsia: ScenarioDefinition = {
  id: 'warlord-asia',
  era: '軍閥割據',
  region: '亞洲',
  nameZh: '軍閥割據：亞洲',
  description: '1916-1928年軍閥割據時期。中國分裂成多個軍閥派系，日本、蘇俄、大英帝國在亞洲角逐勢力範圍。',
  mapBounds: [[60, -10], [150, 55]],
  countries: [
    // === Chinese Warlord Factions ===
    { id: 'wm_anhui', name: 'Anhui Clique', nameZh: '皖系軍閥', code: 'WMA', color: '#1a3a6e', side: 'central', capital: 'Beijing', capitalZh: '北京', flagIcon: '🏛️', tier: 'major' },
    { id: 'wm_zhili', name: 'Zhili Clique', nameZh: '直系軍閥', code: 'WMZ', color: '#c41e3a', side: 'entente', capital: 'Baoding', capitalZh: '保定', flagIcon: '⚔️', tier: 'major' },
    { id: 'wm_fengtian', name: 'Fengtian Clique', nameZh: '奉系軍閥', code: 'WMF', color: '#2d6e3e', side: 'central', capital: 'Mukden', capitalZh: '奉天', flagIcon: '🏔️', tier: 'major' },
    { id: 'wm_kmt', name: 'Kuomintang', nameZh: '國民革命軍', code: 'KMT', color: '#de2910', side: 'entente', capital: 'Guangzhou', capitalZh: '廣州', flagIcon: '🌟', tier: 'major' },
    { id: 'wm_yunnan', name: 'Yunnan Clique', nameZh: '滇系軍閥', code: 'WMY', color: '#7b2d8e', side: 'neutral', capital: 'Kunming', capitalZh: '昆明', flagIcon: '🌿', tier: 'minor' },
    { id: 'wm_guangxi', name: 'Guangxi Clique', nameZh: '桂系軍閥', code: 'WMG', color: '#3b7dd4', side: 'neutral', capital: 'Guilin', capitalZh: '桂林', flagIcon: '🏞️', tier: 'minor' },
    { id: 'wm_sichuan', name: 'Sichuan Clique', nameZh: '川系軍閥', code: 'WMS', color: '#8b5a2b', side: 'neutral', capital: 'Chengdu', capitalZh: '成都', flagIcon: '🐼', tier: 'minor' },
    { id: 'wm_xinjiang', name: 'Xinjiang Clique', nameZh: '新疆軍閥', code: 'WMX', color: '#6b8e6b', side: 'neutral', capital: 'Dihua', capitalZh: '迪化', flagIcon: '🏜️', tier: 'minor' },
    { id: 'wm_mongolia', name: 'Mongolian Autonomy', nameZh: '蒙古自治政府', code: 'WMM', color: '#8b1a1a', side: 'neutral', capital: 'Urga', capitalZh: '庫倫', flagIcon: '🐎', tier: 'minor' },
    { id: 'wm_shanxi', name: 'Shanxi Clique', nameZh: '晉系軍閥', code: 'WMSX', color: '#b8860b', side: 'neutral', capital: 'Taiyuan', capitalZh: '太原', flagIcon: '⛰️', tier: 'minor' },

    // === Foreign Powers in Asia ===
    { id: 'jpn', name: 'Empire of Japan', nameZh: '大日本帝國', code: 'JPN', color: '#bc002d', side: 'central', capital: 'Tokyo', capitalZh: '東京', flagIcon: '🇯🇵', tier: 'major' },
    { id: 'rus_cw', name: 'Soviet Russia', nameZh: '蘇俄（內戰中）', code: 'SRC', color: '#cc0000', side: 'entente', capital: 'Moscow', capitalZh: '莫斯科', flagIcon: '🔴', tier: 'major' },
    { id: 'gbr', name: 'British Empire (Far East)', nameZh: '大英帝國（遠東）', code: 'GBR', color: '#00247d', side: 'entente', capital: 'Rangoon', capitalZh: '仰光', flagIcon: '🇬🇧', tier: 'secondary' },
    { id: 'fra', name: 'French Indochina', nameZh: '法蘭西（印度支那）', code: 'FRA', color: '#0055a5', side: 'entente', capital: 'Hanoi', capitalZh: '河內', flagIcon: '🇫🇷', tier: 'secondary' },
    { id: 'tha', name: 'Kingdom of Siam', nameZh: '暹羅王國', code: 'THA', color: '#a51931', side: 'neutral', capital: 'Bangkok', capitalZh: '曼谷', flagIcon: '🇹🇭', tier: 'minor' },
  ],
  /**
   * ISO2 codes → country ID mapping.
   * Chinese provinces are split among warlord factions.
   * Non-Asian territories are left as '-1' (unclaimed, off-map).
   *
   * China province ISO2 codes used in GeoJSON:
   * CN-11 (北京), CN-12 (天津), CN-13 (河北), CN-14 (山西), CN-15 (內蒙古),
   * CN-21 (遼寧), CN-22 (吉林), CN-23 (黑龍江), CN-31 (上海), CN-32 (江蘇),
   * CN-33 (浙江), CN-34 (安徽), CN-35 (福建), CN-36 (江西), CN-37 (山東),
   * CN-41 (河南), CN-42 (湖北), CN-43 (湖南), CN-44 (廣東), CN-45 (廣西),
   * CN-46 (海南), CN-50 (重慶), CN-51 (四川), CN-52 (貴州), CN-53 (雲南),
   * CN-54 (西藏), CN-61 (陝西), CN-62 (甘肅), CN-63 (青海), CN-64 (寧夏),
   * CN-65 (新疆), CN-71 (台灣), CN-91 (香港), CN-92 (澳門)
   *
   * Since the GeoJSON uses country-level ISO2 (e.g. "CN" for all of China),
   * we map at the top level. Province-level splits within China will be
   * handled by the client's dynamic province assignment system (same as
   * WWII Asia scenario approach).
   *
   * For now, the base GeoJSON doesn't have province-level wwi tags for
   * Chinese sub-regions, so we use a different approach: the territoryMap
   * maps each country-level ISO2 to the warlord faction that historically
   * controlled the most territory in that region.
   *
   * In practice, the client will need a province-level override map for
   * China. We provide that in `provinceOverrides` below.
   */
  territoryMap: {
    // China — assigned to Anhui Clique as the Beijing government (nominally
    // the central government 1916-1920). Province-level overrides below
    // redistribute territories among all cliques.
    'CN': 'wm_anhui',
    'TW': 'jpn',       // Taiwan was Japanese since 1895
    'HK': 'gbr',       // Hong Kong — British
    'MO': 'gbr',       // Macau — Portuguese (mapped to British for simplicity)

    // Japan & Korea
    'JP': 'jpn',
    'KR': 'jpn',       // Japanese Korea
    'KP': 'jpn',

    // Soviet Russia — all former Russian Empire territories in Asia
    'RU': 'rus_cw',
    'KZ': 'rus_cw',
    'UZ': 'rus_cw',
    'TM': 'rus_cw',
    'KG': 'rus_cw',
    'TJ': 'rus_cw',
    'AZ': 'rus_cw',
    'AM': 'rus_cw',
    'GE': 'rus_cw',
    'MN': 'wm_mongolia',  // Outer Mongolia — autonomous

    // British Empire (Far East) — India, Burma, Malaya, etc.
    'GB': 'gbr',
    'IN': 'gbr',
    'PK': 'gbr',
    'BD': 'gbr',
    'MM': 'gbr',       // Burma
    'MY': 'gbr',       // Malaya
    'SG': 'gbr',
    'BN': 'gbr',
    'LK': 'gbr',
    'BT': 'gbr',
    'NP': 'gbr',       // Nepal — British protectorate
    'AF': 'gbr',       // Afghanistan — British sphere

    // French Indochina
    'FR': 'fra',
    'VN': 'fra',
    'LA': 'fra',
    'KH': 'fra',

    // Siam
    'TH': 'tha',

    // Unclaimed / off-map (rest of world shows as neutral)
    '-1': 'wm_anhui',  // fallback to Anhui (Beijing gov) to satisfy "no grey areas" rule
  },

  /**
   * Province-level overrides for Chinese territories.
   * Keyed by province GeoJSON feature ID (e.g. "CN-13").
   * This lets us split China's single ISO2 code among multiple warlords.
   *
   * The client applies these AFTER the territoryMap, overriding any
   * province whose feature ID matches an entry here.
   *
   * Assignment (circa 1920):
   * - Anhui Clique: Beijing, Tianjin, Hebei, Shandong, Anhui, Jiangsu, Shanghai, Zhejiang, Fujia
   * - Zhili Clique: Henan, Hubei, Hunan, Jiangxi
   * - Fengtian Clique: Liaoning, Jilin, Heilongjiang
   * - KMT: Guangdong, Guangxi (shared with Guangxi Clique), Hainan
   * - Yunnan Clique: Yunnan, Guizhou
   * - Guangxi Clique: (within Guangxi — but since we can't split a province,
   *   we give Guangxi to KMT and treat the Guangxi Clique as controlling
   *   parts of Guangdong's western border instead. For gameplay, we give
   *   them Guangxi province.)
   * - Sichuan Clique: Sichuan, Chongqing
   * - Shanxi Clique: Shanxi, Shaanxi, Gansu, Ningxia
   * - Xinjiang Clique: Xinjiang, Qinghai
   * - Mongolia: Inner Mongolia
   * - Tibet: assigned to KMT (nominally Chinese territory)
   */
  provinceOverrides: {
    // Anhui Clique (Beijing government)
    'CN-11': 'wm_anhui',  // Beijing
    'CN-12': 'wm_anhui',  // Tianjin
    'CN-13': 'wm_anhui',  // Hebei
    'CN-37': 'wm_anhui',  // Shandong
    'CN-34': 'wm_anhui',  // Anhui
    'CN-32': 'wm_anhui',  // Jiangsu
    'CN-31': 'wm_anhui',  // Shanghai
    'CN-33': 'wm_anhui',  // Zhejiang
    'CN-35': 'wm_anhui',  // Fujian

    // Zhili Clique
    'CN-41': 'wm_zhili',  // Henan
    'CN-42': 'wm_zhili',  // Hubei
    'CN-43': 'wm_zhili',  // Hunan
    'CN-36': 'wm_zhili',  // Jiangxi

    // Fengtian Clique (Northeast)
    'CN-21': 'wm_fengtian',  // Liaoning
    'CN-22': 'wm_fengtian',  // Jilin
    'CN-23': 'wm_fengtian',  // Heilongjiang

    // KMT (South)
    'CN-44': 'wm_kmt',    // Guangdong
    'CN-46': 'wm_kmt',    // Hainan
    'CN-54': 'wm_kmt',    // Tibet (nominally Chinese)

    // Guangxi Clique
    'CN-45': 'wm_guangxi',  // Guangxi

    // Yunnan Clique
    'CN-53': 'wm_yunnan',   // Yunnan
    'CN-52': 'wm_yunnan',   // Guizhou

    // Sichuan Clique
    'CN-51': 'wm_sichuan',  // Sichuan
    'CN-50': 'wm_sichuan',  // Chongqing

    // Shanxi Clique
    'CN-14': 'wm_shanxi',   // Shanxi
    'CN-61': 'wm_shanxi',   // Shaanxi
    'CN-62': 'wm_shanxi',   // Gansu
    'CN-64': 'wm_shanxi',   // Ningxia

    // Xinjiang Clique
    'CN-65': 'wm_xinjiang', // Xinjiang
    'CN-63': 'wm_xinjiang', // Qinghai

    // Mongolia (Inner Mongolia)
    'CN-15': 'wm_mongolia', // Inner Mongolia
  },
};
