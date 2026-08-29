import React, { useState } from 'react';
import { apiFetch } from '../lib/api';
import {
  MilitaryState,
  Division,
  StockpileItem,
  CATEGORY_LABELS_ZH,
} from '../types/military';

interface DivisionPanelProps {
  militaryState: MilitaryState | null;
  onRefresh: () => void;
  onSwitchTab?: (tab: string) => void;
}

const DivisionPanel: React.FC<DivisionPanelProps> = ({ militaryState, onRefresh, onSwitchTab }) => {
  const [divisionName, setDivisionName] = useState<string>('');
  const [composition, setComposition] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Editing state for rename
  const [editingDivisionId, setEditingDivisionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');

  const stockpile = militaryState?.stockpile || [];
  const divisions = militaryState?.divisions || [];

  const availableStockpile = stockpile.filter((s) => s.quantity > 0);

  const handleQtyChange = (customUnitId: string, val: number, maxQty: number) => {
    const qty = Math.min(Math.max(0, val), maxQty);
    setComposition((prev) => ({
      ...prev,
      [customUnitId]: qty,
    }));
  };

  const handleQuickPercent = (customUnitId: string, percent: number, maxQty: number) => {
    const qty = Math.floor((maxQty * percent) / 100);
    handleQtyChange(customUnitId, qty, maxQty);
  };

  const totalUnitsInNewDivision = Object.values(composition).reduce((a, b) => a + (b || 0), 0);

  const handleCreateDivision = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const nameToUse = divisionName.trim() || `第 ${divisions.length + 1} 師團`;

    if (totalUnitsInNewDivision <= 0) {
      setErrorMsg('請至少從儲備庫中選擇一個單位的兵力');
      return;
    }

    // Filter non-zero composition
    const cleanComposition: Record<string, number> = {};
    for (const [id, qty] of Object.entries(composition)) {
      if (qty > 0) {
        cleanComposition[id] = qty;
      }
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/military/divisions', {
        method: 'POST',
        body: JSON.stringify({
          name: nameToUse,
          composition: cleanComposition,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`✓ 成功建立師團「${data.division?.name || nameToUse}」！`);
        setDivisionName('');
        setComposition({});
        onRefresh();
      } else {
        setErrorMsg(data.error || '建立師團失敗');
      }
    } catch (err: any) {
      setErrorMsg('連線失敗: ' + (err.message || '未知錯誤'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisband = async (division: Division) => {
    if (!window.confirm(`確定要解散師團「${division.name}」嗎？其兵力將返回後勤儲備庫。`)) return;

    try {
      const res = await apiFetch(`/api/military/divisions/${division.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onRefresh();
      } else {
        alert(data.error || '解散師團失敗');
      }
    } catch (err: any) {
      alert('連線失敗: ' + err.message);
    }
  };

  const handleSaveRename = async (divisionId: string) => {
    if (!renameValue.trim()) return;
    try {
      const res = await apiFetch(`/api/military/divisions/${divisionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEditingDivisionId(null);
        setRenameValue('');
        onRefresh();
      }
    } catch (err) {
      console.error('重命名失敗', err);
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Title */}
      <div>
        <h3 style={{ margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🛡️ 編組師團 (軍隊編制)
        </h3>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          將後勤儲備庫中的散兵編組為具備獨立番號與打擊力的正規作戰師團，用於發起進攻、防守或移防。
        </p>
      </div>

      {/* Form: Create Division */}
      <form onSubmit={handleCreateDivision} style={{ padding: '1rem', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--accent-gold)' }}>
          ➕ 建立新師團
        </div>

        {/* Division Name Input */}
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
            師團名稱 / 番號
          </label>
          <input
            type="text"
            className="input-field"
            placeholder={`例：第 ${divisions.length + 1} 近衛步兵師`}
            value={divisionName}
            onChange={(e) => setDivisionName(e.target.value)}
          />
        </div>

        {/* Stockpile Composition Picker */}
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            調配後勤儲備兵力
          </label>

          {availableStockpile.length === 0 ? (
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>目前沒有可用的後勤儲備兵力。請先招募兵力後再進行編組。</span>
              {onSwitchTab && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                  onClick={() => onSwitchTab('recruit')}
                >
                  前往招募兵力 →
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {availableStockpile.map((unit) => {
                const currentQty = composition[unit.customUnitId] || 0;
                return (
                  <div
                    key={unit.customUnitId}
                    style={{
                      padding: '0.625rem 0.875rem',
                      backgroundColor: 'var(--bg-tertiary)',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>
                        {unit.nameZh}
                      </span>{' '}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        ({CATEGORY_LABELS_ZH[unit.category] || unit.category})
                      </span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        儲備餘額: <strong style={{ color: '#4ade80' }}>{unit.quantity.toLocaleString()}</strong> 名
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="number"
                        className="input-field"
                        value={currentQty}
                        onChange={(e) => handleQtyChange(unit.customUnitId, Number(e.target.value), unit.quantity)}
                        min={0}
                        max={unit.quantity}
                        style={{ width: '110px' }}
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                        onClick={() => handleQuickPercent(unit.customUnitId, 50, unit.quantity)}
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                        onClick={() => handleQuickPercent(unit.customUnitId, 100, unit.quantity)}
                      >
                        全選
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Division Preview */}
        <div style={{ fontSize: '0.85rem', color: 'var(--accent-gold)' }}>
          預計編入總兵力: <strong>{totalUnitsInNewDivision.toLocaleString()}</strong> 名
        </div>

        {errorMsg && (
          <div style={{ padding: '0.5rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '4px', color: '#f87171', fontSize: '0.85rem' }}>
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{ padding: '0.5rem', backgroundColor: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e', borderRadius: '4px', color: '#4ade80', fontSize: '0.85rem' }}>
            {successMsg}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || totalUnitsInNewDivision <= 0}
          >
            {submitting ? '建立中...' : '確認建立師團'}
          </button>
        </div>
      </form>

      {/* List: Existing Divisions */}
      <div>
        <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: 'var(--text)' }}>
          ⚔️ 現役師團序列 ({divisions.length})
        </h4>

        {divisions.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            目前尚無編組師團。請在上方選擇儲備兵力並建立第一個正規師團。
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.875rem' }}>
            {divisions.map((div) => (
              <div
                key={div.id}
                style={{
                  padding: '0.875rem',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
              >
                <div>
                  {/* Division Name / Rename Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    {editingDivisionId === div.id ? (
                      <div style={{ display: 'flex', gap: '0.25rem', width: '100%' }}>
                        <input
                          type="text"
                          className="input-field"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          style={{ padding: '0.2rem 0.4rem', fontSize: '0.85rem' }}
                        />
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => handleSaveRename(div.id)}
                        >
                          儲存
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                          onClick={() => setEditingDivisionId(null)}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--accent-gold)' }}>
                          {div.name}
                        </div>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
                          onClick={() => {
                            setEditingDivisionId(div.id);
                            setRenameValue(div.name);
                          }}
                        >
                          ✏️ 改名
                        </button>
                      </>
                    )}
                  </div>

                  {/* Composition breakdown */}
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.5rem' }}>
                    {div.composition?.map((comp, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>• {comp.nameZh || comp.customUnitId} ({CATEGORY_LABELS_ZH[comp.category] || comp.category})</span>
                        <strong style={{ color: 'var(--text)' }}>{comp.quantity.toLocaleString()} 名</strong>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer / Disband */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                  <span>總兵力: <strong style={{ color: '#4ade80' }}>{div.totalUnits.toLocaleString()}</strong></span>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', color: '#f87171', borderColor: '#ef4444' }}
                    onClick={() => handleDisband(div)}
                  >
                    🗑️ 解散師團
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DivisionPanel;
