import type { Server as SocketIOServer, Socket } from 'socket.io';
import { prisma } from '../lib/prisma.js';

export function handleGameSockets(io: SocketIOServer, socket: Socket) {
  // Join a game room
  socket.on('join_game', async (data: { gameId: string; userId: string; countryId?: string }) => {
    const { gameId, userId } = data;
    socket.join(`game:${gameId}`);
    socket.data.gameId = gameId;
    socket.data.userId = userId;

    try {
      const game = await prisma.gameRoom.findUnique({
        where: { id: gameId },
        include: { players: { include: { user: true } } },
      });

      if (game) {
        socket.emit('room_data', {
          game: {
            id: game.id,
            name: game.name,
            status: game.status,
            currentTurn: game.currentTurn,
            nextTurnAt: game.nextTurnAt,
          },
          players: game.players.map((p) => ({
            countryId: p.countryId,
            username: p.user.username,
            avatar: p.user.avatar,
            isAI: p.isAI,
            isReady: p.isReady,
          })),
        });
      }

      socket.to(`game:${gameId}`).emit('player_joined', {
        userId,
        gameId,
      });
      console.log(`[Socket] ${userId} joined game ${gameId}`);
    } catch (err: any) {
      console.error('[Socket] join_game error:', err.message);
    }
  });

  // Submit orders
  socket.on('submit_orders', async (data: {
    gameId: string;
    orders: Array<{
      type: string;
      fromTerritoryId?: string;
      targetTerritoryId?: string;
      infantry?: number;
      artillery?: number;
      cavalry?: number;
      details?: string;
    }>;
  }) => {
    const { gameId, orders } = data;
    const userId = socket.data.userId;
    if (!userId) {
      socket.emit('error', { message: '未識別使用者' });
      return;
    }

    try {
      const game = await prisma.gameRoom.findUnique({
        where: { id: gameId },
        include: { players: true },
      });
      if (!game || game.status !== 'ACTIVE') {
        socket.emit('error', { message: '戰局不存在或不在進行中' });
        return;
      }

      const player = game.players.find((p) => p.userId === userId);
      if (!player) {
        socket.emit('error', { message: '你未加入此戰局' });
        return;
      }

      // Create order records
      const orderRecords = [];
      for (const order of orders) {
        const record = await prisma.order.create({
          data: {
            gameId,
            playerId: player.id,
            countryId: player.countryId,
            turn: game.currentTurn,
            type: order.type,
            fromTerritoryId: order.fromTerritoryId || null,
            targetTerritoryId: order.targetTerritoryId || null,
            infantry: order.infantry || null,
            artillery: order.artillery || null,
            cavalry: order.cavalry || null,
            details: order.details || null,
            status: 'PENDING',
          },
        });
        orderRecords.push(record);
      }

      socket.emit('orders_confirmed', {
        gameId,
        orderCount: orderRecords.length,
        timestamp: new Date().toISOString(),
      });

      socket.to(`game:${gameId}`).emit('country_ready', {
        countryId: player.countryId,
        gameId,
      });

      console.log(`[Socket] ${userId} submitted ${orderRecords.length} orders for game ${gameId}`);
    } catch (err: any) {
      console.error('[Socket] submit_orders error:', err.message);
      socket.emit('error', { message: err.message });
    }
  });

  // Mark ready
  socket.on('mark_ready', async (data: { gameId: string; countryId: string }) => {
    const { gameId, countryId } = data;
    const userId = socket.data.userId;
    if (!userId) return;

    try {
      const player = await prisma.player.findFirst({
        where: { gameId, userId },
      });
      if (player) {
        await prisma.player.update({
          where: { id: player.id },
          data: { isReady: true },
        });
      }

      io.to(`game:${gameId}`).emit('country_ready', { countryId, gameId });

      // Check if all human players are ready
      const game = await prisma.gameRoom.findUnique({
        where: { id: gameId },
        include: { players: true },
      });
      if (game) {
        const humanPlayers = game.players.filter((p) => !p.isAI);
        const allReady = humanPlayers.length > 0 && humanPlayers.every((p) => p.isReady);
        if (allReady) {
          io.to(`game:${gameId}`).emit('all_ready', { gameId });
        }
      }
    } catch (err: any) {
      console.error('[Socket] mark_ready error:', err.message);
    }
  });

  // Chat
  socket.on('chat_message', (data: {
    gameId: string;
    userId: string;
    username: string;
    message: string;
  }) => {
    io.to(`game:${data.gameId}`).emit('chat_message', {
      userId: data.userId,
      username: data.username,
      message: data.message,
      timestamp: new Date().toISOString(),
    });
  });

  // Private message
  socket.on('private_message', (data: {
    gameId: string;
    fromUserId: string;
    fromUsername: string;
    toUserId: string;
    message: string;
  }) => {
    for (const [, s] of io.sockets.sockets) {
      if (s.data.userId === data.toUserId && s.data.gameId === data.gameId) {
        s.emit('private_message', {
          fromUserId: data.fromUserId,
          fromUsername: data.fromUsername,
          message: data.message,
          timestamp: new Date().toISOString(),
        });
        break;
      }
    }
  });

  // Leave game
  socket.on('leave_game', (data: { gameId: string }) => {
    socket.leave(`game:${data.gameId}`);
    socket.to(`game:${data.gameId}`).emit('player_left', {
      userId: socket.data.userId,
      gameId: data.gameId,
    });
  });

  // Map selection sync
  socket.on('map_select', (data: { gameId: string; territoryId: string }) => {
    socket.to(`game:${data.gameId}`).emit('map_selected', {
      userId: socket.data.userId,
      territoryId: data.territoryId,
    });
  });
}
