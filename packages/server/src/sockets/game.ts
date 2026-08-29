import type { Server as SocketIOServer, Socket } from 'socket.io';

export function handleGameSockets(io: SocketIOServer, socket: Socket) {
  // Join a game room
  socket.on('join_game', (data: { gameId: string; userId: string }) => {
    const { gameId, userId } = data;
    socket.join(`game:${gameId}`);
    socket.data.gameId = gameId;
    socket.data.userId = userId;
    console.log(`[Socket] ${userId} joined game ${gameId}`);

    // Notify others in the room
    socket.to(`game:${gameId}`).emit('player_joined', { userId, gameId });
  });

  // Leave a game room
  socket.on('leave_game', (data: { gameId: string }) => {
    socket.leave(`game:${data.gameId}`);
    console.log(`[Socket] ${socket.data.userId} left game ${data.gameId}`);
  });

  // Submit orders for the turn
  socket.on('submit_orders', (data: {
    gameId: string;
    orders: any[];
    countryId: string;
  }) => {
    const { gameId, orders, countryId } = data;
    console.log(`[Socket] Orders submitted for game ${gameId}, country ${countryId}: ${orders.length} orders`);

    // TODO: Store orders in DB
    // For now, acknowledge receipt
    socket.emit('orders_acknowledged', {
      gameId,
      countryId,
      orderCount: orders.length,
      timestamp: new Date().toISOString(),
    });

    // Notify others that this country has submitted
    socket.to(`game:${gameId}`).emit('country_ready', { countryId, gameId });
  });

  // Chat messages
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

  // Private message (diplomatic communication)
  socket.on('private_message', (data: {
    gameId: string;
    fromUserId: string;
    fromUsername: string;
    toUserId: string;
    message: string;
  }) => {
    // Find the socket of the target user and send
    for (const [id, s] of io.sockets.sockets) {
      if (s.data.userId === data.toUserId && s.data.gameId === data.gameId) {
        s.emit('private_message', {
          fromUserId: data.fromUserId,
          fromUsername: data.fromUsername,
          message: data.message,
          timestamp: new Date().toISOString(),
        });
      }
    }
  });

  // Mark ready
  socket.on('mark_ready', (data: { gameId: string; countryId: string }) => {
    socket.to(`game:${data.gameId}`).emit('country_ready', {
      countryId: data.countryId,
      gameId: data.gameId,
    });
  });

  // Map interaction (for real-time cursor/selection sync)
  socket.on('map_select', (data: {
    gameId: string;
    territoryId: string;
  }) => {
    socket.to(`game:${data.gameId}`).emit('map_selected', {
      userId: socket.data.userId,
      territoryId: data.territoryId,
    });
  });
}
