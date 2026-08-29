import { AIConfig } from './ai';

export interface AdminSession {
  token: string;
  authenticatedAt: string;
  expiresAt: string;
}

export interface AdminConfig {
  aiConfig: AIConfig;
  turnIntervalHours: number;
  quietHoursStartUTC8: number;
  quietHoursEndUTC8: number;
  maxPlayersPerGame: number;
  maintenanceMode: boolean;
}
