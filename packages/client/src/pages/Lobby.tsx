import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { WWI_COUNTRIES, CountryDefinition, SIDE_LABELS_ZH } from '@wwi/shared';
import { getApiUrl } from '../lib/api';

interface CurrentGameInfo {
  game: { id: string; name: string; status: string; currentTurn: number; createdAt: string } | null;
  totalCountries: number;
  takenCountryIds: string[];
  myCountryId: string | null;
  players: { countryId: string; username: string; avatar: string | null; isAI: boolean }[];
}

const Lobby: React.FC = () => {
  const navigate = useNavigate();
  const [info, setInfo] = useState<CurrentGameInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const fetchCurrent = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/games/current'), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setInfo(data);
      }
    } catch (err) {
      console.error('載入戰局狀態失敗', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrent();
    const interval = setInterval(fetchCurrent, 5000);
    return () => clearInterval(interval);
  }, [fetchCurrent]);

  const handleJoin = async (countryId: string) => {
    if (joining) return;
    setJoining(countryId);
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/games/join'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryId }),
      });
      const data = await res.json();
      if (res.ok) {
        navigate(`/game/${data.gameId}`);
      } else {
        setError(data.error || '選擇國家失敗');
        fetchCurrent();
      }
    } catch (err) {
      setError('連線失敗,請再試一次');
    } finally {
      setJoining(null);
    }
  };

  const handleLogout = async () => {
    await fetch(getApiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const takenSet = new Set(info?.takenCountryIds || []);
  const isFull = !!info?.game && takenSet.size >= (info?.totalCountries || WWI_COUNTRIES.length);

  return (
    <div>
      <header className="navbar">
        <h2 style={{ fontSize: '1.4rem' }}>1914 戰情室大廳</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {user && <span>指揮官 <strong>{user.username}</strong></span>}
          <button className="btn-secondary" onClick={() => navigate('/admin')}>管理員後台</button>
          <button className="btn-secondary" onClick={handleLogout}>登出</button>
        </div>
      </header>

      <div className="container" style={{ marginTop: '1.5rem' }}>
        {loading ? (
          <p>正在載入戰局狀態...</p>
        ) : !info?.game ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>目前沒有進行中的戰局</h3>
            <p style={{ color: 'var(--text-muted)' }}>請等待管理員在後台開啟新戰局,頁面會自動更新。</p>
          </div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', marginBottom: '0.25rem' }}>{info.game.name}</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  第 {info.game.currentTurn} 回合 | 狀態: <span style={{ color: 'var(--accent-gold)' }}>{info.game.status}</span> | 已選國家: {takenSet.size}/{info.totalCountries}
                </p>
              </div>
              {info.myCountryId && (
                <button className="btn-primary" onClick={() => navigate(`/game/${info.game!.id}`)}>
                  進入戰情室
                </button>
              )}
            </div>

            {error && (
              <div style={{
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                borderRadius: '4px',
                color: '#ef4444'
              }}>
                {error}
              </div>
            )}

            {info.myCountryId ? (
              <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>你已動員為</p>
                <h3 style={{ fontSize: '1.5rem' }}>
                  {(() => {
                    const c = WWI_COUNTRIES.find((x) => x.id === info.myCountryId);
                    return c ? `${c.flagIcon} ${c.nameZh}` : info.myCountryId;
                  })()}
                </h3>
              </div>
            ) : isFull ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                <h3 style={{ marginBottom: '0.5rem' }}>所有國家已被選完</h3>
                <p style={{ color: 'var(--text-muted)' }}>請等待這局結束後的下一場戰局。</p>
              </div>
            ) : (
              <>
                <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  選擇你的國家 — 先搶先贏!
                </h3>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '0.75rem'
                }}>
                  {WWI_COUNTRIES.map((c: CountryDefinition) => {
                    const taken = takenSet.has(c.id);
                    return (
                      <button
                        key={c.id}
                        disabled={taken || !!joining}
                        onClick={() => handleJoin(c.id)}
                        className="card"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          textAlign: 'left',
                          cursor: taken ? 'not-allowed' : 'pointer',
                          opacity: taken ? 0.4 : 1,
                          border: '1px solid var(--border-color)',
                          padding: '0.75rem 1rem',
                        }}
                      >
                        <span>
                          {c.flagIcon} {c.nameZh}
                          <br />
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {SIDE_LABELS_ZH[c.side]}
                          </span>
                        </span>
                        <span style={{ fontSize: '0.8rem', color: taken ? '#ef4444' : 'var(--accent-gold)' }}>
                          {joining === c.id ? '選取中...' : taken ? '已被選走' : '選擇'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Lobby;
