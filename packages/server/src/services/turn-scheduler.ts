import cron from 'node-cron';
import type { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import { TurnResolver } from './turn-resolver.js';
import { AIPlayerService } from './ai-player.js';

/**
 * Turn Scheduler
 * - 2 hours per turn
 * - No resolution during 00:00-08:00 Taiwan time (UTC+8)
 * - Turns resolve at: 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00, 22:00 (UTC+8)
 * - In UTC: 00, 02, 04, 06, 08, 10, 12, 14
 */
export class TurnScheduler {
  private io: SocketIOServer;
  private isRunning = false;
  private aiPlayerService = new AIPlayerService();

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    const cronExpression = '0 0,2,4,6,8,10,12,14 * * *';

    cron.schedule(cronExpression, async () => {
      await this.resolveAllTurns();
    });

    console.log('[Scheduler] Turn scheduler started');
    console.log('[Scheduler] Turns resolve at: 08:00,10:00,12:00,14:00,16:00,18:00,20:00,22:00 (UTC+8)');
    console.log('[Scheduler] Quiet hours: 00:00-08:00 (UTC+8)');
    this.printNextTurnInfo();
  }

  stop() {
    this.isRunning = false;
  }

  private printNextTurnInfo() {
    const now = new Date();
    const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const hour = utc8.getUTCHours();

    let nextTurn: string;
    if (hour >= 0 && hour < 8) {
      nextTurn = '08:00 UTC+8';
    } else if (hour >= 22) {
      nextTurn = '08:00 UTC+8 (tomorrow)';
    } else {
      const nextHour = Math.ceil(hour / 2) * 2;
      nextTurn = `${String(nextHour).padStart(2, '0')}:00 UTC+8`;
    }

    console.log(`[Scheduler] Current UTC+8 time: ${String(hour).padStart(2, '0')}:${String(utc8.getUTCMinutes()).padStart(2, '0')}`);
    console.log(`[Scheduler] Next turn: ${nextTurn}`);
  }

  private async resolveAllTurns() {
    const now = new Date();
    const utc8Hour = new Date(now.getTime() + 8 * 60 * 60 * 1000).getUTCHours();
    console.log(`[Scheduler] Resolving turns at ${now.toISOString()} (UTC+8 hour: ${utc8Hour})`);

    this.io.emit('turn_resolving', { timestamp: now.toISOString(), utc8Hour });

    try {
      const activeGames = await prisma.gameRoom.findMany({
        where: { status: 'ACTIVE' },
      });

      console.log(`[Scheduler] Found ${activeGames.length} active games`);

      const resolver = new TurnResolver();
      let resolvedCount = 0;

      for (const game of activeGames) {
        try {
          // 1. Generate AI orders BEFORE resolution for countries with isAIControlled === true in the latest CountryState
          console.log(`[Scheduler] Generating AI player orders for game ${game.id} turn ${game.currentTurn}...`);
          await this.aiPlayerService.generateOrdersForGame(game.id, game.currentTurn);

          // 2. Resolve the turn
          const result = await resolver.resolveTurn(game.id);

          // Broadcast to all clients in this game's room
          this.io.to(`game:${game.id}`).emit('turn_resolved', {
            gameId: game.id,
            turn: result.turn,
            battles: result.battles,
            narrative: result.narrative,
            timestamp: new Date().toISOString(),
          });

          resolvedCount++;
          console.log(`[Scheduler] Game ${game.id} turn ${result.turn} resolved`);
        } catch (err: any) {
          console.error(`[Scheduler] Error resolving game ${game.id}:`, err.message);
        }
      }

      this.io.emit('turn_batch_complete', {
        timestamp: new Date().toISOString(),
        gamesResolved: resolvedCount,
      });

      console.log(`[Scheduler] Turn resolution complete: ${resolvedCount} games resolved`);
    } catch (error: any) {
      console.error('[Scheduler] Turn resolution error:', error.message);
      this.io.emit('turn_error', { error: error.message, timestamp: new Date().toISOString() });
    }
  }

  isQuietHours(): boolean {
    const utc8Hour = new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCHours();
    return utc8Hour >= 0 && utc8Hour < 8;
  }

  getNextTurnTime(): Date {
    const now = new Date();
    const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    let hour = utc8.getUTCHours();

    if (hour >= 0 && hour < 8) {
      hour = 8;
    } else if (hour >= 22) {
      hour = 8;
    } else {
      hour = Math.ceil(hour / 2) * 2;
    }

    const utcHour = hour - 8;
    const nextTurn = new Date(now);
    nextTurn.setUTCHours(utcHour, 0, 0, 0);

    if (nextTurn <= now) {
      nextTurn.setUTCDate(nextTurn.getUTCDate() + 1);
      nextTurn.setUTCHours(0, 0, 0, 0);
    }

    return nextTurn;
  }
}
