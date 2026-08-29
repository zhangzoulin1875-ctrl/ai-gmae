export type GameStatus = 'WAITING' | 'ACTIVE' | 'COMPLETED' | 'PAUSED';

export type CountrySide = 'entente' | 'allies' | 'central' | 'neutral';

export type OrderType = 'ATTACK' | 'DEFEND' | 'MOVE' | 'RECRUIT' | 'DIPLOMACY' | 'FORTIFY';

export interface UnitCount {
  infantry: number;
  artillery: number;
  cavalry: number;
}

export interface Territory {
  id: string;
  name: string;
  countryId: string;
  ownerId: string;
  units: UnitCount;
  defenseLevel: number;
  factoryPoints: number;
  adjacentTerritoryIds: string[];
}

export interface CountryState {
  countryId: string;
  name: string;
  side: CountrySide;
  manpower: number;
  industrialPoints: number;
  gold: number;
  stability: number;
  territoryIds: string[];
  isAI: boolean;
  controlledByPlayerId?: string;
}

export interface Player {
  id: string;
  discordId: string;
  username: string;
  avatar?: string;
  countryId: string;
  isReady: boolean;
  joinedAt: string;
}

export interface Order {
  id: string;
  gameId: string;
  playerId: string;
  countryId: string;
  turn: number;
  type: OrderType;
  fromTerritoryId?: string;
  targetTerritoryId?: string;
  units?: Partial<UnitCount>;
  details?: string;
  status: 'PENDING' | 'RESOLVED' | 'INVALID';
  createdAt: string;
}

export interface BattleResult {
  id: string;
  territoryId: string;
  attackerCountryId: string;
  defenderCountryId: string;
  attackerCasualties: UnitCount;
  defenderCasualties: UnitCount;
  winnerCountryId: string;
  territoryCaptured: boolean;
  narrative: string;
}

export interface GameEvent {
  id: string;
  type: 'BATTLE' | 'DIPLOMACY' | 'REINFORCEMENT' | 'AI_NARRATIVE';
  title: string;
  description: string;
  turn: number;
  timestamp: string;
  countryIdsInvolved: string[];
}

export interface TurnResolution {
  id: string;
  gameId: string;
  turn: number;
  resolvedAt: string;
  battleResults: BattleResult[];
  events: GameEvent[];
  narrativeSummary: string;
  resolvedByAIProvider: string;
  executionTimeMs: number;
}

export interface GameRoom {
  id: string;
  name: string;
  status: GameStatus;
  currentTurn: number;
  maxPlayers: number;
  turnIntervalHours: number;
  lastTurnResolvedAt?: string;
  nextTurnAt?: string;
  players: Player[];
  countryStates: Record<string, CountryState>;
  territories: Record<string, Territory>;
  createdAt: string;
  updatedAt: string;
}
