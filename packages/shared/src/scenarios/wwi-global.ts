import type { ScenarioDefinition } from '../types/scenario';

export const wwiGlobal: ScenarioDefinition = {
  id: 'wwi-global',
  era: '一戰',
  region: '全球',
  nameZh: '一戰全球',
  description: '1914年第一次世界大戰,全球戰場。54個國家,殖民地歸宗主國。',
  mapBounds: [[-180, -60], [180, 80]],
  countries: [
    // Central Powers
    { id: 'deu', name: 'German Empire', nameZh: '德意志帝國', code: 'DEU', color: '#333333', side: 'central', capital: 'Berlin', capitalZh: '柏林', flagIcon: '🇩🇪', tier: 'major' },
    { id: 'aut', name: 'Austro-Hungarian Empire', nameZh: '奧匈帝國', code: 'AUT', color: '#c41e3a', side: 'central', capital: 'Vienna', capitalZh: '維也納', flagIcon: '🇦🇹', tier: 'major' },
    { id: 'tur', name: 'Ottoman Empire', nameZh: '奧斯曼帝國', code: 'TUR', color: '#e30a17', side: 'central', capital: 'Constantinople', capitalZh: '君士坦丁堡', flagIcon: '🇹🇷', tier: 'major' },
    { id: 'bgr', name: 'Kingdom of Bulgaria', nameZh: '保加利亞王國', code: 'BGR', color: '#00966e', side: 'central', capital: 'Sofia', capitalZh: '索非亞', flagIcon: '🇧🇬', tier: 'secondary' },
    // Entente
    { id: 'gbr', name: 'United Kingdom', nameZh: '大英帝國', code: 'GBR', color: '#00247d', side: 'entente', capital: 'London', capitalZh: '倫敦', flagIcon: '🇬🇧', tier: 'major' },
    { id: 'fra', name: 'French Republic', nameZh: '法蘭西共和國', code: 'FRA', color: '#0055a5', side: 'entente', capital: 'Paris', capitalZh: '巴黎', flagIcon: '🇫🇷', tier: 'major' },
    { id: 'rus', name: 'Russian Empire', nameZh: '俄羅斯帝國', code: 'RUS', color: '#0039a6', side: 'entente', capital: 'Petrograd', capitalZh: '彼得格勒', flagIcon: '🇷🇺', tier: 'major' },
    { id: 'ita', name: 'Kingdom of Italy', nameZh: '義大利王國', code: 'ITA', color: '#009246', side: 'entente', capital: 'Rome', capitalZh: '羅馬', flagIcon: '🇮🇹', tier: 'major' },
    { id: 'usa', name: 'United States', nameZh: '美利堅合眾國', code: 'USA', color: '#3c3b6e', side: 'entente', capital: 'Washington', capitalZh: '華盛頓', flagIcon: '🇺🇸', tier: 'major' },
    { id: 'jpn', name: 'Empire of Japan', nameZh: '大日本帝國', code: 'JPN', color: '#bc002d', side: 'entente', capital: 'Tokyo', capitalZh: '東京', flagIcon: '🇯🇵', tier: 'major' },
    { id: 'srb', name: 'Kingdom of Serbia', nameZh: '塞爾維亞王國', code: 'SRB', color: '#0c4076', side: 'allies', capital: 'Belgrade', capitalZh: '貝爾格勒', flagIcon: '🇷🇸', tier: 'secondary' },
    { id: 'bel', name: 'Kingdom of Belgium', nameZh: '比利時王國', code: 'BEL', color: '#ffd100', side: 'allies', capital: 'Brussels', capitalZh: '布魯塞爾', flagIcon: '🇧🇪', tier: 'secondary' },
    { id: 'rou', name: 'Kingdom of Romania', nameZh: '羅馬尼亞王國', code: 'ROU', color: '#002b7f', side: 'allies', capital: 'Bucharest', capitalZh: '布加勒斯特', flagIcon: '🇷🇴', tier: 'secondary' },
    { id: 'grc', name: 'Kingdom of Greece', nameZh: '希臘王國', code: 'GRC', color: '#0d5eaf', side: 'allies', capital: 'Athens', capitalZh: '雅典', flagIcon: '🇬🇷', tier: 'secondary' },
    { id: 'mne', name: 'Kingdom of Montenegro', nameZh: '蒙特內哥羅王國', code: 'MNE', color: '#c8102e', side: 'allies', capital: 'Cetinje', capitalZh: '采蒂涅', flagIcon: '🇲🇪', tier: 'minor' },
    { id: 'can', name: 'Dominion of Canada', nameZh: '加拿大自治領', code: 'CAN', color: '#ff0000', side: 'allies', capital: 'Ottawa', capitalZh: '渥太華', flagIcon: '🇨🇦', tier: 'secondary' },
    { id: 'aus', name: 'Commonwealth of Australia', nameZh: '澳大利亞聯邦', code: 'AUS', color: '#00008b', side: 'allies', capital: 'Melbourne', capitalZh: '墨爾本', flagIcon: '🇦🇺', tier: 'secondary' },
    { id: 'nzl', name: 'Dominion of New Zealand', nameZh: '紐西蘭自治領', code: 'NZL', color: '#00247d', side: 'allies', capital: 'Wellington', capitalZh: '威靈頓', flagIcon: '🇳🇿', tier: 'minor' },
    { id: 'zaf', name: 'Union of South Africa', nameZh: '南非聯邦', code: 'ZAF', color: '#007a3d', side: 'allies', capital: 'Pretoria', capitalZh: '普利托利亞', flagIcon: '🇿🇦', tier: 'secondary' },
    { id: 'ind', name: 'British Raj', nameZh: '英屬印度', code: 'IND', color: '#ff9933', side: 'allies', capital: 'Delhi', capitalZh: '德里', flagIcon: '🇮🇳', tier: 'secondary' },
    { id: 'prt', name: 'Kingdom of Portugal', nameZh: '葡萄牙王國', code: 'PRT', color: '#046a38', side: 'allies', capital: 'Lisbon', capitalZh: '里斯本', flagIcon: '🇵🇹', tier: 'secondary' },
    { id: 'chn', name: 'Republic of China', nameZh: '中華民國', code: 'CHN', color: '#de2910', side: 'allies', capital: 'Beijing', capitalZh: '北京', flagIcon: '🇨🇳', tier: 'secondary' },
    { id: 'tha', name: 'Kingdom of Siam', nameZh: '暹羅王國', code: 'THA', color: '#a51931', side: 'allies', capital: 'Bangkok', capitalZh: '曼谷', flagIcon: '🇹🇭', tier: 'secondary' },
    { id: 'cub', name: 'Republic of Cuba', nameZh: '古巴共和國', code: 'CUB', color: '#002a8f', side: 'allies', capital: 'Havana', capitalZh: '哈瓦那', flagIcon: '🇨🇺', tier: 'minor' },
    { id: 'hti', name: 'Republic of Haiti', nameZh: '海地共和國', code: 'HTI', color: '#d21034', side: 'neutral', capital: 'Port-au-Prince', capitalZh: '太子港', flagIcon: '🇭🇹', tier: 'minor' },
    { id: 'lbr', name: 'Republic of Liberia', nameZh: '賴比瑞亞共和國', code: 'LBR', color: '#002868', side: 'neutral', capital: 'Monrovia', capitalZh: '蒙羅維亞', flagIcon: '🇱🇷', tier: 'minor' },
    { id: 'pan', name: 'Republic of Panama', nameZh: '巴拿馬共和國', code: 'PAN', color: '#005eb8', side: 'neutral', capital: 'Panama City', capitalZh: '巴拿馬城', flagIcon: '🇵🇦', tier: 'minor' },
    { id: 'cri', name: 'Costa Rica', nameZh: '哥斯大黎加', code: 'CRI', color: '#002b7f', side: 'neutral', capital: 'San José', capitalZh: '聖荷西', flagIcon: '🇨🇷', tier: 'minor' },
    { id: 'gtm', name: 'Guatemala', nameZh: '瓜地馬拉', code: 'GTM', color: '#4997d0', side: 'neutral', capital: 'Guatemala City', capitalZh: '瓜地馬拉城', flagIcon: '🇬🇹', tier: 'minor' },
    { id: 'hnd', name: 'Honduras', nameZh: '宏都拉斯', code: 'HND', color: '#0073cf', side: 'neutral', capital: 'Tegucigalpa', capitalZh: '德古西加巴', flagIcon: '🇭🇳', tier: 'minor' },
    { id: 'nic', name: 'Nicaragua', nameZh: '尼加拉瓜', code: 'NIC', color: '#0067c9', side: 'neutral', capital: 'Managua', capitalZh: '馬納瓜', flagIcon: '🇳🇮', tier: 'minor' },
    { id: 'per', name: 'Republic of Peru', nameZh: '秘魯共和國', code: 'PER', color: '#d91023', side: 'neutral', capital: 'Lima', capitalZh: '利馬', flagIcon: '🇵🇪', tier: 'minor' },
    { id: 'ury', name: 'Uruguay', nameZh: '烏拉圭', code: 'URY', color: '#0038a8', side: 'neutral', capital: 'Montevideo', capitalZh: '蒙特維多', flagIcon: '🇺🇾', tier: 'minor' },
    { id: 'sau', name: 'Kingdom of Hejaz', nameZh: '漢志王國', code: 'SAU', color: '#006c35', side: 'neutral', capital: 'Mecca', capitalZh: '麥加', flagIcon: '🇸🇦', tier: 'minor' },
    { id: 'egy', name: 'Sultanate of Egypt', nameZh: '埃及蘇丹國', code: 'EGY', color: '#c80315', side: 'allies', capital: 'Cairo', capitalZh: '開羅', flagIcon: '🇪🇬', tier: 'secondary' },
    { id: 'esp', name: 'Kingdom of Spain', nameZh: '西班牙王國', code: 'ESP', color: '#aa151b', side: 'neutral', capital: 'Madrid', capitalZh: '馬德里', flagIcon: '🇪🇸', tier: 'secondary' },
    { id: 'nld', name: 'Netherlands', nameZh: '荷蘭王國', code: 'NLD', color: '#21468b', side: 'neutral', capital: 'Amsterdam', capitalZh: '阿姆斯特丹', flagIcon: '🇳🇱', tier: 'secondary' },
    { id: 'swe', name: 'Sweden', nameZh: '瑞典王國', code: 'SWE', color: '#006aa7', side: 'neutral', capital: 'Stockholm', capitalZh: '斯德哥爾摩', flagIcon: '🇸🇪', tier: 'secondary' },
    { id: 'nor', name: 'Norway', nameZh: '挪威王國', code: 'NOR', color: '#ba0c2f', side: 'neutral', capital: 'Oslo', capitalZh: '奧斯陸', flagIcon: '🇳🇴', tier: 'minor' },
    { id: 'dnk', name: 'Denmark', nameZh: '丹麥王國', code: 'DNK', color: '#c8102e', side: 'neutral', capital: 'Copenhagen', capitalZh: '哥本哈根', flagIcon: '🇩🇰', tier: 'minor' },
    { id: 'che', name: 'Switzerland', nameZh: '瑞士聯邦', code: 'CHE', color: '#d52b1e', side: 'neutral', capital: 'Bern', capitalZh: '伯恩', flagIcon: '🇨🇭', tier: 'minor' },
    { id: 'alb', name: 'Albania', nameZh: '阿爾巴尼亞', code: 'ALB', color: '#e41e20', side: 'neutral', capital: 'Tirana', capitalZh: '地拉那', flagIcon: '🇦🇱', tier: 'minor' },
    { id: 'irn', name: 'Persian Empire', nameZh: '波斯帝國', code: 'IRN', color: '#239f40', side: 'neutral', capital: 'Tehran', capitalZh: '德黑蘭', flagIcon: '🇮🇷', tier: 'secondary' },
    { id: 'eth', name: 'Ethiopian Empire', nameZh: '衣索比亞帝國', code: 'ETH', color: '#078930', side: 'neutral', capital: 'Addis Ababa', capitalZh: '阿迪斯阿貝巴', flagIcon: '🇪🇹', tier: 'secondary' },
    { id: 'arg', name: 'Argentina', nameZh: '阿根廷共和國', code: 'ARG', color: '#75aadb', side: 'neutral', capital: 'Buenos Aires', capitalZh: '布宜諾斯艾利斯', flagIcon: '🇦🇷', tier: 'secondary' },
    { id: 'chl', name: 'Chile', nameZh: '智利共和國', code: 'CHL', color: '#0039a6', side: 'neutral', capital: 'Santiago', capitalZh: '聖地亞哥', flagIcon: '🇨🇱', tier: 'secondary' },
    { id: 'mex', name: 'Mexico', nameZh: '墨西哥合眾國', code: 'MEX', color: '#006847', side: 'neutral', capital: 'Mexico City', capitalZh: '墨西哥城', flagIcon: '🇲🇽', tier: 'secondary' },
    { id: 'col', name: 'Colombia', nameZh: '哥倫比亞共和國', code: 'COL', color: '#fcd116', side: 'neutral', capital: 'Bogotá', capitalZh: '波哥大', flagIcon: '🇨🇴', tier: 'minor' },
    { id: 'ven', name: 'Venezuela', nameZh: '委內瑞拉', code: 'VEN', color: '#fcd116', side: 'neutral', capital: 'Caracas', capitalZh: '卡拉卡斯', flagIcon: '🇻🇪', tier: 'minor' },
    { id: 'bol', name: 'Bolivia', nameZh: '玻利維亞', code: 'BOL', color: '#d52b1e', side: 'neutral', capital: 'La Paz', capitalZh: '拉巴斯', flagIcon: '🇧🇴', tier: 'minor' },
    { id: 'pry', name: 'Paraguay', nameZh: '巴拉圭', code: 'PRY', color: '#d52b1e', side: 'neutral', capital: 'Asunción', capitalZh: '亞松森', flagIcon: '🇵🇾', tier: 'minor' },
    { id: 'bra', name: 'Brazil', nameZh: '巴西共和國', code: 'BRA', color: '#009c3b', side: 'neutral', capital: 'Rio de Janeiro', capitalZh: '里約熱內盧', flagIcon: '🇧🇷', tier: 'secondary' },
    { id: 'afg', name: 'Afghanistan', nameZh: '阿富汗酋長國', code: 'AFG', color: '#003893', side: 'neutral', capital: 'Kabul', capitalZh: '喀布爾', flagIcon: '🇦🇫', tier: 'minor' },
    { id: 'nej', name: 'Emirate of Nejd', nameZh: '內志酋長國', code: 'NEJ', color: '#006c35', side: 'neutral', capital: 'Riyadh', capitalZh: '利雅德', flagIcon: '🇸🇦', tier: 'minor' },
  ],
  // Same 1914 colonial map we built earlier
  territoryMap: {
    // Austria-Hungary
    'AT':'aut','HU':'aut','CZ':'aut','SK':'aut','SI':'aut','HR':'aut','BA':'aut',
    // Russia
    'RU':'rus','FI':'rus','EE':'rus','LV':'rus','LT':'rus','PL':'rus','BY':'rus','UA':'rus','MD':'rus',
    'GE':'rus','AM':'rus','AZ':'rus','KZ':'rus','UZ':'rus','TM':'rus','KG':'rus','TJ':'rus','MN':'rus','AX':'rus',
    // UK + colonies
    'GB':'gbr','IE':'gbr','NG':'gbr','GH':'gbr','SL':'gbr','GM':'gbr','KE':'gbr','UG':'gbr',
    'MW':'gbr','ZM':'gbr','ZW':'gbr','BW':'gbr','LS':'gbr','SZ':'gbr','SD':'gbr','SS':'gbr',
    'MU':'gbr','SC':'gbr','MV':'gbr','CY':'gbr','MT':'gbr','HK':'gbr','SG':'gbr','MY':'gbr','BN':'gbr',
    'LK':'gbr','BT':'gbr','NP':'gbr','MM':'ind','OM':'gbr','AE':'gbr','QA':'gbr','BH':'gbr','KW':'gbr',
    'FJ':'gbr','SB':'gbr','TO':'gbr','KI':'gbr','TV':'gbr','VU':'gbr','GY':'gbr','BZ':'gbr',
    'BS':'gbr','JM':'gbr','TT':'gbr','BB':'gbr','GD':'gbr','LC':'gbr','VC':'gbr','AG':'gbr','KN':'gbr',
    'DM':'gbr','AI':'gbr','MS':'gbr','VG':'gbr','KY':'gbr','TC':'gbr','BM':'gbr','FK':'gbr','GS':'gbr',
    'SH':'gbr','IO':'gbr','GI':'gbr','JE':'gbr','GG':'gbr','IM':'gbr','TK':'gbr','AQ':'gbr','PN':'gbr',
    // France + colonies
    'FR':'fra','DZ':'fra','TN':'fra','MA':'fra','MR':'fra','SN':'fra','GN':'fra','CI':'fra','BF':'fra',
    'ML':'fra','NE':'fra','BJ':'fra','TD':'fra','CF':'fra','CG':'fra','GA':'fra','MG':'fra','KM':'fra','DJ':'fra',
    'VN':'fra','LA':'fra','KH':'fra','PF':'fra','NC':'fra','WF':'fra','TF':'fra','PM':'fra','MC':'fra','AD':'fra','MF':'fra','BL':'fra',
    // Germany + colonies
    'DE':'deu','TZ':'deu','RW':'deu','BI':'deu','NA':'deu','CM':'deu','TG':'deu','WS':'deu','NR':'deu',
    'MP':'deu','PW':'deu','FM':'deu','MH':'deu','LU':'deu',
    // Belgium
    'BE':'bel','CD':'bel',
    // Portugal + colonies
    'PT':'prt','AO':'prt','MZ':'prt','GW':'prt','CV':'prt','ST':'prt','TL':'prt','MO':'prt',
    // Italy + colonies
    'IT':'ita','LY':'ita','ER':'ita','SO':'ita','SM':'ita','VA':'ita',
    // Spain + colonies
    'ES':'esp','EH':'esp','GQ':'esp',
    // Netherlands + colonies
    'NL':'nld','ID':'nld','SR':'nld','CW':'nld','AW':'nld','SX':'nld',
    // Denmark
    'DK':'dnk','GL':'dnk','FO':'dnk','VI':'dnk',
    // USA + territories
    'US':'usa','PH':'usa','PR':'usa','GU':'usa','AS':'usa','UM':'usa','DO':'usa',
    // Australia/NZ dependencies
    'AU':'aus','PG':'aus','NF':'aus','HM':'aus',
    'NZ':'nzl','CK':'nzl','NU':'nzl',
    // Ottoman + remnants
    'TR':'tur','MK':'tur','YE':'tur','IQ':'tur','SY':'tur','LB':'tur','IL':'tur','PS':'tur','JO':'tur','SA':'sau',
    // Others
    'RS':'srb','ME':'mne','AL':'alb','GR':'grc','RO':'rou','BG':'bgr',
    'CA':'can','ZA':'zaf','IN':'ind','CN':'chn','TH':'tha','AF':'afg','IR':'irn','ET':'eth',
    'EG':'egy','SE':'swe','NO':'nor','CH':'che','BR':'bra','AR':'arg','CL':'chl','MX':'mex',
    'CO':'col','VE':'ven','BO':'bol','PY':'pry','PE':'per','UY':'ury','CU':'cub','HT':'hti','LR':'lbr',
    'PA':'pan','CR':'cri','GT':'gtm','HN':'hnd','NI':'nic','EC':'col','SV':'gtm',
    '-1':'gbr',
  },
};
