import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { WWI_COUNTRIES, CountryDefinition} from '@wwi/shared';
import { getApiUrl } from '../lib/api';
import WorldMap from '../components/WorldMap';

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
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [clickedCountry, setClickedCountry] = useState<CountryDefinition | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) { try { setUser(JSON.parse(storedUser)); } catch {} }
  }, []);

  const fetchCurrent = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/games/current'), { credentials: 'include' });
      if (res.ok) { const data = await res.json(); setInfo(data); }
    } catch (err) { console.error('載入戰局狀態失敗', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchCurrent();
    const interval = setInterval(fetchCurrent, 5000);
    return () => clearInterval(interval);
  }, [fetchCurrent]);

  const handleSelectCountry = (country: CountryDefinition | null) => {
    if (!country) { setClickedCountry(null); return; }
    const takenSet = new Set(info?.takenCountryIds || []);
    if (takenSet.has(country.id)) {
      setError(`${country.flagIcon} ${country.nameZh} 已被選走，請選擇其他國家`);
      setClickedCountry(null);
      setTimeout(() => setError(null), 3000);
      return;
    }
    setError(null);
    setClickedCountry(country);
  };

  const handleConfirmJoin = async () => {
    if (!clickedCountry || joining) return;
    setJoining(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/games/join'), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryId: clickedCountry.id }),
      });
      const data = await res.json();
      if (res.ok) {
        navigate(`/game/${data.gameId}`);
      } else if (data.error === 'stale_session') {
        setError('登入資訊已失效,將為你重新導向登入頁面...');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setTimeout(() => navigate('/'), 1500);
      } else {
        setError(data.error || '選擇國家失敗');
        setClickedCountry(null);
        fetchCurrent();
      }
    } catch { setError('連線失敗,請再試一次'); }
    finally { setJoining(false); }
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
                padding: '0.75rem 1rem', marginBottom: '1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444',
                borderRadius: '4px', color: '#ef4444'
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
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  {WWI_COUNTRIES.find((x) => x.id === info.myCountryId)?.nameZh || ''}
                </p>
              </div>
            ) : isFull ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                <h3 style={{ marginBottom: '0.5rem' }}>所有國家已被選完</h3>
                <p style={{ color: 'var(--text-muted)' }}>請等待這局結束後的下一場戰局。</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '1.1rem' }}>🌍 點選地圖上的國家來選擇 — 先搶先贏!</h3>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#4a7d4a', borderRadius: '2px', marginRight: '4px' }}></span>可選擇
                    <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#2a3a2a', borderRadius: '2px', marginLeft: '0.75rem', marginRight: '4px' }}></span>已被選走
                  </span>
                </div>

                <WorldMap
                  countries={WWI_COUNTRIES as CountryDefinition[]}
                  takenCountryIds={info.takenCountryIds}
                  selectedCountryId={clickedCountry?.id || null}
                  onSelectCountry={handleSelectCountry}
                />

                {clickedCountry && (
                  <div style={{
                    marginTop: '1rem', padding: '1rem', borderRadius: '6px',
                    border: '1px solid var(--accent-gold)', backgroundColor: 'rgba(255, 209, 102, 0.08)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                        {clickedCountry.flagIcon} {clickedCountry.nameZh}
                      </span>
                      <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        自由陣營
                      </span>
                    </div>
                    <button
                      className="btn-primary"
                      onClick={handleConfirmJoin}
                      disabled={joining}
                      style={{ padding: '0.5rem 2rem' }}
                    >
                      {joining ? '動員中...' : '確認動員'}
                    </button>
                  </div>
                )}

                {/* Player list */}
                {info.players.length > 0 && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>已參戰指揮官</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {info.players.map((p) => {
                        const c = WWI_COUNTRIES.find((x) => x.id === p.countryId);
                        return (
                          <span key={p.countryId} style={{
                            fontSize: '0.8rem', padding: '0.25rem 0.6rem', borderRadius: '12px',
                            border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)',
                          }}>
                            {c?.flagIcon || '🏳️'} {p.username}{p.isAI ? ' 🤖' : ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Lobby;
