import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { GameRoom, Order, OrderType, WWI_COUNTRIES, generateWorldMap, TerritoryGeometry } from '@wwi/shared';
import GameMap from '../components/GameMap';

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  ATTACK: '進攻 (主動出擊)',
  DEFEND: '防守 (固守陣地)',
  MOVE: '移動 (部隊調度)',
  RECRUIT: '徵兵 (動員部隊)',
  DIPLOMACY: '外交 (提議協定)',
  FORTIFY: '築防 (修築壕溝)',
};

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
  const [selectedTerritory, setSelectedTerritory] = useState<TerritoryGeometry | null>(null);

  const worldMap = useMemo(() => generateWorldMap(), []);

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
      setMessage(`第 ${data.turn} 回合已由 ${data.resolution.resolvedByAIProvider} 結算完成!`);
      setTimeout(() => setMessage(null), 5000);
    });

    newSocket.on('order_confirmed', (order: Order) => {
      setSubmittedOrders((prev) => [...prev, order]);
      setMessage(`指令 #${order.id.slice(0, 6)} 已成功排入佳列!`);
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
    const c = WWI_COUNTRIES.find((x) => x.id === cid);
    return c ? `${c.flagIcon} ${c.nameZh}` : cid;
  };

  const handleSelectTerritory = (t: TerritoryGeometry | null) => {
    setSelectedTerritory(t);
  };

  const setAsOrigin = () => {
    if (selectedTerritory) setFromTerritory(selectedTerritory.nameZh);
  };

  const setAsTarget = () => {
    if (selectedTerritory) setTargetTerritory(selectedTerritory.nameZh);
  };

  return (
    <div>
      <header className="navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn-secondary" onClick={() => navigate('/lobby')}>← 返回大廳</button>
          <h2>{game?.name || '1914 戰役'}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span>回合: <strong style={{ color: 'var(--accent-gold)' }}>#{game?.currentTurn || 1}</strong></span>
          <span>狀態: <strong>{game?.status || 'ACTIVE'}</strong></span>
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
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>選定國家</span>
                <select
                  className="input-field"
                  style={{ marginTop: '0.25rem', fontWeight: 'bold' }}
                  value={playerCountry}
                  onChange={(e) => setPlayerCountry(e.target.value)}
                >
                  {WWI_COUNTRIES.slice(0, 10).map((c) => (
                    <option key={c.id} value={c.id}>{c.flagIcon} {c.nameZh}</option>
                  ))}
                </select>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>兵力</span>
                <h3 style={{ color: '#4ade80' }}>125,000</h3>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>工業點數</span>
                <h3 style={{ color: '#60a5fa' }}>450</h3>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>穩定度</span>
                <h3 style={{ color: '#facc15' }}>88%</h3>
              </div>
            </div>

            {/* WebGPU Strategic Map */}
            <div className="card" style={{ padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0 }}>戰略地圖</h3>
                {selectedTerritory && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--accent-gold)' }}>
                      已選取: {selectedTerritory.nameZh} ({getCountryName(selectedTerritory.countryId)})
                    </span>
                    <button type="button" className="btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }} onClick={setAsOrigin}>
                      設為出發地
                    </button>
                    <button type="button" className="btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }} onClick={setAsTarget}>
                      設為目標
                    </button>
                  </div>
                )}
              </div>
              <GameMap
                worldMap={worldMap}
                countries={WWI_COUNTRIES}
                selectedTerritoryId={selectedTerritory?.id}
                onSelectTerritory={handleSelectTerritory}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                地圖為簡化風格化戰區示意圖(非精確地理投影),共 {worldMap.territories.length} 個戰區、{WWI_COUNTRIES.length} 個國家。
              </p>
            </div>

            {/* Territory Tactical Overview */}
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>戰區戰況總覽</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.5rem' }}>戰區</th>
                    <th style={{ padding: '0.5rem' }}>控制國</th>
                    <th style={{ padding: '0.5rem' }}>駐軍 (步/砲/騎)</th>
                    <th style={{ padding: '0.5rem' }}>防禦等級</th>
                  </tr>
                </thead>
                <tbody>
                  {game && game.territories && Object.values(game.territories).length > 0 ? (
                    Object.values(game.territories).map((t) => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{t.name}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{getCountryName(t.countryId)}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{t.units.infantry}k / {t.units.artillery}k / {t.units.cavalry}k</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>Lv.{t.defenseLevel}</td>
                      </tr>
                    ))
                  ) : (
                    worldMap.territories.slice(0, 6).map((t) => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{t.nameZh}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{getCountryName(t.countryId)}</td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>尚未連接戰局資料</td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>—</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* High Command Orders Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="card">
              <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>下達戰略指令</h3>
              <form onSubmit={handleSubmitOrder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    指令類型
                  </label>
                  <select
                    className="input-field"
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value as OrderType)}
                  >
                    {(Object.keys(ORDER_TYPE_LABELS) as OrderType[]).map((key) => (
                      <option key={key} value={key}>{ORDER_TYPE_LABELS[key]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    出發戰區
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="例如:德意志帝國 第1戰區"
                    value={fromTerritory}
                    onChange={(e) => setFromTerritory(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    目標戰區 / 國家
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="例如:法蘭西共和國 第1戰區"
                    value={targetTerritory}
                    onChange={(e) => setTargetTerritory(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>步兵 (千)</label>
                    <input
                      type="number"
                      className="input-field"
                      value={infantry}
                      onChange={(e) => setInfantry(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>砲兵 (千)</label>
                    <input
                      type="number"
                      className="input-field"
                      value={artillery}
                      onChange={(e) => setArtillery(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>騎兵 (千)</label>
                    <input
                      type="number"
                      className="input-field"
                      value={cavalry}
                      onChange={(e) => setCavalry(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
                  發送指令
                </button>
              </form>
            </div>

            {/* Submitted Orders Queue */}
            <div className="card">
              <h4 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: 'var(--accent-gold)' }}>
                已發送指令佳列 ({submittedOrders.length})
              </h4>
              {submittedOrders.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>本回合尚未發送任何指令。</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {submittedOrders.map((ord, idx) => (
                    <li key={idx} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: '0.85rem' }}>
                      <strong>[{ORDER_TYPE_LABELS[ord.type]}]</strong> {ord.fromTerritoryId || '首都'} → {ord.targetTerritoryId || '目標'} ({ord.units?.infantry}k 步兵)
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
