import { CountrySide } from '../types/game';

export interface CountryDefinition {
  id: string;
  name: string;
  nameZh: string;
  code: string;
  color: string;
  side: CountrySide;
  capital: string;
  capitalZh: string;
  flagIcon: string;
}

export const SIDE_LABELS_ZH: Record<CountrySide, string> = {
  central: '同盟國',
  entente: '協約國',
  allies: '協約盟邦',
  neutral: '中立國',
};

export const WWI_COUNTRIES: CountryDefinition[] = [
  // Central Powers
  { id: 'deu', name: 'German Empire', nameZh: '德意志帝國', code: 'DEU', color: '#333333', side: 'central', capital: 'Berlin', capitalZh: '柏林', flagIcon: '🇩🇪' },
  { id: 'aut', name: 'Austro-Hungarian Empire', nameZh: '奧匈帝國', code: 'AUT', color: '#c41e3a', side: 'central', capital: 'Vienna', capitalZh: '維也納', flagIcon: '🇦🇹' },
  { id: 'tur', name: 'Ottoman Empire', nameZh: '奧斯曼帝國', code: 'TUR', color: '#e30a17', side: 'central', capital: 'Constantinople', capitalZh: '君士坦丁堡', flagIcon: '🇹🇷' },
  { id: 'bgr', name: 'Kingdom of Bulgaria', nameZh: '保加利亞王國', code: 'BGR', color: '#00966e', side: 'central', capital: 'Sofia', capitalZh: '索非亞', flagIcon: '🇧🇬' },

  // Triple Entente & Main Allies
  { id: 'gbr', name: 'United Kingdom', nameZh: '大英帝國', code: 'GBR', color: '#00247d', side: 'entente', capital: 'London', capitalZh: '倫敦', flagIcon: '🇬🇧' },
  { id: 'fra', name: 'French Republic', nameZh: '法蘭西共和國', code: 'FRA', color: '#0055a5', side: 'entente', capital: 'Paris', capitalZh: '巴黎', flagIcon: '🇫🇷' },
  { id: 'rus', name: 'Russian Empire', nameZh: '俄羅斯帝國', code: 'RUS', color: '#0039a6', side: 'entente', capital: 'Petrograd', capitalZh: '彼得格勒', flagIcon: '🇷🇺' },
  { id: 'ita', name: 'Kingdom of Italy', nameZh: '義大利王國', code: 'ITA', color: '#009246', side: 'entente', capital: 'Rome', capitalZh: '羅馬', flagIcon: '🇮🇹' },
  { id: 'usa', name: 'United States of America', nameZh: '美利堅合眾國', code: 'USA', color: '#3c3b6e', side: 'entente', capital: 'Washington D.C.', capitalZh: '華盛頓', flagIcon: '🇺🇸' },
  { id: 'jpn', name: 'Empire of Japan', nameZh: '大日本帝國', code: 'JPN', color: '#bc002d', side: 'entente', capital: 'Tokyo', capitalZh: '東京', flagIcon: '🇯🇵' },

  // Co-belligerents & Allied Powers
  { id: 'srb', name: 'Kingdom of Serbia', nameZh: '塞爾維亞王國', code: 'SRB', color: '#0c4076', side: 'allies', capital: 'Belgrade', capitalZh: '貝爾格勒', flagIcon: '🇷🇸' },
  { id: 'bel', name: 'Kingdom of Belgium', nameZh: '比利時王國', code: 'BEL', color: '#ffd100', side: 'allies', capital: 'Brussels', capitalZh: '布魯塞爾', flagIcon: '🇧🇪' },
  { id: 'rou', name: 'Kingdom of Romania', nameZh: '羅馬尼亞王國', code: 'ROU', color: '#002b7f', side: 'allies', capital: 'Bucharest', capitalZh: '布加勒斯特', flagIcon: '🇷🇴' },
  { id: 'grc', name: 'Kingdom of Greece', nameZh: '希臘王國', code: 'GRC', color: '#0d5eaf', side: 'allies', capital: 'Athens', capitalZh: '雅典', flagIcon: '🇬🇷' },
  { id: 'mne', name: 'Kingdom of Montenegro', nameZh: '蒙特內哥羅王國', code: 'MNE', color: '#c8102e', side: 'allies', capital: 'Cetinje', capitalZh: '采蒂涅', flagIcon: '🇲🇪' },
  { id: 'can', name: 'Dominion of Canada', nameZh: '加拿大自治領', code: 'CAN', color: '#ff0000', side: 'allies', capital: 'Ottawa', capitalZh: '渥太華', flagIcon: '🇨🇦' },
  { id: 'aus', name: 'Commonwealth of Australia', nameZh: '澳大利亞聯邦', code: 'AUS', color: '#00008b', side: 'allies', capital: 'Melbourne', capitalZh: '墨爾本', flagIcon: '🇦🇺' },
  { id: 'nzl', name: 'Dominion of New Zealand', nameZh: '紐西蘭自治領', code: 'NZL', color: '#00247d', side: 'allies', capital: 'Wellington', capitalZh: '威靈頓', flagIcon: '🇳🇿' },
  { id: 'zaf', name: 'Union of South Africa', nameZh: '南非聯邦', code: 'ZAF', color: '#007a3d', side: 'allies', capital: 'Pretoria', capitalZh: '普利托利亞', flagIcon: '🇿🇦' },
  { id: 'ind', name: 'British Raj (India)', nameZh: '英屬印度', code: 'IND', color: '#ff9933', side: 'allies', capital: 'New Delhi', capitalZh: '新德里', flagIcon: '🇮🇳' },
  { id: 'prt', name: 'Kingdom of Portugal', nameZh: '葡萄牙王國', code: 'PRT', color: '#046a38', side: 'allies', capital: 'Lisbon', capitalZh: '里斯本', flagIcon: '🇵🇹' },
  { id: 'chn', name: 'Republic of China', nameZh: '中華民國', code: 'CHN', color: '#de2910', side: 'allies', capital: 'Beijing', capitalZh: '北京', flagIcon: '🇨🇳' },
  { id: 'tha', name: 'Kingdom of Siam', nameZh: '暹羅王國', code: 'THA', color: '#a51931', side: 'allies', capital: 'Bangkok', capitalZh: '曼谷', flagIcon: '🇹🇭' },
  { id: 'bra', name: 'Republic of Brazil', nameZh: '巴西共和國', code: 'BRA', color: '#009c3b', side: 'allies', capital: 'Rio de Janeiro', capitalZh: '里約熱內盧', flagIcon: '🇧🇷' },
  { id: 'cub', name: 'Republic of Cuba', nameZh: '古巴共和國', code: 'CUB', color: '#002a8f', side: 'allies', capital: 'Havana', capitalZh: '哈瓦那', flagIcon: '🇨🇺' },
  { id: 'hti', name: 'Republic of Haiti', nameZh: '海地共和國', code: 'HTI', color: '#d21034', side: 'allies', capital: 'Port-au-Prince', capitalZh: '太子港', flagIcon: '🇭🇹' },
  { id: 'lbr', name: 'Republic of Liberia', nameZh: '賴比瑞亞共和國', code: 'LBR', color: '#bf0a30', side: 'allies', capital: 'Monrovia', capitalZh: '蒙羅維亞', flagIcon: '🇱🇷' },
  { id: 'pan', name: 'Republic of Panama', nameZh: '巴拿馬共和國', code: 'PAN', color: '#005293', side: 'allies', capital: 'Panama City', capitalZh: '巴拿馬城', flagIcon: '🇵🇦' },
  { id: 'cri', name: 'Republic of Costa Rica', nameZh: '哥斯大黎加共和國', code: 'CRI', color: '#002b7f', side: 'allies', capital: 'San José', capitalZh: '聖荷西', flagIcon: '🇨🇷' },
  { id: 'gtm', name: 'Republic of Guatemala', nameZh: '瓜地馬拉共和國', code: 'GTM', color: '#4997d0', side: 'allies', capital: 'Guatemala City', capitalZh: '瓜地馬拉市', flagIcon: '🇬🇹' },
  { id: 'hnd', name: 'Republic of Honduras', nameZh: '宏都拉斯共和國', code: 'HND', color: '#00bce4', side: 'allies', capital: 'Tegucigalpa', capitalZh: '德古斯加巴', flagIcon: '🇭🇳' },
  { id: 'nic', name: 'Republic of Nicaragua', nameZh: '尼加拉瓜共和國', code: 'NIC', color: '#0067a6', side: 'allies', capital: 'Managua', capitalZh: '馬納瓜', flagIcon: '🇳🇮' },
  { id: 'per', name: 'Republic of Peru', nameZh: '秘魯共和國', code: 'PER', color: '#d91023', side: 'allies', capital: 'Lima', capitalZh: '利馬', flagIcon: '🇵🇪' },
  { id: 'ury', name: 'Republic of Uruguay', nameZh: '烏拉圭共和國', code: 'URY', color: '#0038a8', side: 'allies', capital: 'Montevideo', capitalZh: '蒙特維多', flagIcon: '🇺🇾' },
  { id: 'sau', name: 'Kingdom of Hejaz', nameZh: '漢志王國', code: 'SAU', color: '#007a3d', side: 'allies', capital: 'Mecca', capitalZh: '麥加', flagIcon: '🇸🇦' },
  { id: 'egy', name: 'Sultanate of Egypt', nameZh: '埃及蘇丹國', code: 'EGY', color: '#c8102e', side: 'allies', capital: 'Cairo', capitalZh: '開羅', flagIcon: '🇪🇬' },

  // Neutral Nations
  { id: 'esp', name: 'Kingdom of Spain', nameZh: '西班牙王國', code: 'ESP', color: '#aa151b', side: 'neutral', capital: 'Madrid', capitalZh: '馬德里', flagIcon: '🇪🇸' },
  { id: 'nld', name: 'Kingdom of the Netherlands', nameZh: '荷蘭王國', code: 'NLD', color: '#ae1c28', side: 'neutral', capital: 'Amsterdam', capitalZh: '阿姆斯特丹', flagIcon: '🇳🇱' },
  { id: 'swe', name: 'Kingdom of Sweden', nameZh: '瑞典王國', code: 'SWE', color: '#006aa7', side: 'neutral', capital: 'Stockholm', capitalZh: '斯德哥爾摩', flagIcon: '🇸🇪' },
  { id: 'nor', name: 'Kingdom of Norway', nameZh: '挪威王國', code: 'NOR', color: '#ba0c2f', side: 'neutral', capital: 'Christiania', capitalZh: '克里斯蒂安尼亞', flagIcon: '🇳🇴' },
  { id: 'dnk', name: 'Kingdom of Denmark', nameZh: '丹麥王國', code: 'DNK', color: '#c8102e', side: 'neutral', capital: 'Copenhagen', capitalZh: '哥本哈根', flagIcon: '🇩🇰' },
  { id: 'che', name: 'Swiss Confederation', nameZh: '瑞士邦聯', code: 'CHE', color: '#ff0000', side: 'neutral', capital: 'Bern', capitalZh: '伯恩', flagIcon: '🇨🇭' },
  { id: 'alb', name: 'Principality of Albania', nameZh: '阿爾巴尼亞公國', code: 'ALB', color: '#e41e20', side: 'neutral', capital: 'Durrës', capitalZh: '都拉斯', flagIcon: '🇦🇱' },
  { id: 'irn', name: 'Persian Empire', nameZh: '波斯帝國', code: 'IRN', color: '#239f40', side: 'neutral', capital: 'Tehran', capitalZh: '德黑蘭', flagIcon: '🇮🇷' },
  { id: 'nej', name: 'Emirate of Nejd and Hasa', nameZh: '內志與哈薩酋長國', code: 'NEJ', color: '#005826', side: 'neutral', capital: 'Riyadh', capitalZh: '利雅德', flagIcon: '🇸🇦' },
  { id: 'eth', name: 'Empire of Ethiopia', nameZh: '衣索比亞帝國', code: 'ETH', color: '#009a44', side: 'neutral', capital: 'Addis Ababa', capitalZh: '阿迪斯阿貝巴', flagIcon: '🇪🇹' },
  { id: 'arg', name: 'Republic of Argentina', nameZh: '阿根廷共和國', code: 'ARG', color: '#74acdf', side: 'neutral', capital: 'Buenos Aires', capitalZh: '布宜諾斯艾利斯', flagIcon: '🇦🇷' },
  { id: 'chl', name: 'Republic of Chile', nameZh: '智利共和國', code: 'CHL', color: '#0039a6', side: 'neutral', capital: 'Santiago', capitalZh: '聖地牙哥', flagIcon: '🇨🇱' },
  { id: 'mex', name: 'Republic of Mexico', nameZh: '墨西哥合眾國', code: 'MEX', color: '#006847', side: 'neutral', capital: 'Mexico City', capitalZh: '墨西哥城', flagIcon: '🇲🇽' },
  { id: 'col', name: 'Republic of Colombia', nameZh: '哥倫比亞共和國', code: 'COL', color: '#fcd116', side: 'neutral', capital: 'Bogotá', capitalZh: '波哥大', flagIcon: '🇨🇴' },
  { id: 'ven', name: 'Republic of Venezuela', nameZh: '委內瑞拉共和國', code: 'VEN', color: '#fcf800', side: 'neutral', capital: 'Caracas', capitalZh: '卡拉卡斯', flagIcon: '🇻🇪' },
  { id: 'bol', name: 'Republic of Bolivia', nameZh: '玻利維亞共和國', code: 'BOL', color: '#d52b1e', side: 'neutral', capital: 'La Paz', capitalZh: '拉巴斯', flagIcon: '🇧🇴' },
  { id: 'pry', name: 'Republic of Paraguay', nameZh: '巴拉圭共和國', code: 'PRY', color: '#d52b1e', side: 'neutral', capital: 'Asunción', capitalZh: '亞松森', flagIcon: '🇵🇾' },
  { id: 'afg', name: 'Kingdom of Afghanistan', nameZh: '阿富汗王國', code: 'AFG', color: '#000000', side: 'neutral', capital: 'Kabul', capitalZh: '喀布爾', flagIcon: '🇦🇫' }
];
