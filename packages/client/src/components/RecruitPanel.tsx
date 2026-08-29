import React, { useState } from 'react';
import { apiFetch } from '../lib/api';
import { recruitCost } from '@wwi/shared';
import {
  MilitaryState,
  AvailableUnit,
  CATEGORY_LABELS_ZH,
} from '../types/military';

interface RecruitPanelProps {
  militaryState: MilitaryState | null;
  onRefresh: () => void;
}

const RecruitPanel: React.FC<RecruitPanelProps> = ({ militaryState, onRefresh }) => {
  const [selectedUnit, setSelectedUnit] = useState<AvailableUnit | null>(null);
  const [quantity, setQuantity] = useState<number>(1000);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const availableUnits = militaryState?.availableUnits || [];
  const stockpile = militaryState?.stockpile || [];
  const countryState = militaryState?.countryState;

  // Group units by category
  const categories = Array.from(new Set(availableUnits.map((u) => u.category)));

  const handleSelectUnit = (unit: AvailableUnit) => {
    setSelectedUnit(unit);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleRecruit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnit || quantity <= 0) return;

    setSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await apiFetch('/api/military/recruit', {
        method: 'POST',
        body: JSON.stringify({
          customUnitId: selectedUnit.id,
          quantity,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`✓ 成功招募 ${quantity.toLocaleString()} 名「${selectedUnit.nameZh}」！`);
        onRefresh();
      } else {
        setErrorMsg(data.error || '招募失敗，請檢查資源是否足夠');
      }
    } catch (err: any) {
      setErrorMsg('連線失敗: ' + (err.message || '未知錯誤'));
    } finally {
      setSubmitting(false);
    }
  };

  const previewCost = selectedUnit ? recruitCost(selectedUnit, quantity) : { gold: 0, manpower: 0, industry: 0 };
  const totalCostGold = previewCost.gold;
  const totalCostManpower = previewCost.manpower;
  const totalCostIndustry = previewCost.industry;

  const hasEnoughGold = countryState ? countryState.gold >= totalCostGold : true;
  const hasEnoughManpower = countryState ? countryState.manpower >= totalCostManpower : true;
  const hasEnoughIndustry = countryState ? countryState.industry >= totalCostIndustry : true;

  const canAfford = hasEnoughGold && hasEnoughManpower && hasEnoughIndustry && quantity > 0;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🪣 招募兵力 (兵源動員)
        </h3>
        {countryState && (
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
            <span>黃金: <strong style={{ color: '#c9a86b' }}>{countryState.gold.toLocaleString()}</strong></span>
            <span>預備役: <strong style={{ color: '#4ade80' }}>{countryState.manpower.toLocaleString()}</strong></span>
            <span>工業: <strong>{countryState.industry.toLocaleString()}</strong></span>
          </div>
        )}
      </div>

      {/* Stockpile Overview */}
      <div style={{ padding: '0.875rem 1rem', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-gold)', marginBottom: '0.5rem' }}>
          📦 現有儲備軍備 (後勤軍力庫)
        </div>
        {stockpile.length === 0 ? (
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>目前軍備庫無儲備兵力。請在下方進行動員招募。</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {stockpile.map((item) => (
              <div key={item.customUnitId} style={{ padding: '0.35rem 0.65rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '0.8rem', border: '1px solid var(--border-color)' }}>
                <span>{item.nameZh}</span> ({CATEGORY_LABELS_ZH[item.category] || item.category}):{' '}
                <strong style={{ color: '#4ade80' }}>{item.quantity.toLocaleString()}</strong> 名
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available Units Grid */}
      <div>
        <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: 'var(--text)' }}>
          🎖️ 可動員兵種單位
        </h4>

        {categories.map((cat) => {
          const unitsInCat = availableUnits.filter((u) => u.category === cat);
          return (
            <div key={cat} style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                【{CATEGORY_LABELS_ZH[cat] || cat}】
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {unitsInCat.map((unit) => {
                  const isSelected = selectedUnit?.id === unit.id;
                  return (
                    <div
                      key={unit.id}
                      onClick={() => handleSelectUnit(unit)}
                      style={{
                        padding: '0.875rem',
                        borderRadius: '6px',
                        backgroundColor: isSelected ? 'rgba(201, 168, 107, 0.12)' : 'var(--bg-primary)',
                        border: `2px solid ${isSelected ? 'var(--accent-gold)' : 'var(--border-color)'}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: isSelected ? 'var(--accent-gold)' : 'var(--text)', marginBottom: '0.25rem' }}>
                          {unit.nameZh}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                          <span>⚔️ 攻 {unit.attack}</span>
                          <span>🛡️ 防 {unit.defense}</span>
                          <span>⚡ 速 {unit.speed}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>招募 100 名成本:</span>
                        <span>💰 黃金 {unit.costGold} | 🏭 工業 {unit.costIndustry}　(👥 人力 每名 {unit.costManpower})</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recruitment Order Form */}
      {selectedUnit && (
        <form onSubmit={handleRecruit} style={{ padding: '1rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px', border: '1px solid var(--accent-gold)', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--accent-gold)' }}>
            🎯 招募設定: {selectedUnit.nameZh}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              招募數量:
            </label>
            <input
              type="number"
              className="input-field"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              min={1}
              step={100}
              style={{ maxWidth: '200px' }}
            />
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {[100, 500, 1000, 5000].map((amt) => (
                <button
                  type="button"
                  key={amt}
                  className="btn-secondary"
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                  onClick={() => setQuantity(amt)}
                >
                  +{amt}
                </button>
              ))}
            </div>
          </div>

          {/* Cost preview */}
          <div style={{ padding: '0.625rem', backgroundColor: 'var(--bg-primary)', borderRadius: '4px', fontSize: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            <span>所需黃金: <strong style={{ color: hasEnoughGold ? '#c9a86b' : '#f87171' }}>{totalCostGold.toLocaleString()}</strong></span>
            <span>消耗預備役: <strong style={{ color: hasEnoughManpower ? '#4ade80' : '#f87171' }}>{totalCostManpower.toLocaleString()}</strong></span>
            <span>消耗工業產能: <strong style={{ color: hasEnoughIndustry ? '#60a5fa' : '#f87171' }}>{totalCostIndustry.toLocaleString()}</strong></span>
          </div>

          {!canAfford && (
            <div style={{ color: '#f87171', fontSize: '0.8rem', fontWeight: 600 }}>
              ⚠️ 資源不足！無法完成招募計畫。
            </div>
          )}

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
              disabled={submitting || !canAfford}
            >
              {submitting ? '招募中...' : `確認招募 ${quantity.toLocaleString()} 名 ${selectedUnit.nameZh}`}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default RecruitPanel;
