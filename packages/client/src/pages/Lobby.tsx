import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameRoom, WWI_COUNTRIES, CountryDefinition } from '@wwi/shared';

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

      const res = await fetch('/api/admin/games', { headers });
      if (res.ok) {
        const data = await res.json();
        setGames(data.games || []);
      }
    } catch (err) {
      console.error('Failed to load games', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGameName.trim()) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/games', {
        method: 'POST',
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
      console.error('Failed to create game', err);
    }
  };

  const handleJoinGame = async (gameId: string) => {
    navigate(`/game/${gameId}`);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <div>
      <header className="navbar">
        <h2 style={{ fontSize: '1.4rem' }}>1914 WAR ROOM LOBBY</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {user && <span>Commander <strong>{user.username}</strong></span>}
          <button className="btn-secondary" onClick={() => navigate('/admin')}>Admin Panel</button>
          <button className="btn-secondary" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div className="container">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem' }}>
          {/* Main Games List */}
          <div>
            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              ACTIVE CAMPAIGNS ({games.length})
            </h3>

            {loading ? (
              <p>Loading active campaigns...</p>
            ) : games.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                <p style={{ color: 'var(--text-muted)' }}>No active campaigns available. Start a new campaign on the right!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {games.map((game) => (
                  <div key={game.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ fontSize: '1.2rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>{game.name}</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Turn {game.currentTurn} | Status: <span style={{ color: 'var(--accent-gold)' }}>{game.status}</span> | Players: {game.players.length}/{game.maxPlayers}
                      </p>
                    </div>
                    <button className="btn-primary" onClick={() => handleJoinGame(game.id)}>
                      Enter War Room
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create Game Sidebar */}
          <div>
            <div className="card">
              <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>CREATE NEW CAMPAIGN</h3>
              <form onSubmit={handleCreateGame} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                    Campaign Title
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Western Front 1914"
                    value={newGameName}
                    onChange={(e) => setNewGameName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                    Select Your Nation ({WWI_COUNTRIES.length} Available)
                  </label>
                  <select
                    className="input-field"
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value)}
                  >
                    {WWI_COUNTRIES.map((c: CountryDefinition) => (
                      <option key={c.id} value={c.id}>
                        {c.flagIcon} {c.name} ({c.side.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
                  Mobilize Campaign
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
