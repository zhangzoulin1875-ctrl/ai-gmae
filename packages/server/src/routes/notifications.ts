import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/notifications
router.get('/', authMiddleware, async (req: any, res) => {
  try {
    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 30));

    // Find current game user belongs to
    const game = await prisma.gameRoom.findFirst({
      where: { status: { in: ['WAITING', 'ACTIVE'] } },
      orderBy: { createdAt: 'desc' },
      include: { players: true },
    });

    if (!game) {
      return res.json({ notifications: [] });
    }

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) {
      return res.json({ notifications: [] });
    }

    const whereClause: any = {
      playerId: player.id,
    };
    if (unreadOnly) {
      whereClause.isRead = false;
    }

    const notifications = await prisma.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({ notifications });
  } catch (error: any) {
    console.error('[Notifications] GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/notifications/:id/read
router.post('/:id/read', authMiddleware, async (req: any, res) => {
  try {
    const notificationId = req.params.id;

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      return res.status(404).json({ error: '找不到此通知' });
    }

    // Ownership check: player associated with this user
    const player = await prisma.player.findFirst({
      where: { id: notification.playerId || '', userId: req.user.id },
    });

    if (!player && notification.playerId) {
      return res.status(403).json({ error: '無權限修改此通知' });
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    res.json({ success: true, notification: updated });
  } catch (error: any) {
    console.error('[Notifications] Read error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/notifications/read-all
router.post('/read-all', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findFirst({
      where: { status: { in: ['WAITING', 'ACTIVE'] } },
      orderBy: { createdAt: 'desc' },
      include: { players: true },
    });

    if (!game) {
      return res.json({ success: true, count: 0 });
    }

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) {
      return res.json({ success: true, count: 0 });
    }

    const result = await prisma.notification.updateMany({
      where: { playerId: player.id, isRead: false },
      data: { isRead: true },
    });

    res.json({ success: true, count: result.count });
  } catch (error: any) {
    console.error('[Notifications] Read-all error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
