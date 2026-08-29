import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import {
  Order, OrderType, WWI_COUNTRIES, CountryDefinition,
  SIDE_LABELS_ZH,
} from '@wwi/shared';
import WorldMap from '../components/WorldMap';
import ErrorBoundary from '../components/ErrorBoundary';
import RecruitPanel from '../components/RecruitPanel';
import DivisionPanel from '../components/DivisionPanel';
import PolicyPanel from '../components/PolicyPanel';
import TechTreePanel from '../components/TechTreePanel';
import NotificationBell from '../components/NotificationBell';
import { getApiUrl, getSocketUrl, apiFetch } from '../lib/api';
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
  game: { id: string; name: string; status: string; currentTurn: number; nextTurnAt?: string };
  myCountryId: string | null;
  players: PlayerInfo[];
  countryStates: CountryStateInfo[];
}

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';
type TabType = 'orders' | 'recruit' | 'divisions' | 'policies' | 'workshop' | 'tech';

const Game: React.FC = () => {
  const { id: gameId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<GameState | null>(null);
  const [militaryState, setMilitaryState] = useState<MilitaryState | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Tab navigation state
  const [activeTab, setActiveTab] = useState<TabType>('orders');
  const [notificationTrigger, setNotificationTrigger] = useState<number>(0);

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
      setActiveTab('recruit');
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
                />
              </ErrorBoundary>
            </div>

            {/* Main Operations Navigation Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <button
                type="button"
                className={activeTab === 'orders' ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                onClick={() => setActiveTab('orders')}
              >
                ⚔️ 下達作戰指令
              </button>
              <button
                type="button"
                className={activeTab === 'recruit' ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                onClick={() => setActiveTab('recruit')}
              >
                🪣 招募兵力
              </button>
              <button
                type="button"
                className={activeTab === 'divisions' ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                onClick={() => setActiveTab('divisions')}
              >
                🛡️ 編組師團 ({activeDivisions.length})
              </button>
              <button
                type="button"
                className={activeTab === 'policies' ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                onClick={() => setActiveTab('policies')}
              >
                📜 國家政策
              </button>
              <button
                type="button"
                className={activeTab === 'workshop' ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                onClick={() => setActiveTab('workshop')}
              >
                ⚙️ 兵種工坊
              </button>
              <button
                type="button"
                className={activeTab === 'tech' ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                onClick={() => setActiveTab('tech')}
              >
                🔬 科技樹
              </button>
            </div>

            {/* TAB 1: 作戰指令 */}
            {activeTab === 'orders' && (
              <ErrorBoundary>
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>下達作戰指令</h3>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                        onClick={handleAiSuggest}
                        disabled={aiSuggesting}
                      >
                        {aiSuggesting ? '⏳ 分析中...' : '🤖 自動決策'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                        onClick={handleClearForm}
                      >
                        🗑️ 清除指令
                      </button>
                    </div>
                  </div>

                  {state.myCountryId ? (
                    <form onSubmit={handleSubmitOrder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      
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
                              const newType = e.target.value as OrderType;
                              setOrderType(newType);
                              setFormError(null);
                              if (newType === 'RECRUIT') {
                                setActiveTab('recruit');
                              }
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
                              在地圖選取
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
                              在地圖選取
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

                      {/* Division Selection (for ATTACK / DEFEND / MOVE) */}
                      {['ATTACK', 'DEFEND', 'MOVE'].includes(orderType) && (
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                            選擇調動參戰師團 {selectedDivisionIds.length > 0 && `(已選取 ${selectedDivisionIds.length} 個師團)`}
                          </label>

                          {activeDivisions.length === 0 ? (
                            <div style={{ padding: '0.875rem 1rem', backgroundColor: 'rgba(239, 68, 68, 0.12)', border: '1px solid #ef4444', borderRadius: '4px', color: '#f87171', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span>⚠️ 您目前沒有可用的編組師團！請先前往「編組師團」頁面建立師團。</span>
                              <button
                                type="button"
                                className="btn-primary"
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                                onClick={() => setActiveTab('divisions')}
                              >
                                前往編組師團 →
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.625rem' }}>
                              {activeDivisions.map((div) => {
                                const isSelected = selectedDivisionIds.includes(div.id);
                                const compSummary = div.composition?.map(c => `${c.nameZh || c.customUnitId}x${c.quantity}`).join(' ') || '';
                                return (
                                  <div
                                    key={div.id}
                                    onClick={() => toggleDivisionSelection(div.id)}
                                    style={{
                                      padding: '0.625rem 0.875rem',
                                      borderRadius: '6px',
                                      backgroundColor: isSelected ? 'rgba(201, 168, 107, 0.15)' : 'var(--bg-tertiary)',
                                      border: `2px solid ${isSelected ? 'var(--accent-gold)' : 'var(--border-color)'}`,
                                      cursor: 'pointer',
                                      fontSize: '0.85rem',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '0.25rem',
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ fontWeight: 700, color: isSelected ? 'var(--accent-gold)' : 'var(--text)' }}>
                                        {isSelected ? '☑ ' : '☐ '} {div.name}
                                      </span>
                                      <span style={{ fontSize: '0.75rem', color: '#4ade80' }}>
                                        {div.totalUnits.toLocaleString()} 名
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {compSummary}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Order Cost & Preview */}
                      <div style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: 'var(--bg-primary)',
                        borderLeft: '4px solid var(--accent-gold)',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                      }}>
                        <div style={{ fontWeight: 600, color: 'var(--accent-gold)', marginBottom: '0.25rem' }}>
                          📋 指令預覽與摘要
                        </div>
                        <div style={{ color: 'var(--text-main)' }}>
                          {['ATTACK', 'DEFEND', 'MOVE'].includes(orderType) && (
                            <>
                              派遣 <strong>{selectedDivisionNames.length > 0 ? selectedDivisionNames.join('、') : '未選擇師團'}</strong>{' '}
                              ({orderType === 'ATTACK' ? '進攻' : orderType === 'DEFEND' ? '固守' : '移防'}{' '}
                              <strong style={{ color: targetTerritory ? '#4ade80' : '#f87171' }}>
                                {targetTerritory ? getCountryName(targetTerritory) : '(請點選目標國家)'}
                              </strong>) → 共 <strong>{selectedTotalUnits.toLocaleString()}</strong> 名兵力
                            </>
                          )}
                          {orderType === 'FORTIFY' && (
                            <>修築防禦工事 → 花費 <strong style={{ color: '#c9a86b' }}>20 黃金</strong> (提升據點防禦等級)</>
                          )}
                          {orderType === 'DIPLOMACY' && (
                            <>向 <strong>{targetTerritory ? getCountryName(targetTerritory) : '(請點選目標國家)'}</strong> 發起外交協定/戰術提案</>
                          )}
                          {orderType === 'RECRUIT' && (
                            <>請前往「招募兵力」頁面進行部隊動員招募。</>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                          type="submit"
                          className="btn-primary"
                          disabled={resolving || (['ATTACK', 'DEFEND', 'MOVE'].includes(orderType) && (activeDivisions.length === 0 || selectedDivisionIds.length === 0))}
                          style={{ flex: 1, justifyContent: 'center' }}
                        >
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
              </ErrorBoundary>
            )}

            {/* TAB 2: 招募兵力 */}
            {activeTab === 'recruit' && (
              <ErrorBoundary>
                <RecruitPanel
                  militaryState={militaryState}
                  onRefresh={fetchMilitaryState}
                />
              </ErrorBoundary>
            )}

            {/* TAB 3: 編組師團 */}
            {activeTab === 'divisions' && (
              <ErrorBoundary>
                <DivisionPanel
                  militaryState={militaryState}
                  onRefresh={fetchMilitaryState}
                  onSwitchTab={(tab) => setActiveTab(tab as TabType)}
                />
              </ErrorBoundary>
            )}

            {/* TAB 4: 國家政策 */}
            {activeTab === 'policies' && (
              <ErrorBoundary>
                <PolicyPanel
                  currentTurn={state.game.currentTurn}
                  refreshTrigger={notificationTrigger}
                />
              </ErrorBoundary>
            )}

            {/* TAB 5: 兵種工坊 */}
            {activeTab === 'workshop' && (
              <ErrorBoundary>
                <div className="card">
                  <h3 style={{ marginBottom: '0.5rem' }}>⚔️ 兵種設計工坊</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    輸入提示詞讓 AI 為你設計獨特兵種（每類最多 5 種）
                  </p>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    <select
                      value={unitDesignCategory}
                      onChange={(e) => setUnitDesignCategory(e.target.value)}
                      style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.8rem' }}
                    >
                      {CATEGORIES.map((c) => {
                        const count = myUnits.filter((u) => u.category === c).length;
                        return <option key={c} value={c}>{CATEGORY_LABELS[c]}（{count}/5）</option>;
                      })}
                    </select>
                    <input
                      type="text"
                      placeholder="例：壕溝突擊隊，配備刺刀和手榴彈"
                      value={unitDesignPrompt}
                      onChange={(e) => setUnitDesignPrompt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !unitDesigning) handleDesignUnit(); }}
                      style={{ flex: 1, minWidth: '120px', padding: '0.35rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.8rem' }}
                    />
                    <button onClick={handleDesignUnit} disabled={unitDesigning || !unitDesignPrompt.trim()} className="btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {unitDesigning ? '⏳...' : '設計'}
                    </button>
                  </div>
                  {unitError && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>✗ {unitError}</p>}
                  {unitSuccess && <p style={{ color: '#22c55e', fontSize: '0.75rem', marginTop: '0.25rem' }}>{unitSuccess}</p>}
                  {myUnits.length > 0 && (
                    <div style={{ marginTop: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                      {myUnits.map((u) => (
                        <div key={u.id} style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--bg-tertiary)', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 600 }}>{CATEGORY_LABELS[u.category] || u.category}: {u.nameZh}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                              攻:{u.attack} 防:{u.defense} 速:{u.speed} 成本:(金{u.costGold}/人{u.costManpower}/工{u.costIndustry})
                            </span>
                          </div>
                          <button onClick={() => handleDeleteUnit(u.id)} className="btn-secondary" style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', color: '#ef4444' }}>刪除</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ErrorBoundary>
            )}

            {/* TAB 6: 科技樹 */}
            {activeTab === 'tech' && gameId && (
              <ErrorBoundary>
                <div className="card">
                  <TechTreePanel gameId={gameId || ''} refreshTrigger={notificationTrigger} />
                </div>
              </ErrorBoundary>
            )}

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
  );
};

export default Game;
