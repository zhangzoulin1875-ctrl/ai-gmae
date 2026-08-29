/**
 * GameContext — shared game-session state for the /game/:id/* nested routes.
 *
 * GameLayout owns all state (socket connection, order form, military state,
 * chat, etc.) and provides it here. Each tab is now its own routed page
 * (OrdersPage, RecruitPage, ...) and reads what it needs via useGame().
 */
import React, { createContext, useContext } from 'react';
import { Order, OrderType } from '@wwi/shared';
import { MilitaryState } from '../types/military';
import { Socket } from 'socket.io-client';

export interface CountryStateInfo {
  countryId: string;
  infantry: number;
  artillery: number;
  cavalry: number;
  morale: number;
  gold: number;
  industry: number;
  manpower: number;
  stability: number;
  isAIControlled: boolean;
  techPoints?: number;
  unlockedTechCount?: number;
  politicalBranch?: string | null;
  customName?: string | null;
  hasRenamed?: boolean;
}

export interface PlayerInfo {
  countryId: string;
  username: string;
  avatar: string | null;
  isAI: boolean;
  isReady: boolean;
}

export interface GameState {
  game: { id: string; name: string; status: string; currentTurn: number; nextTurnAt?: string };
  myCountryId: string | null;
  players: PlayerInfo[];
  countryStates: CountryStateInfo[];
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface GameContextValue {
  gameId: string;
  state: GameState | null;
  militaryState: MilitaryState | null;
  socket: Socket | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  notificationTrigger: number;

  // Order form
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  fromTerritory: string;
  setFromTerritory: (v: string) => void;
  targetTerritory: string;
  setTargetTerritory: (v: string) => void;
  selectedDivisionIds: string[];
  toggleDivisionSelection: (id: string) => void;
  details: string;
  setDetails: (v: string) => void;
  formError: string | null;
  setFormError: (v: string | null) => void;
  mapSelectMode: 'target' | 'from';
  setMapSelectMode: (m: 'target' | 'from') => void;
  handleSubmitOrder: (e: React.FormEvent) => void;
  handleClearForm: () => void;
  handleWithdrawOrder: (orderId: string) => void;
  myOrders: Order[];

  // AI auto-decision
  aiSuggesting: boolean;
  handleAiSuggest: () => void;

  // Tab navigation (each tab is now a route under /game/:id/*)
  goToTab: (tab: string) => void;

  // Unit workshop
  myUnits: any[];
  unitDesigning: boolean;
  unitDesignPrompt: string;
  setUnitDesignPrompt: (v: string) => void;
  unitDesignCategory: string;
  setUnitDesignCategory: (v: string) => void;
  unitError: string;
  unitSuccess: string;
  handleDesignUnit: () => void;
  handleDeleteUnit: (id: string) => void;
  CATEGORY_LABELS: Record<string, string>;
  CATEGORIES: string[];

  fetchMilitaryState: () => void;

  // Country display helpers
  getCountryName: (cid: string) => string;
  getCountryNameZh: (cid: string) => string;
  getCountryFlag: (cid: string) => string;

  activeDivisions: any[];

  resolving: boolean;
  handleReady: () => void;
}

export const GameContext = createContext<GameContextValue | null>(null);

export const useGame = (): GameContextValue => {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame() 必須在 GameLayout 內使用');
  return ctx;
};
