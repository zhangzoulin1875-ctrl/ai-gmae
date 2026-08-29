import type { ScenarioDefinition } from '../types/scenario';

/**
 * 軍閥割據版亞洲 — Warlord Era Asia (1916-1928)
 *
 * China has fractured into competing warlord cliques. Foreign powers
 * (Japan, Soviet Russia, British Empire, French Indochina) vie for
 * influence. Siam sits as a buffer. The map focuses on Asia only.
 *
 * Each Chinese province is assigned to a specific warlord faction
 * based on historical zones of control circa 1920.
 *
 * Uses a dedicated Asia-only GeoJSON (asia-warlord.geojson) with 624
 * features, stripped of all European / American / Middle Eastern /
 * Pacific territories — only East, Southeast, South, and Central Asia.
 */
export const warlordAsia: ScenarioDefinition = {
  id: 'warlord-asia',
  era: '軍閥割據',
  region: '亞洲',
  nameZh: '軍閥割據：亞洲',
  description: '1916-1928年軍閥割據時期。中國分裂成多個軍閥派系，日本、蘇俄、大英帝國在亞洲角逐勢力範圍。',
  mapBounds: [[60, -10], [150, 55]],
  geojsonUrl: '/maps/asia-warlord.geojson',
  countries: [
    // === Chinese Warlord Factions ===
    { id: 'wm_anhui', name: 'Anhui Clique', nameZh: '皖系軍閥', code: 'WMA', color: '#1a3a6e', side: 'central', capital: 'Beijing', capitalZh: '北京', flagIcon: '🏛️', tier: 'major' },
    { id: 'wm_zhili', name: 'Zhili Clique', nameZh: '直系軍閥', code: 'WMZ', color: '#c41e3a', side: 'entente', capital: 'Baoding', capitalZh: '保定', flagIcon: '⚔️', tier: 'major' },
    { id: 'wm_fengtian', name: 'Fengtian Clique', nameZh: '奉系軍閥', code: 'WMF', color: '#2d6e3e', side: 'central', capital: 'Mukden', capitalZh: '奉天', flagIcon: '🏔️', tier: 'major' },
    { id: 'wm_kmt', name: 'Kuomintang', nameZh: '國民革命軍', code: 'KMT', color: '#de2910', side: 'entente', capital: 'Guangzhou', capitalZh: '廣州', flagIcon: '🌟', tier: 'major' },
    { id: 'wm_yunnan', name: 'Yunnan Clique', nameZh: '滇系軍閥', code: 'WMY', color: '#7b2d8e', side: 'neutral', capital: 'Kunming', capitalZh: '昆明', flagIcon: '🌿', tier: 'minor' },
    { id: 'wm_guangxi', name: 'Guangxi Clique', nameZh: '桂系軍閥', code: 'WMG', color: '#3b7dd4', side: 'neutral', capital: 'Guilin', capitalZh: '桂林', flagIcon: '🏞️', tier: 'minor' },
    { id: 'wm_sichuan', name: 'Sichuan Clique', nameZh: '川系軍閥', code: 'WMS', color: '#8b5a2b', side: 'neutral', capital: 'Chengdu', capitalZh: '成都', flagIcon: '🐼', tier: 'minor' },
    { id: 'wm_shanxi', name: 'Shanxi Clique', nameZh: '晉系軍閥', code: 'WMSX', color: '#b8860b', side: 'neutral', capital: 'Taiyuan', capitalZh: '太原', flagIcon: '⛰️', tier: 'minor' },
    // Ma Clique — Muslim warlords controlling the Northwest (Gansu corridor, Ningxia, Qinghai)
    { id: 'wm_ma', name: 'Ma Clique', nameZh: '馬家軍', code: 'WMM', color: '#4a9e4a', side: 'neutral', capital: 'Lanzhou', capitalZh: '蘭州', flagIcon: '🕌', tier: 'minor' },
    // Xinjiang Clique — Yang Zengxin's isolated frontier regime
    { id: 'wm_xinjiang', name: 'Xinjiang Clique', nameZh: '新疆軍閥', code: 'WMX', color: '#6b8e6b', side: 'neutral', capital: 'Dihua', capitalZh: '迪化', flagIcon: '🏜️', tier: 'minor' },
    // Inner Mongolia — mixed Mongol/Chinese autonomy
    { id: 'wm_innermongolia', name: 'Inner Mongolia', nameZh: '內蒙古自治', code: 'WIM', color: '#8b1a1a', side: 'neutral', capital: 'Guihua', capitalZh: '歸綏', flagIcon: '🐎', tier: 'minor' },
    // Outer Mongolia — Bogd Khanate, de facto independent from 1911
    { id: 'wm_mongolia', name: 'Mongolia', nameZh: '蒙古自治政府', code: 'WMG', color: '#a0522d', side: 'neutral', capital: 'Urga', capitalZh: '庫倫', flagIcon: '🐴', tier: 'minor' },
    // Tibet — de facto independent 1912-1951
    { id: 'wm_tibet', name: 'Tibet', nameZh: '西藏', code: 'WMT', color: '#e8a020', side: 'neutral', capital: 'Lhasa', capitalZh: '拉薩', flagIcon: '🏔️', tier: 'minor' },

    // === Foreign Powers in Asia ===
    { id: 'jpn', name: 'Empire of Japan', nameZh: '大日本帝國', code: 'JPN', color: '#bc002d', side: 'central', capital: 'Tokyo', capitalZh: '東京', flagIcon: '🇯🇵', tier: 'major' },
    { id: 'rus_cw', name: 'Soviet Russia', nameZh: '蘇俄（內戰中）', code: 'SRC', color: '#cc0000', side: 'entente', capital: 'Moscow', capitalZh: '莫斯科', flagIcon: '🔴', tier: 'major' },
    { id: 'gbr', name: 'British Empire (Far East)', nameZh: '大英帝國（遠東）', code: 'GBR', color: '#00247d', side: 'entente', capital: 'Rangoon', capitalZh: '仰光', flagIcon: '🇬🇧', tier: 'secondary' },
    { id: 'fra', name: 'French Indochina', nameZh: '法蘭西（印度支那）', code: 'FRA', color: '#0055a5', side: 'entente', capital: 'Hanoi', capitalZh: '河內', flagIcon: '🇫🇷', tier: 'secondary' },
    { id: 'tha', name: 'Kingdom of Siam', nameZh: '暹羅王國', code: 'THA', color: '#a51931', side: 'neutral', capital: 'Bangkok', capitalZh: '曼谷', flagIcon: '🇹🇭', tier: 'minor' },
  ],
  /**
   * ISO2 codes → country ID mapping.
   * Chinese provinces are split among warlord factions via provinceOverrides.
   * Non-Asian territories are excluded (using a dedicated Asia-only GeoJSON).
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
    'KH': 'fra',       // Cambodia

    // French Indochina
    'FR': 'fra',
    'VN': 'fra',
    'LA': 'fra',

    // Siam
    'TH': 'tha',

    // Portuguese colonies in Asia
    'PT': 'gbr',       // Macau & Timor mapped to British for simplicity
  },

  /**
   * Province-level overrides for Chinese territories.
   * Keyed by province GeoJSON feature ID (from asia-warlord.geojson).
   *
   * Assignment (circa 1920):
   * - Anhui Clique (Duan Qirui): Beijing, Tianjin, Hebei, Shandong, Anhui, Jiangsu, Shanghai, Zhejiang, Fujian
   * - Zhili Clique (Wu Peifu): Henan, Hubei, Hunan, Jiangxi
   * - Fengtian Clique (Zhang Zuolin): Liaoning, Jilin, Heilongjiang
   * - KMT (Sun Yat-sen): Guangdong, Hainan
   * - Yunnan Clique (Tang Jiyao): Yunnan, Guizhou
   * - Guangxi Clique (Lu Rongting): Guangxi
   * - Sichuan Clique (various): Sichuan, Chongqing
   * - Shanxi Clique (Yan Xishan): Shanxi, Shaanxi
   * - Ma Clique (Ma Fuxing/Ma Qi): Gansu, Ningxia, Qinghai
   * - Xinjiang Clique (Yang Zengxin): Xinjiang
   * - Inner Mongolia: Inner Mongolia province
   * - Outer Mongolia: 22 Mongolian provinces
   * - Tibet: Xizang (de facto independent)
   */
  provinceOverrides: {
    // Anhui Clique (Beijing government, Duan Qirui)
    'CHN-1155': 'wm_anhui',  // Beijing
    'CHN-1816': 'wm_anhui',  // Tianjin
    'CHN-1811': 'wm_anhui',  // Hebei
    'CHN-1814': 'wm_anhui',  // Shandong
    'CN-20529': 'wm_anhui',  // Anhui
    'CHN-1818': 'wm_anhui',  // Jiangsu
    'CHN-1819': 'wm_anhui',  // Shanghai
    'CHN-1820': 'wm_anhui',  // Zhejiang
    'CHN-1178': 'wm_anhui',  // Fujian
    'CN-20226': 'wm_anhui',  // Paracel Islands (administered by Beijing gov)

    // Zhili Clique (Wu Peifu)
    'CHN-1812': 'wm_zhili',  // Henan
    'CHN-1807': 'wm_zhili',  // Hubei
    'CHN-1808': 'wm_zhili',  // Hunan
    'CHN-1817': 'wm_zhili',  // Jiangxi

    // Fengtian Clique (Zhang Zuolin, Northeast)
    'CHN-1813': 'wm_fengtian',  // Liaoning
    'CHN-1828': 'wm_fengtian',  // Jilin
    'CHN-1839': 'wm_fengtian',  // Heilongjiang

    // KMT (Sun Yat-sen, South)
    'CHN-1180': 'wm_kmt',    // Guangdong
    'CHN-1775': 'wm_kmt',    // Hainan

    // Guangxi Clique (Lu Rongting)
    'CHN-1152': 'wm_guangxi',  // Guangxi

    // Yunnan Clique (Tang Jiyao)
    'CHN-1810': 'wm_yunnan',   // Yunnan
    'CHN-1153': 'wm_yunnan',   // Guizhou

    // Sichuan Clique
    'CHN-1809': 'wm_sichuan',  // Sichuan
    'CHN-1154': 'wm_sichuan',  // Chongqing

    // Shanxi Clique (Yan Xishan)
    'CHN-1805': 'wm_shanxi',   // Shanxi
    'CHN-1804': 'wm_shanxi',   // Shaanxi

    // Ma Clique (Northwest Muslim warlords: Gansu, Ningxia, Qinghai)
    'CHN-1150': 'wm_ma',       // Gansu
    'CHN-1803': 'wm_ma',       // Ningxia
    'CHN-1151': 'wm_ma',       // Qinghai

    // Xinjiang Clique (Yang Zengxin)
    'CHN-1756': 'wm_xinjiang', // Xinjiang

    // Inner Mongolia autonomy
    'CHN-1838': 'wm_innermongolia', // Inner Mongolia

    // Outer Mongolia (Bogd Khanate, 22 aimags)
    'MNG-3208': 'wm_mongolia',  // Bayan-Ölgiy
    'MNG-3297': 'wm_mongolia',  // Dornogovi
    'MNG-3298': 'wm_mongolia',  // Ömnögovi
    'MNG-3315': 'wm_mongolia',  // Hentiy
    'MNG-3316': 'wm_mongolia',  // Arhangay
    'MNG-3317': 'wm_mongolia',  // Bayanhongor
    'MNG-3318': 'wm_mongolia',  // Dzavhan
    'MNG-3319': 'wm_mongolia',  // Govi-Altay
    'MNG-3320': 'wm_mongolia',  // Hovd
    'MNG-3321': 'wm_mongolia',  // Hövsgöl
    'MNG-3322': 'wm_mongolia',  // Uvs
    'MNG-3323': 'wm_mongolia',  // Bulgan
    'MNG-3324': 'wm_mongolia',  // Orhon
    'MNG-3325': 'wm_mongolia',  // Dundgovi
    'MNG-3326': 'wm_mongolia',  // Selenge
    'MNG-3327': 'wm_mongolia',  // Övörhangay
    'MNG-3328': 'wm_mongolia',  // Darhan-Uul
    'MNG-3329': 'wm_mongolia',  // Töv
    'MNG-3330': 'wm_mongolia',  // Govĭ-Sümber
    'MNG-3331': 'wm_mongolia',  // Ulaanbaatar
    'MNG-3332': 'wm_mongolia',  // Dornod
    'MNG-3333': 'wm_mongolia',  // Sühbaatar

    // Tibet (de facto independent 1912-1951)
    'CHN-1662': 'wm_tibet',     // Xizang
  },
};
