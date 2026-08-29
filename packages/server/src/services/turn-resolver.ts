import { prisma } from '../lib/prisma.js';
import { WWI_COUNTRIES, recruitCost } from '@wwi/shared';
import { getTerritoryStats } from '../lib/territory-stats.js';
import type { AIProvider } from '@wwi/shared';
import { AIEngine } from './ai-engine.js';
import { AIPlayerService } from './ai-player.js';
import { ensureStockpileMigration } from './military-init.js';
import { reviewPendingPolicies } from './policy-reviewer.js';
import { generateNotificationsForTurn } from './notification-generator.js';

interface Battle {
  territoryId: string;
  attackerCountryId: string;
  defenderCountryId: string;
  winnerCountryId: string;
  attackerCasualties: Record<string, number>;
  defenderCasualties: Record<string, number>;
  territoryCaptured: boolean;
  narrative: string;
}

const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(
  WWI_COUNTRIES.map((c) => [c.id, c.nameZh])
);

export class TurnResolver {
  private aiPlayerService = new AIPlayerService();

  async resolveTurn(gameId: string): Promise<{
    turn: number;
    battles: Battle[];
    narrative: string;
    game: any;
  }> {
    const t0 = Date.now();

    try { await ensureStockpileMigration(gameId); } catch (e: any) {
      console.warn(`[TurnResolver] Stockpile migration warning: ${e.message}`);
    }

    const game = await prisma.gameRoom.findUnique({
      where: { id: gameId },
      include: { players: true },
    });
    if (!game) throw new Error('找不到戰局');
    if (game.status !== 'ACTIVE') throw new Error('戰局不在進行中');

    const currentTurn = game.currentTurn;

    try {
      await this.aiPlayerService.generateOrdersForGame(gameId, currentTurn);
    } catch (err: any) {
      console.warn(`[TurnResolver] AI order generation warning:`, err.message);
    }

    const orders = await prisma.order.findMany({
      where: { gameId, turn: currentTurn, status: 'PENDING' },
    });

    const countryStates = await prisma.countryState.findMany({
      where: { gameId, turn: currentTurn },
    });
    const stateMap = new Map(countryStates.map((cs) => [cs.countryId, cs]));

    const allDivisions = await prisma.division.findMany({
      where: { gameId, status: 'ACTIVE' },
    });

    const allUnits = await prisma.customUnit.findMany();
    const unitMap = new Map(allUnits.map((u) => [u.id, u]));

    const allStocks = await prisma.countryUnitStock.findMany({ where: { gameId } });
    const stockMap = new Map<string, Map<string, number>>();
    for (const s of allStocks) {
      if (!stockMap.has(s.countryId)) stockMap.set(s.countryId, new Map());
      stockMap.get(s.countryId)!.set(s.customUnitId, s.quantity);
    }

    let aiResolved = false;
    let battles: Battle[] = [];
    let narrative = '';
    let resolvedByProvider = 'deterministic-fallback';

    const dbConfigs = await prisma.aIProviderConfig.findMany({
      where: { isEnabled: true },
      orderBy: { priority: 'asc' },
    });

    const activeProviders: AIProvider[] = dbConfigs
      .map((cfg) => ({
        id: cfg.id, name: cfg.name, type: cfg.type as any,
        apiKey: cfg.apiKeyEnc || process.env.OPENAI_API_KEY || '',
        endpoint: cfg.endpoint || undefined,
        model: cfg.model, priority: cfg.priority, isEnabled: cfg.isEnabled,
        timeoutMs: cfg.timeoutMs, maxRetries: cfg.maxRetries,
      }))
      .filter((p) => Boolean(p.apiKey));

    if (activeProviders.length === 0 && process.env.OPENAI_API_KEY) {
      activeProviders.push({
        id: 'env-openai', name: 'OpenAI (env)', type: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        endpoint: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        priority: 1, isEnabled: true, timeoutMs: 30000, maxRetries: 2,
      });
    }

    const hasAttackOrders = orders.some((o: any) => o.type === 'ATTACK');

    if (activeProviders.length > 0 && hasAttackOrders) {
      try {
        console.log(`[TurnResolver] AI resolution attempt turn ${currentTurn}...`);
        const aiEngine = new AIEngine({
          providers: activeProviders,
          enableDeterministicFallback: false,
          maxTotalTimeoutMs: 60000,
        });

        const worldStateRecord: Record<string, any> = {};
        for (const [cid, cs] of stateMap) {
          const countryDef = WWI_COUNTRIES.find((c) => c.id === cid);
          const countryDivs = allDivisions.filter((d) => d.countryId === cid);
          worldStateRecord[cid] = {
            countryId: cid,
            name: countryDef?.nameZh || cid,
            side: countryDef?.side || 'neutral',
            morale: cs.morale, gold: cs.gold, industry: cs.industry,
            manpower: cs.manpower, stability: cs.stability,
            territories: cs.territories, isAIControlled: cs.isAIControlled,
            divisions: countryDivs.map((d) => ({
              id: d.id, name: d.name,
              composition: Object.entries(d.composition as Record<string, number>).map(([uid, qty]) => ({
                unitName: unitMap.get(uid)?.nameZh || uid,
                category: unitMap.get(uid)?.category || 'unknown',
                quantity: qty,
              })),
            })),
          };
        }

        const aiResponse = await aiEngine.resolveTurn(currentTurn, worldStateRecord, orders as any);

        if (aiResponse) {
          const respAny = aiResponse as any;
          battles = (respAny.battleResults || respAny.battles || []).map((b: any) => ({
            territoryId: b.territoryId || 'unknown',
            attackerCountryId: b.attackerCountryId || 'unknown',
            defenderCountryId: b.defenderCountryId || 'neutral',
            winnerCountryId: b.winnerCountryId || b.attackerCountryId || 'unknown',
            attackerCasualties: b.attackerCasualties || {},
            defenderCasualties: b.defenderCasualties || {},
            territoryCaptured: Boolean(b.territoryCaptured),
            narrative: b.narrative || '戰鬥結束。',
          }));

          for (const b of battles) {
            if (b.territoryCaptured && b.winnerCountryId !== 'neutral') {
              const winnerState = stateMap.get(b.winnerCountryId);
              if (winnerState && !winnerState.territories.includes(b.territoryId)) {
                winnerState.territories.push(b.territoryId);
              }
              const loserState = stateMap.get(b.defenderCountryId);
              if (loserState) {
                loserState.territories = loserState.territories.filter((t) => t !== b.territoryId);
                loserState.morale = Math.max(0, loserState.morale - 5);
              }
            }
            this.applyCasualtiesToDivisions(b.attackerCountryId, b.attackerCasualties, allDivisions);
            this.applyCasualtiesToDivisions(b.defenderCountryId, b.defenderCasualties, allDivisions);
          }

          const stateUpdates = respAny.stateUpdates || [];
          if (Array.isArray(stateUpdates)) {
            for (const su of stateUpdates) {
              const cs = stateMap.get(su.countryId);
              if (!cs) continue;
              if (typeof su.moraleChange === 'number') cs.morale = Math.max(0, Math.min(100, cs.morale + su.moraleChange));
              if (typeof su.goldChange === 'number') cs.gold = Math.max(0, cs.gold + su.goldChange);
              if (typeof su.manpowerChange === 'number') cs.manpower = Math.max(0, cs.manpower + su.manpowerChange);
              if (typeof su.stabilityChange === 'number') cs.stability = Math.max(0, Math.min(100, cs.stability + su.stabilityChange));
              if (typeof su.industryChange === 'number') cs.industry = Math.max(0, cs.industry + su.industryChange);
              if (Array.isArray(su.addTerritories)) for (const t of su.addTerritories) if (!cs.territories.includes(t)) cs.territories.push(t);
              if (Array.isArray(su.removeTerritories)) cs.territories = cs.territories.filter((t: string) => !su.removeTerritories.includes(t));
            }
          }

          await this.processRecruitOrders(orders, stateMap, stockMap, unitMap);
          narrative = respAny.narrativeSummary || respAny.narrative || `第 ${currentTurn} 回合 AI 戰局決算完成。`;
          resolvedByProvider = aiResponse.resolvedByAIProvider || activeProviders[0].name;
          aiResolved = true;
          console.log(`[TurnResolver] AI resolution succeeded via ${resolvedByProvider}`);
        }
      } catch (err: any) {
        console.warn(`[TurnResolver] AI resolution failed: ${err.message}, using deterministic`);
        aiResolved = false;
      }
    }

    if (!aiResolved) {
      battles = [];
      const events: string[] = [];

      for (const order of orders) {
        const orderState = stateMap.get(order.countryId);
        if (!orderState) continue;

        if (order.type === 'ATTACK' && order.targetTerritoryId) {
          let defenderId: string | null = null;
          for (const [cid, cs] of stateMap) {
            if (cs.territories.includes(order.targetTerritoryId)) { defenderId = cid; break; }
          }

          const attackerDivIds = (order.divisionIds || []) as string[];
          const attackerDivs = allDivisions.filter((d) => attackerDivIds.includes(d.id));

          if (attackerDivs.length === 0) {
            events.push(`${COUNTRY_NAMES[order.countryId] || order.countryId} 的進攻指令無可用師團`);
            continue;
          }

          let attackerForce = 0;
          for (const div of attackerDivs) {
            const comp = div.composition as Record<string, number>;
            for (const [uid, qty] of Object.entries(comp)) {
              const unit = unitMap.get(uid);
              if (unit) attackerForce += qty * unit.attack;
            }
          }
          attackerForce += orderState.morale * 10;

          if (!defenderId) {
            battles.push({
              territoryId: order.targetTerritoryId,
              attackerCountryId: order.countryId,
              defenderCountryId: 'neutral',
              winnerCountryId: order.countryId,
              attackerCasualties: {}, defenderCasualties: {},
              territoryCaptured: true,
              narrative: `${COUNTRY_NAMES[order.countryId] || order.countryId} 軍隊未遇抵抗，佔領 ${order.targetTerritoryId}。`,
            });
            if (!orderState.territories.includes(order.targetTerritoryId)) orderState.territories.push(order.targetTerritoryId);
            events.push(`${COUNTRY_NAMES[order.countryId] || order.countryId} 佔領 ${order.targetTerritoryId}`);
            continue;
          }

          const defenderState = stateMap.get(defenderId)!;
          const defenderDivs = allDivisions.filter((d) => d.countryId === defenderId);
          let defenderForce = 0;
          for (const div of defenderDivs) {
            const comp = div.composition as Record<string, number>;
            for (const [uid, qty] of Object.entries(comp)) {
              const unit = unitMap.get(uid);
              if (unit) defenderForce += qty * unit.defense;
            }
          }
          defenderForce += defenderState.morale * 100 + defenderState.stability * 50;

          const attackerWins = attackerForce > defenderForce * 0.6;
          const lossRatio = attackerWins ? 0.15 : 0.4;
          const defenderLossRatio = attackerWins ? 0.08 : 0.03;

          const attackerCasualties: Record<string, number> = {};
          for (const div of attackerDivs) {
            const comp = div.composition as Record<string, number>;
            for (const [uid, qty] of Object.entries(comp)) {
              const lost = Math.floor(qty * lossRatio);
              if (lost > 0) attackerCasualties[uid] = (attackerCasualties[uid] || 0) + lost;
            }
          }

          const defenderCasualties: Record<string, number> = {};
          for (const div of defenderDivs) {
            const comp = div.composition as Record<string, number>;
            for (const [uid, qty] of Object.entries(comp)) {
              const lost = Math.floor(qty * defenderLossRatio);
              if (lost > 0) defenderCasualties[uid] = (defenderCasualties[uid] || 0) + lost;
            }
          }

          battles.push({
            territoryId: order.targetTerritoryId,
            attackerCountryId: order.countryId,
            defenderCountryId: defenderId,
            winnerCountryId: attackerWins ? order.countryId : defenderId,
            attackerCasualties, defenderCasualties,
            territoryCaptured: attackerWins,
            narrative: attackerWins
              ? `${COUNTRY_NAMES[order.countryId] || order.countryId} 軍突破 ${COUNTRY_NAMES[defenderId] || defenderId} 的防線，攻佔 ${order.targetTerritoryId}。`
              : `${COUNTRY_NAMES[defenderId] || defenderId} 成功守住 ${order.targetTerritoryId}，擊退 ${COUNTRY_NAMES[order.countryId] || order.countryId}。`,
          });

          this.applyCasualtiesToDivisions(order.countryId, attackerCasualties, allDivisions);
          this.applyCasualtiesToDivisions(defenderId, defenderCasualties, allDivisions);

          if (attackerWins) {
            if (!orderState.territories.includes(order.targetTerritoryId)) orderState.territories.push(order.targetTerritoryId);
            defenderState.territories = defenderState.territories.filter((t) => t !== order.targetTerritoryId);
            defenderState.morale = Math.max(0, defenderState.morale - 5);
          } else {
            orderState.morale = Math.max(0, orderState.morale - 3);
          }
          events.push(`${COUNTRY_NAMES[order.countryId] || order.countryId} vs ${COUNTRY_NAMES[defenderId] || defenderId} → ${attackerWins ? '攻方勝' : '守方勝'}`);

        } else if (order.type === 'DEFEND') {
          orderState.morale = Math.min(100, orderState.morale + 2);
          events.push(`${COUNTRY_NAMES[order.countryId] || order.countryId} 進入防禦態勢`);
        } else if (order.type === 'RECRUIT') {
          continue;
        } else if (order.type === 'FORTIFY') {
          orderState.gold = Math.max(0, orderState.gold - 20);
          events.push(`${COUNTRY_NAMES[order.countryId] || order.countryId} 修築防禦工事`);
        } else if (order.type === 'MOVE') {
          events.push(`${COUNTRY_NAMES[order.countryId] || order.countryId} 調動部隊`);
        } else if (order.type === 'DIPLOMACY') {
          events.push(`${COUNTRY_NAMES[order.countryId] || order.countryId} 發起外交行動`);
        }
      }

      await this.processRecruitOrders(orders, stateMap, stockMap, unitMap);

      const recruitOrders = orders.filter((o) => o.type === 'RECRUIT');
      for (const ro of recruitOrders) {
        const comp = ro.recruitComposition as Record<string, number> | null;
        if (comp) {
          const parts = Object.entries(comp).map(([uid, qty]) => `${unitMap.get(uid)?.nameZh || uid} x${qty}`);
          events.push(`${COUNTRY_NAMES[ro.countryId] || ro.countryId} 完成招募: ${parts.join(', ')}`);
        }
      }

      narrative = events.length > 0
        ? `第 ${currentTurn} 回合：${events.join('；')}。共 ${battles.length} 場戰鬥。`
        : `第 ${currentTurn} 回合：本回合無軍事行動。`;
      resolvedByProvider = 'deterministic-fallback';
    }

    // Economy & regen — dynamic, driven by currently-held territory
    // (area + population), not a fixed per-country snapshot.
    // Capturing enemy provinces increases future growth; losing territory
    // decreases it. This composes with AI policy deltas applied above.
    for (const cs of stateMap.values()) {
      const { areaKm2, population } = getTerritoryStats(cs.territories);
      // Gold: tax base from population + land value from area
      cs.gold += Math.round(cs.industry * 5 + (areaKm2 / 50_000));
      // Manpower: population-driven natural growth + small base
      cs.manpower += Math.round(population * 0.0005) + Math.floor(cs.manpower * 0.02) + 1000;
      // Morale: slow passive recovery
      cs.morale = Math.min(100, cs.morale + 1);
    }

    // Create new CountryState records
    const newTurn = currentTurn + 1;
    const newStateRecords = Array.from(stateMap.values()).map((cs) => ({
      gameId, countryId: cs.countryId, turn: newTurn,
      infantry: cs.infantry, artillery: cs.artillery, cavalry: cs.cavalry,
      morale: cs.morale, gold: cs.gold, industry: cs.industry,
      manpower: cs.manpower, stability: cs.stability,
      territories: cs.territories, isAIControlled: cs.isAIControlled, playerId: cs.playerId,
    }));
    if (newStateRecords.length > 0) {
      await prisma.countryState.createMany({ data: newStateRecords });
    }

    // Persist stockpile + division changes
    await this.persistStockpileChanges(gameId, stockMap);
    await this.persistDivisionChanges(allDivisions);

    // Save TurnResolution
    await prisma.turnResolution.create({
      data: { gameId, turn: currentTurn, narrative, resolvedByProvider, executionTimeMs: Date.now() - t0, apiTokensUsed: 0 },
    });

    // Mark orders resolved
    if (orders.length > 0) {
      await prisma.order.updateMany({ where: { gameId, turn: currentTurn, status: 'PENDING' }, data: { status: 'RESOLVED' } });
    }

    // Advance game turn
    const nextTurnAt = new Date(Date.now() + (game.turnIntervalHrs || 2) * 60 * 60 * 1000);
    await prisma.gameRoom.update({ where: { id: gameId }, data: { currentTurn: newTurn, lastTurnAt: new Date(), nextTurnAt } });
    await prisma.player.updateMany({ where: { gameId }, data: { isReady: false } });

    // Review policies
    try { await reviewPendingPolicies(gameId, currentTurn); } catch (e: any) {
      console.error(`[TurnResolver] Policy review error: ${e.message}`);
    }

    // Generate notifications
    try { await generateNotificationsForTurn(gameId, currentTurn, battles); } catch (e: any) {
      console.error(`[TurnResolver] Notification generation error: ${e.message}`);
    }

    console.log(`[TurnResolver] Game ${gameId} turn ${currentTurn} resolved (${resolvedByProvider}): ${battles.length} battles, ${orders.length} orders`);

    return { turn: currentTurn, battles, narrative, game: { ...game, currentTurn: newTurn } };
  }

  private applyCasualtiesToDivisions(
    countryId: string,
    casualties: Record<string, number>,
    allDivisions: any[]
  ): void {
    if (!casualties || Object.keys(casualties).length === 0) return;

    const countryDivs = allDivisions.filter((d) => d.countryId === countryId && d.status === 'ACTIVE');
    if (countryDivs.length === 0) return;

    for (const [unitId, totalLost] of Object.entries(casualties)) {
      if (totalLost <= 0) continue;
      const divsWithUnit = countryDivs.filter((d) => {
        const comp = d.composition as Record<string, number>;
        return (comp[unitId] || 0) > 0;
      });
      if (divsWithUnit.length === 0) continue;

      const totalAvailable = divsWithUnit.reduce((sum, d) => {
        return sum + ((d.composition as Record<string, number>)[unitId] || 0);
      }, 0);
      if (totalAvailable <= 0) continue;

      let remaining = totalLost;
      for (let i = 0; i < divsWithUnit.length && remaining > 0; i++) {
        const div = divsWithUnit[i];
        const comp = div.composition as Record<string, number>;
        const available = comp[unitId] || 0;
        const lost = i === divsWithUnit.length - 1
          ? Math.min(remaining, available)
          : Math.floor(available * (totalLost / totalAvailable));
        comp[unitId] = Math.max(0, available - lost);
        remaining -= lost;
      }
    }

    // Disband emptied divisions
    for (const div of countryDivs) {
      const comp = div.composition as Record<string, number>;
      const total = Object.values(comp).reduce((s, q) => s + q, 0);
      if (total === 0) div.status = 'DISBANDED';
    }
  }

  private async processRecruitOrders(
    orders: any[],
    stateMap: Map<string, any>,
    stockMap: Map<string, Map<string, number>>,
    unitMap: Map<string, any>
  ): Promise<void> {
    const recruitOrders = orders.filter((o) => o.type === 'RECRUIT');
    for (const order of recruitOrders) {
      const state = stateMap.get(order.countryId);
      if (!state) continue;
      const comp = order.recruitComposition as Record<string, number> | null;
      if (!comp) continue;

      let totalGold = 0, totalManpower = 0, totalIndustry = 0;
      for (const [unitId, qty] of Object.entries(comp)) {
        const unit = unitMap.get(unitId);
        if (!unit || qty <= 0) continue;
        const cost = recruitCost(unit, qty);
        totalGold += cost.gold;
        totalManpower += cost.manpower;
        totalIndustry += cost.industry;
      }

      if (state.gold < totalGold || state.manpower < totalManpower || state.industry < totalIndustry) {
        console.warn(`[TurnResolver] Recruit insufficient resources for ${order.countryId}`);
        continue;
      }

      state.gold -= totalGold;
      state.manpower -= totalManpower;
      state.industry -= totalIndustry;

      let countryStock = stockMap.get(order.countryId);
      if (!countryStock) { countryStock = new Map(); stockMap.set(order.countryId, countryStock); }
      for (const [unitId, qty] of Object.entries(comp)) {
        countryStock.set(unitId, (countryStock.get(unitId) || 0) + qty);
      }
    }
  }

  private async persistStockpileChanges(
    gameId: string,
    stockMap: Map<string, Map<string, number>>
  ): Promise<void> {
    for (const [countryId, unitStock] of stockMap) {
      for (const [unitId, qty] of unitStock) {
        await prisma.countryUnitStock.upsert({
          where: { gameId_countryId_customUnitId: { gameId, countryId, customUnitId: unitId } },
          create: { gameId, countryId, customUnitId: unitId, quantity: qty },
          update: { quantity: qty },
        });
      }
    }
  }

  private async persistDivisionChanges(allDivisions: any[]): Promise<void> {
    for (const div of allDivisions) {
      await prisma.division.update({
        where: { id: div.id },
        data: { composition: div.composition, status: div.status },
      });
    }
  }
}
