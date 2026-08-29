import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { WWI_COUNTRIES, CountryDefinition, getScenario } from '@wwi/shared';
import { getApiUrl } from '../lib/api';
import WorldMap from '../components/WorldMap';

interface GameInfo {
  game: { id: string; name: string; status: string; currentTurn: number; createdAt: string; scenarioId?: string };
  totalCountries: number;
  takenCountryIds: string[];
  myCountryId: string | null;
  players: { countryId: string; username: string; avatar: string | null; isAI: boolean }[];
}

const Lobby: React.FC = () => {
  const navigate = useNavigate();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [clickedCountry, setClickedCountry] = useState<CountryDefinition | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) { try { setUser(JSON.parse(storedUser)); } catch {} }
  }, []);

  const fetchGames = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/games/list'), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const list: GameInfo[] = data.games || [];
        setGames(list);
        // Default to a game the player hasn't joined yet, or the first one
        setActiveGameId((prev) => {
          if (prev && list.some((g) => g.game.id === prev)) return prev;
          const unjoined = list.find((g) => !g.myCountryId);
          return (unjoined || list[0])?.game.id || null;
        });
      }
    } catch (err) { console.error('載入戰局狀態失敗', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 5000);
    return () => clearInterval(interval);
  }, [fetchGames]);

  const activeGame = games.find((g) => g.game.id === activeGameId) || null;
  const takenSet = new Set(activeGame?.takenCountryIds || []);
  const isFull = !!activeGame && takenSet.size >= (activeGame.totalCountries || WWI_COUNTRIES.length);
  // Resolve the country list for the active game's scenario — falls back to
  // the legacy static WWI list when no scenario is set (or scenario unknown).
  const scenarioCountries: CountryDefinition[] =
    (activeGame?.game.scenarioId && getScenario(activeGame.game.scenarioId)?.countries as CountryDefinition[]) ||
    (WWI_COUNTRIES as CountryDefinition[]);

  const handleSelectCountry = (country: CountryDefinition | null) => {
    if (!country) { setClickedCountry(null); return; }
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
    if (!clickedCountry || joining || !activeGameId) return;
    setJoining(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/games/join'), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryId: clickedCountry.id, gameId: activeGameId }),
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
        fetchGames();
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
        ) : games.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>目前沒有進行中的戰局</h3>
            <p style={{ color: 'var(--text-muted)' }}>請等待管理員在後台開啟新戰局,頁面會自動更新。</p>
          </div>
        ) : (
          <>
            {/* Game selector — up to 2 concurrent games (main + beta) */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {games.map((g) => {
                const taken = new Set(g.takenCountryIds).size;
                const isActive = g.game.id === activeGameId;
                return (
                  <div
                    key={g.game.id}
                    onClick={() => { setActiveGameId(g.game.id); setClickedCountry(null); setError(null); }}
                    className="card"
                    style={{
                      flex: '1 1 260px', cursor: 'pointer', padding: '1rem 1.25rem',
                      border: isActive ? '2px solid var(--accent-gold)' : '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontSize: '1.1rem' }}>{g.game.name}</h3>
                      {g.myCountryId && (
                        <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '10px', backgroundColor: 'rgba(74,125,74,0.25)', color: '#8fd98f' }}>已加入</span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                      第 {g.game.currentTurn} 回合 | {g.game.status} | 已選國家 {taken}/{g.totalCountries}
                    </p>
                    {g.myCountryId && (
                      <button
                        className="btn-primary"
                        style={{ marginTop: '0.6rem', width: '100%' }}
                        onClick={(e) => { e.stopPropagation(); navigate(`/game/${g.game.id}`); }}
                      >
                        進入戰情室
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {activeGame && (
              <>
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.3rem', marginBottom: '0.25rem' }}>{activeGame.game.name}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    第 {activeGame.game.currentTurn} 回合 | 狀態: <span style={{ color: 'var(--accent-gold)' }}>{activeGame.game.status}</span> | 已選國家: {takenSet.size}/{activeGame.totalCountries}
                  </p>
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

                {activeGame.myCountryId ? (
                  <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>在「{activeGame.game.name}」中，你已動員為</p>
                    <h3 style={{ fontSize: '1.5rem' }}>
                      {(() => {
                        const c = scenarioCountries.find((x) => x.id === activeGame.myCountryId);
                        return c ? `${c.flagIcon} ${c.nameZh}` : activeGame.myCountryId;
                      })()}
                    </h3>
                    <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => navigate(`/game/${activeGame.game.id}`)}>
                      進入戰情室
                    </button>
                  </div>
                ) : isFull ? (
                  <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                    <h3 style={{ marginBottom: '0.5rem' }}>所有國家已被選完</h3>
                    <p style={{ color: 'var(--text-muted)' }}>請等待這局結束後的下一場戰局，或切換到另一個戰局試試。</p>
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
                      countries={scenarioCountries}
                      takenCountryIds={activeGame.takenCountryIds}
                      selectedCountryId={clickedCountry?.id || null}
                      onSelectCountry={handleSelectCountry}
                      scenarioId={activeGame.game.scenarioId}
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
                    {activeGame.players.length > 0 && (
                      <div style={{ marginTop: '1.5rem' }}>
                        <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>已參戰指揮官</h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {activeGame.players.map((p) => {
                            const c = scenarioCountries.find((x) => x.id === p.countryId);
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
          </>
        )}
      </div>
    </div>
  );
};

export default Lobby;
