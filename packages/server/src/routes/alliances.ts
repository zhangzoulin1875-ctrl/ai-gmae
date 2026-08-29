/**
 * Alliance routes — free-form alliance system replacing fixed sides.
 *
 * Endpoints:
 *  GET    /:id/alliances              — list all alliances in this game
 *  POST   /:id/alliances              — create a new alliance (player must be a game member)
 *  POST   /:id/alliances/:allianceId/apply   — apply to join an alliance
 *  POST   /:id/alliances/:allianceId/leave   — leave an alliance
 *  POST   /:id/alliances/:allianceId/approve/:countryId — leader approves a pending member
 *  POST   /:id/alliances/:allianceId/kick/:countryId    — leader kicks a member
 *  DELETE /:id/alliances/:allianceId   — leader disbands the alliance
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router({ mergeParams: true });

// GET /api/games/:id/alliances
router.get('/', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });

    const alliances = await prisma.alliance.findMany({
      where: { gameId: game.id },
      include: { members: true },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      success: true,
      alliances: alliances.map((a) => ({
        id: a.id,
        name: a.name,
        leaderCountryId: a.leaderCountryId,
        color: a.color,
        members: a.members.map((m) => ({
          countryId: m.countryId,
          status: m.status,
        })),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games/:id/alliances — create a new alliance
router.post('/', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });
    if (game.status !== 'ACTIVE') return res.status(400).json({ error: '戰局不在進行中' });

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) return res.status(403).json({ error: '你未加入此戰局' });

    // Check if country is already in an alliance
    const existing = await prisma.allianceMember.findFirst({
      where: { gameId: game.id, countryId: player.countryId },
    });
    if (existing) return res.status(400).json({ error: '你已在一個聯盟中，請先退出' });

    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: '聯盟名稱不可為空' });
    if (name.length > 20) return res.status(400).json({ error: '聯盟名稱不可超過 20 字' });

    const color = (req.body?.color || '#888888').trim();

    const alliance = await prisma.alliance.create({
      data: {
        gameId: game.id,
        name,
        leaderCountryId: player.countryId,
        color,
        members: {
          create: {
            gameId: game.id,
            countryId: player.countryId,
            status: 'LEADER',
          },
        },
      },
      include: { members: true },
    });

    res.json({
      success: true,
      alliance: {
        id: alliance.id,
        name: alliance.name,
        leaderCountryId: alliance.leaderCountryId,
        color: alliance.color,
        members: alliance.members.map((m) => ({ countryId: m.countryId, status: m.status })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games/:id/alliances/:allianceId/apply — apply to join
router.post('/:allianceId/apply', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) return res.status(403).json({ error: '你未加入此戰局' });

    // Check if already in an alliance
    const existing = await prisma.allianceMember.findFirst({
      where: { gameId: game.id, countryId: player.countryId },
    });
    if (existing) return res.status(400).json({ error: '你已在聯盟中，請先退出' });

    const alliance = await prisma.alliance.findUnique({
      where: { id: req.params.allianceId },
    });
    if (!alliance) return res.status(404).json({ error: '找不到此聯盟' });

    await prisma.allianceMember.create({
      data: {
        allianceId: alliance.id,
        gameId: game.id,
        countryId: player.countryId,
        status: 'PENDING',
      },
    });

    res.json({ success: true, message: `已申請加入「${alliance.name}」` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games/:id/alliances/:allianceId/leave — leave alliance
router.post('/:allianceId/leave', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) return res.status(403).json({ error: '你未加入此戰局' });

    const member = await prisma.allianceMember.findFirst({
      where: { gameId: game.id, countryId: player.countryId },
    });
    if (!member) return res.status(400).json({ error: '你不在任何聯盟中' });

    const alliance = await prisma.alliance.findUnique({
      where: { id: member.allianceId },
    });

    if (member.status === 'LEADER') {
      // Leader leaving = disband the alliance
      await prisma.alliance.delete({ where: { id: member.allianceId } });
      return res.json({ success: true, message: `已解散聯盟「${alliance?.name || ''}」` });
    }

    await prisma.allianceMember.delete({ where: { id: member.id } });
    res.json({ success: true, message: `已退出聯盟「${alliance?.name || ''}」` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games/:id/alliances/:allianceId/approve/:countryId — leader approves
router.post('/:allianceId/approve/:countryId', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) return res.status(403).json({ error: '你未加入此戰局' });

    const alliance = await prisma.alliance.findUnique({
      where: { id: req.params.allianceId },
    });
    if (!alliance) return res.status(404).json({ error: '找不到此聯盟' });

    if (alliance.leaderCountryId !== player.countryId) {
      return res.status(403).json({ error: '只有盟主可以審核申請' });
    }

    const applicant = await prisma.allianceMember.findFirst({
      where: {
        allianceId: alliance.id,
        gameId: game.id,
        countryId: req.params.countryId,
        status: 'PENDING',
      },
    });
    if (!applicant) return res.status(404).json({ error: '找不到此申請' });

    await prisma.allianceMember.update({
      where: { id: applicant.id },
      data: { status: 'MEMBER' },
    });

    res.json({ success: true, message: '已批准加入' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games/:id/alliances/:allianceId/kick/:countryId — leader kicks
router.post('/:allianceId/kick/:countryId', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) return res.status(403).json({ error: '你未加入此戰局' });

    const alliance = await prisma.alliance.findUnique({
      where: { id: req.params.allianceId },
    });
    if (!alliance) return res.status(404).json({ error: '找不到此聯盟' });

    if (alliance.leaderCountryId !== player.countryId) {
      return res.status(403).json({ error: '只有盟主可以驅逐成員' });
    }

    if (req.params.countryId === alliance.leaderCountryId) {
      return res.status(400).json({ error: '無法驅逐盟主，請改為解散聯盟' });
    }

    const member = await prisma.allianceMember.findFirst({
      where: {
        allianceId: alliance.id,
        gameId: game.id,
        countryId: req.params.countryId,
      },
    });
    if (!member) return res.status(404).json({ error: '此國家不在聯盟中' });

    await prisma.allianceMember.delete({ where: { id: member.id } });
    res.json({ success: true, message: '已驅逐該成員' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/games/:id/alliances/:allianceId — leader disbands
router.delete('/:allianceId', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) return res.status(403).json({ error: '你未加入此戰局' });

    const alliance = await prisma.alliance.findUnique({
      where: { id: req.params.allianceId },
    });
    if (!alliance) return res.status(404).json({ error: '找不到此聯盟' });

    if (alliance.leaderCountryId !== player.countryId) {
      return res.status(403).json({ error: '只有盟主可以解散聯盟' });
    }

    await prisma.alliance.delete({ where: { id: alliance.id } });
    res.json({ success: true, message: `已解散聯盟「${alliance.name}」` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
