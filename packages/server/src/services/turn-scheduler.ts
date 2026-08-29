import cron from 'node-cron';
import type { Server as SocketIOServer } from 'socket.io';

/**
 * Turn Scheduler
 * - 2 hours per turn
 * - No resolution during 00:00-08:00 Taiwan time (UTC+8)
 * - Turns resolve at: 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00, 22:00 (UTC+8)
 * - 08:00 UTC+8 = 00:00 UTC
 * - 22:00 UTC+8 = 14:00 UTC
 * - So in UTC: 00, 02, 04, 06, 08, 10, 12, 14
 */
export class TurnScheduler {
  private io: SocketIOServer;
  private isRunning = false;

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Cron: every 2 hours during 00:00-14:00 UTC (= 08:00-22:00 UTC+8)
    // 00,02,04,06,08,10,12,14 UTC
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

    // Notify all clients that turn resolution is starting
    this.io.emit('turn_resolving', {
      timestamp: now.toISOString(),
      utc8Hour,
    });

    try {
      // TODO: Load all active games from DB
      // For each active game:
      //   1. Collect all orders
      //   2. Call AI engine to resolve
      //   3. Update game state
      //   4. Broadcast results

      // Placeholder: broadcast completion
      this.io.emit('turn_resolved', {
        timestamp: new Date().toISOString(),
        gamesResolved: 0,
        message: 'Turn resolution complete (no active games yet)',
      });

      console.log('[Scheduler] Turn resolution complete');
    } catch (error: any) {
      console.error('[Scheduler] Turn resolution error:', error.message);
      this.io.emit('turn_error', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Check if current time is within quiet hours (00:00-08:00 UTC+8)
  isQuietHours(): boolean {
    const utc8Hour = new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCHours();
    return utc8Hour >= 0 && utc8Hour < 8;
  }

  // Get next turn time
  getNextTurnTime(): Date {
    const now = new Date();
    const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    let hour = utc8.getUTCHours();

    if (hour >= 0 && hour < 8) {
      // Next turn at 08:00 UTC+8 = 00:00 UTC
      hour = 8;
    } else if (hour >= 22) {
      // Next turn at 08:00 UTC+8 tomorrow
      hour = 8;
    } else {
      // Next even hour
      hour = Math.ceil(hour / 2) * 2;
      if (hour <= hour) hour += 2; // ensure it's in the future
    }

    // Convert back to UTC
    const utcHour = hour - 8;
    const nextTurn = new Date(now);
    nextTurn.setUTCHours(utcHour, 0, 0, 0);

    if (nextTurn <= now) {
      nextTurn.setUTCDate(nextTurn.getUTCDate() + 1);
      nextTurn.setUTCHours(0, 0, 0, 0); // 08:00 UTC+8 = 00:00 UTC
    }

    return nextTurn;
  }
}
