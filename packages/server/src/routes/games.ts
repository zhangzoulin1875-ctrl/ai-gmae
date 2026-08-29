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

// GET /api/games/current - the one active/waiting game (or null), taken countries, and my assignment
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

// POST /api/games/join - claim a country in the current game, first-come-first-served
router.post('/join', authMiddleware, async (req: any, res) => {
  try {
    const { countryId } = req.body as { countryId?: string };
    if (!countryId || !VALID_COUNTRY_IDS.has(countryId)) {
      return res.status(400).json({ error: '無效的國家' });
    }

    const game = await findCurrentGame();
    if (!game) {
      return res.status(404).json({ error: '目前沒有進行中的戰局,請等待管理員開啟新戰局' });
    }

    // Already joined this game? Return existing assignment (idempotent).
    const existing = game.players.find((p) => p.userId === req.user.id);
    if (existing) {
      return res.json({ gameId: game.id, countryId: existing.countryId, alreadyJoined: true });
    }

    if (game.players.length >= TOTAL_COUNTRIES) {
      return res.status(409).json({ error: '所有國家已被選完,請等待下一局' });
    }

    try {
      const player = await prisma.player.create({
        data: {
          userId: req.user.id,
          gameId: game.id,
          countryId,
        },
      });
      res.json({ gameId: game.id, countryId: player.countryId, alreadyJoined: false });
    } catch (err: any) {
      // Unique constraint on [gameId, countryId] -> someone else grabbed it first
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

// GET /api/games/:id - full detail for the game screen
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: { include: { user: true } } },
    });

    if (!game) {
      return res.status(404).json({ error: '找不到此戰局' });
    }

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
    console.error('[Games] detail error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
