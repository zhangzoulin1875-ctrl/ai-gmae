import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, NavLink, Outlet } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import {
  Order, OrderType, WWI_COUNTRIES, CountryDefinition,
} from '@wwi/shared';
import WorldMap from '../components/WorldMap';
import ErrorBoundary from '../components/ErrorBoundary';
import NotificationBell from '../components/NotificationBell';
import { getApiUrl, getSocketUrl, apiFetch } from '../lib/api';
import { GameContext, GameContextValue } from '../contexts/GameContext';
import { MilitaryState } from '../types/military';

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  ATTACK: '進攻 (主動出擊)',
  DEFEND: '防守 (固守陣地)',
  MOVE: '移動 (部隊調度)',
  RECRUIT: '徵兵 (轉至招募分頁)',
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
  techPoints?: number;
  unlockedTechCount?: number;
  politicalBranch?: string | null;
  customName?: string | null;
  hasRenamed?: boolean;
}

interface PlayerInfo {
  countryId: string;
  username: string;
  avatar: string | null;
  isAI: boolean;
  isReady: boolean;
}

interface GameState {
  game: { id: string; name: string; status: string; currentTurn: number; nextTurnAt?: string; scenarioId?: string };
  myCountryId: string | null;
  players: PlayerInfo[];
  countryStates: CountryStateInfo[];
}

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';
const Game: React.FC = () => {
  const { id: gameId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<GameState | null>(null);
  const [militaryState, setMilitaryState] = useState<MilitaryState | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [notificationTrigger, setNotificationTrigger] = useState<number>(0);

  const goToTab = useCallback((tab: string) => {
    navigate(`/game/${gameId}/${tab}`);
  }, [navigate, gameId]);

  // Order form state
  const [orderType, setOrderType] = useState<OrderType>('ATTACK');
  const [fromTerritory, setFromTerritory] = useState<string>('');
  const [targetTerritory, setTargetTerritory] = useState<string>('');
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([]);
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

  // Unit design state
  const [myUnits, setMyUnits] = useState<any[]>([]);
  const [unitDesigning, setUnitDesigning] = useState(false);
  const [unitDesignPrompt, setUnitDesignPrompt] = useState('');
  const [unitDesignCategory, setUnitDesignCategory] = useState('infantry');
  const [unitError, setUnitError] = useState('');
  const [unitSuccess, setUnitSuccess] = useState('');

  // Auto-decision (AI suggestion) state
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [showAiSuggestModal, setShowAiSuggestModal] = useState(false);

  const CATEGORY_LABELS: Record<string, string> = {
    infantry: '步兵', cavalry: '騎兵', artillery: '砲兵', fleet: '艦隊', armored: '裝甲',
  };
  const CATEGORIES = ['infantry', 'cavalry', 'artillery', 'fleet', 'armored'];

  const loadMyUnits = useCallback(async () => {
    try {
      const res = await apiFetch('/api/games/my-units');
      if (res.ok) { const data = await res.json(); setMyUnits(data.units || []); }
    } catch {}
  }, []);

  const fetchMilitaryState = useCallback(async () => {
    try {
      const res = await apiFetch('/api/military/state');
      if (res.ok) {
        const data = await res.json();
        setMilitaryState(data);
      }
    } catch (err) {
      console.error('載入軍事狀態失敗', err);
    }
  }, []);

  const handleDesignUnit = async () => {
    if (!unitDesignPrompt.trim() || unitDesigning) return;
    setUnitDesigning(true); setUnitError(''); setUnitSuccess('');
    try {
      const res = await apiFetch('/api/games/design-unit', {
        method: 'POST',
        body: JSON.stringify({ prompt: unitDesignPrompt, category: unitDesignCategory }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUnitSuccess(`✓ 兵種「${data.unit.nameZh}」設計成功！`);
        setUnitDesignPrompt('');
        await loadMyUnits();
        await fetchMilitaryState();
      } else { setUnitError(data.error || '設計失敗'); }
    } catch (e: any) { setUnitError('連線失敗: ' + e.message); }
    finally { setUnitDesigning(false); }
  };

  const handleDeleteUnit = async (id: string) => {
    try {
      await apiFetch(`/api/games/delete-unit/${id}`, { method: 'DELETE' });
      await loadMyUnits();
      await fetchMilitaryState();
    } catch {}
  };

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
    loadMyUnits();
    fetchMilitaryState();
    try {
      const res = await apiFetch(`/api/games/${gameId}/state`);
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
  }, [gameId, navigate, loadMyUnits, fetchMilitaryState]);

  const fetchOrders = useCallback(async () => {
    if (!gameId) return;
    try {
      const res = await apiFetch(`/api/games/${gameId}/orders`);
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
      console.log('[Socket] 重連成功，嘗試次數:', attemptNumber);
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
      setNotificationTrigger((prev) => prev + 1);
      fetchState();
      fetchOrders();
      fetchMilitaryState();
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

  const toggleDivisionSelection = (divId: string) => {
    setSelectedDivisionIds((prev) =>
      prev.includes(divId) ? prev.filter((id) => id !== divId) : [...prev, divId]
    );
    setFormError(null);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!gameId || !state?.myCountryId) return;

    if (orderType === 'RECRUIT') {
      goToTab('recruit');
      return;
    }

    const activeDivs = militaryState?.divisions || [];

    // Validations for ATTACK, DEFEND, MOVE
    if (['ATTACK', 'DEFEND', 'MOVE'].includes(orderType)) {
      if (activeDivs.length === 0) {
        setFormError('您目前沒有任何可用的編組師團。請先前往「編組師團」頁面建立師團。');
        return;
      }
      if (selectedDivisionIds.length === 0) {
        setFormError('請至少勾選選擇一個師團參戰！');
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

    if (orderType === 'DIPLOMACY') {
      if (!targetTerritory) {
        setFormError('外交指令必須選擇目標國家！');
        return;
      }
    }

    const orderPayload = {
      type: orderType,
      fromTerritoryId: fromTerritory || state.myCountryId,
      targetTerritoryId: targetTerritory || undefined,
      divisionIds: ['ATTACK', 'DEFEND', 'MOVE'].includes(orderType) ? selectedDivisionIds : undefined,
      details: details || undefined,
    };

    try {
      const res = await apiFetch(`/api/games/${gameId}/orders`, {
        method: 'POST',
        body: JSON.stringify({ orders: [orderPayload] }),
      });

      if (res.ok) {
        setMessage('✓ 指令已成功提交');
        setTimeout(() => setMessage(null), 4000);
        fetchOrders();
      }

      if (socket && socket.connected) {
        socket.emit('submit_orders', {
          gameId,
          orders: [orderPayload],
        });
      }

      setDetails('');
      setSelectedDivisionIds([]);
      setFormError(null);
    } catch (err: any) {
      setFormError('提交失敗: ' + (err.message || '未知錯誤'));
    }
  };

  const handleClearForm = () => {
    setOrderType('ATTACK');
    setFromTerritory(state?.myCountryId || '');
    setTargetTerritory('');
    setSelectedDivisionIds([]);
    setDetails('');
    setFormError(null);
  };

  const handleReady = () => {
    if (!socket || !gameId || !state?.myCountryId) return;
    socket.emit('mark_ready', { gameId, countryId: state.myCountryId });
  };

  // Auto-decision: generate AI suggestions for the player
  const handleAiSuggest = async () => {
    if (!gameId || !state?.myCountryId) return;
    setAiSuggesting(true);
    setFormError(null);
    try {
      const res = await apiFetch(`/api/games/${gameId}/ai-suggest`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error || 'AI 建議生成失敗');
        return;
      }
      const data = await res.json();
      setAiSuggestions(data.suggestions || []);
      setShowAiSuggestModal(true);
    } catch (err: any) {
      setFormError('AI 建議生成失敗: ' + (err.message || '未知錯誤'));
    } finally {
      setAiSuggesting(false);
    }
  };

  // Confirm: submit all suggested orders as a batch
  const handleConfirmAiSuggest = async () => {
    if (!gameId || aiSuggestions.length === 0) return;
    setAiSuggesting(true);
    try {
      const orders = aiSuggestions.map(s => ({
        type: s.type,
        fromTerritoryId: s.fromTerritoryId || undefined,
        targetTerritoryId: s.targetTerritoryId || undefined,
        infantry: s.infantry || undefined,
        artillery: s.artillery || undefined,
        cavalry: s.cavalry || undefined,
        details: s.details || undefined,
      }));

      const res = await apiFetch(`/api/games/${gameId}/orders`, {
        method: 'POST',
        body: JSON.stringify({ orders }),
      });

      if (res.ok) {
        setMessage('✓ AI 建議指令已全部提交');
        setTimeout(() => setMessage(null), 4000);
        setShowAiSuggestModal(false);
        setAiSuggestions([]);
        fetchOrders();
        if (socket && socket.connected) {
          socket.emit('submit_orders', { gameId, orders });
        }
      } else {
        const data = await res.json();
        setFormError(data.error || '提交失敗');
      }
    } catch (err: any) {
      setFormError('提交失敗: ' + (err.message || '未知錯誤'));
    } finally {
      setAiSuggesting(false);
    }
  };

  const handleCancelAiSuggest = () => {
    setShowAiSuggestModal(false);
    setAiSuggestions([]);
  };

  // Withdraw a pending order
  const handleWithdrawOrder = async (orderId: string) => {
    if (!gameId) return;
    try {
      const res = await apiFetch(`/api/games/${gameId}/orders/${orderId}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage('✓ 指令已撤回');
        setTimeout(() => setMessage(null), 3000);
        fetchOrders();
      } else {
        const data = await res.json();
        setFormError(data.error || '撤回失敗');
      }
    } catch (err: any) {
      setFormError('撤回失敗: ' + (err.message || '未知錯誤'));
    }
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
    const csInfo = state?.countryStates.find((cs) => cs.countryId === cid);
    const displayName = csInfo?.customName || c?.nameZh || cid;
    return c ? `${c.flagIcon} ${displayName}` : displayName;
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

  const activeDivisions = militaryState?.divisions || [];
  const selectedDivisions = activeDivisions.filter((d) => selectedDivisionIds.includes(d.id));
  const selectedDivisionNames = selectedDivisions.map((d) => d.name);
  const selectedTotalUnits = selectedDivisions.reduce((sum, d) => sum + (d.totalUnits || 0), 0);

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

  const gameContextValue: GameContextValue = {
    gameId: gameId || '',
    state,
    militaryState,
    socket,
    connectionStatus,
    connectionError,
    notificationTrigger,
    orderType, setOrderType,
    fromTerritory, setFromTerritory,
    targetTerritory, setTargetTerritory,
    selectedDivisionIds, toggleDivisionSelection,
    details, setDetails,
    formError, setFormError,
    mapSelectMode, setMapSelectMode,
    handleSubmitOrder, handleClearForm, handleWithdrawOrder,
    myOrders,
    aiSuggesting, handleAiSuggest,
    goToTab,
    myUnits, unitDesigning, unitDesignPrompt, setUnitDesignPrompt,
    unitDesignCategory, setUnitDesignCategory,
    unitError, unitSuccess, handleDesignUnit, handleDeleteUnit,
    CATEGORY_LABELS, CATEGORIES,
    fetchMilitaryState,
    getCountryName, getCountryNameZh, getCountryFlag,
    activeDivisions,
    resolving, handleReady,
  };

  return (
    <GameContext.Provider value={gameContextValue}>
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
          <ErrorBoundary>
            <NotificationBell refreshTrigger={notificationTrigger} />
          </ErrorBoundary>

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
          {/* Left Column: Map + Main Operations */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Player's Country Status Summary */}
            {militaryState?.countryState && (
              <div className="card" style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>我的國家</span>
                  <h3 style={{ marginTop: '0.25rem' }}>{getCountryName(state.myCountryId!)}</h3>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>黃金</span>
                  <h3 style={{ color: '#c9a86b' }}>{militaryState.countryState.gold.toLocaleString()}</h3>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>工業產能</span>
                  <h3>{militaryState.countryState.industry.toLocaleString()}</h3>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>預備役人力</span>
                  <h3 style={{ color: '#4ade80' }}>{militaryState.countryState.manpower.toLocaleString()}</h3>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>軍隊士氣</span>
                  <h3 style={{ color: '#60a5fa' }}>{militaryState.countryState.morale}</h3>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>國家穩定度</span>
                  <h3>{militaryState.countryState.stability}</h3>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>現役師團</span>
                  <h3 style={{ color: 'var(--accent-gold)' }}>{activeDivisions.length} 個</h3>
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
                  scenarioId={state?.game?.scenarioId}
                />
              </ErrorBoundary>
            </div>

            {/* Main Operations: sidebar nav + routed sub-page content */}
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '1rem' }}>
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {[
                  { key: 'orders', label: '⚔️ 下達作戰指令' },
                  { key: 'recruit', label: '🪣 招募兵力' },
                  { key: 'divisions', label: `🛡️ 編組師團 (${activeDivisions.length})` },
                  { key: 'policies', label: '📜 國家政策' },
                  { key: 'workshop', label: '⚙️ 兵種工坊' },
                  { key: 'tech', label: '🔬 科技樹' },
                  { key: 'alliance', label: '🤝 聯盟' },
                ].map((item) => (
                  <NavLink
                    key={item.key}
                    to={item.key}
                    style={({ isActive }) => ({
                      display: 'block',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: isActive ? 700 : 500,
                      textDecoration: 'none',
                      color: isActive ? '#1a1a1a' : 'var(--text)',
                      backgroundColor: isActive ? 'var(--accent-gold)' : 'var(--bg-tertiary)',
                      border: `1px solid ${isActive ? 'var(--accent-gold)' : 'var(--border-color)'}`,
                      transition: 'background-color 0.15s, color 0.15s',
                    })}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <div style={{ minWidth: 0 }}>
                <ErrorBoundary>
                  <Outlet />
                </ErrorBoundary>
              </div>
            </div>

            {/* My Orders This Turn */}
            {myOrders.length > 0 && (
              <div className="card">
                <h3 style={{ marginBottom: '1rem' }}>本回合已下達指令 ({myOrders.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {myOrders.map((o, i) => (
                    <div key={o.id || i} style={{ padding: '0.5rem 0.75rem', borderLeft: '3px solid var(--accent-gold)', backgroundColor: 'var(--bg-tertiary)', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>{ORDER_TYPE_LABELS[o.type]}</strong>
                        {o.targetTerritoryId && <span> → {getCountryName(o.targetTerritoryId)}</span>}
                        {o.details && <span style={{ color: 'var(--text-muted)' }}> ({o.details})</span>}
                        <span style={{ color: o.status === 'PENDING' ? '#facc15' : '#22c55e', marginLeft: '0.5rem' }}>
                          {o.status === 'PENDING' ? '待結算' : '已結算'}
                        </span>
                      </div>
                      {o.status === 'PENDING' && o.id && (
                        <button
                          type="button"
                          onClick={() => handleWithdrawOrder(o.id)}
                          style={{
                            padding: '0.2rem 0.6rem', fontSize: '0.75rem',
                            background: 'transparent', border: '1px solid #ef4444',
                            color: '#ef4444', borderRadius: '0.25rem', cursor: 'pointer',
                          }}
                        >
                          撤回
                        </button>
                      )}
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
                          {p.username}
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
            <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '380px' }}>
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

      {/* Turn Resolution Modal */}
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

      {/* AI Suggestion Preview Modal */}
      {showAiSuggestModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 2000,
        }}>
          <div style={{
            background: 'var(--bg-surface)', borderRadius: '0.75rem',
            padding: '1.5rem', maxWidth: '600px', width: '90%',
            maxHeight: '80vh', overflowY: 'auto',
            border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>🤖 AI 戰略建議預覽</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              以下指令由 AI 根據當前局勢自動生成，請確認後一鍵執行，或取消返回手動操作。
            </p>

            {aiSuggestions.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>AI 未生成任何建議指令。當前局勢可能不需要行動。</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {aiSuggestions.map((s, i) => (
                  <div key={i} style={{
                    background: 'var(--bg-card)', borderRadius: '0.5rem',
                    padding: '0.85rem', border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        {i + 1}. {s.typeLabel}
                      </span>
                      {s.targetLabel && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          目標：{s.targetLabel}
                        </span>
                      )}
                    </div>
                    {s.details && (
                      <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {s.details}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                      {s.infantry != null && <span>步兵 {s.infantry.toLocaleString()}</span>}
                      {s.artillery != null && <span>砲兵 {s.artillery.toLocaleString()}</span>}
                      {s.cavalry != null && <span>騎兵 {s.cavalry.toLocaleString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCancelAiSuggest}
                disabled={aiSuggesting}
              >
                取消
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmAiSuggest}
                disabled={aiSuggesting || aiSuggestions.length === 0}
              >
                {aiSuggesting ? '提交中...' : '✓ 確認執行'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </GameContext.Provider>
  );
};

export default Game;
