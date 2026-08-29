/**
 * ISO 3166-1 numeric -> alpha-3 mapping for the countries we need to
 * resolve against the world-atlas TopoJSON (which keys features by
 * numeric ISO code). Only includes countries relevant to WWI_COUNTRIES;
 * anything else on the map is rendered as unclaimed/neutral territory.
 */
export const ISO_NUMERIC_TO_ALPHA3: Record<string, string> = {
  '4': 'AFG', '8': 'ALB', '32': 'ARG', '36': 'AUS', '40': 'AUT',
  '56': 'BEL', '68': 'BOL', '76': 'BRA', '100': 'BGR', '124': 'CAN',
  '152': 'CHL', '156': 'CHN', '170': 'COL', '188': 'CRI', '192': 'CUB',
  '208': 'DNK', '231': 'ETH', '250': 'FRA', '276': 'DEU', '300': 'GRC',
  '320': 'GTM', '332': 'HTI', '340': 'HND', '356': 'IND', '364': 'IRN',
  '380': 'ITA', '392': 'JPN', '430': 'LBR', '484': 'MEX', '499': 'MNE',
  '528': 'NLD', '554': 'NZL', '558': 'NIC', '578': 'NOR', '600': 'PRY',
  '604': 'PER', '620': 'PRT', '642': 'ROU', '643': 'RUS', '682': 'SAU',
  '688': 'SRB', '710': 'ZAF', '724': 'ESP', '752': 'SWE', '756': 'CHE',
  '764': 'THA', '792': 'TUR', '818': 'EGY', '826': 'GBR', '840': 'USA',
  '858': 'URY', '862': 'VEN',
};
