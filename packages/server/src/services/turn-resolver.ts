import { prisma } from '../lib/prisma.js';
import { WWI_COUNTRIES } from '@wwi/shared';
import type { AIProvider } from '@wwi/shared';
import { AIEngine } from './ai-engine.js';
import { AIPlayerService } from './ai-player.js';

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
  private aiPlayerService = new AIPlayerService();

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

    // 2. Ensure AI orders are generated BEFORE turn resolution
    try {
      await this.aiPlayerService.generateOrdersForGame(gameId, currentTurn);
    } catch (err: any) {
      console.warn(`[TurnResolver] AI order generation warning for game ${gameId}:`, err.message);
    }

    // 3. Load all PENDING orders for this turn
    const orders = await prisma.order.findMany({
      where: { gameId, turn: currentTurn, status: 'PENDING' },
    });

    // 4. Load current country states for this turn
    const countryStates = await prisma.countryState.findMany({
      where: { gameId, turn: currentTurn },
    });

    const stateMap = new Map(countryStates.map((cs) => [cs.countryId, cs]));

    // 5. Try AI resolution first if AI Config / API key exists
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
        id: cfg.id,
        name: cfg.name,
        type: cfg.type as any,
        apiKey: cfg.apiKeyEnc || process.env.OPENAI_API_KEY || '',
        endpoint: cfg.endpoint || undefined,
        model: cfg.model,
        priority: cfg.priority,
        isEnabled: cfg.isEnabled,
        timeoutMs: cfg.timeoutMs,
        maxRetries: cfg.maxRetries,
      }))
      .filter((p) => Boolean(p.apiKey));

    // Fallback environment variable check
    if (activeProviders.length === 0 && process.env.OPENAI_API_KEY) {
      activeProviders.push({
        id: 'env-openai',
        name: 'OpenAI (env)',
        type: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        endpoint: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        priority: 1,
        isEnabled: true,
        timeoutMs: 30000,
        maxRetries: 2,
      });
    }

    // Check if there are any ATTACK orders — if not, skip LLM entirely
    // (no battles = no need for narrative generation, saves 1 API call)
    const hasAttackOrders = orders.some((o: any) => o.type === 'ATTACK');

    if (activeProviders.length > 0 && hasAttackOrders) {
      try {
        console.log(`[TurnResolver] Attempting AI resolution for game ${gameId} turn ${currentTurn}...`);
        const aiEngine = new AIEngine({
          providers: activeProviders,
          enableDeterministicFallback: false,
          maxTotalTimeoutMs: 60000,
        });

        const worldStateRecord: Record<string, any> = {};
        for (const [cid, cs] of stateMap) {
          const countryDef = WWI_COUNTRIES.find((c) => c.id === cid);
          worldStateRecord[cid] = {
            countryId: cid,
            name: countryDef?.nameZh || countryDef?.name || cid,
            side: countryDef?.side || 'neutral',
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
          };
        }

        const aiResponse = await aiEngine.resolveTurn(currentTurn, worldStateRecord, orders);

        if (aiResponse) {
          const respAny = aiResponse as any;
          // Parse battles from AI response
          const rawBattles = respAny.battleResults || respAny.battles || [];
          battles = rawBattles.map((b: any) => ({
            territoryId: b.territoryId || 'unknown',
            attackerCountryId: b.attackerCountryId || 'unknown',
            defenderCountryId: b.defenderCountryId || 'neutral',
            winnerCountryId: b.winnerCountryId || b.attackerCountryId || 'unknown',
            attackerCasualties: {
              infantry: b.attackerCasualties?.infantry || 0,
              artillery: b.attackerCasualties?.artillery || 0,
              cavalry: b.attackerCasualties?.cavalry || 0,
            },
            defenderCasualties: {
              infantry: b.defenderCasualties?.infantry || 0,
              artillery: b.defenderCasualties?.artillery || 0,
              cavalry: b.defenderCasualties?.cavalry || 0,
            },
            territoryCaptured: Boolean(b.territoryCaptured),
            narrative: b.narrative || '戰鬥結束。',
          }));

          // Apply AI battles to state Map
          for (const b of battles) {
            if (b.territoryCaptured && b.winnerCountryId && b.winnerCountryId !== 'neutral') {
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

            // Casualties
            const attState = stateMap.get(b.attackerCountryId);
            if (attState) {
              attState.infantry = Math.max(0, attState.infantry - b.attackerCasualties.infantry);
              attState.artillery = Math.max(0, attState.artillery - b.attackerCasualties.artillery);
              attState.cavalry = Math.max(0, attState.cavalry - b.attackerCasualties.cavalry);
            }
            const defState = stateMap.get(b.defenderCountryId);
            if (defState) {
              defState.infantry = Math.max(0, defState.infantry - b.defenderCasualties.infantry);
              defState.artillery = Math.max(0, defState.artillery - b.defenderCasualties.artillery);
              defState.cavalry = Math.max(0, defState.cavalry - b.defenderCasualties.cavalry);
            }
          }

          // Apply AI state updates if provided
          const stateUpdates = respAny.stateUpdates || [];
          if (Array.isArray(stateUpdates)) {
            for (const su of stateUpdates) {
              const cs = stateMap.get(su.countryId);
              if (!cs) continue;

              if (typeof su.infantryChange === 'number') cs.infantry = Math.max(0, cs.infantry + su.infantryChange);
              if (typeof su.artilleryChange === 'number') cs.artillery = Math.max(0, cs.artillery + su.artilleryChange);
              if (typeof su.cavalryChange === 'number') cs.cavalry = Math.max(0, cs.cavalry + su.cavalryChange);
              if (typeof su.moraleChange === 'number') cs.morale = Math.max(0, Math.min(100, cs.morale + su.moraleChange));
              if (typeof su.goldChange === 'number') cs.gold = Math.max(0, cs.gold + su.goldChange);
              if (typeof su.manpowerChange === 'number') cs.manpower = Math.max(0, cs.manpower + su.manpowerChange);
              if (typeof su.stabilityChange === 'number') cs.stability = Math.max(0, Math.min(100, cs.stability + su.stabilityChange));

              if (Array.isArray(su.addTerritories)) {
                for (const t of su.addTerritories) {
                  if (!cs.territories.includes(t)) cs.territories.push(t);
                }
              }
              if (Array.isArray(su.removeTerritories)) {
                cs.territories = cs.territories.filter((t) => !su.removeTerritories.includes(t));
              }

              if (typeof su.field === 'string' && typeof su.change === 'number') {
                if (su.field === 'infantry') cs.infantry = Math.max(0, cs.infantry + su.change);
                if (su.field === 'gold') cs.gold = Math.max(0, cs.gold + su.change);
                if (su.field === 'morale') cs.morale = Math.max(0, Math.min(100, cs.morale + su.change));
              }
            }
          }

          narrative = respAny.narrativeSummary || respAny.narrative || `第 ${currentTurn} 回合 AI 戰局決算完成。`;
          resolvedByProvider = aiResponse.resolvedByAIProvider || activeProviders[0].name;
          aiResolved = true;
          console.log(`[TurnResolver] AI resolution succeeded via ${resolvedByProvider}`);
        }
      } catch (err: any) {
        console.warn(`[TurnResolver] AI resolution failed: ${err.message}, falling back to deterministic resolution`);
        aiResolved = false;
      }
    }

    // 6. Deterministic Resolution (fallback or default when AI disabled/failed)
    if (!aiResolved) {
      battles = [];
      const events: string[] = [];

      for (const order of orders) {
        const attackerState = stateMap.get(order.countryId);
        if (!attackerState) continue;

        const orderInfantry = order.infantry || 0;
        const orderArtillery = order.artillery || 0;
        const orderCavalry = order.cavalry || 0;

        if (order.type === 'ATTACK' && order.targetTerritoryId) {
          let defenderId: string | null = null;
          for (const [cid, cs] of stateMap) {
            if (cs.territories.includes(order.targetTerritoryId)) {
              defenderId = cid;
              break;
            }
          }

          if (!defenderId) {
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
            if (!attackerState.territories.includes(order.targetTerritoryId)) {
              attackerState.territories.push(order.targetTerritoryId);
            }
            events.push(`${COUNTRY_NAMES[order.countryId] || order.countryId} 佔領 ${order.targetTerritoryId}`);
            continue;
          }

          const defenderState = stateMap.get(defenderId)!;
          const attackerForce = orderInfantry + orderArtillery * 3 + orderCavalry * 2;
          const defenderForce = Math.floor(defenderState.infantry * 0.1) + defenderState.artillery * 3 + defenderState.cavalry * 1.5 + defenderState.morale * 100;

          const attackerWins = attackerForce > defenderForce * 0.6;

          const attackerLossInf = Math.min(orderInfantry, Math.floor(orderInfantry * (attackerWins ? 0.15 : 0.4)));
          const defenderLossInf = Math.min(defenderState.infantry, Math.floor(defenderState.infantry * (attackerWins ? 0.08 : 0.03)));

          battles.push({
            territoryId: order.targetTerritoryId,
            attackerCountryId: order.countryId,
            defenderCountryId: defenderId,
            winnerCountryId: attackerWins ? order.countryId : defenderId,
            attackerCasualties: { infantry: attackerLossInf, artillery: 0, cavalry: 0 },
            defenderCasualties: { infantry: defenderLossInf, artillery: 0, cavalry: 0 },
            territoryCaptured: attackerWins,
            narrative: attackerWins
              ? `${COUNTRY_NAMES[order.countryId] || order.countryId} 軍突破 ${COUNTRY_NAMES[defenderId] || defenderId} 的防線,攻佔 ${order.targetTerritoryId}。`
              : `${COUNTRY_NAMES[defenderId] || defenderId} 成功守住 ${order.targetTerritoryId},擊退 ${COUNTRY_NAMES[order.countryId] || order.countryId} 的進攻。`,
          });

          attackerState.infantry -= attackerLossInf;
          defenderState.infantry -= defenderLossInf;

          if (attackerWins) {
            if (!attackerState.territories.includes(order.targetTerritoryId)) {
              attackerState.territories.push(order.targetTerritoryId);
            }
            defenderState.territories = defenderState.territories.filter((t) => t !== order.targetTerritoryId);
            defenderState.morale = Math.max(0, defenderState.morale - 5);
          } else {
            attackerState.morale = Math.max(0, attackerState.morale - 3);
          }

          events.push(`${COUNTRY_NAMES[order.countryId] || order.countryId} vs ${COUNTRY_NAMES[defenderId] || defenderId} → ${attackerWins ? '攻方勝' : '守方勝'}`);

        } else if (order.type === 'DEFEND') {
          attackerState.morale = Math.min(100, attackerState.morale + 2);
          events.push(`${COUNTRY_NAMES[order.countryId] || order.countryId} 進入防禦態勢,士氣提升`);

        } else if (order.type === 'RECRUIT') {
          const recruitAmount = orderInfantry || 10000;
          const cost = Math.floor(recruitAmount / 200);
          if (attackerState.gold >= cost) {
            attackerState.infantry += recruitAmount;
            attackerState.gold -= cost;
            attackerState.manpower = Math.max(0, attackerState.manpower - recruitAmount);
            events.push(`${COUNTRY_NAMES[order.countryId] || order.countryId} 徵兵 ${recruitAmount.toLocaleString()} 人,耗費 ${cost} 黃金`);
          }

        } else if (order.type === 'FORTIFY') {
          attackerState.gold = Math.max(0, attackerState.gold - 20);
          events.push(`${COUNTRY_NAMES[order.countryId] || order.countryId} 修築防禦工事`);

        } else if (order.type === 'MOVE') {
          events.push(`${COUNTRY_NAMES[order.countryId] || order.countryId} 調動部隊至 ${order.targetTerritoryId || '新位置'}`);

        } else if (order.type === 'DIPLOMACY') {
          events.push(`${COUNTRY_NAMES[order.countryId] || order.countryId} 發起外交行動`);
        }
      }

      narrative = events.length > 0
        ? `第 ${currentTurn} 回合:${events.join('; ')}。共 ${battles.length} 場戰鬥。`
        : `第 ${currentTurn} 回合:本回合無軍事行動。`;
      resolvedByProvider = 'deterministic-fallback';
    }

    // 7. Per-turn economy & regen (run for all state records regardless of path)
    for (const cs of stateMap.values()) {
      cs.gold += cs.industry * 5;
      cs.manpower += Math.floor(cs.manpower * 0.05) + 1000;
      cs.morale = Math.min(100, cs.morale + 1);
    }

    // 8. Create new CountryState records for turn + 1
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

    // 9. Save TurnResolution record
    await prisma.turnResolution.create({
      data: {
        gameId,
        turn: currentTurn,
        narrative,
        resolvedByProvider,
        executionTimeMs: Date.now() - t0,
        apiTokensUsed: 0,
      },
    });

    // 10. Mark all pending orders for this turn as RESOLVED
    if (orders.length > 0) {
      await prisma.order.updateMany({
        where: { gameId, turn: currentTurn, status: 'PENDING' },
        data: { status: 'RESOLVED' },
      });
    }

    // 11. Reset player ready states and advance game turn
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

    console.log(`[TurnResolver] Game ${gameId} turn ${currentTurn} resolved (${resolvedByProvider}): ${battles.length} battles, ${orders.length} orders processed`);

    return {
      turn: currentTurn,
      battles,
      narrative,
      game: { ...game, currentTurn: newTurn },
    };
  }
}
