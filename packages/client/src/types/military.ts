export interface CountryStateData {
  gold: number;
  industry: number;
  manpower: number;
  morale: number;
  stability: number;
}

export interface AvailableUnit {
  id: string;
  nameZh: string;
  category: string;
  attack: number;
  defense: number;
  speed: number;
  costGold: number;
  costManpower: number;
  costIndustry: number;
  isSystemDefault?: boolean;
}

export interface StockpileItem {
  customUnitId: string;
  nameZh: string;
  category: string;
  quantity: number;
  attack: number;
  defense: number;
  speed: number;
  costGold: number;
  costManpower: number;
  costIndustry: number;
}

export interface DivisionCompositionItem {
  customUnitId: string;
  nameZh: string;
  category: string;
  quantity: number;
}

export interface Division {
  id: string;
  name: string;
  status: string;
  composition: DivisionCompositionItem[];
  totalUnits: number;
}

export interface MilitaryState {
  countryState: CountryStateData;
  stockpile: StockpileItem[];
  divisions: Division[];
  availableUnits: AvailableUnit[];
}

export interface Policy {
  id: string;
  turn: number;
  title: string;
  content: string;
  status: 'PENDING' | 'APPROVED' | 'PARTIAL' | 'REJECTED';
  aiVerdict?: string;
  effects?: Record<string, number>;
  createdAt: string;
}

export interface GameNotification {
  id: string;
  turn: number;
  type: 'BATTLE' | 'POLICY' | 'RECRUIT' | 'ECONOMY' | 'SYSTEM' | 'AI_ORDER';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export const CATEGORY_LABELS_ZH: Record<string, string> = {
  infantry: '步兵',
  cavalry: '騎兵',
  artillery: '砲兵',
  fleet: '艦隊',
  armored: '裝甲',
  air: '空軍',
  support: '後勤支援',
};
