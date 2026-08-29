import { CountrySide } from '../types/game';

export interface CountryDefinition {
  id: string;
  name: string;
  code: string;
  color: string;
  side: CountrySide;
  capital: string;
  flagIcon: string;
}

export const WWI_COUNTRIES: CountryDefinition[] = [
  // Central Powers
  { id: 'deu', name: 'German Empire', code: 'DEU', color: '#333333', side: 'central', capital: 'Berlin', flagIcon: '🇩🇪' },
  { id: 'aut', name: 'Austro-Hungarian Empire', code: 'AUT', color: '#c41e3a', side: 'central', capital: 'Vienna', flagIcon: '🇦🇹' },
  { id: 'tur', name: 'Ottoman Empire', code: 'TUR', color: '#e30a17', side: 'central', capital: 'Constantinople', flagIcon: '🇹🇷' },
  { id: 'bgr', name: 'Kingdom of Bulgaria', code: 'BGR', color: '#00966e', side: 'central', capital: 'Sofia', flagIcon: '🇧🇬' },

  // Triple Entente & Main Allies
  { id: 'gbr', name: 'United Kingdom', code: 'GBR', color: '#00247d', side: 'entente', capital: 'London', flagIcon: '🇬🇧' },
  { id: 'fra', name: 'French Republic', code: 'FRA', color: '#0055a5', side: 'entente', capital: 'Paris', flagIcon: '🇫🇷' },
  { id: 'rus', name: 'Russian Empire', code: 'RUS', color: '#0039a6', side: 'entente', capital: 'Petrograd', flagIcon: '🇷🇺' },
  { id: 'ita', name: 'Kingdom of Italy', code: 'ITA', color: '#009246', side: 'entente', capital: 'Rome', flagIcon: '🇮🇹' },
  { id: 'usa', name: 'United States of America', code: 'USA', color: '#3c3b6e', side: 'entente', capital: 'Washington D.C.', flagIcon: '🇺🇸' },
  { id: 'jpn', name: 'Empire of Japan', code: 'JPN', color: '#bc002d', side: 'entente', capital: 'Tokyo', flagIcon: '🇯🇵' },

  // Co-belligerents & Allied Powers
  { id: 'srb', name: 'Kingdom of Serbia', code: 'SRB', color: '#0c4076', side: 'allies', capital: 'Belgrade', flagIcon: '🇷🇸' },
  { id: 'bel', name: 'Kingdom of Belgium', code: 'BEL', color: '#ffd100', side: 'allies', capital: 'Brussels', flagIcon: '🇧🇪' },
  { id: 'rou', name: 'Kingdom of Romania', code: 'ROU', color: '#002b7f', side: 'allies', capital: 'Bucharest', flagIcon: '🇷🇴' },
  { id: 'grc', name: 'Kingdom of Greece', code: 'GRC', color: '#0d5eaf', side: 'allies', capital: 'Athens', flagIcon: '🇬🇷' },
  { id: 'mne', name: 'Kingdom of Montenegro', code: 'MNE', color: '#c8102e', side: 'allies', capital: 'Cetinje', flagIcon: '🇲🇪' },
  { id: 'can', name: 'Dominion of Canada', code: 'CAN', color: '#ff0000', side: 'allies', capital: 'Ottawa', flagIcon: '🇨🇦' },
  { id: 'aus', name: 'Commonwealth of Australia', code: 'AUS', color: '#00008b', side: 'allies', capital: 'Melbourne', flagIcon: '🇦🇺' },
  { id: 'nzl', name: 'Dominion of New Zealand', code: 'NZL', color: '#00247d', side: 'allies', capital: 'Wellington', flagIcon: '🇳🇿' },
  { id: 'zaf', name: 'Union of South Africa', code: 'ZAF', color: '#007a3d', side: 'allies', capital: 'Pretoria', flagIcon: '🇿🇦' },
  { id: 'ind', name: 'British Raj (India)', code: 'IND', color: '#ff9933', side: 'allies', capital: 'New Delhi', flagIcon: '🇮🇳' },
  { id: 'prt', name: 'Kingdom of Portugal', code: 'PRT', color: '#046a38', side: 'allies', capital: 'Lisbon', flagIcon: '🇵🇹' },
  { id: 'chn', name: 'Republic of China', code: 'CHN', color: '#de2910', side: 'allies', capital: 'Beijing', flagIcon: '🇨🇳' },
  { id: 'tha', name: 'Kingdom of Siam', code: 'THA', color: '#a51931', side: 'allies', capital: 'Bangkok', flagIcon: '🇹🇭' },
  { id: 'bra', name: 'Republic of Brazil', code: 'BRA', color: '#009c3b', side: 'allies', capital: 'Rio de Janeiro', flagIcon: '🇧🇷' },
  { id: 'cub', name: 'Republic of Cuba', code: 'CUB', color: '#002a8f', side: 'allies', capital: 'Havana', flagIcon: '🇨🇺' },
  { id: 'hti', name: 'Republic of Haiti', code: 'HTI', color: '#d21034', side: 'allies', capital: 'Port-au-Prince', flagIcon: '🇭🇹' },
  { id: 'lbr', name: 'Republic of Liberia', code: 'LBR', color: '#bf0a30', side: 'allies', capital: 'Monrovia', flagIcon: '🇱🇷' },
  { id: 'pan', name: 'Republic of Panama', code: 'PAN', color: '#005293', side: 'allies', capital: 'Panama City', flagIcon: '🇵🇦' },
  { id: 'cri', name: 'Republic of Costa Rica', code: 'CRI', color: '#002b7f', side: 'allies', capital: 'San José', flagIcon: '🇨🇷' },
  { id: 'gtm', name: 'Republic of Guatemala', code: 'GTM', color: '#4997d0', side: 'allies', capital: 'Guatemala City', flagIcon: '🇬🇹' },
  { id: 'hnd', name: 'Republic of Honduras', code: 'HND', color: '#00bce4', side: 'allies', capital: 'Tegucigalpa', flagIcon: '🇭🇳' },
  { id: 'nic', name: 'Republic of Nicaragua', code: 'NIC', color: '#0067a6', side: 'allies', capital: 'Managua', flagIcon: '🇳🇮' },
  { id: 'per', name: 'Republic of Peru', code: 'PER', color: '#d91023', side: 'allies', capital: 'Lima', flagIcon: '🇵🇪' },
  { id: 'ury', name: 'Republic of Uruguay', code: 'URY', color: '#0038a8', side: 'allies', capital: 'Montevideo', flagIcon: '🇺🇾' },
  { id: 'sau', name: 'Kingdom of Hejaz', code: 'SAU', color: '#007a3d', side: 'allies', capital: 'Mecca', flagIcon: '🇸🇦' },
  { id: 'egy', name: 'Sultanate of Egypt', code: 'EGY', color: '#c8102e', side: 'allies', capital: 'Cairo', flagIcon: '🇪🇬' },

  // Neutral Nations
  { id: 'esp', name: 'Kingdom of Spain', code: 'ESP', color: '#aa151b', side: 'neutral', capital: 'Madrid', flagIcon: '🇪🇸' },
  { id: 'nld', name: 'Kingdom of the Netherlands', code: 'NLD', color: '#ae1c28', side: 'neutral', capital: 'Amsterdam', flagIcon: '🇳🇱' },
  { id: 'swe', name: 'Kingdom of Sweden', code: 'SWE', color: '#006aa7', side: 'neutral', capital: 'Stockholm', flagIcon: '🇸🇪' },
  { id: 'nor', name: 'Kingdom of Norway', code: 'NOR', color: '#ba0c2f', side: 'neutral', capital: 'Christiania', flagIcon: '🇳🇴' },
  { id: 'dnk', name: 'Kingdom of Denmark', code: 'DNK', color: '#c8102e', side: 'neutral', capital: 'Copenhagen', flagIcon: '🇩🇰' },
  { id: 'che', name: 'Swiss Confederation', code: 'CHE', color: '#ff0000', side: 'neutral', capital: 'Bern', flagIcon: '🇨🇭' },
  { id: 'alb', name: 'Principality of Albania', code: 'ALB', color: '#e41e20', side: 'neutral', capital: 'Durrës', flagIcon: '🇦🇱' },
  { id: 'irn', name: 'Persian Empire', code: 'IRN', color: '#239f40', side: 'neutral', capital: 'Tehran', flagIcon: '🇮🇷' },
  { id: 'nej', name: 'Emirate of Nejd and Hasa', code: 'NEJ', color: '#005826', side: 'neutral', capital: 'Riyadh', flagIcon: '🇸🇦' },
  { id: 'eth', name: 'Empire of Ethiopia', code: 'ETH', color: '#009a44', side: 'neutral', capital: 'Addis Ababa', flagIcon: '🇪🇹' },
  { id: 'arg', name: 'Republic of Argentina', code: 'ARG', color: '#74acdf', side: 'neutral', capital: 'Buenos Aires', flagIcon: '🇦🇷' },
  { id: 'chl', name: 'Republic of Chile', code: 'CHL', color: '#0039a6', side: 'neutral', capital: 'Santiago', flagIcon: '🇨🇱' },
  { id: 'mex', name: 'Republic of Mexico', code: 'MEX', color: '#006847', side: 'neutral', capital: 'Mexico City', flagIcon: '🇲🇽' },
  { id: 'col', name: 'Republic of Colombia', code: 'COL', color: '#fcd116', side: 'neutral', capital: 'Bogotá', flagIcon: '🇨🇴' },
  { id: 'ven', name: 'Republic of Venezuela', code: 'VEN', color: '#fcf800', side: 'neutral', capital: 'Caracas', flagIcon: '🇻🇪' },
  { id: 'bol', name: 'Republic of Bolivia', code: 'BOL', color: '#d52b1e', side: 'neutral', capital: 'La Paz', flagIcon: '🇧🇴' },
  { id: 'pry', name: 'Republic of Paraguay', code: 'PRY', color: '#d52b1e', side: 'neutral', capital: 'Asunción', flagIcon: '🇵🇾' },
  { id: 'afg', name: 'Kingdom of Afghanistan', code: 'AFG', color: '#000000', side: 'neutral', capital: 'Kabul', flagIcon: '🇦🇫' }
];
