import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// POST /api/policies/submit
router.post('/submit', authMiddleware, async (req: any, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content || !String(title).trim() || !String(content).trim()) {
      return res.status(400).json({ error: '標題與政策內容不可為空' });
    }

    // Find active game user belongs to
    const game = await prisma.gameRoom.findFirst({
      where: { status: { in: ['WAITING', 'ACTIVE'] } },
      orderBy: { createdAt: 'desc' },
      include: { players: true },
    });

    if (!game) {
      return res.status(404).json({ error: '目前沒有進行中的戰局' });
    }

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) {
      return res.status(403).json({ error: '你尚未加入此戰局' });
    }

    const currentTurn = game.currentTurn;

    // Check if player already has a pending policy for this turn
    const existingPending = await prisma.policySubmission.findFirst({
      where: {
        gameId: game.id,
        playerId: player.id,
        turn: currentTurn,
        status: 'PENDING',
      },
    });

    if (existingPending) {
      return res.status(409).json({ error: '本回合已提交過政策' });
    }

    const policy = await prisma.policySubmission.create({
      data: {
        gameId: game.id,
        countryId: player.countryId,
        playerId: player.id,
        turn: currentTurn,
        title: String(title).trim(),
        content: String(content).trim(),
        status: 'PENDING',
      },
    });

    res.json({ success: true, policy });
  } catch (error: any) {
    console.error('[Policies] Submit error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/policies/mine
router.get('/mine', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findFirst({
      where: { status: { in: ['WAITING', 'ACTIVE'] } },
      orderBy: { createdAt: 'desc' },
      include: { players: true },
    });

    if (!game) {
      return res.json({ policies: [] });
    }

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) {
      return res.json({ policies: [] });
    }

    const policies = await prisma.policySubmission.findMany({
      where: { playerId: player.id },
      orderBy: { turn: 'desc' },
      take: 30,
    });

    res.json({ policies });
  } catch (error: any) {
    console.error('[Policies] Mine error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
