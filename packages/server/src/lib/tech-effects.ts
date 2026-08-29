/**
 * Server-side tech tree helpers — thin wrappers around @wwi/shared's
 * pure tech-tree functions, plus DB-aware unlock/eligibility checks.
 */
import { TECH_TREE, TechNode, computeTechCost, aggregateTechEffects, TechEffects } from '@wwi/shared';

export interface TechEligibility {
  canUnlock: boolean;
  reason?: string;
  effectiveCost: number;
}

/**
 * Determine whether a country can unlock a given tech node right now.
 */
export function checkTechEligibility(
  node: TechNode,
  unlockedTechIds: string[],
  politicalBranch: string | null,
  techPoints: number
): TechEligibility {
  const unlockedSet = new Set(unlockedTechIds);
  const effectiveCost = computeTechCost(node.baseCost, unlockedTechIds.length);

  if (unlockedSet.has(node.id)) {
    return { canUnlock: false, reason: '已解鎖', effectiveCost };
  }

  for (const req of node.requires) {
    if (!unlockedSet.has(req)) {
      return { canUnlock: false, reason: '前置科技尚未解鎖', effectiveCost };
    }
  }

  if (node.category === 'political') {
    if (politicalBranch && politicalBranch !== node.politicalBranch) {
      return { canUnlock: false, reason: `已選定「${politicalBranch}」路線，無法研究其他政治路線`, effectiveCost };
    }
  }

  if (techPoints < effectiveCost) {
    return { canUnlock: false, reason: `科技點數不足（需要 ${effectiveCost}，目前 ${techPoints}）`, effectiveCost };
  }

  return { canUnlock: true, effectiveCost };
}

export { TECH_TREE, computeTechCost, aggregateTechEffects };
export type { TechEffects };
