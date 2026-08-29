import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameRoom, WWI_COUNTRIES, CountryDefinition, SIDE_LABELS_ZH } from '@wwi/shared';
import { getApiUrl } from '../lib/api';

const Lobby: React.FC = () => {
  const navigate = useNavigate();
  const [games, setGames] = useState<GameRoom[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [newGameName, setNewGameName] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<string>('deu');
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

    fetchGames();
    const interval = setInterval(fetchGames, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchGames = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(getApiUrl('/api/admin/games'), { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setGames(data.games || []);
      }
    } catch (err) {
      console.error('載入戰局失敗', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGameName.trim()) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(getApiUrl('/api/games'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: newGameName,
          countryId: selectedCountry
        })
      });

      if (res.ok) {
        const game = await res.json();
        setNewGameName('');
        navigate(`/game/${game.id}`);
      }
    } catch (err) {
      console.error('建立戰局失敗', err);
    }
  };

  const handleJoinGame = async (gameId: string) => {
    navigate(`/game/${gameId}`);
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

      <div className="container">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem' }}>
          {/* Main Games List */}
          <div>
            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              進行中的戰局 ({games.length})
            </h3>

            {loading ? (
              <p>正在載入戰局清單...</p>
            ) : games.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                <p style={{ color: 'var(--text-muted)' }}>目前沒有進行中的戰局,在右側建立一個新的戰局吧!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {games.map((game) => (
                  <div key={game.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ fontSize: '1.2rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>{game.name}</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        第 {game.currentTurn} 回合 | 狀態: <span style={{ color: 'var(--accent-gold)' }}>{game.status}</span> | 玩家: {game.players.length}/{game.maxPlayers}
                      </p>
                    </div>
                    <button className="btn-primary" onClick={() => handleJoinGame(game.id)}>
                      進入戰情室
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create Game Sidebar */}
          <div>
            <div className="card">
              <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>建立新戰局</h3>
              <form onSubmit={handleCreateGame} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                    戰局名稱
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="例如:1914 西線戰役"
                    value={newGameName}
                    onChange={(e) => setNewGameName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                    選擇您的國家(共 {WWI_COUNTRIES.length} 個)
                  </label>
                  <select
                    className="input-field"
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value)}
                  >
                    {WWI_COUNTRIES.map((c: CountryDefinition) => (
                      <option key={c.id} value={c.id}>
                        {c.flagIcon} {c.nameZh} ({SIDE_LABELS_ZH[c.side]})
                      </option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
                  動員並開戰
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
