import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import {
  GameRoom, Order, OrderType, WWI_COUNTRIES, CountryDefinition,
  SIDE_LABELS_ZH,
} from '@wwi/shared';
import WorldMap from '../components/WorldMap';
import ErrorBoundary from '../components/ErrorBoundary';
import { getApiUrl, getSocketUrl } from '../lib/api';

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  ATTACK: '進攻 (主動出擊)',
  DEFEND: '防守 (固守陣地)',
  MOVE: '移動 (部隊調度)',
  RECRUIT: '徵兵 (動員部隊)',
  DIPLOMACY: '外交 (提議協定)',
  FORTIFY: '築防 (修築壕溝)',
};

interface CountryStateInfo {
  countryId: string;
  infantry: number;
  artillery: number;
  cavalry: number;
  morale: number;
  gold: number;
  industry: number;
  manpower: number;
  stability: number;
  isAIControlled: boolean;
}

interface PlayerInfo {
  countryId: string;
  username: string;
  avatar: string | null;
  isAI: boolean;
  isReady: boolean;
}

interface GameState {
  game: { id: string; name: string; status: string; currentTurn: number; nextTurnAt?: string };
  myCountryId: string | null;
  players: PlayerInfo[];
  countryStates: CountryStateInfo[];
}

const Game: React.FC = () => {
  const { id: gameId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<GameState | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Order form
  const [orderType, setOrderType] = useState<OrderType>('ATTACK');
  const [fromTerritory, setFromTerritory] = useState<string>('');
  const [targetTerritory, setTargetTerritory] = useState<string>('');
  const [infantry, setInfantry] = useState<number>(10000);
  const [artillery, setArtillery] = useState<number>(100);
  const [cavalry, setCavalry] = useState<number>(50);
  const [details, setDetails] = useState<string>('');

  // Submitted orders this turn
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryDefinition | null>(null);
  const [chatMessages, setChatMessages] = useState<{ username: string; message: string; timestamp: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [resolving, setResolving] = useState(false);

  // Last turn resolution result
  const [lastResolution, setLastResolution] = useState<any>(null);

  const fetchState = useCallback(async () => {
    if (!gameId) return;
    try {
      const res = await fetch(getApiUrl(`/api/games/${gameId}/state`), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setState(data);
      } else if (res.status === 401) {
        navigate('/lobby');
      }
    } catch (err) {
      console.error('載入戰局狀態失敗', err);
    } finally {
      setLoading(false);
    }
  }, [gameId, navigate]);

  useEffect(() => {
    if (!gameId) return;
    fetchState();

    // Load existing orders for this turn
    fetch(getApiUrl(`/api/games/${gameId}/orders`), { credentials: 'include' })
      .then(res => res.json())
      .then(data => { if (data.orders) setMyOrders(data.orders); })
      .catch(err => console.error('載入指令失敗', err));

    // Connect Socket.IO
    const socketUrl = getSocketUrl();
    const newSocket = socketUrl
      ? io(socketUrl, { path: '/socket.io', withCredentials: true })
      : io({ path: '/socket.io', withCredentials: true });
    setSocket(newSocket);

    const user = JSON.parse(localStorage.getItem('user') || '{}');

    newSocket.emit('join_game', {
      gameId,
      userId: user.id,
      countryId: state?.myCountryId || '',
    });

    newSocket.on('room_data', (data: any) => {
      if (data.game) setState(prev => prev ? { ...prev, game: data.game, players: data.players } : null);
    });

    newSocket.on('player_joined', (data: PlayerInfo) => {
      setState(prev => prev ? { ...prev, players: [...prev.players.filter(p => p.countryId !== data.countryId), data] } : null);
    });

    newSocket.on('orders_confirmed', (data: { orderCount: number; timestamp: string }) => {
      setMessage(`✓ ${data.orderCount} 道指令已排入作戰序列`);
      setTimeout(() => setMessage(null), 4000);
      // Refresh orders
      fetch(getApiUrl(`/api/games/${gameId}/orders`), { credentials: 'include' })
        .then(res => res.json())
        .then(d => { if (d.orders) setMyOrders(d.orders); })
        .catch(() => {});
    });

    newSocket.on('country_ready', (data: { countryId: string }) => {
      setState(prev => prev ? {
        ...prev,
        players: prev.players.map(p => p.countryId === data.countryId ? { ...p, isReady: true } : p),
      } : null);
    });

    newSocket.on('all_ready', () => {
      setMessage('全員就緒!等待回合結算...');
      setTimeout(() => setMessage(null), 5000);
    });

    newSocket.on('turn_resolving', () => {
      setResolving(true);
      setMessage('⏳ 回合結算中...');
    });

    newSocket.on('turn_resolved', (data: any) => {
      setResolving(false);
      setLastResolution(data);
      setMessage(`✓ 第 ${data.turn} 回合結算完成!`);
      setTimeout(() => setMessage(null), 6000);
      fetchState();
    });

    newSocket.on('chat_message', (data: { username: string; message: string; timestamp: string }) => {
      setChatMessages(prev => [...prev, data].slice(-50));
    });

    return () => {
      newSocket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !gameId || !state?.myCountryId) return;

    socket.emit('submit_orders', {
      gameId,
      orders: [{
        type: orderType,
        fromTerritoryId: fromTerritory || undefined,
        targetTerritoryId: targetTerritory || undefined,
        infantry,
        artillery,
        cavalry,
        details: details || undefined,
      }],
    });

    // Reset form partially
    setDetails('');
  };

  const handleReady = () => {
    if (!socket || !gameId || !state?.myCountryId) return;
    socket.emit('mark_ready', { gameId, countryId: state.myCountryId });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !gameId || !chatInput.trim()) return;
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    socket.emit('chat_message', {
      gameId,
      userId: user.id,
      username: user.username,
      message: chatInput.trim(),
    });
    setChatInput('');
  };

  const getCountryName = (cid: string) => {
    const c = WWI_COUNTRIES.find((x) => x.id === cid);
    return c ? `${c.flagIcon} ${c.nameZh}` : cid;
  };

  const handleSelectCountry = (c: CountryDefinition | null) => {
    setSelectedCountry(c);
  };

  const myState = state?.countryStates?.find(cs => cs.countryId === state.myCountryId);
  const readyCount = state?.players?.filter(p => p.isReady).length || 0;
  const totalPlayers = state?.players?.length || 0;

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>載入戰情室中...</div>;
  }

  if (!state?.game) {
    return <div style={{ padding: '2rem' }}>
      <p>找不到戰局。</p>
      <button className="btn-primary" onClick={() => navigate('/lobby')}>返回大廳</button>
    </div>;
  }

  return (
    <div>
      <header className="navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn-secondary" onClick={() => navigate('/lobby')}>← 返回大廳</button>
          <h2>{state.game.name}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span>回合: <strong style={{ color: 'var(--accent-gold)' }}>#{state.game.currentTurn}</strong></span>
          <span>狀態: <strong>{state.game.status}</strong></span>
          <span>就緒: {readyCount}/{totalPlayers}</span>
          {state.game.nextTurnAt && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              下次結算: {new Date(state.game.nextTurnAt).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei' })}
            </span>
          )}
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
            color: 'var(--accent-gold)',
          }}>
            {message}
          </div>
        )}

        {lastResolution && (
          <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--accent-gold)' }}>
            <h4 style={{ marginBottom: '0.5rem' }}>📜 第 {lastResolution.turn} 回合戰報</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{lastResolution.narrative}</p>
            {lastResolution.battles?.length > 0 && (
              <details style={{ marginTop: '0.5rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--accent-gold)' }}>
                  戰鬥詳情 ({lastResolution.battles.length} 場)
                </summary>
                {lastResolution.battles.map((b: any, i: number) => (
                  <div key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                    <strong>{getCountryName(b.attackerCountryId)}</strong> 攻擊 <strong>{getCountryName(b.defenderCountryId)}</strong>
                    {' → '}<span style={{ color: b.winnerCountryId === b.attackerCountryId ? '#22c55e' : '#ef4444' }}>
                      {b.winnerCountryId === b.attackerCountryId ? '攻方勝' : '守方勝'}
                    </span>
                    {b.narrative && <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>{b.narrative}</p>}
                  </div>
                ))}
              </details>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
          {/* Left: Map + Orders */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* My Country Status */}
            {myState && (
              <div className="card" style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>我的國家</span>
                  <h3 style={{ marginTop: '0.25rem' }}>{getCountryName(state.myCountryId!)}</h3>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>步兵</span>
                  <h3 style={{ color: '#4ade80' }}>{myState.infantry.toLocaleString()}</h3>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>砲兵</span>
                  <h3 style={{ color: '#60a5fa' }}>{myState.artillery}</h3>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>騎兵</span>
                  <h3 style={{ color: '#facc15' }}>{myState.cavalry}</h3>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>黃金</span>
                  <h3 style={{ color: '#c9a86b' }}>{myState.gold}</h3>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>工業</span>
                  <h3>{myState.industry}</h3>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>士氣</span>
                  <h3>{myState.morale}</h3>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>人力</span>
                  <h3 style={{ fontSize: '1rem' }}>{myState.manpower.toLocaleString()}</h3>
                </div>
              </div>
            )}

            {/* World Strategic Map */}
            <div className="card" style={{ padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0 }}>戰略地圖</h3>
                {selectedCountry && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--accent-gold)' }}>
                      已選取: {selectedCountry.flagIcon} {selectedCountry.nameZh}
                    </span>
                    <button type="button" className="btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }} onClick={() => setFromTerritory(selectedCountry.id)}>
                      設為出發地
                    </button>
                    <button type="button" className="btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }} onClick={() => setTargetTerritory(selectedCountry.id)}>
                      設為目標
                    </button>
                  </div>
                )}
              </div>
              <ErrorBoundary>
                <WorldMap
                  countries={WWI_COUNTRIES}
                  selectedCountryId={selectedCountry?.id}
                  onSelectCountry={handleSelectCountry}
                />
              </ErrorBoundary>
            </div>

            {/* Order Form */}
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>下達作戰指令</h3>
              {state.myCountryId ? (
                <form onSubmit={handleSubmitOrder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>指令類型</label>
                      <select className="input-field" value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)}>
                        {Object.entries(ORDER_TYPE_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>備註</label>
                      <input type="text" className="input-field" placeholder="作戰細節..." value={details} onChange={(e) => setDetails(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>出發地</label>
                      <input type="text" className="input-field" placeholder="戰區ID" value={fromTerritory} onChange={(e) => setFromTerritory(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>目標</label>
                      <input type="text" className="input-field" placeholder="戰區ID" value={targetTerritory} onChange={(e) => setTargetTerritory(e.target.value)} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>步兵數量</label>
                      <input type="number" className="input-field" value={infantry} onChange={(e) => setInfantry(Number(e.target.value))} min={0} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>砲兵數量</label>
                      <input type="number" className="input-field" value={artillery} onChange={(e) => setArtillery(Number(e.target.value))} min={0} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>騎兵數量</label>
                      <input type="number" className="input-field" value={cavalry} onChange={(e) => setCavalry(Number(e.target.value))} min={0} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button type="submit" className="btn-primary" disabled={resolving} style={{ flex: 1, justifyContent: 'center' }}>
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

            {/* My Orders This Turn */}
            {myOrders.length > 0 && (
              <div className="card">
                <h3 style={{ marginBottom: '1rem' }}>本回合已下達指令 ({myOrders.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {myOrders.map((o, i) => (
                    <div key={o.id || i} style={{ padding: '0.5rem 0.75rem', borderLeft: '3px solid var(--accent-gold)', backgroundColor: 'var(--bg-tertiary)', fontSize: '0.85rem' }}>
                      <strong>{ORDER_TYPE_LABELS[o.type]}</strong>
                      {o.targetTerritoryId && <span> → {o.targetTerritoryId}</span>}
                      {o.units && (o.units.infantry || o.units.artillery || o.units.cavalry) && (
                        <span style={{ color: 'var(--text-muted)' }}>
                          {' '}| 步{o.units.infantry || 0} 砲{o.units.artillery || 0} 騎{o.units.cavalry || 0}
                        </span>
                      )}
                      <span style={{ color: o.status === 'PENDING' ? '#facc15' : '#22c55e', float: 'right' }}>
                        {o.status === 'PENDING' ? '待結算' : '已結算'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Players + Chat */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Players List */}
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>參戰國家 ({state.players.length})</h3>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {state.players.map((p) => {
                  const c = WWI_COUNTRIES.find(x => x.id === p.countryId);
                  return (
                    <div key={p.countryId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: '0.85rem' }}>
                      <span>
                        {c?.flagIcon} {c?.nameZh || p.countryId}
                        <br />
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {p.username} · {SIDE_LABELS_ZH[c?.side || 'neutral']}
                        </span>
                      </span>
                      <span style={{ fontSize: '0.75rem' }}>
                        {p.isReady ? '✓' : '○'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chat */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '350px' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>指揮官頻道</h3>
              <div style={{ flex: 1, overflowY: 'auto', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                {chatMessages.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '2rem' }}>尚無訊息</p>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div key={i} style={{ padding: '0.25rem 0' }}>
                      <strong>{msg.username}</strong>: {msg.message}
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="輸入訊息..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn-secondary">送出</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Game;
