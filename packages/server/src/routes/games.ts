import { Router } from 'express';
import { WWI_COUNTRIES, getScenario } from '@wwi/shared';
import { prisma } from '../lib/prisma.js';
import { RuleBasedAI } from '../services/rule-based-ai.js';
import { TECH_TREE, computeTechCost } from '@wwi/shared';
import { validateCountryName } from '@wwi/shared';
import { checkTechEligibility, aggregateTechEffects } from '../lib/tech-effects.js';
import allianceRouter from './alliances.js';
import { authMiddleware } from '../middleware/auth.js';
import { createRequire } from 'module';
const require_games = createRequire(import.meta.url);
const provinceNamesData = require_games('../data/province-names.json');

const router = Router();

const VALID_COUNTRY_IDS = new Set(WWI_COUNTRIES.map((c) => c.id));

/** Get valid country IDs for a game's scenario */
function getValidCountryIds(scenarioId: string): Set<string> {
  const scenario = getScenario(scenarioId);
  if (scenario) return new Set(scenario.countries.map(c => c.id));
  return VALID_COUNTRY_IDS;
}

/** Get country name zh for a scenario */
function getCountryNameZh(scenarioId: string): Record<string, string> {
  const scenario = getScenario(scenarioId);
  if (scenario) return Object.fromEntries(scenario.countries.map(c => [c.id, c.nameZh]));
  return Object.fromEntries(WWI_COUNTRIES.map(c => [c.id, c.nameZh]));
}

/** Get total countries for a scenario */
function getTotalCountries(scenarioId: string): number {
  const scenario = getScenario(scenarioId);
  return scenario ? scenario.countries.length : WWI_COUNTRIES.length;
}

// All games open for joining / in progress right now (there can be up to
// MAX_CONCURRENT_GAMES — see admin.ts — e.g. a main game + a beta test game)
async function findActiveGames() {
  return prisma.gameRoom.findMany({
    where: { status: { in: ['WAITING', 'ACTIVE'] } },
    orderBy: { createdAt: 'asc' },
    include: { players: { include: { user: true } } },
  });
}

// The specific active game a user has already joined (if any), or null.
async function findGameForUser(userId: string) {
  const games = await findActiveGames();
  return games.find((g) => g.players.some((p) => p.userId === userId)) || null;
}

function serializeGameInfo(game: Awaited<ReturnType<typeof findActiveGames>>[number], userId: string) {
  const myPlayer = game.players.find((p) => p.userId === userId);
  return {
    game: {
      id: game.id,
      name: game.name,
      status: game.status,
      currentTurn: game.currentTurn,
      createdAt: game.createdAt,
      scenarioId: game.scenarioId,
    },
    totalCountries: getTotalCountries(game.scenarioId || 'wwi-global'),
    takenCountryIds: game.players.map((p) => p.countryId),
    myCountryId: myPlayer ? myPlayer.countryId : null,
    players: game.players.map((p) => ({
      countryId: p.countryId,
      username: p.user.username,
      avatar: p.user.avatar,
      isAI: p.isAI,
    })),
  };
}

// GET /api/games/list — every currently open/active game (up to MAX_CONCURRENT_GAMES)
router.get('/list', authMiddleware, async (req: any, res) => {
  try {
    const games = await findActiveGames();
    res.json({ games: games.map((g) => serializeGameInfo(g, req.user.id)) });
  } catch (error: any) {
    console.error('[Games] list error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/games/current — kept for backward-compat; returns the user's
// joined game if any, otherwise the first open game.
router.get('/current', authMiddleware, async (req: any, res) => {
  try {
    const games = await findActiveGames();
    if (games.length === 0) {
      return res.json({
        game: null,
        totalCountries: getTotalCountries('wwi-global'),
        takenCountryIds: [],
        myCountryId: null,
        players: [],
      });
    }
    const mine = games.find((g) => g.players.some((p) => p.userId === req.user.id));
    res.json(serializeGameInfo(mine || games[0], req.user.id));
  } catch (error: any) {
    console.error('[Games] current error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games/join
router.post('/join', authMiddleware, async (req: any, res) => {
  try {
    const { countryId, gameId } = req.body as { countryId?: string; gameId?: string };

    const dbUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!dbUser) {
      return res.status(401).json({ error: 'stale_session', message: '登入資訊已失效,請重新登入' });
    }

    const activeGames = await findActiveGames();
    if (activeGames.length === 0) {
      return res.status(404).json({ error: '目前沒有進行中的戰局,請等待管理員開啟新戰局' });
    }
    // gameId is optional for backward-compat with single-game clients — default to the first open game.
    const game = gameId ? activeGames.find((g) => g.id === gameId) : activeGames[0];
    if (!game) {
      return res.status(404).json({ error: '找不到指定的戰局,可能已經結束' });
    }

    const validIds = getValidCountryIds(game.scenarioId || 'wwi-global');
    if (!countryId || !validIds.has(countryId)) {
      return res.status(400).json({ error: '無效的國家' });
    }

    const existing = game.players.find((p) => p.userId === req.user.id);
    if (existing) {
      return res.json({ gameId: game.id, countryId: existing.countryId, alreadyJoined: true });
    }

    if (game.players.length >= getTotalCountries(game.scenarioId || 'wwi-global')) {
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
      maxPlayers: getTotalCountries(game.scenarioId || 'wwi-global'),
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
        techPoints: cs.techPoints,
        unlockedTechCount: (cs.unlockedTechIds || []).length,
        politicalBranch: cs.politicalBranch,
        customName: cs.customName,
        hasRenamed: cs.hasRenamed,
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

    // Support both single order and batch (req.body.orders array)
    const orderList = Array.isArray(req.body.orders) ? req.body.orders : [req.body];
    const created = [];

    for (const ord of orderList) {
      if (!ord.type) {
        if (orderList.length === 1) return res.status(400).json({ error: '必須指定指令類型' });
        continue; // skip invalid in batch
      }
      const order = await prisma.order.create({
        data: {
          gameId: game.id,
          playerId: player.id,
          countryId: player.countryId,
          turn: game.currentTurn,
          type: ord.type,
          fromTerritoryId: ord.fromTerritoryId || null,
          targetTerritoryId: ord.targetTerritoryId || null,
          infantry: ord.infantry || null,
          artillery: ord.artillery || null,
          cavalry: ord.cavalry || null,
          divisionIds: Array.isArray(ord.divisionIds) ? ord.divisionIds : [],
          recruitComposition: ord.recruitComposition || null,
          details: ord.details || null,
          status: 'PENDING',
        },
      });
      created.push(order);
    }

    res.json({ success: true, orders: created, order: created[created.length - 1] });
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
        divisionIds: o.divisionIds,
        recruitComposition: o.recruitComposition,
        status: o.status,
        createdAt: o.createdAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games/:id/ai-suggest — generate AI-suggested orders preview (not saved)
router.post('/:id/ai-suggest', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });
    if (game.status !== 'ACTIVE') return res.status(400).json({ error: '戰局不在進行中' });

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) return res.status(403).json({ error: '你未加入此戰局' });

    // Get player's country state for current turn
    const myState = await prisma.countryState.findFirst({
      where: { gameId: game.id, countryId: player.countryId, turn: game.currentTurn },
    });
    if (!myState) return res.status(404).json({ error: '找不到你的國家狀態' });

    // Get all country states for AI assessment
    const allStates = await prisma.countryState.findMany({
      where: { gameId: game.id, turn: game.currentTurn },
    });

    // Run rule-based AI to generate suggestions
    const ruleAI = new RuleBasedAI();
    const suggestions = ruleAI.generateOrders(myState as any, allStates as any, game.currentTurn);

    // Map to client-friendly format with Chinese labels
    const COUNTRY_NAMES = getCountryNameZh(game.scenarioId || 'wwi-global');
    const TYPE_LABELS: Record<string, string> = {
      ATTACK: '進攻', DEFEND: '防守', FORTIFY: '築防', MOVE: '調動',
      RECRUIT: '徵兵', DIPLOMACY: '外交',
    };

    const labeled = suggestions.map((s, i) => ({
      index: i,
      type: s.type,
      typeLabel: TYPE_LABELS[s.type] || s.type,
      fromTerritoryId: s.fromTerritoryId,
      targetTerritoryId: s.targetTerritoryId,
      targetLabel: s.targetTerritoryId ? (COUNTRY_NAMES[s.targetTerritoryId] || (provinceNamesData['warlord-asia'] || {})[s.targetTerritoryId] || (provinceNamesData['global'] || {})[s.targetTerritoryId] || s.targetTerritoryId) : null,
      infantry: s.infantry,
      artillery: s.artillery,
      cavalry: s.cavalry,
      details: s.details,
    }));

    res.json({ success: true, suggestions: labeled });
  } catch (error: any) {
    console.error('[Games] ai-suggest error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/games/:id/tech — full tech tree + this country's progress
router.get('/:id/tech', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) return res.status(403).json({ error: '你未加入此戰局' });

    const myState = await prisma.countryState.findFirst({
      where: { gameId: game.id, countryId: player.countryId, turn: game.currentTurn },
    });
    if (!myState) return res.status(404).json({ error: '找不到你的國家狀態' });

    const unlockedIds = myState.unlockedTechIds || [];
    const nodes = TECH_TREE.map((node: any) => {
      const elig = checkTechEligibility(node, unlockedIds, myState.politicalBranch, myState.techPoints);
      return {
        id: node.id,
        nameZh: node.nameZh,
        category: node.category,
        tier: node.tier,
        requires: node.requires,
        politicalBranch: node.politicalBranch || null,
        doctrineBranch: node.doctrineBranch || null,
        unlocksRename: node.unlocksRename || false,
        effectDescZh: node.effectDescZh,
        flavorZh: node.flavorZh,
        cost: elig.effectiveCost,
        isUnlocked: unlockedIds.includes(node.id),
        canUnlock: elig.canUnlock,
        lockedReason: elig.reason || null,
      };
    });

    res.json({
      success: true,
      techPoints: myState.techPoints,
      unlockedTechIds: unlockedIds,
      politicalBranch: myState.politicalBranch,
      customName: myState.customName,
      hasRenamed: myState.hasRenamed,
      nodes,
    });
  } catch (error: any) {
    console.error('[Games] tech list error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games/:id/tech/:techId — unlock a tech node
router.post('/:id/tech/:techId', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });
    if (game.status !== 'ACTIVE') return res.status(400).json({ error: '戰局不在進行中' });

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) return res.status(403).json({ error: '你未加入此戰局' });

    const node = TECH_TREE.find((t: any) => t.id === req.params.techId);
    if (!node) return res.status(404).json({ error: '找不到此科技' });

    const myState = await prisma.countryState.findFirst({
      where: { gameId: game.id, countryId: player.countryId, turn: game.currentTurn },
    });
    if (!myState) return res.status(404).json({ error: '找不到你的國家狀態' });

    const unlockedIds = myState.unlockedTechIds || [];
    const elig = checkTechEligibility(node, unlockedIds, myState.politicalBranch, myState.techPoints);
    if (!elig.canUnlock) return res.status(400).json({ error: elig.reason || '無法解鎖此科技' });

    const newUnlockedIds = [...unlockedIds, node.id];
    const newEffects = aggregateTechEffects(newUnlockedIds);

    const data: any = {
      techPoints: myState.techPoints - elig.effectiveCost,
      unlockedTechIds: newUnlockedIds,
      techEffects: newEffects,
    };

    // One-time flat effects applied directly now
    if (node.effects.industryFlat) data.industry = myState.industry + node.effects.industryFlat;
    if (node.effects.moraleFlat) data.morale = Math.max(0, Math.min(100, myState.morale + node.effects.moraleFlat));
    if (node.effects.stabilityFlat) data.stability = Math.max(0, Math.min(100, myState.stability + node.effects.stabilityFlat));

    // Political branch commitment (first political tech locks the branch)
    if (node.category === 'political' && !myState.politicalBranch) {
      data.politicalBranch = node.politicalBranch;
    }

    await prisma.countryState.update({ where: { id: myState.id }, data });

    res.json({ success: true, message: `已解鎖「${node.nameZh}」`, techPoints: data.techPoints, unlockedTechIds: newUnlockedIds });
  } catch (error: any) {
    console.error('[Games] tech unlock error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games/:id/rename — rename own country (requires an unlocked
// political tech with unlocksRename=true; usable exactly once).
router.post('/:id/rename', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });
    if (game.status !== 'ACTIVE') return res.status(400).json({ error: '戰局不在進行中' });

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) return res.status(403).json({ error: '你未加入此戰局' });

    const myState = await prisma.countryState.findFirst({
      where: { gameId: game.id, countryId: player.countryId, turn: game.currentTurn },
    });
    if (!myState) return res.status(404).json({ error: '找不到你的國家狀態' });

    if (myState.hasRenamed) return res.status(400).json({ error: '本局已使用過改名機會' });

    const unlockedIds = myState.unlockedTechIds || [];
    const hasRenameUnlock = TECH_TREE.some((t: any) => t.unlocksRename && unlockedIds.includes(t.id));
    if (!hasRenameUnlock) return res.status(400).json({ error: '尚未解鎖可更改國名的政治科技' });

    const check = validateCountryName(req.body?.name);
    if (!check.valid) return res.status(400).json({ error: check.error });

    await prisma.countryState.update({
      where: { id: myState.id },
      data: { customName: check.sanitized, hasRenamed: true },
    });

    res.json({ success: true, message: '國名已更新', customName: check.sanitized });
  } catch (error: any) {
    console.error('[Games] rename error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/games/:id/orders/:orderId — withdraw a pending order
router.delete('/:id/orders/:orderId', authMiddleware, async (req: any, res) => {
  try {
    const game = await prisma.gameRoom.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    if (!game) return res.status(404).json({ error: '找不到戰局' });
    if (game.status !== 'ACTIVE') return res.status(400).json({ error: '戰局不在進行中' });

    const player = game.players.find((p) => p.userId === req.user.id);
    if (!player) return res.status(403).json({ error: '你未加入此戰局' });

    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
    });

    if (!order) return res.status(404).json({ error: '找不到指令' });
    if (order.playerId !== player.id) return res.status(403).json({ error: '只能撤回自己的指令' });
    if (order.status !== 'PENDING') return res.status(400).json({ error: '已結算的指令無法撤回' });
    if (order.turn !== game.currentTurn) return res.status(400).json({ error: '只能撤回本回合指令' });

    await prisma.order.delete({ where: { id: req.params.orderId } });

    res.json({ success: true, message: '指令已撤回' });
  } catch (error: any) {
    console.error('[Games] delete order error:', error.message);
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

// === Player Unit Design ===
import { UnitDesignerService } from '../services/unit-designer.js';
const playerUnitDesigner = new UnitDesignerService();

// GET /api/games/my-units — list current player's own custom units
router.get('/my-units', authMiddleware, async (req: any, res) => {
  try {
    const game = await findGameForUser(req.user.id);
    if (!game) return res.status(404).json({ error: '找不到進行中的戰局' });

    const myPlayer = game.players.find((p) => p.userId === req.user.id);
    if (!myPlayer) return res.status(403).json({ error: '你尚未選擇國家' });

    // Only show units designed in THIS game — no cross-game leakage.
    // System defaults (gameId=null) are NOT player units and are shown
    // via the military /state endpoint, not here.
    const units = await prisma.customUnit.findMany({
      where: {
        gameId: game.id,
        designedByUserId: req.user.id,
      },
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

    const game = await findGameForUser(req.user.id);
    if (!game) return res.status(404).json({ error: '找不到進行中的戰局' });

    const myPlayer = game.players.find((p) => p.userId === req.user.id);
    if (!myPlayer) return res.status(403).json({ error: '你尚未選擇國家' });

    const result = await playerUnitDesigner.designUnit({
      prompt,
      category,
      gameId: game.id,
      userId: req.user.id,
      username: req.user.username,
      countryId: myPlayer.countryId,
    });

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

// DELETE /api/games/delete-unit/:id — player can only delete their OWN unit
router.delete('/delete-unit/:id', authMiddleware, async (req: any, res) => {
  try {
    const unit = await prisma.customUnit.findUnique({ where: { id: req.params.id } });
    if (!unit) return res.status(404).json({ error: '找不到該兵種' });
    if (unit.isSystemDefault) {
      return res.status(403).json({ error: '系統預設兵種不可刪除' });
    }
    if (unit.designedByUserId !== req.user.id) {
      return res.status(403).json({ error: '只能刪除自己設計的兵種' });
    }
    await prisma.customUnit.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Alliance routes — mounted at /api/games/:id/alliances
router.use('/:id/alliances', allianceRouter);

export default router;
