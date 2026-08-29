/**
 * Shared recruit cost formula — used by BOTH client (live cost preview) and
 * server (validation + actual deduction) so they never drift out of sync.
 *
 * Balance rationale: countries start with abundant manpower (millions) but
 * scarce gold (hundreds) and very scarce industry (single digits to tens).
 * A CustomUnit's stored costGold/costManpower/costIndustry fields represent
 * cost PER 100 RECRUITED SOLDIERS for gold & industry (since 1 gold/industry
 * per single soldier would be either too cheap or impossible to express as
 * a useful integer at bulk quantities), while manpower cost is a direct
 * 1:1 per-soldier headcount cost (matches the "reserve manpower -> active
 * troops" conversion).
 */
export interface RecruitableUnit {
  costGold: number;
  costManpower: number;
  costIndustry: number;
}

export interface RecruitCostResult {
  gold: number;
  manpower: number;
  industry: number;
}

// Gold & industry costs on CustomUnit are expressed "per 100 recruited units"
export const RECRUIT_COST_BATCH_SIZE = 100;

export function recruitCost(unit: RecruitableUnit, quantity: number): RecruitCostResult {
  const qty = Math.max(0, Math.floor(quantity));
  return {
    gold: Math.ceil((unit.costGold * qty) / RECRUIT_COST_BATCH_SIZE),
    manpower: unit.costManpower * qty,
    industry: Math.ceil((unit.costIndustry * qty) / RECRUIT_COST_BATCH_SIZE),
  };
}
