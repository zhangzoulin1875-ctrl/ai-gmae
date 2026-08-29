import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { ensureStockpileMigration } from '../services/military-init.js';
import { recruitCost } from '@wwi/shared';

const router = Router();

// Helper to find player's active game
async function getPlayerGameContext(userId: string) {
  const game = await prisma.gameRoom.findFirst({
    where: { status: { in: ['WAITING', 'ACTIVE'] } },
    orderBy: { createdAt: 'desc' },
    include: { players: true },
  });

  if (!game) return { game: null, player: null };

  const player = game.players.find((p) => p.userId === userId);
  return { game, player };
}

// GET /api/military/state
router.get('/state', authMiddleware, async (req: any, res) => {
  try {
    const { game, player } = await getPlayerGameContext(req.user.id);
    if (!game || !player) {
      return res.status(404).json({ error: '找不到進行中的戰局或玩家未加入' });
    }

    // Ensure stockpile migration has run
    await ensureStockpileMigration(game.id);

    // 1. Current CountryState
    const countryState = await prisma.countryState.findFirst({
      where: { gameId: game.id, countryId: player.countryId, turn: game.currentTurn },
    });

    // 2. Stockpile (quantity > 0)
    const stockRows = await prisma.countryUnitStock.findMany({
      where: { gameId: game.id, countryId: player.countryId, quantity: { gt: 0 } },
    });

    const stockUnitIds = stockRows.map((s) => s.customUnitId);
    const stockUnits = await prisma.customUnit.findMany({
      where: { id: { in: stockUnitIds } },
    });
    const stockUnitMap = new Map(stockUnits.map((u) => [u.id, u]));

    const stockpile = stockRows
      .map((s) => {
        const u = stockUnitMap.get(s.customUnitId);
        if (!u) return null;
        return {
          customUnitId: u.id,
          nameZh: u.nameZh,
          category: u.category,
          quantity: s.quantity,
          attack: u.attack,
          defense: u.defense,
          speed: u.speed,
          costGold: u.costGold,
          costManpower: u.costManpower,
          costIndustry: u.costIndustry,
        };
      })
      .filter(Boolean);

    // 3. Divisions (ACTIVE)
    const divisionRows = await prisma.division.findMany({
      where: { gameId: game.id, countryId: player.countryId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });

    // Gather all unit IDs in division compositions
    const divUnitIdsSet = new Set<string>();
    for (const d of divisionRows) {
      if (d.composition && typeof d.composition === 'object') {
        Object.keys(d.composition as Record<string, number>).forEach((uid) => divUnitIdsSet.add(uid));
      }
    }

    const divUnits = await prisma.customUnit.findMany({
      where: { id: { in: Array.from(divUnitIdsSet) } },
    });
    const divUnitMap = new Map(divUnits.map((u) => [u.id, u]));

    const divisions = divisionRows.map((d) => {
      const compObj = (d.composition as Record<string, number>) || {};
      let totalUnits = 0;
      const composition: Array<{ customUnitId: string; nameZh: string; category: string; quantity: number }> = [];

      for (const [uid, qty] of Object.entries(compObj)) {
        if (qty <= 0) continue;
        totalUnits += qty;
        const u = divUnitMap.get(uid);
        composition.push({
          customUnitId: uid,
          nameZh: u?.nameZh || uid,
          category: u?.category || 'unknown',
          quantity: qty,
        });
      }

      return {
        id: d.id,
        name: d.name,
        status: d.status,
        composition,
        totalUnits,
      };
    });

    // 4. Available CustomUnits for recruitment
    // System defaults (gameId=null, isSystemDefault=true) are global and
    // available to everyone. Player-designed units are scoped to the
    // current game only — no cross-game leakage.
    const availableUnits = await prisma.customUnit.findMany({
      where: {
        OR: [
          { isSystemDefault: true },
          { designedByUserId: req.user.id, gameId: game.id },
        ],
      },
      orderBy: { category: 'asc' },
    });

    res.json({
      countryState,
      stockpile,
      divisions,
      availableUnits,
    });
  } catch (error: any) {
    console.error('[Military] GET /state error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/military/recruit
router.post('/recruit', authMiddleware, async (req: any, res) => {
  try {
    const { game, player } = await getPlayerGameContext(req.user.id);
    if (!game || !player) {
      return res.status(404).json({ error: '找不到進行中的戰局或玩家未加入' });
    }

    let composition: Record<string, number> = {};

    if (req.body.recruitComposition && typeof req.body.recruitComposition === 'object') {
      composition = req.body.recruitComposition;
    } else if (req.body.customUnitId && typeof req.body.quantity === 'number') {
      composition = { [req.body.customUnitId]: req.body.quantity };
    } else {
      return res.status(400).json({ error: '請提供要招募的兵種與數量' });
    }

    const unitEntries = Object.entries(composition).filter(([_, qty]) => Number(qty) > 0);
    if (unitEntries.length === 0) {
      return res.status(400).json({ error: '招募數量必須大於 0' });
    }

    const unitIds = unitEntries.map(([uid]) => uid);
    const units = await prisma.customUnit.findMany({
      where: { id: { in: unitIds } },
    });

    const unitMap = new Map(units.map((u) => [u.id, u]));

    // Validate ownership/permission
    for (const [uid] of unitEntries) {
      const u = unitMap.get(uid);
      if (!u) {
        return res.status(400).json({ error: `找不到兵種 (ID: ${uid})` });
      }
      if (!u.isSystemDefault && u.designedByUserId !== req.user.id) {
        return res.status(403).json({ error: `無權限招募兵種「${u.nameZh}」` });
      }
      // Reject units from other games — no cross-game pollution
      if (!u.isSystemDefault && u.gameId && u.gameId !== game.id) {
        return res.status(403).json({ error: `兵種「${u.nameZh}」屬於其他戰局，無法在本局招募` });
      }
      if (!u.isSystemDefault && !u.gameId) {
        return res.status(403).json({ error: `兵種「${u.nameZh}」未綁定至本戰局，無法招募` });
      }
    }

    // Compute cost (gold/industry scale per-100-recruited; manpower is 1:1 per soldier)
    let totalCostGold = 0;
    let totalCostManpower = 0;
    let totalCostIndustry = 0;

    for (const [uid, qtyRaw] of unitEntries) {
      const qty = Math.floor(Number(qtyRaw));
      const u = unitMap.get(uid)!;
      const cost = recruitCost(u, qty);
      totalCostGold += cost.gold;
      totalCostManpower += cost.manpower;
      totalCostIndustry += cost.industry;
    }

    // Get current CountryState
    const countryState = await prisma.countryState.findFirst({
      where: { gameId: game.id, countryId: player.countryId, turn: game.currentTurn },
    });

    if (!countryState) {
      return res.status(500).json({ error: '無法讀取目前國家狀態' });
    }

    // Account for pending RECRUIT orders this turn
    const pendingRecruits = await prisma.order.findMany({
      where: {
        gameId: game.id,
        countryId: player.countryId,
        turn: game.currentTurn,
        type: 'RECRUIT',
        status: 'PENDING',
      },
    });

    let committedGold = 0;
    let committedManpower = 0;
    let committedIndustry = 0;

    // Fetch units for pending recruits to calculate committed costs
    const pendingUnitIds = new Set<string>();
    for (const pr of pendingRecruits) {
      if (pr.recruitComposition && typeof pr.recruitComposition === 'object') {
        Object.keys(pr.recruitComposition as Record<string, number>).forEach((uid) => pendingUnitIds.add(uid));
      }
    }

    const pendingUnits = await prisma.customUnit.findMany({
      where: { id: { in: Array.from(pendingUnitIds) } },
    });
    const pendingUnitMap = new Map(pendingUnits.map((u) => [u.id, u]));

    for (const pr of pendingRecruits) {
      if (pr.recruitComposition && typeof pr.recruitComposition === 'object') {
        for (const [uid, qty] of Object.entries(pr.recruitComposition as Record<string, number>)) {
          const u = pendingUnitMap.get(uid);
          if (u) {
            const cost = recruitCost(u, qty);
            committedGold += cost.gold;
            committedManpower += cost.manpower;
            committedIndustry += cost.industry;
          }
        }
      }
    }

    const availableGold = countryState.gold - committedGold;
    const availableManpower = countryState.manpower - committedManpower;
    const availableIndustry = countryState.industry - committedIndustry;

    if (availableGold < totalCostGold) {
      return res.status(400).json({
        error: `黃金不足！尚需 ${totalCostGold} 黃金，目前可用 ${availableGold} (已預扣 ${committedGold})`,
      });
    }
    if (availableManpower < totalCostManpower) {
      return res.status(400).json({
        error: `人力不足！尚需 ${totalCostManpower} 人力，目前可用 ${availableManpower} (已預扣 ${committedManpower})`,
      });
    }
    if (availableIndustry < totalCostIndustry) {
      return res.status(400).json({
        error: `工業點數不足！尚需 ${totalCostIndustry} 工業點數，目前可用 ${availableIndustry} (已預扣 ${committedIndustry})`,
      });
    }

    // Build recruitComposition object with exact quantities
    const cleanComposition: Record<string, number> = {};
    for (const [uid, qtyRaw] of unitEntries) {
      cleanComposition[uid] = Math.floor(Number(qtyRaw));
    }

    // Create RECRUIT order
    const order = await prisma.order.create({
      data: {
        gameId: game.id,
        playerId: player.id,
        countryId: player.countryId,
        turn: game.currentTurn,
        type: 'RECRUIT',
        recruitComposition: cleanComposition,
        status: 'PENDING',
        details: `招募部隊指令 (預估耗費 ${totalCostGold} 黃金)`,
      },
    });

    res.json({
      order,
      totalCost: {
        gold: totalCostGold,
        manpower: totalCostManpower,
        industry: totalCostIndustry,
      },
    });
  } catch (error: any) {
    console.error('[Military] POST /recruit error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/military/divisions — create division from stock
router.post('/divisions', authMiddleware, async (req: any, res) => {
  try {
    const { name, composition } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: '師團名稱不可為空' });
    }

    if (!composition || typeof composition !== 'object') {
      return res.status(400).json({ error: '請提供編制內容' });
    }

    const { game, player } = await getPlayerGameContext(req.user.id);
    if (!game || !player) {
      return res.status(404).json({ error: '找不到進行中的戰局或玩家未加入' });
    }

    const compEntries = Object.entries(composition)
      .map(([uid, qty]) => [uid, Math.floor(Number(qty))] as [string, number])
      .filter(([_, qty]) => qty > 0);

    if (compEntries.length === 0) {
      return res.status(400).json({ error: '師團編制單位數量必須大於 0' });
    }

    // Verify stock availability
    const requiredUnitIds = compEntries.map(([uid]) => uid);
    const stockRows = await prisma.countryUnitStock.findMany({
      where: {
        gameId: game.id,
        countryId: player.countryId,
        customUnitId: { in: requiredUnitIds },
      },
    });

    const stockMap = new Map(stockRows.map((s) => [s.customUnitId, s]));

    for (const [uid, requiredQty] of compEntries) {
      const stock = stockMap.get(uid);
      const availableQty = stock ? stock.quantity : 0;
      if (availableQty < requiredQty) {
        return res.status(400).json({
          error: `軍備庫存不足！單位 (ID: ${uid}) 需要 ${requiredQty}，庫存僅剩 ${availableQty}`,
        });
      }
    }

    // Atomically decrement stock and create division
    const cleanComp: Record<string, number> = {};
    for (const [uid, qty] of compEntries) {
      cleanComp[uid] = qty;
    }

    const division = await prisma.$transaction(async (tx) => {
      for (const [uid, qty] of compEntries) {
        await tx.countryUnitStock.update({
          where: {
            gameId_countryId_customUnitId: {
              gameId: game.id,
              countryId: player.countryId,
              customUnitId: uid,
            },
          },
          data: {
            quantity: { decrement: qty },
          },
        });
      }

      return tx.division.create({
        data: {
          gameId: game.id,
          countryId: player.countryId,
          name: String(name).trim(),
          composition: cleanComp,
          status: 'ACTIVE',
        },
      });
    });

    res.json({ division });
  } catch (error: any) {
    console.error('[Military] POST /divisions error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/military/divisions/:id — rename division
router.patch('/divisions/:id', authMiddleware, async (req: any, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: '新師團名稱不可為空' });
    }

    const { game, player } = await getPlayerGameContext(req.user.id);
    if (!game || !player) {
      return res.status(404).json({ error: '找不到進行中的戰局或玩家未加入' });
    }

    const divId = req.params.id;
    const division = await prisma.division.findUnique({
      where: { id: divId },
    });

    if (!division) {
      return res.status(404).json({ error: '找不到此師團' });
    }

    if (division.countryId !== player.countryId || division.gameId !== game.id) {
      return res.status(403).json({ error: '無權限修改此師團' });
    }

    const updated = await prisma.division.update({
      where: { id: divId },
      data: { name: String(name).trim() },
    });

    res.json({ division: updated });
  } catch (error: any) {
    console.error('[Military] PATCH /divisions/:id error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/military/divisions/:id — disband division & return stock
router.delete('/divisions/:id', authMiddleware, async (req: any, res) => {
  try {
    const { game, player } = await getPlayerGameContext(req.user.id);
    if (!game || !player) {
      return res.status(404).json({ error: '找不到進行中的戰局或玩家未加入' });
    }

    const divId = req.params.id;
    const division = await prisma.division.findUnique({
      where: { id: divId },
    });

    if (!division) {
      return res.status(404).json({ error: '找不到此師團' });
    }

    if (division.countryId !== player.countryId || division.gameId !== game.id) {
      return res.status(403).json({ error: '無權限解散此師團' });
    }

    if (division.status === 'DISBANDED') {
      return res.status(400).json({ error: '該師團已被解散' });
    }

    const compObj = (division.composition as Record<string, number>) || {};

    await prisma.$transaction(async (tx) => {
      // Return units to stockpile
      for (const [uid, qty] of Object.entries(compObj)) {
        if (qty > 0) {
          await tx.countryUnitStock.upsert({
            where: {
              gameId_countryId_customUnitId: {
                gameId: game.id,
                countryId: player.countryId,
                customUnitId: uid,
              },
            },
            update: { quantity: { increment: qty } },
            create: {
              gameId: game.id,
              countryId: player.countryId,
              customUnitId: uid,
              quantity: qty,
            },
          });
        }
      }

      // Mark division as DISBANDED
      await tx.division.update({
        where: { id: divId },
        data: { status: 'DISBANDED' },
      });
    });

    res.json({ success: true, message: `師團「${division.name}」已解散，裝備已退回軍備庫存` });
  } catch (error: any) {
    console.error('[Military] DELETE /divisions/:id error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
