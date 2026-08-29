import React from 'react';
import { useGame } from '../../contexts/GameContext';

const WorkshopPage: React.FC = () => {
  const {
    myUnits, unitDesigning, unitDesignPrompt, setUnitDesignPrompt,
    unitDesignCategory, setUnitDesignCategory, unitError, unitSuccess,
    handleDesignUnit, handleDeleteUnit, CATEGORY_LABELS, CATEGORIES,
  } = useGame();

  return (
    <div className="card">
      <h3 style={{ marginBottom: '0.5rem' }}>⚔️ 兵種設計工坊</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        輸入提示詞讓 AI 為你設計獨特兵種（每類最多 5 種）
      </p>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <select
          value={unitDesignCategory}
          onChange={(e) => setUnitDesignCategory(e.target.value)}
          style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.8rem' }}
        >
          {CATEGORIES.map((c) => {
            const count = myUnits.filter((u) => u.category === c).length;
            return <option key={c} value={c}>{CATEGORY_LABELS[c]}（{count}/5）</option>;
          })}
        </select>
        <input
          type="text"
          placeholder="例：壕溝突擊隊，配備刺刀和手榴彈"
          value={unitDesignPrompt}
          onChange={(e) => setUnitDesignPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !unitDesigning) handleDesignUnit(); }}
          style={{ flex: 1, minWidth: '120px', padding: '0.35rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.8rem' }}
        />
        <button onClick={handleDesignUnit} disabled={unitDesigning || !unitDesignPrompt.trim()} className="btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
          {unitDesigning ? '⏳...' : '設計'}
        </button>
      </div>
      {unitError && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>✗ {unitError}</p>}
      {unitSuccess && <p style={{ color: '#22c55e', fontSize: '0.75rem', marginTop: '0.25rem' }}>{unitSuccess}</p>}
      {myUnits.length > 0 && (
        <div style={{ marginTop: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
          {myUnits.map((u) => (
            <div key={u.id} style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--bg-tertiary)', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600 }}>{CATEGORY_LABELS[u.category] || u.category}: {u.nameZh}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                  攻:{u.attack} 防:{u.defense} 速:{u.speed} 成本:(金{u.costGold}/人{u.costManpower}/工{u.costIndustry})
                </span>
              </div>
              <button onClick={() => handleDeleteUnit(u.id)} className="btn-secondary" style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', color: '#ef4444' }}>刪除</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkshopPage;
