/**
 * AlliancePanel — free-form alliance management UI.
 *
 * Features:
 *  - View all alliances in the current game
 *  - Create a new alliance (become leader)
 *  - Apply to join an existing alliance
 *  - Leave your current alliance
 *  - Leader: approve pending members, kick members, disband alliance
 */
import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { useGame } from '../contexts/GameContext';

interface AllianceMemberInfo {
  countryId: string;
  status: string; // PENDING | MEMBER | LEADER
}

interface AllianceInfo {
  id: string;
  name: string;
  leaderCountryId: string;
  color: string;
  members: AllianceMemberInfo[];
}

interface AllianceData {
  success: boolean;
  alliances: AllianceInfo[];
}

const AlliancePanel: React.FC<{ gameId: string; myCountryId: string; refreshTrigger: number }> = ({ gameId, myCountryId, refreshTrigger }) => {
  const [data, setData] = useState<AllianceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [busy, setBusy] = useState<string | null>(null);

  const { getCountryName } = useGame();
  const cn = (cid: string) => getCountryName(cid);

  const fetchAlliances = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/games/${gameId}/alliances`);
      if (res.ok) {
        const d: AllianceData = await res.json();
        setData(d.alliances || []);
      }
    } catch (e: any) {
      setError('載入聯盟資料失敗: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => { fetchAlliances(); }, [fetchAlliances, refreshTrigger]);

  // Find my alliance membership
  const myMembership = data.flatMap((a) =>
    a.members.filter((m) => m.countryId === myCountryId).map((m) => ({ alliance: a, member: m }))
  )[0];

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy('create');
    setError(null);
    try {
      const res = await apiFetch(`/api/games/${gameId}/alliances`, {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      const d = await res.json();
      if (res.ok) {
        setNewName('');
        await fetchAlliances();
      } else {
        setError(d.error || '建立失敗');
      }
    } catch (e: any) {
      setError('建立失敗: ' + e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleApply = async (allianceId: string) => {
    setBusy(`apply-${allianceId}`);
    setError(null);
    try {
      const res = await apiFetch(`/api/games/${gameId}/alliances/${allianceId}/apply`, { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        await fetchAlliances();
      } else {
        setError(d.error || '申請失敗');
      }
    } catch (e: any) {
      setError('申請失敗: ' + e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleLeave = async () => {
    if (!myMembership) return;
    setBusy('leave');
    setError(null);
    try {
      const res = await apiFetch(`/api/games/${gameId}/alliances/${myMembership.alliance.id}/leave`, { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        await fetchAlliances();
      } else {
        setError(d.error || '退出失敗');
      }
    } catch (e: any) {
      setError('退出失敗: ' + e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async (allianceId: string, countryId: string) => {
    setBusy(`approve-${countryId}`);
    setError(null);
    try {
      const res = await apiFetch(`/api/games/${gameId}/alliances/${allianceId}/approve/${countryId}`, { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        await fetchAlliances();
      } else {
        setError(d.error || '批准失敗');
      }
    } catch (e: any) {
      setError('批准失敗: ' + e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleKick = async (allianceId: string, countryId: string) => {
    setBusy(`kick-${countryId}`);
    setError(null);
    try {
      const res = await apiFetch(`/api/games/${gameId}/alliances/${allianceId}/kick/${countryId}`, { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        await fetchAlliances();
      } else {
        setError(d.error || '驅逐失敗');
      }
    } catch (e: any) {
      setError('驅逐失敗: ' + e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleDisband = async (allianceId: string) => {
    if (!confirm('確定要解散此聯盟？所有成員將被移除。')) return;
    setBusy('disband');
    setError(null);
    try {
      const res = await apiFetch(`/api/games/${gameId}/alliances/${allianceId}`, { method: 'DELETE' });
      const d = await res.json();
      if (res.ok) {
        await fetchAlliances();
      } else {
        setError(d.error || '解散失敗');
      }
    } catch (e: any) {
      setError('解散失敗: ' + e.message);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div style={{ padding: '1rem', textAlign: 'center' }}>載入聯盟資料中…</div>;

  const isLeader = myMembership?.member.status === 'LEADER';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {error && <div style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</div>}

      {/* My alliance status */}
      <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '1rem', marginRight: '0.5rem' }}>🤝</span>
            {myMembership ? (
              <>
                <span style={{ fontWeight: 700, color: myMembership.alliance.color }}>{myMembership.alliance.name}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                  {myMembership.member.status === 'LEADER' ? '盟主' : myMembership.member.status === 'PENDING' ? '申請中' : '成員'}
                </span>
              </>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>尚未加入任何聯盟</span>
            )}
          </div>
          {myMembership && myMembership.member.status !== 'PENDING' && (
            <button
              onClick={handleLeave}
              disabled={busy === 'leave'}
              style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '4px', cursor: 'pointer' }}
            >
              {busy === 'leave' ? '處理中…' : isLeader ? '解散聯盟' : '退出聯盟'}
            </button>
          )}
          {myMembership && myMembership.member.status === 'PENDING' && (
            <button
              onClick={handleLeave}
              disabled={busy === 'leave'}
              style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '4px', cursor: 'pointer' }}
            >
              {busy === 'leave' ? '處理中…' : '取消申請'}
            </button>
          )}
        </div>
      </div>

      {/* Create alliance form (only if not in an alliance) */}
      {!myMembership && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>建立新聯盟</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={20}
              placeholder="聯盟名稱（最多 20 字）"
              style={{ flex: 1, minWidth: '200px', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.85rem' }}
            />
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              style={{ width: '40px', height: '34px', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
              title="選擇聯盟顏色"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || busy === 'create'}
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', background: 'var(--accent-blue, #3b82f6)', color: '#fff', border: 'none', borderRadius: '4px', cursor: newName.trim() ? 'pointer' : 'not-allowed', opacity: (!newName.trim() || busy === 'create') ? 0.5 : 1 }}
            >
              {busy === 'create' ? '建立中…' : '建立聯盟'}
            </button>
          </div>
        </div>
      )}

      {/* Alliances list */}
      <div>
        <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>全球聯盟一覽</h3>
        {data.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            目前沒有任何聯盟。建立第一個吧！
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {data.map((a) => {
              const pendingMembers = a.members.filter((m) => m.status === 'PENDING');
              const activeMembers = a.members.filter((m) => m.status !== 'PENDING');
              return (
                <div key={a.id} style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: '6px',
                  border: `1px solid ${a.color}`,
                  backgroundColor: 'var(--bg-tertiary)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: a.color, display: 'inline-block' }} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{a.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        盟主：{cn(a.leaderCountryId)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      {!myMembership && (
                        <button
                          onClick={() => handleApply(a.id)}
                          disabled={busy === `apply-${a.id}`}
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem', background: 'var(--accent-blue, #3b82f6)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          {busy === `apply-${a.id}` ? '申請中…' : '申請加入'}
                        </button>
                      )}
                      {isLeader && myMembership?.alliance.id === a.id && (
                        <button
                          onClick={() => handleDisband(a.id)}
                          disabled={busy === 'disband'}
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          解散
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Members */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                    {activeMembers.map((m) => (
                      <span key={m.countryId} style={{
                        fontSize: '0.78rem', padding: '0.15rem 0.5rem', borderRadius: '4px',
                        backgroundColor: m.status === 'LEADER' ? a.color : 'var(--bg)',
                        color: m.status === 'LEADER' ? '#fff' : 'var(--text)',
                      }}>
                        {cn(m.countryId)}{m.status === 'LEADER' ? ' 👑' : ''}
                        {isLeader && myMembership?.alliance.id === a.id && m.status === 'MEMBER' && (
                          <button
                            onClick={() => handleKick(a.id, m.countryId)}
                            disabled={busy === `kick-${m.countryId}`}
                            style={{ marginLeft: '0.3rem', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.78rem', padding: 0 }}
                            title="驅逐"
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  {/* Pending members (leader only) */}
                  {isLeader && myMembership?.alliance.id === a.id && pendingMembers.length > 0 && (
                    <div style={{ marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px dashed var(--border-color)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>申請中：</div>
                      {pendingMembers.map((m) => (
                        <div key={m.countryId} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                          <span style={{ fontSize: '0.8rem' }}>{cn(m.countryId)}</span>
                          <button
                            onClick={() => handleApprove(a.id, m.countryId)}
                            disabled={busy === `approve-${m.countryId}`}
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            {busy === `approve-${m.countryId}` ? '…' : '批准'}
                          </button>
                          <button
                            onClick={() => handleKick(a.id, m.countryId)}
                            disabled={busy === `kick-${m.countryId}`}
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            拒絕
                          </button>
                        </div>
                      ))}
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

export default AlliancePanel;
