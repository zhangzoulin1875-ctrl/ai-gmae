import { Router } from 'express';
import { WWI_COUNTRIES } from '@wwi/shared';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

const VALID_COUNTRY_IDS = new Set(WWI_COUNTRIES.map((c) => c.id));
const TOTAL_COUNTRIES = WWI_COUNTRIES.length;

// The single game that's open for joining / in progress right now (if any)
async function findCurrentGame() {
  return prisma.gameRoom.findFirst({
    where: { status: { in: ['WAITING', 'ACTIVE'] } },
    orderBy: { createdAt: 'desc' },
    include: { players: { include: { user: true } } },
  });
}

// GET /api/games/current
router.get('/current', authMiddleware, async (req: any, res) => {
  try {
    const game = await findCurrentGame();
    if (!game) {
      return res.json({
        game: null,
        totalCountries: TOTAL_COUNTRIES,
        takenCountryIds: [],
        myCountryId: null,
        players: [],
      });
    }

    const myPlayer = game.players.find((p) => p.userId === req.user.id);

    res.json({
      game: {
        id: game.id,
        name: game.name,
        status: game.status,
        currentTurn: game.currentTurn,
        createdAt: game.createdAt,
      },
      totalCountries: TOTAL_COUNTRIES,
      takenCountryIds: game.players.map((p) => p.countryId),
      myCountryId: myPlayer ? myPlayer.countryId : null,
      players: game.players.map((p) => ({
        countryId: p.countryId,
        username: p.user.username,
        avatar: p.user.avatar,
        isAI: p.isAI,
      })),
    });
  } catch (error: any) {
    console.error('[Games] current error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games/join
router.post('/join', authMiddleware, async (req: any, res) => {
  try {
    const { countryId } = req.body as { countryId?: string };
    if (!countryId || !VALID_COUNTRY_IDS.has(countryId)) {
      return res.status(400).json({ error: '無效的國家' });
    }

    // Defensive check: make sure the logged-in user still exists in DB.
    // A stale JWT cookie (e.g. issued before a DB reset/redeploy) would otherwise
    // fail with a confusing foreign-key error on Player.create.
    const dbUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!dbUser) {
      return res.status(401).json({ error: 'stale_session', message: '登入資訊已失效,請重新登入' });
    }

    const game = await findCurrentGame();
    if (!game) {
      return res.status(404).json({ error: '目前沒有進行中的戰局,請等待管理員開啟新戰局' });
    }

    const existing = game.players.find((p) => p.userId === req.user.id);
    if (existing) {
      return res.json({ gameId: game.id, countryId: existing.countryId, alreadyJoined: true });
    }

    if (game.players.length >= TOTAL_COUNTRIES) {
      return res.status(409).json({ error: '所有國家已被選完,請等待下一局' });
    }

    try {
      const player = await prisma.player.create({
        data: { userId: req.user.id, gameId: game.id, countryId },
      });
      res.json({ gameId: game.id, countryId: player.countryId, alreadyJoined: false });
    } catch (err: any) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: '太慢了!這個國家剛被其他玩家選走,請重新選擇' });
      }
      throw err;
    }
  } catch (error: any) {
    console.error('[Games] join error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/games/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: { include: { user: true } } },
    });
    if (!game) return res.status(404).json({ error: '找不到此戰局' });

    res.json({
      id: game.id,
      name: game.name,
      status: game.status,
      currentTurn: game.currentTurn,
      maxPlayers: TOTAL_COUNTRIES,
      turnIntervalHours: game.turnIntervalHrs,
      lastTurnResolvedAt: game.lastTurnAt,
      nextTurnAt: game.nextTurnAt,
      players: game.players.map((p) => ({
        id: p.id,
        discordId: p.user.discordId,
        username: p.user.username,
        avatar: p.user.avatar,
        countryId: p.countryId,
        isReady: p.isReady,
        joinedAt: p.joinedAt,
      })),
      countryStates: {},
      territories: {},
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/games/:id/state — full game state with country stats
router.get('/:id/state', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: { include: { user: true } } },
    });
    if (!game) return res.status(404).json({ error: '找不到此戰局' });

    const myPlayer = game.players.find((p) => p.userId === req.user.id);

    // Get latest country states
    const countryStates = await prisma.countryState.findMany({
      where: { gameId: game.id, turn: game.currentTurn },
    });

    res.json({
      game: {
        id: game.id,
        name: game.name,
        status: game.status,
        currentTurn: game.currentTurn,
        nextTurnAt: game.nextTurnAt,
      },
      myCountryId: myPlayer ? myPlayer.countryId : null,
      players: game.players.map((p) => ({
        countryId: p.countryId,
        username: p.user.username,
        avatar: p.user.avatar,
        isAI: p.isAI,
        isReady: p.isReady,
      })),
      countryStates: countryStates.map((cs) => ({
        countryId: cs.countryId,
        infantry: cs.infantry,
        artillery: cs.artillery,
        cavalry: cs.cavalry,
        morale: cs.morale,
        gold: cs.gold,
        industry: cs.industry,
        manpower: cs.manpower,
        stability: cs.stability,
        isAIControlled: cs.isAIControlled,
      })),
    });
  } catch (error: any) {
    console.error('[Games] state error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games/:id/orders — submit an order
router.post('/:id/orders', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });
    if (game.status !== 'ACTIVE') return res.status(400).json({ error: '戰局不在進行中' });

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) return res.status(403).json({ error: '你未加入此戰局' });

    const { type, fromTerritoryId, targetTerritoryId, infantry, artillery, cavalry, details } = req.body;

    if (!type) return res.status(400).json({ error: '必須指定指令類型' });

    const order = await prisma.order.create({
      data: {
        gameId: game.id,
        playerId: player.id,
        countryId: player.countryId,
        turn: game.currentTurn,
        type,
        fromTerritoryId: fromTerritoryId || null,
        targetTerritoryId: targetTerritoryId || null,
        infantry: infantry || null,
        artillery: artillery || null,
        cavalry: cavalry || null,
        details: details || null,
        status: 'PENDING',
      },
    });

    res.json({ order });
  } catch (error: any) {
    console.error('[Games] orders error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/games/:id/orders — get my orders for current turn
router.get('/:id/orders', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) return res.json({ orders: [] });

    const orders = await prisma.order.findMany({
      where: { gameId: game.id, playerId: player.id, turn: game.currentTurn },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      orders: orders.map((o) => ({
        id: o.id,
        type: o.type,
        fromTerritoryId: o.fromTerritoryId,
        targetTerritoryId: o.targetTerritoryId,
        units: { infantry: o.infantry || 0, artillery: o.artillery || 0, cavalry: o.cavalry || 0 },
        status: o.status,
        createdAt: o.createdAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games/:id/ready — mark ready
router.post('/:id/ready', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) return res.status(403).json({ error: '你未加入此戰局' });

    await prisma.player.update({
      where: { id: player.id },
      data: { isReady: true },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

// === Player Unit Design ===
import { UnitDesignerService } from '../services/unit-designer.js';
const playerUnitDesigner = new UnitDesignerService();

// GET /api/games/my-units — list current player's custom units
router.get('/my-units', authMiddleware, async (req: any, res) => {
  try {
    const game = await findCurrentGame();
    if (!game) return res.status(404).json({ error: '找不到進行中的戰局' });

    const myPlayer = game.players.find((p) => p.userId === req.user.id);
    if (!myPlayer) return res.status(403).json({ error: '你尚未選擇國家' });

    const units = await prisma.customUnit.findMany({
      where: { OR: [{ gameId: game.id }, { gameId: null }] },
      orderBy: { category: 'asc' },
    });
    res.json({ units, countryId: myPlayer.countryId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games/design-unit — player designs their own unit
router.post('/design-unit', authMiddleware, async (req: any, res) => {
  try {
    const { prompt, category } = req.body;
    if (!prompt || !category) return res.status(400).json({ error: '必須提供提示詞和兵種類別' });

    const game = await findCurrentGame();
    if (!game) return res.status(404).json({ error: '找不到進行中的戰局' });

    const myPlayer = game.players.find((p) => p.userId === req.user.id);
    if (!myPlayer) return res.status(403).json({ error: '你尚未選擇國家' });

    const result = await playerUnitDesigner.designUnit({ prompt, category, gameId: game.id });

    if (result.success) {
      res.json({ success: true, unit: result.unit });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('[Games] design-unit error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/games/delete-unit/:id — player deletes their own unit
router.delete('/delete-unit/:id', authMiddleware, async (req: any, res) => {
  try {
    await prisma.customUnit.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
