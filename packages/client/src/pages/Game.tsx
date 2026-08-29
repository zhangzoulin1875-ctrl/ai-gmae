import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { GameRoom, Order, OrderType, WWI_COUNTRIES } from '@wwi/shared';

const Game: React.FC = () => {
  const { id: gameId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [game, setGame] = useState<GameRoom | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [playerCountry, setPlayerCountry] = useState<string>('deu');
  const [orderType, setOrderType] = useState<OrderType>('ATTACK');
  const [fromTerritory, setFromTerritory] = useState<string>('');
  const [targetTerritory, setTargetTerritory] = useState<string>('');
  const [infantry, setInfantry] = useState<number>(10);
  const [artillery, setArtillery] = useState<number>(2);
  const [cavalry, setCavalry] = useState<number>(1);
  const [submittedOrders, setSubmittedOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;

    // Connect Socket.IO
    const newSocket = io('/', { path: '/socket.io' });
    setSocket(newSocket);

    newSocket.emit('join_room', { gameId, countryId: playerCountry });

    newSocket.on('room_data', (room: GameRoom) => {
      setGame(room);
    });

    newSocket.on('turn_update', (data: { turn: number; resolution: any; room: GameRoom }) => {
      setGame(data.room);
      setMessage(`Turn ${data.turn} resolved by ${data.resolution.resolvedByAIProvider}!`);
      setTimeout(() => setMessage(null), 5000);
    });

    newSocket.on('order_confirmed', (order: Order) => {
      setSubmittedOrders((prev) => [...prev, order]);
      setMessage(`Order #${order.id.slice(0, 6)} successfully queued!`);
      setTimeout(() => setMessage(null), 4000);
    });

    // Fetch initial state via REST
    fetch(`/api/games/${gameId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.id) setGame(data);
      })
      .catch((err) => console.error(err));

    return () => {
      newSocket.disconnect();
    };
  }, [gameId, playerCountry]);

  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !gameId) return;

    const newOrder: Partial<Order> = {
      gameId,
      countryId: playerCountry,
      turn: game?.currentTurn || 1,
      type: orderType,
      fromTerritoryId: fromTerritory || undefined,
      targetTerritoryId: targetTerritory || undefined,
      units: { infantry, artillery, cavalry },
      status: 'PENDING'
    };

    socket.emit('submit_orders', { gameId, order: newOrder });
  };

  const getCountryName = (cid: string) => {
    return WWI_COUNTRIES.find((c) => c.id === cid)?.name || cid;
  };

  return (
    <div>
      <header className="navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn-secondary" onClick={() => navigate('/lobby')}>← Back to Lobby</button>
          <h2>{game?.name || 'WWI Campaign'}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span>Turn: <strong style={{ color: 'var(--accent-gold)' }}>#{game?.currentTurn || 1}</strong></span>
          <span>Status: <strong>{game?.status || 'ACTIVE'}</strong></span>
        </div>
      </header>

      <div className="container" style={{ marginTop: '1.5rem' }}>
        {message && (
          <div style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            backgroundColor: 'rgba(201, 168, 107, 0.15)',
            border: '1px solid var(--accent-gold)',
            borderRadius: '4px',
            color: 'var(--accent-gold)'
          }}>
            {message}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
          {/* Main Map & Operations */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Country Status Bar */}
            <div className="card" style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>SELECTED EMPIRE</span>
                <select
                  className="input-field"
                  style={{ marginTop: '0.25rem', fontWeight: 'bold' }}
                  value={playerCountry}
                  onChange={(e) => setPlayerCountry(e.target.value)}
                >
                  {WWI_COUNTRIES.slice(0, 10).map((c) => (
                    <option key={c.id} value={c.id}>{c.flagIcon} {c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>MANPOWER</span>
                <h3 style={{ color: '#4ade80' }}>125,000</h3>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>INDUSTRIAL PTS</span>
                <h3 style={{ color: '#60a5fa' }}>450</h3>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>STABILITY</span>
                <h3 style={{ color: '#facc15' }}>88%</h3>
              </div>
            </div>

            {/* Territory Tactical Overview */}
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>TERRITORIAL THEATRES</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.5rem' }}>Territory</th>
                    <th style={{ padding: '0.5rem' }}>Controlling Power</th>
                    <th style={{ padding: '0.5rem' }}>Garrison (Inf/Art/Cav)</th>
                    <th style={{ padding: '0.5rem' }}>Fortification</th>
                  </tr>
                </thead>
                <tbody>
                  {game && game.territories && Object.values(game.territories).length > 0 ? (
                    Object.values(game.territories).map((t) => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{t.name}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{getCountryName(t.countryId)}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{t.units.infantry}k / {t.units.artillery}k / {t.units.cavalry}k</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>Lvl {t.defenseLevel}</td>
                      </tr>
                    ))
                  ) : (
                    <>
                      <tr style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Alsace-Lorraine</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>German Empire</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>50k / 10k / 5k</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>Lvl 3</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Marne & Paris Sector</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>French Republic</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>45k / 8k / 4k</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>Lvl 2</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Flanders & Ypres</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>Kingdom of Belgium</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>20k / 3k / 1k</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>Lvl 1</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* High Command Orders Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="card">
              <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>ISSUE STRATEGIC ORDERS</h3>
              <form onSubmit={handleSubmitOrder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Order Action Type
                  </label>
                  <select
                    className="input-field"
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value as OrderType)}
                  >
                    <option value="ATTACK">ATTACK (Offensive)</option>
                    <option value="DEFEND">DEFEND (Hold Position)</option>
                    <option value="MOVE">MOVE (Redeploy)</option>
                    <option value="RECRUIT">RECRUIT (Mobilize Forces)</option>
                    <option value="DIPLOMACY">DIPLOMACY (Propose Pact)</option>
                    <option value="FORTIFY">FORTIFY (Build Trenches)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Origin Sector
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Alsace-Lorraine"
                    value={fromTerritory}
                    onChange={(e) => setFromTerritory(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Target Sector / Nation
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Marne & Paris Sector"
                    value={targetTerritory}
                    onChange={(e) => setTargetTerritory(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Infantry (k)</label>
                    <input
                      type="number"
                      className="input-field"
                      value={infantry}
                      onChange={(e) => setInfantry(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Artillery (k)</label>
                    <input
                      type="number"
                      className="input-field"
                      value={artillery}
                      onChange={(e) => setArtillery(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cavalry (k)</label>
                    <input
                      type="number"
                      className="input-field"
                      value={cavalry}
                      onChange={(e) => setCavalry(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
                  Dispatch Orders
                </button>
              </form>
            </div>

            {/* Submitted Orders Queue */}
            <div className="card">
              <h4 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: 'var(--accent-gold)' }}>
                DISPATCHED ORDERS QUEUE ({submittedOrders.length})
              </h4>
              {submittedOrders.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No orders submitted for this turn yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {submittedOrders.map((ord, idx) => (
                    <li key={idx} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: '0.85rem' }}>
                      <strong>[{ord.type}]</strong> {ord.fromTerritoryId || 'Capital'} → {ord.targetTerritoryId || 'Target'} ({ord.units?.infantry}k Inf)
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Game;
