import { prisma } from '../lib/prisma.js';

export async function ensureSystemUnits() {
  const defaults = [
    {
      category: 'infantry',
      nameZh: '標準步兵',
      nameEn: 'Standard Infantry',
      description: '一戰經典標準步兵單位，平衡攻防。',
      attack: 15,
      defense: 15,
      speed: 5,
      range_: 1,
      costGold: 30,
      costManpower: 5000,
      costIndustry: 2,
    },
    {
      category: 'artillery',
      nameZh: '標準砲兵',
      nameEn: 'Standard Artillery',
      description: '重型加農砲與野戰砲單位，強大火力與防禦支援。',
      attack: 25,
      defense: 10,
      speed: 3,
      range_: 2,
      costGold: 60,
      costManpower: 3000,
      costIndustry: 5,
    },
    {
      category: 'cavalry',
      nameZh: '標準騎兵',
      nameEn: 'Standard Cavalry',
      description: '快速機動騎兵單位，適合機動作戰與偵察。',
      attack: 12,
      defense: 8,
      speed: 10,
      range_: 1,
      costGold: 40,
      costManpower: 4000,
      costIndustry: 1,
    },
  ];

  const units: Record<string, any> = {};

  for (const def of defaults) {
    let unit = await prisma.customUnit.findFirst({
      where: { isSystemDefault: true, category: def.category },
    });

    if (!unit) {
      unit = await prisma.customUnit.create({
        data: {
          category: def.category,
          nameZh: def.nameZh,
          nameEn: def.nameEn,
          description: def.description,
          attack: def.attack,
          defense: def.defense,
          speed: def.speed,
          range_: def.range_,
          costGold: def.costGold,
          costManpower: def.costManpower,
          costIndustry: def.costIndustry,
          isApproved: true,
          isSystemDefault: true,
          designedByUserId: null,
          designedByUsername: null,
          designedByCountryId: null,
          gameId: null,
        },
      });
    }
    units[def.category] = unit;
  }

  return units as { infantry: any; artillery: any; cavalry: any };
}

export async function ensureStockpileMigration(gameId: string): Promise<void> {
  const units = await ensureSystemUnits();

  // Find latest turn for this game
  const latestState = await prisma.countryState.findFirst({
    where: { gameId },
    orderBy: { turn: 'desc' },
  });
  if (!latestState) return;

  const currentTurn = latestState.turn;
  const states = await prisma.countryState.findMany({
    where: { gameId, turn: currentTurn },
  });

  for (const cs of states) {
    const stockCount = await prisma.countryUnitStock.count({
      where: { gameId, countryId: cs.countryId },
    });

    if (stockCount === 0) {
      // Create starting stock rows
      const stockItems = [
        { gameId, countryId: cs.countryId, customUnitId: units.infantry.id, quantity: 0 },
        { gameId, countryId: cs.countryId, customUnitId: units.artillery.id, quantity: 0 },
        { gameId, countryId: cs.countryId, customUnitId: units.cavalry.id, quantity: 0 },
      ];

      for (const item of stockItems) {
        await prisma.countryUnitStock.upsert({
          where: {
            gameId_countryId_customUnitId: {
              gameId: item.gameId,
              countryId: item.countryId,
              customUnitId: item.customUnitId,
            },
          },
          create: item,
          update: {},
        });
      }

      // Check if division exists
      const divCount = await prisma.division.count({
        where: { gameId, countryId: cs.countryId, status: 'ACTIVE' },
      });

      if (divCount === 0) {
        const composition: Record<string, number> = {};
        if (cs.infantry > 0) composition[units.infantry.id] = cs.infantry;
        if (cs.artillery > 0) composition[units.artillery.id] = cs.artillery;
        if (cs.cavalry > 0) composition[units.cavalry.id] = cs.cavalry;

        await prisma.division.create({
          data: {
            gameId,
            countryId: cs.countryId,
            name: '主力部隊',
            composition,
            status: 'ACTIVE',
          },
        });
      }
    }
  }
}
