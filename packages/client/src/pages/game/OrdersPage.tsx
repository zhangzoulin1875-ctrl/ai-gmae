/**
 * OrdersPage — 下達作戰指令 (formerly TAB 1 inside Game.tsx).
 * Now its own route: /game/:id/orders
 */
import React from 'react';
import { OrderType } from '@wwi/shared';
import { useGame } from '../../contexts/GameContext';

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  ATTACK: '進攻 (主動出擊)',
  DEFEND: '防守 (固守陣地)',
  MOVE: '移動 (部隊調度)',
  RECRUIT: '徵兵 (轉至招募分頁)',
  DIPLOMACY: '外交 (提議協定)',
  FORTIFY: '築防 (修築壕溝)',
};

const OrdersPage: React.FC = () => {
  const {
    state, activeDivisions, formError, setFormError,
    orderType, setOrderType, details, setDetails,
    mapSelectMode, setMapSelectMode,
    fromTerritory, setFromTerritory, targetTerritory, setTargetTerritory,
    getCountryFlag, getCountryNameZh, getCountryName, getTerritoryName,
    selectedDivisionIds, toggleDivisionSelection,
    handleSubmitOrder, handleClearForm, handleReady,
    handleAiSuggest, aiSuggesting, resolving,
    goToTab,
  } = useGame();

  if (!state) return null;

  const selectedDivisions = activeDivisions.filter((d) => selectedDivisionIds.includes(d.id));
  const selectedDivisionNames = selectedDivisions.map((d) => d.name);
  const selectedTotalUnits = selectedDivisions.reduce((sum, d) => sum + (d.totalUnits || 0), 0);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>下達作戰指令</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
            onClick={handleAiSuggest}
            disabled={aiSuggesting}
          >
            {aiSuggesting ? '⏳ 分析中...' : '🤖 自動決策'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
            onClick={handleClearForm}
          >
            🗑️ 清除指令
          </button>
        </div>
      </div>

      {state.myCountryId ? (
        <form onSubmit={handleSubmitOrder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {formError && (
            <div style={{
              padding: '0.625rem 0.875rem',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              borderRadius: '4px',
              color: '#f87171',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}>
              ⚠️ {formError}
            </div>
          )}

          {/* Order Type + Details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                指令類型
              </label>
              <select
                className="input-field"
                value={orderType}
                onChange={(e) => {
                  const newType = e.target.value as OrderType;
                  setOrderType(newType);
                  setFormError(null);
                  if (newType === 'RECRUIT') {
                    goToTab('recruit');
                  }
                }}
              >
                {Object.entries(ORDER_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                備註 / 戰術細節
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="作戰說明..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
          </div>

          {/* Territory Selectors (From & Target) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                出發地 {mapSelectMode === 'from' && <span style={{ color: 'var(--accent-gold)', fontSize: '0.75rem' }}>(點擊地圖選擇中...)</span>}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div className="input-field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-tertiary)', flex: 1, minHeight: '40px', overflow: 'hidden' }}>
                  {fromTerritory ? (
                    <>
                      <span>{getCountryFlag(fromTerritory)}</span>
                      <span style={{ fontWeight: 600 }}>{getTerritoryName(fromTerritory)}</span>
                    </>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>未設定</span>
                  )}
                </div>
                <button
                  type="button"
                  className={mapSelectMode === 'from' ? 'btn-primary' : 'btn-secondary'}
                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                  onClick={() => setMapSelectMode('from')}
                >
                  在地圖選取
                </button>
                {fromTerritory && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.5rem 0.6rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                    onClick={() => setFromTerritory('')}
                    title="清除出發地"
                  >
                    清除
                  </button>
                )}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                目標 {mapSelectMode === 'target' && <span style={{ color: 'var(--accent-gold)', fontSize: '0.75rem' }}>(點擊地圖選擇中...)</span>}
                {orderType === 'ATTACK' && <span style={{ color: '#ef4444' }}> *進攻必填</span>}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div className="input-field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-tertiary)', flex: 1, minHeight: '40px', overflow: 'hidden' }}>
                  {targetTerritory ? (
                    <>
                      <span>{getCountryFlag(targetTerritory)}</span>
                      <span style={{ fontWeight: 600 }}>{getTerritoryName(targetTerritory)}</span>
                    </>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>請點選目標省份</span>
                  )}
                </div>
                <button
                  type="button"
                  className={mapSelectMode === 'target' ? 'btn-primary' : 'btn-secondary'}
                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                  onClick={() => setMapSelectMode('target')}
                >
                  在地圖選取
                </button>
                {targetTerritory && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.5rem 0.6rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                    onClick={() => setTargetTerritory('')}
                  >
                    清除
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Division Selection (for ATTACK / DEFEND / MOVE) */}
          {['ATTACK', 'DEFEND', 'MOVE'].includes(orderType) && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                選擇調動參戰師團 {selectedDivisionIds.length > 0 && `(已選取 ${selectedDivisionIds.length} 個師團)`}
              </label>

              {activeDivisions.length === 0 ? (
                <div style={{ padding: '0.875rem 1rem', backgroundColor: 'rgba(239, 68, 68, 0.12)', border: '1px solid #ef4444', borderRadius: '4px', color: '#f87171', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>⚠️ 您目前沒有可用的編組師團！請先前往「編組師團」頁面建立師團。</span>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                    onClick={() => goToTab('divisions')}
                  >
                    前往編組師團 →
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.625rem' }}>
                  {activeDivisions.map((div) => {
                    const isSelected = selectedDivisionIds.includes(div.id);
                    const compSummary = div.composition?.map((c: any) => `${c.nameZh || c.customUnitId}x${c.quantity}`).join(' ') || '';
                    return (
                      <div
                        key={div.id}
                        onClick={() => toggleDivisionSelection(div.id)}
                        style={{
                          padding: '0.625rem 0.875rem',
                          borderRadius: '6px',
                          backgroundColor: isSelected ? 'rgba(201, 168, 107, 0.15)' : 'var(--bg-tertiary)',
                          border: `2px solid ${isSelected ? 'var(--accent-gold)' : 'var(--border-color)'}`,
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: isSelected ? 'var(--accent-gold)' : 'var(--text)' }}>
                            {isSelected ? '☑ ' : '☐ '} {div.name}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#4ade80' }}>
                            {div.totalUnits.toLocaleString()} 名
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {compSummary}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Order Cost & Preview */}
          <div style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--bg-primary)',
            borderLeft: '4px solid var(--accent-gold)',
            borderRadius: '4px',
            fontSize: '0.875rem',
          }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-gold)', marginBottom: '0.25rem' }}>
              📋 指令預覽與摘要
            </div>
            <div style={{ color: 'var(--text-main)' }}>
              {['ATTACK', 'DEFEND', 'MOVE'].includes(orderType) && (
                <>
                  派遣 <strong>{selectedDivisionNames.length > 0 ? selectedDivisionNames.join('、') : '未選擇師團'}</strong>{' '}
                  ({orderType === 'ATTACK' ? '進攻' : orderType === 'DEFEND' ? '固守' : '移防'}{' '}
                  <strong style={{ color: targetTerritory ? '#4ade80' : '#f87171' }}>
                    {targetTerritory ? getCountryName(targetTerritory) : '(請點選目標省份)'}
                  </strong>) → 共 <strong>{selectedTotalUnits.toLocaleString()}</strong> 名兵力
                </>
              )}
              {orderType === 'FORTIFY' && (
                <>修築防禦工事 → 花費 <strong style={{ color: '#c9a86b' }}>20 黃金</strong> (提升據點防禦等級)</>
              )}
              {orderType === 'DIPLOMACY' && (
                <>向 <strong>{targetTerritory ? getCountryName(targetTerritory) : '(請點選目標省份)'}</strong> 發起外交協定/戰術提案</>
              )}
              {orderType === 'RECRUIT' && (
                <>請前往「招募兵力」頁面進行部隊動員招募。</>
              )}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={resolving || (['ATTACK', 'DEFEND', 'MOVE'].includes(orderType) && (activeDivisions.length === 0 || selectedDivisionIds.length === 0))}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {resolving ? '結算中...' : '送出指令'}
            </button>
            <button type="button" className="btn-secondary" onClick={handleReady} disabled={resolving}>
              ✓ 本回合就緒
            </button>
          </div>
        </form>
      ) : (
        <p style={{ color: 'var(--text-muted)' }}>你尚未加入此戰局。</p>
      )}
    </div>
  );
};

export default OrdersPage;
