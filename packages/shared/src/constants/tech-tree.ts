/**
 * Tech Tree — HOI4-inspired but WWI-flavored research system.
 *
 * Three categories:
 *  - general:   linear/parallel economic & industrial techs, no exclusivity.
 *  - political: THREE mutually exclusive ideology branches (democracy /
 *               communism / fascism). Unlocking the FIRST node of a branch
 *               commits the country to that branch for the rest of the game.
 *               The branch's tier-2 node grants a one-time country rename.
 *  - military:  doctrine branches (firepower / defense / maneuver). NOT
 *               mutually exclusive — a country can eventually research all
 *               of them, but the escalating per-unlock cost curve keeps
 *               this slow even for large industrial powers.
 *
 * Cost model: each node has a baseCost. The EFFECTIVE cost paid also scales
 * with how many techs the country has already unlocked in total:
 *   effectiveCost = round(baseCost * (1 + 0.25 * totalUnlockedCount))
 * This is what prevents big/rich countries from maxing the tree early —
 * the tax applies regardless of how much tech-point income they generate.
 */

export type TechCategory = 'general' | 'political' | 'military';
export type PoliticalBranch = 'democracy' | 'communism' | 'fascism';
export type DoctrineBranch = 'firepower' | 'defense' | 'maneuver';

/** Cumulative percentage/flat modifiers. Percentages stack additively. */
export interface TechEffects {
  industryFlat?: number;      // one-time, added directly to industry on unlock
  moraleFlat?: number;        // one-time, added directly to morale on unlock
  stabilityFlat?: number;     // one-time, added directly to stability on unlock
  goldIncomePct?: number;     // ongoing % modifier on per-turn gold income
  manpowerPct?: number;       // ongoing % modifier on per-turn manpower growth
  attackPct?: number;        // ongoing % modifier on attacker combat force
  defensePct?: number;        // ongoing % modifier on defender combat force
  fortifyBonusPct?: number;   // additional % stacked on the FORTIFY order bonus
  defendBonusPct?: number;    // additional % stacked on the DEFEND order bonus
  moveCostPct?: number;       // ongoing % modifier on MOVE order gold cost (negative = cheaper)
  diplomacyBonusPct?: number; // ongoing % modifier on DIPLOMACY stability gain
  recruitCostPct?: number;    // ongoing % modifier on recruit gold/industry cost (negative = cheaper)
}

export interface TechNode {
  id: string;
  nameZh: string;
  category: TechCategory;
  tier: 1 | 2 | 3;
  baseCost: number;
  requires: string[];
  politicalBranch?: PoliticalBranch;
  doctrineBranch?: DoctrineBranch;
  unlocksRename?: boolean;
  effects: TechEffects;
  effectDescZh: string;
  flavorZh: string;
}

export const TECH_TREE: TechNode[] = [
  // ───────────────────────────── 通用科技 ─────────────────────────────
  {
    id: 'gen-basic-industry', nameZh: '基礎工業化推廣', category: 'general', tier: 1,
    baseCost: 100, requires: [],
    effects: { industryFlat: 5 },
    effectDescZh: '工業產值 +5（一次性）',
    flavorZh: '引進標準化生產線，讓工廠產出脫離手工作坊時代。',
  },
  {
    id: 'gen-railway', nameZh: '鐵路運輸網建設', category: 'general', tier: 2,
    baseCost: 160, requires: ['gen-basic-industry'],
    effects: { goldIncomePct: 8, manpowerPct: 5 },
    effectDescZh: '黃金收入 +8%，人力增長 +5%',
    flavorZh: '鐵路網加速物流與兵員動員，帶動全國經濟循環。',
  },
  {
    id: 'gen-finance', nameZh: '金融體制改革', category: 'general', tier: 2,
    baseCost: 150, requires: ['gen-basic-industry'],
    effects: { goldIncomePct: 15 },
    effectDescZh: '黃金收入 +15%',
    flavorZh: '建立中央銀行與國債制度，穩定戰爭財政。',
  },
  {
    id: 'gen-agri-mech', nameZh: '農業機械化', category: 'general', tier: 2,
    baseCost: 150, requires: ['gen-basic-industry'],
    effects: { manpowerPct: 10, moraleFlat: 3 },
    effectDescZh: '人力增長 +10%，士氣 +3（一次性）',
    flavorZh: '拖拉機與化肥釋放大量農村人口投入軍工生產。',
  },
  {
    id: 'gen-heavy-industry', nameZh: '重工業擴建計畫', category: 'general', tier: 3,
    baseCost: 240, requires: ['gen-railway', 'gen-finance'],
    effects: { industryFlat: 12, goldIncomePct: 10 },
    effectDescZh: '工業產值 +12（一次性），黃金收入再 +10%',
    flavorZh: '鋼鐵與機械聯合體全面建成，軍工產能躍升。',
  },
  {
    id: 'gen-total-mobilization', nameZh: '全國總動員法案', category: 'general', tier: 3,
    baseCost: 240, requires: ['gen-railway', 'gen-agri-mech'],
    effects: { manpowerPct: 20, stabilityFlat: -5 },
    effectDescZh: '人力增長 +20%，穩定度 -5（一次性，動員引發民怨）',
    flavorZh: '強制徵召體制擴大兵源，但也加深民間不滿。',
  },

  // ───────────────────────── 政治科技（三選一） ─────────────────────────
  // 民主主義
  {
    id: 'pol-dem-1', nameZh: '自由市場改革', category: 'political', tier: 1,
    baseCost: 120, requires: [], politicalBranch: 'democracy',
    effects: { goldIncomePct: 20, manpowerPct: -10 },
    effectDescZh: '黃金收入 +20%，人力增長 -10%（自願兵制取代強制徵召）',
    flavorZh: '解除價格管制與貿易壁壘，市場活力帶動財政收入。',
  },
  {
    id: 'pol-dem-2', nameZh: '普選制度確立', category: 'political', tier: 2,
    baseCost: 180, requires: ['pol-dem-1'], politicalBranch: 'democracy',
    unlocksRename: true,
    effects: { stabilityFlat: 10 },
    effectDescZh: '穩定度 +10（一次性）；解鎖「更改國名」一次',
    flavorZh: '全民選舉制度確立，政府獲得空前的統治正當性。',
  },
  {
    id: 'pol-dem-3', nameZh: '國際聯盟外交網', category: 'political', tier: 3,
    baseCost: 260, requires: ['pol-dem-2'], politicalBranch: 'democracy',
    effects: { diplomacyBonusPct: 50 },
    effectDescZh: '外交指令效果 +50%',
    flavorZh: '積極主導國際協商機制，外交手段的槓桿大幅提升。',
  },
  // 共產主義
  {
    id: 'pol-com-1', nameZh: '集體農業徵召制', category: 'political', tier: 1,
    baseCost: 120, requires: [], politicalBranch: 'communism',
    effects: { manpowerPct: 25, goldIncomePct: -10 },
    effectDescZh: '人力增長 +25%，黃金收入 -10%（計畫經濟犧牲效率）',
    flavorZh: '土地集體化釋放出龐大且服從的兵源與勞動力。',
  },
  {
    id: 'pol-com-2', nameZh: '政治委員監督體系', category: 'political', tier: 2,
    baseCost: 180, requires: ['pol-com-1'], politicalBranch: 'communism',
    unlocksRename: true,
    effects: { moraleFlat: 15 },
    effectDescZh: '士氣 +15（一次性）；解鎖「更改國名」一次',
    flavorZh: '政委深入部隊監督思想，士兵作戰意志空前堅定。',
  },
  {
    id: 'pol-com-3', nameZh: '統一戰爭經濟計畫', category: 'political', tier: 3,
    baseCost: 260, requires: ['pol-com-2'], politicalBranch: 'communism',
    effects: { recruitCostPct: -15 },
    effectDescZh: '招募成本 -15%',
    flavorZh: '全國生產完全服務於戰爭機器，兵員補充成本大減。',
  },
  // 法西斯主義
  {
    id: 'pol-fas-1', nameZh: '國家軍國化改革', category: 'political', tier: 1,
    baseCost: 120, requires: [], politicalBranch: 'fascism',
    effects: { manpowerPct: 20, stabilityFlat: -5 },
    effectDescZh: '人力增長 +20%，穩定度 -5（一次性，軍國體制壓縮民生）',
    flavorZh: '舉國轉向軍事優先體制，軍隊規模迅速膨脹。',
  },
  {
    id: 'pol-fas-2', nameZh: '國家宣傳部成立', category: 'political', tier: 2,
    baseCost: 180, requires: ['pol-fas-1'], politicalBranch: 'fascism',
    unlocksRename: true,
    effects: { stabilityFlat: 15 },
    effectDescZh: '穩定度 +15（一次性）；解鎖「更改國名」一次',
    flavorZh: '強力宣傳機器統一輿論，鎮壓不同聲音。',
  },
  {
    id: 'pol-fas-3', nameZh: '總體戰爭動員令', category: 'political', tier: 3,
    baseCost: 260, requires: ['pol-fas-2'], politicalBranch: 'fascism',
    effects: { attackPct: 15, manpowerPct: -10 },
    effectDescZh: '進攻部隊戰力 +15%，人力增長 -10%（透支未來人口）',
    flavorZh: '孤注一擲地將全部資源投入攻勢作戰。',
  },

  // ───────────────────────────── 軍事學說 ─────────────────────────────
  // 火力至上主義
  {
    id: 'mil-fire-1', nameZh: '集中炮兵戰術', category: 'military', tier: 1,
    baseCost: 140, requires: [], doctrineBranch: 'firepower',
    effects: { attackPct: 12 },
    effectDescZh: '進攻部隊戰力 +12%',
    flavorZh: '將炮兵集中編組，以絕對火力優勢撕開防線。',
  },
  {
    id: 'mil-fire-2', nameZh: '徹底轟擊準則', category: 'military', tier: 2,
    baseCost: 200, requires: ['mil-fire-1'], doctrineBranch: 'firepower',
    effects: { attackPct: 10, defensePct: -5 },
    effectDescZh: '進攻部隊戰力再 +10%，防禦部隊戰力 -5%（重攻輕守）',
    flavorZh: '一切為了推進：犧牲防禦縱深，換取更猛烈的攻勢節奏。',
  },
  // 塹壕防禦主義
  {
    id: 'mil-def-1', nameZh: '塹壕強化工程學', category: 'military', tier: 1,
    baseCost: 140, requires: [], doctrineBranch: 'defense',
    effects: { fortifyBonusPct: 10 },
    effectDescZh: '築防（FORTIFY）加成再 +10%',
    flavorZh: '鋼筋混凝土工事與縱橫交錯的塹壕系統大幅提升防禦韌性。',
  },
  {
    id: 'mil-def-2', nameZh: '縱深防禦準則', category: 'military', tier: 2,
    baseCost: 200, requires: ['mil-def-1'], doctrineBranch: 'defense',
    effects: { defendBonusPct: 10 },
    effectDescZh: '防守（DEFEND）加成再 +10%',
    flavorZh: '多層防線層層消耗敵軍銳氣，讓固守變得幾乎無法撼動。',
  },
  // 機動作戰主義
  {
    id: 'mil-mov-1', nameZh: '快速部署訓練', category: 'military', tier: 1,
    baseCost: 140, requires: [], doctrineBranch: 'maneuver',
    effects: { moveCostPct: -50 },
    effectDescZh: '調動（MOVE）指令花費 -50%',
    flavorZh: '標準化的行軍與後勤流程讓部隊調動更快更省。',
  },
  {
    id: 'mil-mov-2', nameZh: '閃擊戰術準則', category: 'military', tier: 2,
    baseCost: 200, requires: ['mil-mov-1'], doctrineBranch: 'maneuver',
    effects: { attackPct: 8 },
    effectDescZh: '進攻部隊戰力再 +8%',
    flavorZh: '快速機動與突襲滲透相結合，讓敵軍難以組織有效防禦。',
  },
];

export function getTechNode(id: string): TechNode | undefined {
  return TECH_TREE.find((t) => t.id === id);
}

/** Effective point cost to unlock a node, scaled by how many techs are already unlocked. */
export function computeTechCost(baseCost: number, totalUnlockedCount: number): number {
  return Math.round(baseCost * (1 + 0.25 * Math.max(0, totalUnlockedCount)));
}

/** Sum all ongoing (non-flat, non-one-time) percentage effects across a set of unlocked tech ids. */
export function aggregateTechEffects(unlockedTechIds: string[]): TechEffects {
  const out: TechEffects = {};
  const pctKeys: (keyof TechEffects)[] = [
    'goldIncomePct', 'manpowerPct', 'attackPct', 'defensePct',
    'fortifyBonusPct', 'defendBonusPct', 'moveCostPct', 'diplomacyBonusPct', 'recruitCostPct',
  ];
  for (const id of unlockedTechIds) {
    const node = getTechNode(id);
    if (!node) continue;
    for (const key of pctKeys) {
      const v = node.effects[key];
      if (typeof v === 'number') out[key] = (out[key] || 0) + v;
    }
  }
  return out;
}

/**
 * Validate a player-supplied country name.
 * Blocks: empty/whitespace-only, zero-width/invisible/control chars,
 * private-use/surrogate code points, and enforces an 18-character cap.
 */
const DISALLOWED_CHAR_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uE000-\uF8FF]/;

export function validateCountryName(raw: unknown): { valid: boolean; error?: string; sanitized?: string } {
  if (typeof raw !== 'string') return { valid: false, error: '名稱格式錯誤' };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { valid: false, error: '國名不可為空白' };
  if (DISALLOWED_CHAR_RE.test(trimmed)) return { valid: false, error: '國名包含不可見或無法顯示的字元' };
  if (/^[\s\u3000]+$/.test(trimmed)) return { valid: false, error: '國名不可全為空白字元' };
  if (Array.from(trimmed).length > 18) return { valid: false, error: '國名長度不可超過 18 字' };
  return { valid: true, sanitized: trimmed };
}
