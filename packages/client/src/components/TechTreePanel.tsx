/**
 * TechTreePanel — full tech tree visualization + unlock interaction.
 *
 * Three columns: 通用科技 | 政治科技 | 軍事學說
 * Each node shows name, cost (effective), effect description, flavor text.
 * Locked nodes show why they're locked. Unlocked nodes are dimmed/highlighted.
 * Political branches are mutually exclusive — once committed, others lock.
 * Nodes with unlocksRename=true show a rename input after unlock.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, getApiUrl } from '../lib/api';

interface TechNodeInfo {
  id: string;
  nameZh: string;
  category: 'general' | 'political' | 'military';
  tier: number;
  requires: string[];
  politicalBranch: string | null;
  doctrineBranch: string | null;
  unlocksRename: boolean;
  effectDescZh: string;
  flavorZh: string;
  cost: number;
  isUnlocked: boolean;
  canUnlock: boolean;
  lockedReason: string | null;
}

interface TechData {
  success: boolean;
  techPoints: number;
  unlockedTechIds: string[];
  politicalBranch: string | null;
  customName: string | null;
  hasRenamed: boolean;
  nodes: TechNodeInfo[];
}

const CATEGORY_LABELS: Record<string, string> = {
  general: '通用科技',
  political: '政治科技',
  military: '軍事學說',
};

const CATEGORY_COLORS: Record<string, string> = {
  general: '#60a5fa',
  political: '#f59e0b',
  military: '#ef4444',
};

const BRANCH_LABELS: Record<string, string> = {
  democracy: '民主主義',
  communism: '共產主義',
  fascism: '法西斯主義',
  firepower: '火力至上',
  defense: '塹壕防禦',
  maneuver: '機動作戰',
};

const TechTreePanel: React.FC<{ gameId: string; refreshTrigger: number }> = ({ gameId, refreshTrigger }) => {
  const [data, setData] = useState<TechData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRename, setShowRename] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSuccess, setRenameSuccess] = useState<string | null>(null);

  const fetchTech = useCallback(async () => {
    try {
      const res = await apiFetch(getApiUrl(`/api/games/${gameId}/tech`));
      if (res.ok) {
        const d = await res.json();
        setData(d);
      } else {
        const err = await res.json();
        setError(err.error || '載入科技樹失敗');
      }
    } catch (e: any) {
      setError('載入科技樹失敗: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    fetchTech();
  }, [fetchTech, refreshTrigger]);

  const handleUnlock = async (nodeId: string, nameZh: string) => {
    setBusy(nodeId);
    setError(null);
    try {
      const res = await apiFetch(getApiUrl(`/api/games/${gameId}/tech/${nodeId}`), { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        await fetchTech();
        setError(null);
      } else {
        setError(d.error || '解鎖失敗');
      }
    } catch (e: any) {
      setError('解鎖失敗: ' + e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleRename = async () => {
    setRenameError(null);
    setRenameSuccess(null);
    try {
      const res = await apiFetch(getApiUrl(`/api/games/${gameId}/rename`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const d = await res.json();
      if (res.ok) {
        setRenameSuccess('✓ 國名已更新為「' + d.customName + '」');
        setNewName('');
        setShowRename(false);
        await fetchTech();
      } else {
        setRenameError(d.error || '改名失敗');
      }
    } catch (e: any) {
      setRenameError('改名失敗: ' + e.message);
    }
  };

  if (loading) return <div style={{ padding: '1rem', textAlign: 'center' }}>載入科技樹中…</div>;
  if (error && !data) return <div style={{ padding: '1rem', color: '#f87171' }}>{error}</div>;
  if (!data) return null;

  const categories: ('general' | 'political' | 'military')[] = ['general', 'political', 'military'];
  const hasRenameUnlock = data.nodes.some((n) => n.unlocksRename && data.unlockedTechIds.includes(n.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Header bar: tech points + rename button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', padding: '0.75rem 1rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.1rem' }}>🔬 科技樹</span>
          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: CATEGORY_COLORS.general }}>
            {data.techPoints.toLocaleString()} 科技點數
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            已解鎖 {data.unlockedTechIds.length} / {data.nodes.length}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {data.politicalBranch && (
            <span style={{ fontSize: '0.8rem', color: CATEGORY_COLORS.political, border: `1px solid ${CATEGORY_COLORS.political}`, borderRadius: '4px', padding: '0.2rem 0.5rem' }}>
              政治路線：{BRANCH_LABELS[data.politicalBranch] || data.politicalBranch}
            </span>
          )}
          {hasRenameUnlock && !data.hasRenamed && (
            <button
              type="button"
              onClick={() => setShowRename(!showRename)}
              style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', background: 'var(--bg)', border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)', borderRadius: '4px', cursor: 'pointer' }}
            >
              ✏️ 更改國名
            </button>
          )}
          {data.customName && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              目前國名：{data.customName}
            </span>
          )}
        </div>
      </div>

      {/* Rename form */}
      {showRename && hasRenameUnlock && !data.hasRenamed && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px', border: '1px solid var(--accent-gold)' }}>
          <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.4rem' }}>
            輸入新國名（最多 18 字，不可使用不可見字元）：
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={18}
              placeholder="例：大日本帝國"
              style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.9rem' }}
            />
            <button
              type="button"
              onClick={handleRename}
              disabled={!newName.trim()}
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', background: 'var(--accent-gold)', color: '#1a1a1a', border: 'none', borderRadius: '4px', cursor: newName.trim() ? 'pointer' : 'not-allowed', opacity: newName.trim() ? 1 : 0.5 }}
            >
              確認改名
            </button>
            <button
              type="button"
              onClick={() => { setShowRename(false); setNewName(''); setRenameError(null); }}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text)', borderRadius: '4px', cursor: 'pointer' }}
            >
              取消
            </button>
          </div>
          {renameError && <p style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.4rem' }}>{renameError}</p>}
          {renameSuccess && <p style={{ color: '#4ade80', fontSize: '0.8rem', marginTop: '0.4rem' }}>{renameSuccess}</p>}
        </div>
      )}

      {error && <div style={{ color: '#f87171', fontSize: '0.85rem', padding: '0.5rem 0' }}>{error}</div>}

      {/* Three columns */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {categories.map((cat) => {
          const nodes = data.nodes.filter((n) => n.category === cat);
          // Group by sub-branch for political and military
          const branches = cat === 'general' ? ['main'] :
            cat === 'political' ? ['democracy', 'communism', 'fascism'] :
            ['firepower', 'defense', 'maneuver'];

          return (
            <div key={cat} style={{ flex: '1 1 300px', minWidth: '280px' }}>
              <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem', color: CATEGORY_COLORS[cat], borderBottom: `2px solid ${CATEGORY_COLORS[cat]}`, paddingBottom: '0.3rem' }}>
                {CATEGORY_LABELS[cat]}
              </h3>
              {branches.map((br) => {
                const brNodes = cat === 'general'
                  ? nodes
                  : nodes.filter((n) => (cat === 'political' ? n.politicalBranch === br : n.doctrineBranch === br));

                // For political: check if another branch is already committed
                const branchLocked = cat === 'political' && data.politicalBranch && data.politicalBranch !== br;

                return (
                  <div key={br} style={{ marginBottom: '0.75rem' }}>
                    {cat !== 'general' && (
                      <div style={{
                        fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem',
                        color: branchLocked ? 'var(--text-muted)' : CATEGORY_COLORS[cat],
                        opacity: branchLocked ? 0.5 : 1,
                        textDecoration: branchLocked ? 'line-through' : 'none',
                      }}>
                        {BRANCH_LABELS[br]}
                        {branchLocked && '（已選其他路線）'}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {brNodes.map((node) => {
                        const isLocked = branchLocked || (!node.canUnlock && !node.isUnlocked);
                        return (
                          <div key={node.id} style={{
                            padding: '0.6rem 0.75rem',
                            borderRadius: '6px',
                            border: `1px solid ${node.isUnlocked ? '#22c55e' : isLocked ? 'var(--border-color)' : CATEGORY_COLORS[cat]}`,
                            backgroundColor: node.isUnlocked
                              ? 'rgba(34,197,94,0.08)'
                              : isLocked ? 'var(--bg)' : 'var(--bg-tertiary)',
                            opacity: node.isUnlocked ? 0.85 : isLocked ? 0.5 : 1,
                            transition: 'all 0.2s',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                                {node.isUnlocked ? '✅ ' : ''}
                                {node.nameZh}
                                {node.unlocksRename && node.isUnlocked && !data.hasRenamed && ' ✏️'}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: node.isUnlocked ? '#22c55e' : isLocked ? 'var(--text-muted)' : 'var(--accent-gold)' }}>
                                {node.isUnlocked ? '已解鎖' : `消耗 ${node.cost} 點`}
                              </div>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                              {node.effectDescZh}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontStyle: 'italic', opacity: 0.7 }}>
                              {node.flavorZh}
                            </div>
                            {!node.isUnlocked && node.canUnlock && !branchLocked && (
                              <button
                                type="button"
                                onClick={() => handleUnlock(node.id, node.nameZh)}
                                disabled={busy === node.id}
                                style={{
                                  marginTop: '0.4rem', padding: '0.3rem 0.8rem', fontSize: '0.8rem',
                                  background: CATEGORY_COLORS[cat], color: '#fff',
                                  border: 'none', borderRadius: '4px', cursor: 'pointer',
                                  opacity: busy === node.id ? 0.6 : 1,
                                }}
                              >
                                {busy === node.id ? '解鎖中…' : `解鎖科技`}
                              </button>
                            )}
                            {!node.isUnlocked && !node.canUnlock && node.lockedReason && !branchLocked && (
                              <div style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '0.3rem' }}>
                                🔒 {node.lockedReason}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TechTreePanel;
