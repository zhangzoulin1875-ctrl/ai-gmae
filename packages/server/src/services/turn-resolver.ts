import { prisma } from '../lib/prisma.js';
import { WWI_COUNTRIES } from '@wwi/shared';

interface Battle {
  territoryId: string;
  attackerCountryId: string;
  defenderCountryId: string;
  winnerCountryId: string;
  attackerCasualties: { infantry: number; artillery: number; cavalry: number };
  defenderCasualties: { infantry: number; artillery: number; cavalry: number };
  territoryCaptured: boolean;
  narrative: string;
}

const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(
  WWI_COUNTRIES.map((c) => [c.id, c.nameZh])
);

export class TurnResolver {
  async resolveTurn(gameId: string): Promise<{
    turn: number;
    battles: Battle[];
    narrative: string;
    game: any;
  }> {
    const t0 = Date.now();

    // 1. Load game
    const game = await prisma.gameRoom.findUnique({
      where: { id: gameId },
      include: { players: true },
    });
    if (!game) throw new Error('找不到戰局');
    if (game.status !== 'ACTIVE') throw new Error('戰局不在進行中');

    const currentTurn = game.currentTurn;

    // 2. Load all PENDING orders for this turn
    const orders = await prisma.order.findMany({
      where: { gameId, turn: currentTurn, status: 'PENDING' },
    });

    // 3. Load current country states
    const countryStates = await prisma.countryState.findMany({
      where: { gameId, turn: currentTurn },
    });

    const stateMap = new Map(countryStates.map((cs) => [cs.countryId, cs]));

    // 4. Deterministic resolution
    const battles: Battle[] = [];
    const events: string[] = [];

    for (const order of orders) {
      const attackerState = stateMap.get(order.countryId);
      if (!attackerState) continue;

      const orderInfantry = order.infantry || 0;
      const orderArtillery = order.artillery || 0;
      const orderCavalry = order.cavalry || 0;

      if (order.type === 'ATTACK' && order.targetTerritoryId) {
        // Find defender: the country that owns this territory
        let defenderId: string | null = null;
        for (const [cid, cs] of stateMap) {
          if (cs.territories.includes(order.targetTerritoryId)) {
            defenderId = cid;
            break;
          }
        }

        if (!defenderId) {
          // Unopposed
          battles.push({
            territoryId: order.targetTerritoryId,
            attackerCountryId: order.countryId,
            defenderCountryId: 'neutral',
            winnerCountryId: order.countryId,
            attackerCasualties: { infantry: 0, artillery: 0, cavalry: 0 },
            defenderCasualties: { infantry: 0, artillery: 0, cavalry: 0 },
            territoryCaptured: true,
            narrative: `${COUNTRY_NAMES[order.countryId] || order.countryId} 軍隊未遇抵抗,佔領 ${order.targetTerritoryId}。`,
          });
          // Transfer territory
          if (!attackerState.territories.includes(order.targetTerritoryId)) {
            attackerState.territories.push(order.targetTerritoryId);
          }
          events.push(`${COUNTRY_NAMES[order.countryId]} 佔領 ${order.targetTerritoryId}`);
          continue;
        }

        const defenderState = stateMap.get(defenderId)!;
        const attackerForce = orderInfantry * 1.0 + orderArtillery * 1.5 + orderCavalry * 0.8;
        const defenderForce = defenderState.infantry * 0.0005 + defenderState.artillery * 1.0 + defenderState.morale / 100;

        const attackerWins = attackerForce > defenderForce * 0.8;

        const attackerLossInf = Math.floor(orderInfantry * (attackerWins ? 0.2 : 0.5));
        const defenderLossInf = Math.floor(defenderState.infantry * (attackerWins ? 0.05 : 0.02));

        battles.push({
          territoryId: order.targetTerritoryId,
          attackerCountryId: order.countryId,
          defenderCountryId: defenderId,
          winnerCountryId: attackerWins ? order.countryId : defenderId,
          attackerCasualties: { infantry: attackerLossInf, artillery: 0, cavalry: 0 },
          defenderCasualties: { infantry: defenderLossInf, artillery: 0, cavalry: 0 },
          territoryCaptured: attackerWins,
          narrative: attackerWins
            ? `${COUNTRY_NAMES[order.countryId]} 軍突破 ${COUNTRY_NAMES[defenderId]} 的防線,攻佔 ${order.targetTerritoryId}。`
            : `${COUNTRY_NAMES[defenderId]} 成功守住 ${order.targetTerritoryId},擊退 ${COUNTRY_NAMES[order.countryId]} 的進攻。`,
        });

        // Apply losses
        attackerState.infantry -= attackerLossInf;
        defenderState.infantry -= defenderLossInf;

        if (attackerWins) {
          // Transfer territory
          if (!attackerState.territories.includes(order.targetTerritoryId)) {
            attackerState.territories.push(order.targetTerritoryId);
          }
          defenderState.territories = defenderState.territories.filter((t) => t !== order.targetTerritoryId);
          defenderState.morale = Math.max(0, defenderState.morale - 5);
        } else {
          attackerState.morale = Math.max(0, attackerState.morale - 3);
        }

        events.push(`${COUNTRY_NAMES[order.countryId]} vs ${COUNTRY_NAMES[defenderId]} → ${attackerWins ? '攻方勝' : '守方勝'}`);

      } else if (order.type === 'DEFEND') {
        attackerState.morale = Math.min(100, attackerState.morale + 2);
        events.push(`${COUNTRY_NAMES[order.countryId]} 進入防禦態勢,士氣提升`);

      } else if (order.type === 'RECRUIT') {
        const recruitAmount = orderInfantry || 10000;
        const cost = Math.floor(recruitAmount / 200);
        if (attackerState.gold >= cost) {
          attackerState.infantry += recruitAmount;
          attackerState.gold -= cost;
          attackerState.manpower = Math.max(0, attackerState.manpower - recruitAmount);
          events.push(`${COUNTRY_NAMES[order.countryId]} 徵兵 ${recruitAmount.toLocaleString()} 人,耗費 ${cost} 黃金`);
        }

      } else if (order.type === 'FORTIFY') {
        attackerState.gold = Math.max(0, attackerState.gold - 20);
        events.push(`${COUNTRY_NAMES[order.countryId]} 修築防禦工事`);

      } else if (order.type === 'MOVE') {
        events.push(`${COUNTRY_NAMES[order.countryId]} 調動部隊至 ${order.targetTerritoryId || '新位置'}`);

      } else if (order.type === 'DIPLOMACY') {
        events.push(`${COUNTRY_NAMES[order.countryId]} 發起外交行動`);
      }
    }

    // 5. Create new CountryState records for turn+1
    const newTurn = currentTurn + 1;
    const newStateRecords = Array.from(stateMap.values()).map((cs) => ({
      gameId,
      countryId: cs.countryId,
      turn: newTurn,
      infantry: cs.infantry,
      artillery: cs.artillery,
      cavalry: cs.cavalry,
      morale: cs.morale,
      gold: cs.gold,
      industry: cs.industry,
      manpower: cs.manpower,
      stability: cs.stability,
      territories: cs.territories,
      isAIControlled: cs.isAIControlled,
      playerId: cs.playerId,
    }));

    if (newStateRecords.length > 0) {
      await prisma.countryState.createMany({ data: newStateRecords });
    }

    // 6. Create TurnResolution record
    const narrative = events.length > 0
      ? `第 ${currentTurn} 回合:${events.join('; ')}。共 ${battles.length} 場戰鬥。`
      : `第 ${currentTurn} 回合:本回合無軍事行動。`;

    await prisma.turnResolution.create({
      data: {
        gameId,
        turn: currentTurn,
        narrative,
        resolvedByProvider: 'deterministic-fallback',
        executionTimeMs: Date.now() - t0,
        apiTokensUsed: 0,
      },
    });

    // 7. Mark all orders as RESOLVED
    if (orders.length > 0) {
      await prisma.order.updateMany({
        where: { gameId, turn: currentTurn, status: 'PENDING' },
        data: { status: 'RESOLVED' },
      });
    }

    // 8. Reset player ready status and increment turn
    const nextTurnAt = new Date(Date.now() + (game.turnIntervalHrs || 2) * 60 * 60 * 1000);
    await prisma.gameRoom.update({
      where: { id: gameId },
      data: {
        currentTurn: newTurn,
        lastTurnAt: new Date(),
        nextTurnAt,
      },
    });

    await prisma.player.updateMany({
      where: { gameId },
      data: { isReady: false },
    });

    console.log(`[TurnResolver] Game ${gameId} turn ${currentTurn} resolved: ${battles.length} battles, ${orders.length} orders processed`);

    return {
      turn: currentTurn,
      battles,
      narrative,
      game: { ...game, currentTurn: newTurn },
    };
  }
}
