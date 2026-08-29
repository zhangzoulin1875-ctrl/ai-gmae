/**
 * Rule-Based AI Engine — HOI4-style strategic decision system.
 * No LLM required. Pure weighted scoring + behavior trees.
 *
 * Architecture:
 * 1. Strategic Assessment — evaluate global power balance
 * 2. Mode Selection — pick primary strategy (ATTACK/DEFEND/ECONOMY/EXPAND/DESPERATE)
 * 3. Tactical Planning — generate concrete orders based on mode
 * 4. Coalition Coordination — same-side AI countries cooperate
 * 5. Multi-turn Memory — track enemy strength patterns
 */

import { WWI_COUNTRIES, getScenario } from '@wwi/shared';
import type { CountryState } from '@prisma/client';

// === Types ===

type StrategyMode = 'ATTACK' | 'DEFEND' | 'ECONOMY' | 'EXPAND' | 'DESPERATE' | 'CONSOLIDATE';

interface CountryAssessment {
  countryId: string;
  side: string;
  power: number;
  economy: number;
  threat: number;
  opportunity: number;
  morale: number;
  infantry: number;
  artillery: number;
  cavalry: number;
  gold: number;
  manpower: number;
  industry: number;
  stability: number;
  territories: string[];
  neighbors: string[];
  allies: string[];
  enemyStates: Array<{ countryId: string; power: number; side: string }>;
  allyStates: Array<{ countryId: string; power: number; side: string }>;
  strongestEnemy: string | null;
  weakestEnemy: string | null;
  forceRatio: number;
}

interface AIDecision {
  type: string;
  fromTerritoryId: string | null;
  targetTerritoryId: string | null;
  infantry: number | null;
  artillery: number | null;
  cavalry: number | null;
  details: string | null;
}

const DIFFICULTY_MULT = 1.0;

export class RuleBasedAI {
  private allStatesRef: CountryState[] = [];
  private allianceMap: Map<string, Set<string>> = new Map();
  generateOrders(
    myState: CountryState,
    allStates: CountryState[],
    turn: number,
    allianceMap?: Map<string, Set<string>>
  ): AIDecision[] {
    this.allStatesRef = allStates;
    this.allianceMap = allianceMap || new Map();
    const assessment = this.assess(myState, allStates);
    const mode = this.selectMode(assessment);
    const orders = this.planOrders(mode, assessment, turn);

    console.log(
      `[RuleAI] ${assessment.countryId} -> mode=${mode}, power=${assessment.power.toFixed(0)}, ` +
      `threat=${assessment.threat.toFixed(0)}, forceRatio=${assessment.forceRatio.toFixed(2)}, ` +
      `orders=${orders.length}`
    );

    return orders;
  }

  // === 1. Strategic Assessment ===

  private assess(myState: CountryState, allStates: CountryState[]): CountryAssessment {
    const myId = myState.countryId;

    const powerMap = new Map<string, number>();
    for (const cs of allStates) {
      powerMap.set(cs.countryId, this.calculatePower(cs));
    }

    // Alliance-based friend/foe detection
    const myAllies = this.allianceMap.get(myId) || new Set<string>();

    const enemyStates: Array<{ countryId: string; power: number; side: string }> = [];
    const allyStates: Array<{ countryId: string; power: number; side: string }> = [];

    for (const cs of allStates) {
      if (cs.countryId === myId) continue;
      const power = powerMap.get(cs.countryId) || 0;

      if (myAllies.has(cs.countryId)) {
        // Same alliance = ally
        allyStates.push({ countryId: cs.countryId, power, side: 'alliance' });
      } else {
        // Not in our alliance = potential enemy
        enemyStates.push({ countryId: cs.countryId, power, side: 'hostile' });
      }
    }

    enemyStates.sort((a, b) => b.power - a.power);
    const strongestEnemy = enemyStates.length > 0 ? enemyStates[0].countryId : null;
    const weakestEnemy = enemyStates.length > 0 ? enemyStates[enemyStates.length - 1].countryId : null;

    const myPower = powerMap.get(myId) || 0;
    const totalEnemyPower = enemyStates.reduce((sum, e) => sum + e.power, 0);
    const forceRatio = totalEnemyPower > 0 ? myPower / totalEnemyPower : 1.0;

    const directThreats = enemyStates.slice(0, 3).reduce((sum, e) => sum + e.power, 0);
    const threat = Math.min(100, (directThreats / Math.max(1, myPower)) * 30);

    const opportunity = Math.min(100,
      enemyStates.length > 0
        ? (myPower / Math.max(1, enemyStates[enemyStates.length - 1].power)) * 25
        : 0
    );

    const economy = Math.min(100,
      (myState.gold / 10) * 0.3 +
      (myState.industry / 5) * 0.3 +
      (myState.manpower / 20000) * 0.4
    );

    return {
      countryId: myId, side: 'free', power: myPower, economy, threat, opportunity,
      morale: myState.morale, infantry: myState.infantry, artillery: myState.artillery,
      cavalry: myState.cavalry, gold: myState.gold, manpower: myState.manpower,
      industry: myState.industry, stability: myState.stability,
      territories: myState.territories as string[],
      neighbors: enemyStates.map((e) => e.countryId),
      allies: allyStates.map((a) => a.countryId),
      enemyStates, allyStates, strongestEnemy, weakestEnemy, forceRatio,
    };
  }

  private calculatePower(cs: CountryState): number {
    // Actual military power is in divisions (not tracked here), so use
    // gold + manpower + industry as proxy for deployable force
    return (
      cs.gold * 10 +
      cs.manpower * 0.01 +
      cs.industry * 100 +
      cs.morale * 500 +
      cs.stability * 200 +
      (cs.territories as string[]).length * 50
    ) * DIFFICULTY_MULT;
  }

  private pickEnemyProvince(enemyCountryId: string): string | null {
    const enemyState = this.allStatesRef.find(s => s.countryId === enemyCountryId);
    if (!enemyState || !enemyState.territories || (enemyState.territories as string[]).length === 0) return null;
    const territories = enemyState.territories as string[];
    return territories[Math.floor(Math.random() * territories.length)];
  }

  // Legacy: alliance system replaces fixed sides. All non-allied countries
  // are treated as potential enemies by the rule-based AI.
  private isEnemy(_mySide: string, _otherSide: string): boolean {
    return true;
  }

  // === 2. Mode Selection ===

  private selectMode(a: CountryAssessment): StrategyMode {
    if (a.forceRatio < 0.25 && a.morale < 35) return 'DESPERATE';
    if (a.threat > 65 || (a.forceRatio < 0.6 && a.morale < 50)) return 'DEFEND';
    if (a.gold < 30 || a.manpower < 50000 || a.power < 5000) return 'ECONOMY';
    if (a.forceRatio > 1.2 && a.opportunity > 50 && a.morale >= 60) return 'ATTACK';
    if (a.opportunity > 70 && a.forceRatio > 0.8) return 'EXPAND';
    return 'CONSOLIDATE';
  }

  // === 3. Tactical Planning ===

  private planOrders(mode: StrategyMode, a: CountryAssessment, turn: number): AIDecision[] {
    switch (mode) {
      case 'ATTACK':      return this.planAttack(a, turn);
      case 'DEFEND':      return this.planDefend(a, turn);
      case 'ECONOMY':     return this.planEconomy(a, turn);
      case 'EXPAND':      return this.planExpand(a, turn);
      case 'DESPERATE':   return this.planDesperate(a, turn);
      case 'CONSOLIDATE': return this.planConsolidate(a, turn);
    }
  }

  private planAttack(a: CountryAssessment, _turn: number): AIDecision[] {
    const orders: AIDecision[] = [];
    if (!a.weakestEnemy) return orders;
    const targetProvince = this.pickEnemyProvince(a.weakestEnemy);
    if (!targetProvince) return orders;
    const allyBonus = Math.min(0.15, a.allyStates.length * 0.05);
    const commitRatio = 0.55 + allyBonus + Math.random() * 0.1;
    const commitInf = Math.floor(a.infantry * commitRatio);
    orders.push({
      type: 'ATTACK', fromTerritoryId: a.territories[0] || a.countryId,
      targetTerritoryId: targetProvince,
      infantry: commitInf, artillery: Math.floor(a.artillery * 0.6), cavalry: Math.floor(a.cavalry * 0.4),
      details: `集中主力打擊 ${this.cn(a.weakestEnemy)}（投入 ${commitInf.toLocaleString()} 步兵）`,
    });
    if (a.gold >= 50 && a.manpower >= 30000) {
      const r = Math.min(50000, Math.floor(a.manpower * 0.15));
      orders.push({ type: 'RECRUIT', fromTerritoryId: a.territories[0] || a.countryId, targetTerritoryId: null, infantry: r, artillery: null, cavalry: null, details: `補充戰損：徵兵 ${r.toLocaleString()} 人` });
    }
    return orders;
  }

  private planDefend(a: CountryAssessment, _turn: number): AIDecision[] {
    const orders: AIDecision[] = [];
    const home = a.territories[0] || a.countryId;
    orders.push({ type: 'DEFEND', fromTerritoryId: home, targetTerritoryId: null, infantry: a.infantry, artillery: a.artillery, cavalry: a.cavalry, details: `全線轉入防禦：${a.infantry.toLocaleString()} 步兵駐守 ${this.cn(a.countryId)}` });
    if (a.gold >= 30) orders.push({ type: 'FORTIFY', fromTerritoryId: home, targetTerritoryId: null, infantry: null, artillery: null, cavalry: null, details: '加固前線防禦工事' });
    if (a.power < 5000 && a.gold >= 40 && a.manpower >= 20000) {
      orders.push({ type: 'RECRUIT', fromTerritoryId: home, targetTerritoryId: null, infantry: Math.min(30000, Math.floor(a.manpower * 0.2)), artillery: null, cavalry: null, details: '緊急補充兵力以維持防線' });
    }
    return orders;
  }

  private planEconomy(a: CountryAssessment, _turn: number): AIDecision[] {
    const orders: AIDecision[] = [];
    const home = a.territories[0] || a.countryId;
    if (a.gold >= 50 && a.manpower >= 30000) {
      const r = Math.min(80000, Math.floor(a.manpower * 0.25));
      orders.push({ type: 'RECRUIT', fromTerritoryId: home, targetTerritoryId: null, infantry: r, artillery: null, cavalry: null, details: `經濟模式：大量徵兵 ${r.toLocaleString()} 人以擴充軍力` });
    }
    orders.push({ type: 'DEFEND', fromTerritoryId: home, targetTerritoryId: null, infantry: Math.floor(a.infantry * 0.8), artillery: a.artillery, cavalry: a.cavalry, details: '建設期保持防守態勢' });
    return orders;
  }

  private planExpand(a: CountryAssessment, _turn: number): AIDecision[] {
    const orders: AIDecision[] = [];
    const home = a.territories[0] || a.countryId;
    if (a.weakestEnemy && a.power > 8000) {
      const targetProvince = this.pickEnemyProvince(a.weakestEnemy);
      if (targetProvince) {
        const ci = Math.floor(a.infantry * (0.35 + Math.random() * 0.15));
        orders.push({ type: 'ATTACK', fromTerritoryId: home, targetTerritoryId: targetProvince, infantry: ci, artillery: Math.floor(a.artillery * 0.4), cavalry: Math.floor(a.cavalry * 0.3), details: `擴張進攻：打擊弱鄰 ${this.cn(a.weakestEnemy)}` });
      }
    }
    if (a.gold >= 40 && a.manpower >= 20000) {
      const r = Math.min(40000, Math.floor(a.manpower * 0.15));
      orders.push({ type: 'RECRUIT', fromTerritoryId: home, targetTerritoryId: null, infantry: r, artillery: null, cavalry: null, details: `擴張支援：徵兵 ${r.toLocaleString()} 人` });
    }
    if (orders.length === 0) orders.push({ type: 'DEFEND', fromTerritoryId: home, targetTerritoryId: null, infantry: a.infantry, artillery: a.artillery, cavalry: a.cavalry, details: '無擴張目標，保持防禦' });
    return orders;
  }

  private planDesperate(a: CountryAssessment, _turn: number): AIDecision[] {
    const orders: AIDecision[] = [];
    const home = a.territories[0] || a.countryId;
    if (a.morale < 25) {
      orders.push({ type: 'DEFEND', fromTerritoryId: home, targetTerritoryId: null, infantry: a.infantry, artillery: a.artillery, cavalry: a.cavalry, details: '絕望防守：動員一切力量死守國土' });
    } else if (a.weakestEnemy) {
      const targetProvince = this.pickEnemyProvince(a.weakestEnemy);
      if (targetProvince) {
        orders.push({ type: 'ATTACK', fromTerritoryId: home, targetTerritoryId: targetProvince, infantry: Math.floor(a.infantry * 0.85), artillery: a.artillery, cavalry: a.cavalry, details: `孤注一擲：全力進攻 ${this.cn(a.weakestEnemy)}` });
      }
    }
    if (a.manpower >= 10000) {
      orders.push({ type: 'RECRUIT', fromTerritoryId: home, targetTerritoryId: null, infantry: Math.min(a.manpower, 50000), artillery: null, cavalry: null, details: '最後動員：徵召所有可用人力' });
    }
    return orders;
  }

  private planConsolidate(a: CountryAssessment, _turn: number): AIDecision[] {
    const orders: AIDecision[] = [];
    const home = a.territories[0] || a.countryId;
    if (a.gold >= 40 && a.manpower >= 25000) {
      const r = Math.min(60000, Math.floor(a.manpower * 0.2));
      orders.push({ type: 'RECRUIT', fromTerritoryId: home, targetTerritoryId: null, infantry: r, artillery: null, cavalry: null, details: `穩固期：擴充兵力 ${r.toLocaleString()} 人` });
    }
    orders.push({ type: 'DEFEND', fromTerritoryId: home, targetTerritoryId: null, infantry: Math.floor(a.infantry * 0.7), artillery: a.artillery, cavalry: a.cavalry, details: '保持防禦態勢，積蓄實力' });
    if (a.gold >= 50 && orders.length < 3) {
      orders.push({ type: 'FORTIFY', fromTerritoryId: home, targetTerritoryId: null, infantry: null, artillery: null, cavalry: null, details: '建設防禦工事' });
    }
    return orders;
  }

  private cn(id: string): string {
    // Look across all registered scenarios since this class has no game context;
    // display-name lookup only, falls back to the raw id if not found anywhere.
    const def = WWI_COUNTRIES.find((c) => c.id === id);
    if (def) return def.nameZh || def.name || id;
    for (const scenarioId of ['warlord-asia', 'wwi-europe', 'wwii-europe', 'wwii-asia', 'coldwar-global']) {
      const scenario = getScenario(scenarioId);
      const found = scenario?.countries.find((c) => c.id === id);
      if (found) return found.nameZh || found.name || id;
    }
    return id;
  }
}
