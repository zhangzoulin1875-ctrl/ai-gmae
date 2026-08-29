import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { Policy } from '../types/military';

interface PolicyPanelProps {
  currentTurn?: number;
  refreshTrigger?: number;
}

const EFFECT_NAMES_ZH: Record<string, string> = {
  gold: '黃金',
  stability: '穩定度',
  morale: '士氣',
  industry: '工業產能',
  manpower: '預備役人力',
  defense: '防禦等級',
};

const PolicyPanel: React.FC<PolicyPanelProps> = ({ currentTurn, refreshTrigger }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [alreadySubmittedThisTurn, setAlreadySubmittedThisTurn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await apiFetch('/api/policies/mine');
      if (res.ok) {
        const data = await res.json();
        if (data.policies) {
          setPolicies(data.policies);
          // Check if already submitted for current turn
          if (currentTurn !== undefined) {
            const submittedThisTurn = data.policies.some((p: Policy) => p.turn === currentTurn);
            if (submittedThisTurn) {
              setAlreadySubmittedThisTurn(true);
            } else {
              setAlreadySubmittedThisTurn(false);
            }
          }
        }
      }
    } catch (err) {
      console.error('載入政策歷史失敗', err);
    }
  }, [currentTurn]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies, refreshTrigger]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || submitting || alreadySubmittedThisTurn) return;

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await apiFetch('/api/policies/submit', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
        }),
      });

      const data = await res.json();

      if (res.status === 409 || (data.error && data.error.includes('already'))) {
        setAlreadySubmittedThisTurn(true);
        setErrorMsg('⚠️ 本回合您已經提交過國家政策法案，每個回合限提交一次。');
      } else if (res.ok && data.success) {
        setSuccessMsg('✓ 政策法案已成功提交！內閣與 AI 參謀將在回合結算時進行評估。');
        setTitle('');
        setContent('');
        setAlreadySubmittedThisTurn(true);
        fetchPolicies();
      } else {
        setErrorMsg(data.error || '提交政策失敗');
      }
    } catch (err: any) {
      setErrorMsg('連線失敗: ' + (err.message || '未知錯誤'));
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusBadge = (status: Policy['status']) => {
    switch (status) {
      case 'PENDING':
        return (
          <span
            style={{
              padding: '0.2rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: 'rgba(234, 179, 8, 0.15)',
              color: '#facc15',
              border: '1px solid #eab308',
            }}
          >
            ⏳ 審核中…
          </span>
        );
      case 'APPROVED':
        return (
          <span
            style={{
              padding: '0.2rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: 'rgba(34, 197, 94, 0.15)',
              color: '#4ade80',
              border: '1px solid #22c55e',
            }}
          >
            ✓ 已核准
          </span>
        );
      case 'PARTIAL':
        return (
          <span
            style={{
              padding: '0.2rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: 'rgba(234, 179, 8, 0.15)',
              color: '#facc15',
              border: '1px solid #eab308',
            }}
          >
            ⚠️ 部分通過
          </span>
        );
      case 'REJECTED':
        return (
          <span
            style={{
              padding: '0.2rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#f87171',
              border: '1px solid #ef4444',
            }}
          >
            ✗ 已否決
          </span>
        );
      default:
        return null;
    }
  };

  const formatEffects = (effects?: Record<string, number>) => {
    if (!effects || Object.keys(effects).length === 0) return null;
    const parts = Object.entries(effects).map(([key, val]) => {
      const name = EFFECT_NAMES_ZH[key] || key;
      const sign = val > 0 ? '+' : '';
      return `${name} ${sign}${val}`;
    });
    return parts.join(', ');
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Title */}
      <div>
        <h3 style={{ margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          📜 國家政策法案 (內閣提案)
        </h3>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          起草並提交本國經濟、軍事或外交政策提案。AI 參謀將評估可行性並於回合結算時產生國家增益/扣減。
        </p>
      </div>

      {/* Policy Submission Form */}
      <form onSubmit={handleSubmit} style={{ padding: '1rem', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--accent-gold)' }}>
          ✍️ 起草新政策提案 {currentTurn !== undefined && `(第 ${currentTurn} 回合)`}
        </div>

        {alreadySubmittedThisTurn && (
          <div style={{ padding: '0.625rem 0.875rem', backgroundColor: 'rgba(234, 179, 8, 0.15)', border: '1px solid #eab308', borderRadius: '4px', color: '#facc15', fontSize: '0.85rem' }}>
            ⚠️ 本回合您已經提交過政策法案，每個回合限提交一案。請等待下一回合結算後再行提案。
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
            政策名稱 / 法案標題
          </label>
          <input
            type="text"
            className="input-field"
            placeholder="例如：戰時工業緊急動員令 / 糧食配給與戰時管制"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={alreadySubmittedThisTurn || submitting}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
            政策內文 / 具體條款與執行計畫
          </label>
          <textarea
            className="input-field"
            rows={4}
            placeholder="請詳細敘述政策背景、期望目標與資源分配規劃..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={alreadySubmittedThisTurn || submitting}
            style={{ resize: 'vertical' }}
          />
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
            disabled={alreadySubmittedThisTurn || submitting || !title.trim() || !content.trim()}
          >
            {submitting ? '提交中...' : '提交政策法案'}
          </button>
        </div>
      </form>

      {/* Submission History */}
      <div>
        <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: 'var(--text)' }}>
          📋 歷史政策提案與評估紀錄 ({policies.length})
        </h4>

        {policies.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            目前尚無政策提案紀錄。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {policies.map((p) => {
              const formattedEffects = formatEffects(p.effects);
              return (
                <div
                  key={p.id}
                  style={{
                    padding: '1rem',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.625rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '3px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent-gold)' }}>
                        第 {p.turn} 回合
                      </span>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--text)' }}>{p.title}</strong>
                    </div>
                    {renderStatusBadge(p.status)}
                  </div>

                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                    {p.content}
                  </p>

                  {/* AI Verdict */}
                  {p.aiVerdict && (
                    <div
                      style={{
                        padding: '0.625rem',
                        backgroundColor: 'var(--bg-tertiary)',
                        borderLeft: '3px solid var(--accent-gold)',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        color: 'var(--text)',
                        lineHeight: '1.4',
                      }}
                    >
                      <strong>🤖 AI 內閣評估評語:</strong> {p.aiVerdict}
                    </div>
                  )}

                  {/* Effects preview */}
                  {formattedEffects && (
                    <div style={{ fontSize: '0.8rem', color: '#4ade80', fontWeight: 600 }}>
                      ⚡ 政策生效效果: {formattedEffects}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PolicyPanel;
