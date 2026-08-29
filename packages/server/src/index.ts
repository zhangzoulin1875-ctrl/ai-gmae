import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

// Load env vars
dotenv.config();

// Routes
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import gamesRoutes from './routes/games.js';

// Socket handlers
import { handleGameSockets } from './sockets/game.js';

// Services
import { TurnScheduler } from './services/turn-scheduler.js';

const app = express();
const server = http.createServer(app);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const io = new SocketIOServer(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/games', gamesRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  handleGameSockets(io, socket);

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// Turn scheduler
const scheduler = new TurnScheduler(io);
scheduler.start();

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  WWI Strategy Game Server`);
  console.log(`║  Port: ${PORT}`);
  console.log(`║  Turn Schedule: 2hr (08:00-24:00 UTC+8)`);
  console.log(`║  AI Fallback: Enabled`);
  console.log(`╚══════════════════════════════════════╝\n`);
});

export { app, server, io };
