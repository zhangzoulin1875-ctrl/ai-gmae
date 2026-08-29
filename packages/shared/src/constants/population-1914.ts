/**
 * Historical population estimates for ~1914, keyed by WWI_COUNTRIES id.
 * Sources: commonly-cited historical demographics (Wikipedia / Maddison Project).
 * These represent the population of the territory actually controlled
 * by each country in this game's 1914 setup (i.e. the provinces assigned
 * to each country id in provinces-1914.geojson), NOT necessarily the
 * full historical empire's global extent.
 */
export const POPULATION_1914: Record<string, number> = {
  // Central Powers
  deu: 67000000,    // German Empire
  aut: 51500000,    // Austria-Hungary
  tur: 21000000,    // Ottoman Empire (core territories)
  bgr: 4900000,     // Bulgaria

  // Triple Entente & Main Allies
  gbr: 46000000,    // United Kingdom (metropole; dominions/colonies counted separately)
  fra: 39600000,    // France (metropole)
  rus: 178000000,   // Russian Empire (full)
  ita: 35000000,    // Italy
  usa: 99000000,    // USA
  jpn: 53000000,    // Japan (incl. Korea, Taiwan)

  // Co-belligerents & Allied Powers
  srb: 4500000,     // Serbia
  bel: 7500000,     // Belgium
  rou: 7500000,     // Romania
  grc: 4800000,     // Greece
  mne: 250000,      // Montenegro
  can: 8000000,     // Canada
  aus: 4900000,     // Australia
  nzl: 1100000,     // New Zealand
  zaf: 6500000,     // South Africa
  ind: 315000000,   // British Raj (India)
  prt: 6000000,     // Portugal
  chn: 430000000,   // China (Republic of China / Qing successor)
  tha: 8500000,     // Siam
  bra: 24000000,    // Brazil
  cub: 2800000,     // Cuba
  hti: 2200000,     // Haiti
  lbr: 1500000,     // Liberia
  pan: 400000,      // Panama
  cri: 450000,      // Costa Rica
  gtm: 2400000,     // Guatemala
  hnd: 700000,      // Honduras
  nic: 700000,      // Nicaragua
  per: 5000000,     // Peru
  ury: 1300000,     // Uruguay
  sau: 2000000,     // Hejaz (Arabian peninsula)
  egy: 12000000,    // Egypt

  // Neutral Nations
  esp: 20000000,    // Spain
  nld: 6300000,     // Netherlands
  swe: 5600000,     // Sweden
  nor: 2400000,     // Norway
  dnk: 2900000,     // Denmark
  che: 3900000,     // Switzerland
  alb: 800000,      // Albania
  irn: 10000000,    // Persia
  nej: 500000,      // Nejd
  eth: 10000000,    // Ethiopia
  arg: 8000000,     // Argentina
  chl: 3500000,     // Chile
  mex: 15000000,    // Mexico
  col: 5500000,     // Colombia
  ven: 2800000,     // Venezuela
  bol: 2200000,     // Bolivia
  pry: 900000,      // Paraguay
  afg: 5500000,     // Afghanistan
};
