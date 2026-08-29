import { Router } from 'express';
import jwt from 'jsonwebtoken';
import type { AIConfig, AIProvider } from '@wwi/shared';
import { AIEngine } from '../services/ai-engine.js';
import { WWI_COUNTRIES } from '@wwi/shared';
import { prisma } from '../lib/prisma.js';
import { initializeGameCountries } from '../services/game-init.js';
import { TurnResolver } from '../services/turn-resolver.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'wwi-game-secret-change-in-production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// In-memory config (will be backed by DB later)
let currentAIConfig: AIConfig | null = null;

// Admin login
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// Auth middleware
const adminAuth = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Not admin' });
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Get admin config
router.get('/config', adminAuth, async (_req, res) => {
  try {
    res.json({
      aiConfig: currentAIConfig || getDefaultConfig(),
      turnIntervalHours: 2,
      quietHoursStartUTC8: 0,
      quietHoursEndUTC8: 8,
      maxPlayersPerGame: -1, // -1 = unlimited
      maintenanceMode: false,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update AI config
router.put('/ai-config', adminAuth, async (req, res) => {
  try {
    const config: AIConfig = req.body;
    if (!config.fallbackChain || !config.fallbackChain.providers) {
      return res.status(400).json({ error: 'Invalid config format' });
    }

    // Save API keys to environment variables for the AI engine
    for (const provider of config.fallbackChain.providers) {
      if (provider.type === 'openai' && provider.apiKey) {
        process.env.OPENAI_API_KEY = provider.apiKey;
        if (provider.endpoint) process.env.OPENAI_BASE_URL = provider.endpoint;
      }
      if (provider.type === 'custom' && provider.apiKey) {
        // Store in env with provider id as suffix
        process.env[`AI_KEY_${provider.id}`] = provider.apiKey;
        if (provider.endpoint) process.env[`AI_URL_${provider.id}`] = provider.endpoint;
      }
    }

    currentAIConfig = config;
    res.json({ success: true, config });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Test AI provider connection
router.post('/test-provider', adminAuth, async (req, res) => {
  try {
    const { provider } = req.body as { provider: AIProvider };
    if (!provider) return res.status(400).json({ error: 'Provider required' });

    const engine = new AIEngine({
      providers: [provider],
      enableDeterministicFallback: false,
      maxTotalTimeoutMs: 30000,
    });

    const testResult = await engine.testConnection(provider);
    res.json(testResult);
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

const TOTAL_COUNTRIES = WWI_COUNTRIES.length;

// Get all games (admin) - most recent first, with player counts
router.get('/games', adminAuth, async (_req, res) => {
  try {
    const games = await prisma.gameRoom.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { players: true },
    });

    res.json({
      games: games.map((g) => ({
        id: g.id,
        name: g.name,
        status: g.status,
        currentTurn: g.currentTurn,
        playerCount: g.players.length,
        maxPlayers: TOTAL_COUNTRIES,
        createdAt: g.createdAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Open a new game - only one WAITING/ACTIVE game is allowed at a time
router.post('/games', adminAuth, async (req, res) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '戰局名稱必填' });
    }

    const existing = await prisma.gameRoom.findFirst({
      where: { status: { in: ['WAITING', 'ACTIVE'] } },
    });
    if (existing) {
      return res.status(409).json({ error: `已有進行中的戰局「${existing.name}」,請先結束才能開啟新戰局` });
    }

    const game = await prisma.gameRoom.create({
      data: { name: name.trim(), status: 'ACTIVE' },
    });

    // Initialize all 54 country states with starting values
    await initializeGameCountries(game.id);

    res.json({ success: true, game });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// End the current game, freeing things up for a new one
router.post('/games/:gameId/end', adminAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await prisma.gameRoom.update({
      where: { id: gameId },
      data: { status: 'COMPLETED' },
    });
    res.json({ success: true, game });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Assign AI to empty country
router.post('/games/:gameId/assign-ai', adminAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { countryId } = req.body;
    if (!countryId) return res.status(400).json({ error: '必須指定國家' });

    // Check if human player already controls this country
    const existingHuman = await prisma.player.findFirst({
      where: { gameId, countryId, isAI: false },
    });
    if (existingHuman) return res.status(409).json({ error: '該國家已有人類玩家' });

    // Find or create an AI user
    let aiUser = await prisma.user.findFirst({ where: { discordId: `ai-${countryId}` } });
    if (!aiUser) {
      const countryDef = WWI_COUNTRIES.find((c) => c.id === countryId);
      aiUser = await prisma.user.create({
        data: { discordId: `ai-${countryId}`, username: `AI - ${countryDef?.nameZh || countryId}`, isAdmin: false },
      });
    }

    // Remove existing AI player for this country if any
    await prisma.player.deleteMany({ where: { gameId, countryId, isAI: true } });

    // Create AI Player with formula mode by default
    await prisma.player.create({
      data: {
        userId: aiUser.id,
        gameId,
        countryId,
        isAI: true,
        isReady: true,
        aiPersonality: 'formula',
      },
    });

    // Update CountryState
    const game = await prisma.gameRoom.findUnique({ where: { id: gameId } });
    if (game) {
      await prisma.countryState.updateMany({
        where: { gameId, countryId, turn: game.currentTurn },
        data: { isAIControlled: true },
      });
    }

    res.json({ success: true, message: `已指派 AI 控制 ${countryId}（預設：公式引擎）` });
  } catch (error: any) {
    console.error('[Admin] assign-ai error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Remove AI from country
router.post('/games/:gameId/remove-ai', adminAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { countryId } = req.body;
    if (!countryId) return res.status(400).json({ error: '必須指定國家' });

    await prisma.player.deleteMany({ where: { gameId, countryId, isAI: true } });

    const game = await prisma.gameRoom.findUnique({ where: { id: gameId } });
    if (game) {
      await prisma.countryState.updateMany({
        where: { gameId, countryId, turn: game.currentTurn },
        data: { isAIControlled: false },
      });
    }

    res.json({ success: true, message: `已撤除 ${countryId} 的 AI 控制` });
  } catch (error: any) {
    console.error('[Admin] remove-ai error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Force resolve turn
router.post('/games/:gameId/force-turn', adminAuth, async (req, res) => {
  try {
    const resolver = new TurnResolver();
    const result = await resolver.resolveTurn(req.params.gameId);
    res.json(result);
  } catch (error: any) {
    console.error('[Admin] force-turn error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Manual turn resolution (for testing)
router.post('/games/:gameId/resolve-turn', adminAuth, async (req, res) => {
  try {
    const resolver = new TurnResolver();
    const result = await resolver.resolveTurn(req.params.gameId);
    res.json(result);
  } catch (error: any) {
    console.error('[Admin] resolve-turn error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

function getDefaultConfig(): AIConfig {
  return {
    activeProviderId: '',
    fallbackChain: {
      providers: [
        {
          id: 'default-openai',
          name: 'OpenAI Compatible',
          type: 'openai',
          apiKey: process.env.OPENAI_API_KEY || '',
          endpoint: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
          model: 'gpt-4o',
          priority: 1,
          isEnabled: true,
          timeoutMs: 30000,
          maxRetries: 2,
        },
        {
          id: 'default-google',
          name: 'Google AI',
          type: 'custom',
          apiKey: process.env.GOOGLE_AI_API_KEY || '',
          endpoint: 'https://generativelanguage.googleapis.com/v1beta',
          model: 'gemini-1.5-pro',
          priority: 2,
          isEnabled: true,
          timeoutMs: 30000,
          maxRetries: 2,
        },
      ],
      enableDeterministicFallback: true,
      maxTotalTimeoutMs: 120000,
    },
    temperature: 0.7,
    updatedAt: new Date().toISOString(),
  };
}

export default router;

// === Dashboard Stats ===
router.get('/stats', adminAuth, async (_req, res) => {
  try {
    const [totalGames, activeGames, totalPlayers, aiPlayers, totalOrders, totalResolutions] = await Promise.all([
      prisma.gameRoom.count(),
      prisma.gameRoom.count({ where: { status: 'ACTIVE' } }),
      prisma.player.count(),
      prisma.player.count({ where: { isAI: true } }),
      prisma.order.count(),
      prisma.turnResolution.count(),
    ]);

    const aiApiCalls = await prisma.turnResolution.count({
      where: { resolvedByProvider: { not: 'deterministic-fallback' } },
    });

    const latestGame = await prisma.gameRoom.findFirst({
      orderBy: { createdAt: 'desc' },
      include: { players: true },
    });

    res.json({
      totalGames,
      activeGames,
      totalPlayers,
      aiCountries: aiPlayers,
      totalOrders,
      totalResolutions,
      aiApiCalls,
      latestGame: latestGame ? {
        id: latestGame.id,
        name: latestGame.name,
        status: latestGame.status,
        currentTurn: latestGame.currentTurn,
        playerCount: latestGame.players.length,
      } : null,
    });
  } catch (error: any) {
    console.error('[Admin] stats error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// === Player Management ===
router.get('/players', adminAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const skip = Number(req.query.skip) || 0;
    const search = req.query.search as string | undefined;
    const filterAI = req.query.isAI as string | undefined;
    const filterGameId = req.query.gameId as string | undefined;

    const where: any = {};
    if (filterAI === 'true') where.isAI = true;
    if (filterAI === 'false') where.isAI = false;
    if (filterGameId) where.gameId = filterGameId;
    if (search) {
      where.user = { username: { contains: search, mode: 'insensitive' } };
    }

    const players = await prisma.player.findMany({
      where,
      include: { user: true, game: true },
      orderBy: { joinedAt: 'desc' },
      take: limit,
      skip,
    });

    const total = await prisma.player.count({ where });

    res.json({
      players: players.map((p) => ({
        id: p.id,
        username: p.user.username,
        discordId: p.user.discordId,
        avatar: p.user.avatar,
        countryId: p.countryId,
        gameId: p.gameId,
        gameName: p.game?.name || '',
        isAI: p.isAI,
        isReady: p.isReady,
        joinedAt: p.joinedAt,
      })),
      total,
    });
  } catch (error: any) {
    console.error('[Admin] players error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// === AI Unassign ===
router.post('/games/:gameId/unassign-ai', adminAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { countryId } = req.body;
    if (!countryId) return res.status(400).json({ error: '必須指定國家' });

    await prisma.player.deleteMany({
      where: { gameId, countryId, isAI: true },
    });

    const latestTurn = await prisma.gameRoom.findUnique({ where: { id: gameId } });
    if (latestTurn) {
      await prisma.countryState.updateMany({
        where: { gameId, countryId, turn: latestTurn.currentTurn },
        data: { isAIControlled: false },
      });
    }

    res.json({ success: true, message: `已撤除 ${countryId} 的 AI 控制` });
  } catch (error: any) {
    console.error('[Admin] unassign-ai error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// === Get country control status for a game ===
router.get('/games/:gameId/countries', adminAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await prisma.gameRoom.findUnique({
      where: { id: gameId },
      include: { players: { include: { user: true } } },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });

    const countries = WWI_COUNTRIES.map((c) => {
      const player = game.players.find((p) => p.countryId === c.id);
      return {
        countryId: c.id,
        nameZh: c.nameZh,
        flagIcon: c.flagIcon,
        side: c.side,
        controller: player
          ? { type: player.isAI ? 'ai' : 'human', username: player.user.username, isReady: player.isReady, mode: player.aiPersonality || 'formula' }
          : { type: 'empty' },
      };
    });

    res.json({ countries, totalCountries: countries.length });
  } catch (error: any) {
    console.error('[Admin] countries error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// === Switch AI mode (formula/llm) for a country ===
router.post('/games/:gameId/ai-mode', adminAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { countryId, mode } = req.body;
    if (!countryId) return res.status(400).json({ error: '必須指定國家' });
    if (mode !== 'formula' && mode !== 'llm') return res.status(400).json({ error: '模式必須是 formula 或 llm' });

    // Update the AI Player's aiPersonality field
    const player = await prisma.player.findFirst({
      where: { gameId, countryId, isAI: true },
    });

    if (!player) return res.status(404).json({ error: '該國家未被指派為 AI' });

    await prisma.player.update({
      where: { id: player.id },
      data: { aiPersonality: mode },
    });

    res.json({ success: true, message: `${countryId} 已切換為 ${mode === 'formula' ? '公式引擎' : 'AI/LLM 引擎'}` });
  } catch (error: any) {
    console.error('[Admin] ai-mode error:', error.message);
    res.status(500).json({ error: error.message });
  }
});
