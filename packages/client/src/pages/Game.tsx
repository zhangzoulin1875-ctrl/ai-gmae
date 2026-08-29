import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import {
  Order, OrderType, WWI_COUNTRIES, CountryDefinition,
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

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

const Game: React.FC = () => {
  const { id: gameId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<GameState | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Order form state
  const [orderType, setOrderType] = useState<OrderType>('ATTACK');
  const [fromTerritory, setFromTerritory] = useState<string>('');
  const [targetTerritory, setTargetTerritory] = useState<string>('');
  const [infantry, setInfantry] = useState<number>(10000);
  const [artillery, setArtillery] = useState<number>(100);
  const [cavalry, setCavalry] = useState<number>(50);
  const [details, setDetails] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Map selection mode state
  const [mapSelectMode, setMapSelectMode] = useState<'target' | 'from'>('target');

  // Submitted orders & chat state
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryDefinition | null>(null);
  const [chatMessages, setChatMessages] = useState<{ username: string; message: string; timestamp: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [resolving, setResolving] = useState(false);

  // Turn resolution modal state
  const [lastResolution, setLastResolution] = useState<any>(null);
  const [showResolutionModal, setShowResolutionModal] = useState(false);

  // Keep track of my country id in a ref for socket event handlers
  const myCountryIdRef = useRef<string | null>(null);

  useEffect(() => {
    myCountryIdRef.current = state?.myCountryId || null;
    if (state?.myCountryId && !fromTerritory) {
      setFromTerritory(state.myCountryId);
    }
  }, [state?.myCountryId, fromTerritory]);

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

  const fetchOrders = useCallback(async () => {
    if (!gameId) return;
    try {
      const res = await fetch(getApiUrl(`/api/games/${gameId}/orders`), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.orders) setMyOrders(data.orders);
      }
    } catch (err) {
      console.error('載入指令失敗', err);
    }
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    fetchState();
    fetchOrders();

    const socketUrl = getSocketUrl();
    const socketOptions = {
      path: '/socket.io',
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    };

    const newSocket = socketUrl
      ? io(socketUrl, socketOptions)
      : io(socketOptions);
    setSocket(newSocket);

    const getUser = () => JSON.parse(localStorage.getItem('user') || '{}');

    // Socket lifecycle & event handlers
    newSocket.on('connect', () => {
      console.log('[Socket] 已連線');
      setConnectionStatus('connected');
      setConnectionError(null);

      const user = getUser();
      newSocket.emit('join_game', {
        gameId,
        userId: user.id,
        countryId: myCountryIdRef.current || undefined,
      });
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[Socket] 已中斷連線:', reason);
      setConnectionStatus('disconnected');
    });

    newSocket.on('connect_error', (err) => {
      console.error('[Socket] 連線錯誤:', err.message);
      setConnectionStatus('reconnecting');
      setConnectionError('連線異常，嘗試重連中...');
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('[Socket] 重重連成功，嘗試次數:', attemptNumber);
      setConnectionStatus('connected');
      setConnectionError(null);

      const user = getUser();
      newSocket.emit('join_game', {
        gameId,
        userId: user.id,
        countryId: myCountryIdRef.current || undefined,
      });

      fetchState();
      fetchOrders();
    });

    newSocket.on('room_data', (data: any) => {
      if (data.game) {
        setState(prev => prev ? { ...prev, game: data.game, players: data.players } : null);
      }
    });

    newSocket.on('player_joined', (data: PlayerInfo) => {
      setState(prev => prev ? {
        ...prev,
        players: [...prev.players.filter(p => p.countryId !== data.countryId), data],
      } : null);
    });

    newSocket.on('orders_confirmed', (data: { orderCount: number; timestamp: string }) => {
      setMessage(`✓ ${data.orderCount} 道指令已排入作戰序列`);
      setTimeout(() => setMessage(null), 4000);
      fetchOrders();
    });

    newSocket.on('country_ready', (data: { countryId: string }) => {
      setState(prev => prev ? {
        ...prev,
        players: prev.players.map(p => p.countryId === data.countryId ? { ...p, isReady: true } : p),
      } : null);
    });

    newSocket.on('all_ready', () => {
      setMessage('全員就緒！等待回合結算...');
      setTimeout(() => setMessage(null), 5000);
    });

    newSocket.on('turn_resolving', () => {
      setResolving(true);
      setMessage('⏳ 回合結算中...');
    });

    newSocket.on('turn_resolved', (data: any) => {
      setResolving(false);
      setLastResolution(data);
      setShowResolutionModal(true);
      setMessage(`✓ 第 ${data.turn} 回合結算完成！`);
      setTimeout(() => setMessage(null), 6000);
      fetchState();
      fetchOrders();
    });

    newSocket.on('chat_message', (data: { username: string; message: string; timestamp: string }) => {
      setChatMessages(prev => [...prev, data].slice(-50));
    });

    return () => {
      newSocket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // Re-emit join_game with countryId once loaded
  useEffect(() => {
    if (socket && gameId && state?.myCountryId && socket.connected) {
      socket.emit('join_game', {
        gameId,
        userId: JSON.parse(localStorage.getItem('user') || '{}').id,
        countryId: state.myCountryId,
      });
    }
  }, [socket, gameId, state?.myCountryId]);

  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!socket || !gameId || !state?.myCountryId) return;

    const myState = state.countryStates?.find(cs => cs.countryId === state.myCountryId);
    if (!myState) {
      setFormError('無法讀取您的國家數據');
      return;
    }

    // Input validations
    if (['ATTACK', 'DEFEND', 'MOVE'].includes(orderType)) {
      if (infantry > myState.infantry) {
        setFormError(`派遣步兵數 (${infantry.toLocaleString()}) 不能超過現有兵力 (${myState.infantry.toLocaleString()})`);
        return;
      }
      if (artillery > myState.artillery) {
        setFormError(`派遣砲兵數 (${artillery}) 不能超過現有兵力 (${myState.artillery})`);
        return;
      }
      if (cavalry > myState.cavalry) {
        setFormError(`派遣騎兵數 (${cavalry}) 不能超過現有兵力 (${myState.cavalry})`);
        return;
      }
      if (infantry <= 0 && artillery <= 0 && cavalry <= 0) {
        setFormError('請至少派遣一種兵種 (步兵/砲兵/騎兵)');
        return;
      }
    }

    if (orderType === 'ATTACK') {
      if (!targetTerritory) {
        setFormError('進攻指令必須在地圖上選取目標國家！');
        return;
      }
      if (targetTerritory === state.myCountryId) {
        setFormError('無法攻擊自己的國家！');
        return;
      }
    }

    if (orderType === 'RECRUIT') {
      if (infantry <= 0) {
        setFormError('請輸入有效的徵兵數量');
        return;
      }
      const cost = Math.floor(infantry / 200);
      if (cost > myState.gold) {
        setFormError(`黃金不足！徵兵 ${infantry.toLocaleString()} 人需要 ${cost} 黃金，但您只有 ${myState.gold} 黃金`);
        return;
      }
      if (infantry > myState.manpower) {
        setFormError(`預備役人力不足！徵兵 ${infantry.toLocaleString()} 人，但您只有 ${myState.manpower.toLocaleString()} 人力`);
        return;
      }
    }

    if (orderType === 'FORTIFY') {
      if (myState.gold < 20) {
        setFormError(`黃金不足！修築防禦工事需要 20 黃金，但您只有 ${myState.gold} 黃金`);
        return;
      }
    }

    socket.emit('submit_orders', {
      gameId,
      orders: [{
        type: orderType,
        fromTerritoryId: fromTerritory || state.myCountryId,
        targetTerritoryId: targetTerritory || undefined,
        infantry,
        artillery,
        cavalry,
        details: details || undefined,
      }],
    });

    setDetails('');
    setFormError(null);
  };

  const handleClearForm = () => {
    setOrderType('ATTACK');
    setFromTerritory(state?.myCountryId || '');
    setTargetTerritory('');
    setInfantry(10000);
    setArtillery(100);
    setCavalry(50);
    setDetails('');
    setFormError(null);
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
    if (!cid) return '未選擇';
    const c = WWI_COUNTRIES.find((x) => x.id === cid);
    return c ? `${c.flagIcon} ${c.nameZh}` : cid;
  };

  const getCountryNameZh = (cid: string) => {
    if (!cid) return '未選擇';
    const c = WWI_COUNTRIES.find((x) => x.id === cid);
    return c ? c.nameZh : cid;
  };

  const getCountryFlag = (cid: string) => {
    if (!cid) return '🌐';
    const c = WWI_COUNTRIES.find((x) => x.id === cid);
    return c ? c.flagIcon : '🌐';
  };

  const handleSelectCountry = (c: CountryDefinition | null) => {
    if (!c) return;
    setSelectedCountry(c);
    if (mapSelectMode === 'from') {
      setFromTerritory(c.id);
    } else {
      setTargetTerritory(c.id);
    }
  };

  const myState = state?.countryStates?.find(cs => cs.countryId === state.myCountryId);
  const readyCount = state?.players?.filter(p => p.isReady).length || 0;
  const totalPlayers = state?.players?.length || 0;

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>載入戰情室中...</div>;
  }

  if (!state?.game) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>找不到戰局。</p>
        <button className="btn-primary" onClick={() => navigate('/lobby')}>返回大廳</button>
      </div>
    );
  }

  return (
    <div>
      {/* Top Navbar Header */}
      <header className="navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn-secondary" onClick={() => navigate('/lobby')}>← 返回大廳</button>
          <h2>{state.game.name}</h2>
          
          {/* Socket Connection Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.25rem 0.6rem',
            borderRadius: '12px',
            fontSize: '0.8rem',
            backgroundColor: connectionStatus === 'connected'
              ? 'rgba(34, 197, 94, 0.15)'
              : connectionStatus === 'reconnecting'
              ? 'rgba(234, 179, 8, 0.15)'
              : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${
              connectionStatus === 'connected' ? '#22c55e' : connectionStatus === 'reconnecting' ? '#eab308' : '#ef4444'
            }`,
            color: connectionStatus === 'connected' ? '#4ade80' : connectionStatus === 'reconnecting' ? '#facc15' : '#f87171',
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: connectionStatus === 'connected' ? '#22c55e' : connectionStatus === 'reconnecting' ? '#eab308' : '#ef4444',
            }} />
            <span>
              {connectionStatus === 'connected' ? '已連線' : connectionStatus === 'reconnecting' ? '重連中...' : '已斷線'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          {lastResolution && (
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
              onClick={() => setShowResolutionModal(true)}
            >
              📜 檢視戰報
            </button>
          )}
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
        {/* Connection Interrupted Banner */}
        {connectionStatus !== 'connected' && (
          <div style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #ef4444',
            borderRadius: '4px',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}>
            <span>⚠️ 連線中斷，正在重連...</span>
            {connectionError && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 400 }}>({connectionError})</span>}
          </div>
        )}

        {/* Global Notification Banner */}
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

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
          {/* Left Column: Map + Orders */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Player's Country Status Summary */}
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
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>預備役人力</span>
                  <h3 style={{ fontSize: '1rem' }}>{myState.manpower.toLocaleString()}</h3>
                </div>
              </div>
            )}

            {/* World Strategic Map */}
            <div className="card" style={{ padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>戰略地圖</h3>
                
                {/* Map Mode Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>地圖點擊模式:</span>
                  <button
                    type="button"
                    className={mapSelectMode === 'target' ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                    onClick={() => setMapSelectMode('target')}
                  >
                    🎯 選取目標國家 {targetTerritory && `(${getCountryNameZh(targetTerritory)})`}
                  </button>
                  <button
                    type="button"
                    className={mapSelectMode === 'from' ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                    onClick={() => setMapSelectMode('from')}
                  >
                    🚩 選取出發地 {fromTerritory && `(${getCountryNameZh(fromTerritory)})`}
                  </button>
                </div>
              </div>

              <ErrorBoundary>
                <WorldMap
                  countries={WWI_COUNTRIES}
                  selectedCountryId={mapSelectMode === 'target' ? (targetTerritory || selectedCountry?.id) : (fromTerritory || selectedCountry?.id)}
                  onSelectCountry={handleSelectCountry}
                  mapSelectMode={mapSelectMode}
                />
              </ErrorBoundary>
            </div>

            {/* Improved Order Form */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>下達作戰指令</h3>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                  onClick={handleClearForm}
                >
                  🗑️ 清除指令
                </button>
              </div>

              {state.myCountryId ? (
                <form onSubmit={handleSubmitOrder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  
                  {/* Player Resource Mini Bar at top of Order Form */}
                  {myState && (
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      padding: '0.625rem 1rem',
                      backgroundColor: 'var(--bg-primary)',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      fontSize: '0.85rem',
                      alignItems: 'center',
                    }}>
                      <span style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>🚩 可用資源:</span>
                      <span>步兵 <strong style={{ color: '#4ade80' }}>{myState.infantry.toLocaleString()}</strong></span>
                      <span>砲兵 <strong style={{ color: '#60a5fa' }}>{myState.artillery}</strong></span>
                      <span>騎兵 <strong style={{ color: '#facc15' }}>{myState.cavalry}</strong></span>
                      <span>黃金 <strong style={{ color: '#c9a86b' }}>{myState.gold}</strong></span>
                      <span>人力 <strong>{myState.manpower.toLocaleString()}</strong></span>
                    </div>
                  )}

                  {/* Form Error Banner */}
                  {formError && (
                    <div style={{
                      padding: '0.625rem 0.875rem',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid #ef4444',
                      borderRadius: '4px',
                      color: '#f87171',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                    }}>
                      ⚠️ {formError}
                    </div>
                  )}

                  {/* Order Type + Details */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                        指令類型
                      </label>
                      <select
                        className="input-field"
                        value={orderType}
                        onChange={(e) => {
                          setOrderType(e.target.value as OrderType);
                          setFormError(null);
                        }}
                      >
                        {Object.entries(ORDER_TYPE_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                        備註 / 戰術細節
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="作戰說明..."
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Territory Selectors (From & Target) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    {/* From Territory Display */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                        出發地 {mapSelectMode === 'from' && <span style={{ color: 'var(--accent-gold)', fontSize: '0.75rem' }}>(點擊地圖選擇中...)</span>}
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <div className="input-field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-tertiary)', flex: 1, minHeight: '40px', overflow: 'hidden' }}>
                          {fromTerritory ? (
                            <>
                              <span>{getCountryFlag(fromTerritory)}</span>
                              <span style={{ fontWeight: 600 }}>{getCountryNameZh(fromTerritory)}</span>
                            </>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>未設定</span>
                          )}
                        </div>
                        <button
                          type="button"
                          className={mapSelectMode === 'from' ? 'btn-primary' : 'btn-secondary'}
                          style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                          onClick={() => setMapSelectMode('from')}
                        >
                          在地圖上點選
                        </button>
                        {state?.myCountryId && fromTerritory !== state.myCountryId && (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '0.5rem 0.6rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                            onClick={() => setFromTerritory(state.myCountryId!)}
                            title="重設為我的國家"
                          >
                            母國
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Target Territory Display */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                        目標 {mapSelectMode === 'target' && <span style={{ color: 'var(--accent-gold)', fontSize: '0.75rem' }}>(點擊地圖選擇中...)</span>}
                        {orderType === 'ATTACK' && <span style={{ color: '#ef4444' }}> *進攻必填</span>}
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <div className="input-field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-tertiary)', flex: 1, minHeight: '40px', overflow: 'hidden' }}>
                          {targetTerritory ? (
                            <>
                              <span>{getCountryFlag(targetTerritory)}</span>
                              <span style={{ fontWeight: 600 }}>{getCountryNameZh(targetTerritory)}</span>
                            </>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>請點選目標國家</span>
                          )}
                        </div>
                        <button
                          type="button"
                          className={mapSelectMode === 'target' ? 'btn-primary' : 'btn-secondary'}
                          style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                          onClick={() => setMapSelectMode('target')}
                        >
                          在地圖上點選
                        </button>
                        {targetTerritory && (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '0.5rem 0.6rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                            onClick={() => setTargetTerritory('')}
                          >
                            清除
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Unit Amounts (for military/recruit orders) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {orderType === 'RECRUIT' ? '徵召步兵數' : '步兵數量'}
                      </label>
                      <input
                        type="number"
                        className="input-field"
                        value={infantry}
                        onChange={(e) => {
                          setInfantry(Math.max(0, Number(e.target.value)));
                          setFormError(null);
                        }}
                        min={0}
                        step={1000}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>砲兵數量</label>
                      <input
                        type="number"
                        className="input-field"
                        value={artillery}
                        onChange={(e) => {
                          setArtillery(Math.max(0, Number(e.target.value)));
                          setFormError(null);
                        }}
                        min={0}
                        disabled={orderType === 'RECRUIT'}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>騎兵數量</label>
                      <input
                        type="number"
                        className="input-field"
                        value={cavalry}
                        onChange={(e) => {
                          setCavalry(Math.max(0, Number(e.target.value)));
                          setFormError(null);
                        }}
                        min={0}
                        disabled={orderType === 'RECRUIT'}
                      />
                    </div>
                  </div>

                  {/* Order Preview & Cost Box */}
                  <div style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'var(--bg-primary)',
                    borderLeft: '4px solid var(--accent-gold)',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                  }}>
                    <div style={{ fontWeight: 600, color: 'var(--accent-gold)', marginBottom: '0.25rem' }}>
                      📋 指令預覽與費用
                    </div>
                    <div style={{ color: 'var(--text-main)' }}>
                      {orderType === 'RECRUIT' && (
                        <>
                          徵集 <strong>{infantry.toLocaleString()}</strong> 步兵 →
                          花費 <strong style={{ color: '#c9a86b' }}>{Math.floor(infantry / 200)} 黃金</strong>，
                          消耗 <strong>{infantry.toLocaleString()} 預備役人力</strong>
                        </>
                      )}
                      {orderType === 'ATTACK' && (
                        <>
                          由 {getCountryName(fromTerritory || state.myCountryId!)} 進攻{' '}
                          <strong style={{ color: targetTerritory ? '#4ade80' : '#f87171' }}>
                            {targetTerritory ? getCountryName(targetTerritory) : '(請點選目標國家)'}
                          </strong>{' '}
                          → 出動 步兵:{infantry.toLocaleString()} / 砲兵:{artillery} / 騎兵:{cavalry}
                        </>
                      )}
                      {orderType === 'DEFEND' && (
                        <>
                          在 {getCountryName(fromTerritory || state.myCountryId!)} 固守陣地 → 提升士氣 (+2)
                        </>
                      )}
                      {orderType === 'MOVE' && (
                        <>
                          由 {getCountryName(fromTerritory || state.myCountryId!)} 調動部隊至{' '}
                          <strong>
                            {targetTerritory ? getCountryName(targetTerritory) : '(請點選目標國家)'}
                          </strong>{' '}
                          → 步兵:{infantry.toLocaleString()} / 砲兵:{artillery} / 騎兵:{cavalry}
                        </>
                      )}
                      {orderType === 'FORTIFY' && (
                        <>
                          修築防禦工事 → 花費 <strong style={{ color: '#c9a86b' }}>20 黃金</strong> (提升防禦等級)
                        </>
                      )}
                      {orderType === 'DIPLOMACY' && (
                        <>
                          向 <strong>{targetTerritory ? getCountryName(targetTerritory) : '(請點選目標國家)'}</strong> 發起外交協定/提案
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
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
                      {o.targetTerritoryId && <span> → {getCountryName(o.targetTerritoryId)}</span>}
                      {o.units && (o.units.infantry || o.units.artillery || o.units.cavalry) && (
                        <span style={{ color: 'var(--text-muted)' }}>
                          {' '}| 步:{o.units.infantry || 0} 砲:{o.units.artillery || 0} 騎:{o.units.cavalry || 0}
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

          {/* Right Column: Players + Chat */}
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
                      <span style={{ fontSize: '0.75rem', color: p.isReady ? '#4ade80' : 'var(--text-muted)' }}>
                        {p.isReady ? '✓ 已就緒' : '○ 思考中'}
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

      {/* Turn Resolution Modal Overlay */}
      {showResolutionModal && lastResolution && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div className="card" style={{
            maxWidth: '650px',
            width: '100%',
            maxHeight: '85vh',
            overflowY: 'auto',
            border: '2px solid var(--accent-gold)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            position: 'relative',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📜 第 {lastResolution.turn} 回合戰報
              </h3>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.9rem' }}
                onClick={() => setShowResolutionModal(false)}
              >
                ✕
              </button>
            </div>

            {/* Narrative */}
            <div style={{
              padding: '0.875rem 1rem',
              backgroundColor: 'var(--bg-primary)',
              borderRadius: '6px',
              borderLeft: '4px solid var(--accent-gold)',
              marginBottom: '1.25rem',
              fontSize: '0.95rem',
              lineHeight: '1.6',
            }}>
              {lastResolution.narrative || lastResolution.narrativeSummary || '本回合無詳細戰情描述。'}
            </div>

            {/* Battles List */}
            <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-main)', fontSize: '1rem' }}>
              ⚔️ 戰鬥結果 (共 {lastResolution.battles?.length || 0} 場)
            </h4>

            {!lastResolution.battles || lastResolution.battles.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                本回合未爆發直接大規模武裝衝突。
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {lastResolution.battles.map((b: any, index: number) => {
                  const isAttackerWin = b.winnerCountryId === b.attackerCountryId;
                  return (
                    <div key={index} style={{
                      padding: '0.875rem',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                          {getCountryName(b.attackerCountryId)} ⚔️ {getCountryName(b.defenderCountryId)}
                        </div>
                        <span style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: isAttackerWin ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: isAttackerWin ? '#4ade80' : '#f87171',
                          border: `1px solid ${isAttackerWin ? '#22c55e' : '#ef4444'}`,
                        }}>
                          {isAttackerWin ? '攻方獲勝' : '守方成功擊退'}
                        </span>
                      </div>

                      {b.territoryCaptured && (
                        <div style={{ color: 'var(--accent-gold)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                          🚩 領土易主：{getCountryName(b.attackerCountryId)} 佔領了戰區 ({b.territoryId})
                        </div>
                      )}

                      {b.narrative && (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                          {b.narrative}
                        </p>
                      )}

                      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <span>攻方傷亡: 步兵 -{b.attackerCasualties?.infantry || 0}</span>
                        <span>守方傷亡: 步兵 -{b.defenderCasualties?.infantry || 0}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Close button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowResolutionModal(false)}
              >
                關閉戰報
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Game;
