import React, { useState, useEffect } from 'react';
import type { AIConfig, AIProvider, AdminConfig } from '@wwi/shared';
import { getApiUrl } from '../lib/api';

const Admin: React.FC = () => {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Config state
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [tab, setTab] = useState<'dashboard' | 'ai' | 'games' | 'players' | 'aicountries' | 'units' | 'accounts'>('dashboard');
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  // Game management state
  const [games, setGames] = useState<any[]>([]);
  const [newGameName, setNewGameName] = useState('');
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [selectedScenario, setSelectedScenario] = useState('wwi-global');
  const [gameActionLoading, setGameActionLoading] = useState(false);
  const [gameError, setGameError] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [playerList, setPlayerList] = useState<any[]>([]);
  const [playerTotal, setPlayerTotal] = useState(0);
  const [playerSkip, setPlayerSkip] = useState(0);
  const [aiCountries, setAiCountries] = useState<any[]>([]);
  const [aiCountryLoading, setAiCountryLoading] = useState<string | null>(null);

  // Unit Design state — read-only monitoring (players design their own units now)
  const [unitList, setUnitList] = useState<any[]>([]);
  const [unitRules, setUnitRules] = useState<any>(null);

  // Account management state
  const [accountList, setAccountList] = useState<any[]>([]);
  const [accountTotal, setAccountTotal] = useState(0);
  const [accountSkip, setAccountSkip] = useState(0);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountLoading, setAccountLoading] = useState(false);
  const [autoLoginTried, setAutoLoginTried] = useState(false);

  const CATEGORY_LABELS: Record<string, string> = {
    infantry: '步兵', cavalry: '騎兵', artillery: '砲兵', fleet: '艦隊', armored: '裝甲',
  };
  const CATEGORIES = ['infantry', 'cavalry', 'artillery', 'fleet', 'armored'];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(getApiUrl('/api/admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('adminToken', data.token);
        setAuthed(true);
        loadConfig();
        loadGames();
    loadScenarios();
      } else {
        setError(data.error || '驗證失敗');
      }
    } catch (err: any) {
      setError(err.message || '連線錯誤');
    } finally {
      setLoading(false);
    }
  };

  const loadConfig = async () => {
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(getApiUrl('/api/admin/config'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setProviders(data.aiConfig?.fallbackChain?.providers || []);
      }
    } catch (err) {
      console.error('載入設定失敗');
    }
  };

  const loadScenarios = async () => {
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(getApiUrl('/api/admin/scenarios'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setScenarios(data);
      }
    } catch {}
  };

  const loadGames = async () => {
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(getApiUrl('/api/admin/games'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGames(data.games || []);
      }
    } catch (err) {
      console.error('載入戰局清單失敗');
    }
  };

  const loadStats = async () => {
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(getApiUrl('/api/admin/stats'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { const data = await res.json(); setStats(data); }
    } catch { /* ignore */ }
  };

  const loadPlayers = async (skipVal = 0) => {
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(getApiUrl(`/api/admin/players?limit=50&skip=${skipVal}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPlayerList(data.players || []);
        setPlayerTotal(data.total || 0);
      }
    } catch { /* ignore */ }
  };

  const loadAICountries = async () => {
    const token = localStorage.getItem('adminToken');
    const activeGame = games.find((g) => g.status === 'WAITING' || g.status === 'ACTIVE');
    if (!activeGame) { setAiCountries([]); return; }
    try {
      const res = await fetch(getApiUrl(`/api/admin/games/${activeGame.id}/countries`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { const data = await res.json(); setAiCountries(data.countries || []); }
    } catch { /* ignore */ }
  };

  const handleAssignAI = async (gameId: string, countryId: string) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    setAiCountryLoading(countryId);
    try {
      const res = await fetch(getApiUrl(`/api/admin/games/${gameId}/assign-ai`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ countryId }),
      });
      const data = await res.json();
      if (!res.ok) { setGameError(data.error || '操作失敗'); }
      else { await loadAICountries(); }
    } catch { setGameError('連線失敗'); }
    finally { setAiCountryLoading(null); }
  };

  const handleUnassignAI = async (gameId: string, countryId: string) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    setAiCountryLoading(countryId);
    try {
      const res = await fetch(getApiUrl(`/api/admin/games/${gameId}/unassign-ai`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ countryId }),
      });
      const data = await res.json();
      if (!res.ok) { setGameError(data.error || '操作失敗'); }
      else { await loadAICountries(); }
    } catch { setGameError('連線失敗'); }
    finally { setAiCountryLoading(null); }
  };

  const handleSwitchAIMode = async (gameId: string, countryId: string, mode: string) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    setAiCountryLoading(countryId + '-mode');
    try {
      const res = await fetch(getApiUrl(`/api/admin/games/${gameId}/ai-mode`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ countryId, mode }),
      });
      const data = await res.json();
      if (!res.ok) { setGameError(data.error || '切換失敗'); }
      else { await loadAICountries(); }
    } catch { setGameError('連線失敗'); }
    finally { setAiCountryLoading(null); }
  };

  // Auto-login via account binding — try cookie-based login before showing password form
  useEffect(() => {
    if (autoLoginTried || authed) return;
    // If we already have a valid admin token, skip auto-login
    const existingToken = localStorage.getItem('adminToken');
    if (existingToken) {
      setAuthed(true);
      setAutoLoginTried(true);
      return;
    }
    setAutoLoginTried(true);
    (async () => {
      try {
        const res = await fetch(getApiUrl('/api/admin/login-with-account'), {
          method: 'POST',
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('adminToken', data.token);
          setAuthed(true);
          loadConfig();
          loadGames();
          loadScenarios();
        }
      } catch { /* silent fail — will show password form */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoginTried, authed]);

  // Load data when tab changes
  useEffect(() => {
    if (!authed) return;
    if (tab === 'dashboard') loadStats();
    if (tab === 'players') loadPlayers(playerSkip);
    if (tab === 'aicountries') loadAICountries();
    if (tab === 'units') { loadUnits(); loadUnitRules(); }
    if (tab === 'accounts') loadAccounts(accountSkip);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, tab]);

  const loadAccounts = async (skipVal: number = 0) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    setAccountLoading(true);
    try {
      let url = `/api/admin/accounts?limit=50&skip=${skipVal}`;
      if (accountSearch) url += `&search=${encodeURIComponent(accountSearch)}`;
      const res = await fetch(getApiUrl(url), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setAccountList(data.accounts || []);
        setAccountTotal(data.total || 0);
      }
    } catch {}
    finally { setAccountLoading(false); }
  };

  const handleToggleAdmin = async (userId: string, currentIsAdmin: boolean) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const res = await fetch(getApiUrl(`/api/admin/accounts/${userId}/set-admin`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAdmin: !currentIsAdmin }),
      });
      if (res.ok) {
        // Update local state
        setAccountList((prev) => prev.map((a) => a.id === userId ? { ...a, isAdmin: !currentIsAdmin } : a));
      }
    } catch {}
  };

  const loadUnits = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const res = await fetch(getApiUrl('/api/admin/units'), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setUnitList(data.units || []); }
    } catch {}
  };

  const loadUnitRules = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const res = await fetch(getApiUrl('/api/admin/unit-rules'), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setUnitRules(data); }
    } catch {}
  };

  const handleDeleteUnit = async (id: string) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      await fetch(getApiUrl(`/api/admin/units/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadUnits();
    } catch {}
  };

  const handleUpdateRules = async (field: string, value: any) => {
    const token = localStorage.getItem('adminToken');
    if (!token || !unitRules) return;
    const updated = { ...unitRules, [field]: value };
    setUnitRules(updated);
    try {
      await fetch(getApiUrl('/api/admin/unit-rules'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [field]: value }),
      });
    } catch {}
  };

  const createGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGameName.trim()) return;
    const token = localStorage.getItem('adminToken');
    setGameActionLoading(true);
    setGameError('');
    try {
      const res = await fetch(getApiUrl('/api/admin/games'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newGameName.trim(), scenarioId: selectedScenario }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewGameName('');
        loadGames();
      } else {
        setGameError(data.error || '開啟戰局失敗');
      }
    } catch (err: any) {
      setGameError(err.message || '連線錯誤');
    } finally {
      setGameActionLoading(false);
    }
  };

  const endGame = async (gameId: string) => {
    if (!window.confirm('確定要結束這場戰局嗎?結束後才能開啟新戰局。')) return;
    const token = localStorage.getItem('adminToken');
    setGameActionLoading(true);
    setGameError('');
    try {
      const res = await fetch(getApiUrl(`/api/admin/games/${gameId}/end`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        loadGames();
      } else {
        const data = await res.json();
        setGameError(data.error || '結束戰局失敗');
      }
    } catch (err: any) {
      setGameError(err.message || '連線錯誤');
    } finally {
      setGameActionLoading(false);
    }
  };

  const resolveTurn = async (gameId: string) => {
    if (!window.confirm('確定要立即結算本回合嗎？')) return;
    const token = localStorage.getItem('adminToken');
    setGameActionLoading(true);
    setGameError('');
    try {
      const res = await fetch(getApiUrl(`/api/admin/games/${gameId}/resolve-turn`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setGameError('');
        alert(`第 ${data.turn} 回合結算完成!\n${data.narrative || ''}`);
        loadGames();
      } else {
        setGameError(data.error || '結算失敗');
      }
    } catch (err: any) {
      setGameError(err.message || '連線錯誤');
    } finally {
      setGameActionLoading(false);
    }
  };

  const updateProvider = (id: string, updates: Partial<AIProvider>) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  const addProvider = () => {
    const newProvider: AIProvider = {
      id: `provider-${Date.now()}`,
      name: '新供應商',
      type: 'openai',
      apiKey: '',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      priority: providers.length + 1,
      isEnabled: true,
      timeoutMs: 30000,
      maxRetries: 2,
    };
    setProviders((prev) => [...prev, newProvider]);
  };

  const removeProvider = (id: string) => {
    setProviders((prev) => prev.filter((p) => p.id !== id));
  };

  const moveProvider = (id: string, dir: 'up' | 'down') => {
    setProviders((prev) => {
      const arr = [...prev].sort((a, b) => a.priority - b.priority);
      const idx = arr.findIndex((p) => p.id === id);
      if (idx < 0) return prev;
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= arr.length) return prev;
      [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
      return arr.map((p, i) => ({ ...p, priority: i + 1 }));
    });
  };

  const saveAIConfig = async () => {
    const token = localStorage.getItem('adminToken');
    setLoading(true);
    try {
      const aiConfig: AIConfig = {
        activeProviderId: providers.find((p) => p.isEnabled)?.id || '',
        fallbackChain: {
          providers: providers.sort((a, b) => a.priority - b.priority),
          enableDeterministicFallback: true,
          maxTotalTimeoutMs: 120000,
        },
        temperature: 0.7,
        updatedAt: new Date().toISOString(),
      };
      const res = await fetch(getApiUrl('/api/admin/ai-config'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(aiConfig),
      });
      if (res.ok) {
        setError('');
        setTestResult({ _save: '儲存成功!' });
        setTimeout(() => setTestResult({}), 3000);
      } else {
        const data = await res.json();
        setError(data.error || '儲存失敗');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const testProvider = async (id: string) => {
    const provider = providers.find((p) => p.id === id);
    if (!provider) return;
    setTestingProvider(id);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(getApiUrl('/api/admin/test-provider'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      setTestResult((prev) => ({
        ...prev,
        [id]: data.success ? '✓ 連線成功' : `✗ ${data.error}`,
      }));
    } catch (err: any) {
      setTestResult((prev) => ({ ...prev, [id]: `✗ ${err.message}` }));
    } finally {
      setTestingProvider(null);
    }
  };

  // === Login View ===
  if (!authed) {
    if (!autoLoginTried) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0f1419' }}>
          <p style={{ color: 'var(--text-muted)' }}>正在驗證帳號權限...</p>
        </div>
      );
    }
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          background: 'radial-gradient(circle at center, #1e2836 0%, #0f1419 100%)',
        }}
      >
        <div className="card" style={{ maxWidth: '420px', width: '100%' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>⚙ 管理員控制台</h2>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            僅限授權人員進入
          </p>
          {error && (
            <div
              style={{
                padding: '0.75rem',
                marginBottom: '1rem',
                backgroundColor: 'rgba(239,68,68,0.1)',
                border: '1px solid #ef4444',
                borderRadius: '4px',
                color: '#ef4444',
                fontSize: '0.9rem',
              }}
            >
              {error}
            </div>
          )}
          <form onSubmit={handleLogin}>
            <input
              type="password"
              placeholder="請輸入管理員密碼"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                marginBottom: '1rem',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontSize: '1rem',
              }}
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {loading ? '驗證中...' : '進入管理後台'}
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <a href="/" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              ← 返回遊戲
            </a>
          </div>
        </div>
      </div>
    );
  }

  // === Admin Panel View ===
  const tabs = [
    { key: 'dashboard' as const, label: '📊 儀表板' },
    { key: 'ai' as const, label: '🤖 AI 設定' },
    { key: 'games' as const, label: '🎮 戰局管理' },
    { key: 'aicountries' as const, label: '♟️ AI 國家管理' },
    { key: 'units' as const, label: '⚔️ 兵種設計' },
    { key: 'players' as const, label: '👥 玩家管理' },
    { key: 'accounts' as const, label: '🔑 帳號管理' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#0f1419', padding: '1.5rem' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '1rem',
        }}
      >
        <h2 style={{ margin: 0 }}>⚙ 管理員控制台</h2>
        <button
          onClick={() => {
            localStorage.removeItem('adminToken');
            setAuthed(false);
          }}
          className="btn-secondary"
        >
          登出
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              border: '1px solid',
              borderColor: tab === t.key ? '#3b82f6' : 'var(--border-color)',
              backgroundColor: tab === t.key ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: tab === t.key ? '#3b82f6' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            backgroundColor: 'rgba(239,68,68,0.1)',
            border: '1px solid #ef4444',
            borderRadius: '4px',
            color: '#ef4444',
          }}
        >
          {error}
        </div>
      )}

      {/* Dashboard Tab */}
      {tab === 'dashboard' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card">
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>總戰局數</p>
              <p style={{ fontSize: '2rem', fontWeight: 700 }}>{stats?.totalGames ?? '—'}</p>
            </div>
            <div className="card">
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>進行中戰局</p>
              <p style={{ fontSize: '2rem', fontWeight: 700 }}>{stats?.activeGames ?? '—'}</p>
            </div>
            <div className="card">
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>總玩家數</p>
              <p style={{ fontSize: '2rem', fontWeight: 700 }}>{stats?.totalPlayers ?? '—'}</p>
            </div>
            <div className="card">
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>AI 控制國家</p>
              <p style={{ fontSize: '2rem', fontWeight: 700 }}>{stats?.aiCountries ?? '—'}</p>
            </div>
            <div className="card">
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>總指令數</p>
              <p style={{ fontSize: '2rem', fontWeight: 700 }}>{stats?.totalOrders ?? '—'}</p>
            </div>
            <div className="card">
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>回合結算次數</p>
              <p style={{ fontSize: '2rem', fontWeight: 700 }}>{stats?.totalResolutions ?? '—'}</p>
            </div>
            <div className="card">
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>AI API 呼叫次數</p>
              <p style={{ fontSize: '2rem', fontWeight: 700 }}>{stats?.aiApiCalls ?? '—'}</p>
            </div>
          </div>
          {stats?.latestGame && (
            <div className="card">
              <h3 style={{ marginBottom: '0.5rem' }}>最新戰局</h3>
              <p style={{ color: 'var(--text-muted)' }}>
                {stats.latestGame.name} — 回合 {stats.latestGame.currentTurn} — {stats.latestGame.playerCount} 名玩家
              </p>
            </div>
          )}
        </div>
      )}

      {/* AI Config Tab */}
      {tab === 'ai' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>AI 供應商降級鏈</h3>
            <button onClick={addProvider} style={{ padding: '0.5rem 1rem', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              + 新增供應商
            </button>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            系統會依序嘗試各供應商,若失敗則自動切換至下一個。全部失敗時將使用確定性規則降級結算。
          </p>

          {providers.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              尚未設定任何供應商,請點擊「新增供應商」開始設定。
            </div>
          )}

          {providers
            .sort((a, b) => a.priority - b.priority)
            .map((provider, idx) => (
              <div key={provider.id} className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: '#3b82f6',
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={provider.name}
                      onChange={(e) => updateProvider(provider.id, { name: e.target.value })}
                      style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: 'var(--text)',
                        fontSize: '1.1rem',
                        fontWeight: 600,
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => moveProvider(provider.id, 'up')} className="btn-secondary" style={{ padding: '0.25rem 0.5rem' }}>↑</button>
                    <button onClick={() => moveProvider(provider.id, 'down')} className="btn-secondary" style={{ padding: '0.25rem 0.5rem' }}>↓</button>
                    <button
                      onClick={() => updateProvider(provider.id, { isEnabled: !provider.isEnabled })}
                      style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '4px',
                        border: '1px solid',
                        borderColor: provider.isEnabled ? '#22c55e' : 'var(--border-color)',
                        color: provider.isEnabled ? '#22c55e' : 'var(--text-muted)',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      {provider.isEnabled ? '● 已啟用' : '○ 已停用'}
                    </button>
                    <button onClick={() => removeProvider(provider.id)} style={{ padding: '0.25rem 0.5rem', color: '#ef4444', background: 'transparent', border: '1px solid #ef4444', borderRadius: '4px', cursor: 'pointer' }}>
                      ✕
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>類型</label>
                    <select
                      value={provider.type}
                      onChange={(e) => updateProvider(provider.id, { type: e.target.value as AIProvider['type'] })}
                      style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text)' }}
                    >
                      <option value="openai">OpenAI 相容格式</option>
                      <option value="custom">自訂 (OpenAI 格式)</option>
                      <option value="deterministic">確定性規則 (無 AI)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>模型</label>
                    <input
                      type="text"
                      value={provider.model}
                      onChange={(e) => updateProvider(provider.id, { model: e.target.value })}
                      placeholder="gpt-4o"
                      style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text)' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>API 金鑰</label>
                    <input
                      type="password"
                      value={provider.apiKey || ''}
                      onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                      placeholder="sk-..."
                      style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text)' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>API 位址</label>
                    <input
                      type="text"
                      value={provider.endpoint || ''}
                      onChange={(e) => updateProvider(provider.id, { endpoint: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                      style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text)' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>逾時時間 (毫秒)</label>
                    <input
                      type="number"
                      value={provider.timeoutMs}
                      onChange={(e) => updateProvider(provider.id, { timeoutMs: Number(e.target.value) })}
                      style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text)' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>最大重試次數</label>
                    <input
                      type="number"
                      value={provider.maxRetries}
                      onChange={(e) => updateProvider(provider.id, { maxRetries: Number(e.target.value) })}
                      style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text)' }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <button
                    onClick={() => testProvider(provider.id)}
                    disabled={testingProvider === provider.id}
                    className="btn-secondary"
                  >
                    {testingProvider === provider.id ? '測試中...' : '測試連線'}
                  </button>
                  {testResult[provider.id] && (
                    <span style={{ fontSize: '0.85rem', color: testResult[provider.id].startsWith('✓') ? '#22c55e' : '#ef4444' }}>
                      {testResult[provider.id]}
                    </span>
                  )}
                </div>
              </div>
            ))}

          {providers.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <button
                onClick={saveAIConfig}
                disabled={loading}
                style={{ padding: '0.75rem 2rem', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}
              >
                {loading ? '儲存中...' : '儲存設定'}
              </button>
              {testResult._save && (
                <span style={{ marginLeft: '1rem', color: '#22c55e' }}>{testResult._save}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Games Tab */}
      {tab === 'games' && (() => {
        const MAX_CONCURRENT_GAMES = 2;
        const currentGames = games.filter((g) => g.status === 'WAITING' || g.status === 'ACTIVE');
        const history = games.filter((g) => !currentGames.includes(g));
        const canCreateMore = currentGames.length < MAX_CONCURRENT_GAMES;
        return (
          <div>
            {gameError && (
              <div style={{ padding: '0.75rem', marginBottom: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '4px', color: '#ef4444' }}>
                {gameError}
              </div>
            )}

            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>目前戰局（{currentGames.length}/{MAX_CONCURRENT_GAMES}）</h3>
              {currentGames.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: canCreateMore ? '1.5rem' : 0 }}>
                  {currentGames.map((currentGame) => (
                    <div key={currentGame.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                      <div>
                        <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>{currentGame.name}</p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          狀態: <span style={{ color: 'var(--accent-gold)' }}>{currentGame.status}</span> | 第 {currentGame.currentTurn} 回合 | 玩家: {currentGame.playerCount}/{currentGame.maxPlayers}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => resolveTurn(currentGame.id)}
                          disabled={gameActionLoading}
                          style={{ padding: '0.6rem 1.5rem', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          立即結算
                        </button>
                        <button
                          onClick={() => endGame(currentGame.id)}
                          disabled={gameActionLoading}
                          style={{ padding: '0.6rem 1.5rem', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          結束戰局
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {canCreateMore ? (
                <form onSubmit={createGame} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                      戰局名稱
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="例如:1914 西線戰役"
                      value={newGameName}
                      onChange={(e) => setNewGameName(e.target.value)}
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                  <div style={{ minWidth: '220px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                      開局情境
                    </label>
                    <select
                      className="input-field"
                      value={selectedScenario}
                      onChange={(e) => setSelectedScenario(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      {scenarios.length === 0 && <option value="wwi-global">一戰全球</option>}
                      {scenarios.map((s) => (
                        <option key={s.id} value={s.id}>
                          [{s.era}] {s.nameZh} ({s.countryCount} 國)
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={gameActionLoading}
                    style={{ padding: '0.75rem 1.5rem', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {gameActionLoading ? '開啟中...' : '開啟新戰局'}
                  </button>
                </form>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  已達上限 {MAX_CONCURRENT_GAMES} 個並行戰局，請先結束一個戰局才能開啟新戰局。
                </p>
              )}
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
                最多可同時開啟 2 個戰局（主戰局 + Beta 測試服）。玩家進入大廳後採先搶先贏方式選擇國家,選完就只能等下一局。
              </p>
            </div>

            <h3 style={{ marginBottom: '1rem' }}>歷史戰局</h3>
            {history.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>尚無歷史戰局紀錄。</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {history.map((g) => (
                  <div key={g.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem' }}>
                    <span>{g.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{g.status} · 玩家 {g.playerCount}/{g.maxPlayers}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Players Tab */}
      {/* AI Country Management Tab */}
      {tab === 'aicountries' && (
        <div>
          <h3 style={{ marginBottom: '1rem' }}>♟️ AI 國家管理</h3>
          {!games.find((g) => g.status === 'WAITING' || g.status === 'ACTIVE') ? (
            <div className="card"><p style={{ color: 'var(--text-muted)' }}>目前沒有進行中的戰局</p></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
              {aiCountries.map((c) => {
                const activeGame = games.find((g) => g.status === 'WAITING' || g.status === 'ACTIVE');
                return (
                  <div key={c.countryId} className="card" style={{ padding: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '1.2rem' }}>{c.flagIcon}</span>
                        <span style={{ marginLeft: '0.5rem', fontWeight: 600 }}>{c.nameZh}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem' }}>
                        {c.controller.type === 'human' && (
                          <span style={{ color: '#3b82f6' }}>👤 {c.controller.username}</span>
                        )}
                        {c.controller.type === 'ai' && (
                          <span style={{ color: '#22c55e' }}>🤖 AI</span>
                        )}
                        {c.controller.type === 'empty' && (
                          <span style={{ color: 'var(--text-muted)' }}>— 空位</span>
                        )}
                      </div>
                    </div>
                    <div style={{ marginTop: '0.5rem' }}>
                      {c.controller.type === 'empty' && activeGame && (
                        <button
                          onClick={() => handleAssignAI(activeGame.id, c.countryId)}
                          disabled={aiCountryLoading === c.countryId}
                          className="btn-primary"
                          style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                        >
                          {aiCountryLoading === c.countryId ? '...' : '指派 AI'}
                        </button>
                      )}
                      {c.controller.type === 'ai' && activeGame && (
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <button
                            onClick={() => handleSwitchAIMode(activeGame.id, c.countryId, c.controller.mode === 'llm' ? 'formula' : 'llm')}
                            disabled={aiCountryLoading === c.countryId + '-mode'}
                            style={{
                              padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px',
                              border: '1px solid',
                              borderColor: c.controller.mode === 'llm' ? '#a855f7' : 'var(--border-color)',
                              color: c.controller.mode === 'llm' ? '#a855f7' : 'var(--text-muted)',
                              background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                            title="切換 AI 引擎模式"
                          >
                            {aiCountryLoading === c.countryId + '-mode' ? '...' : c.controller.mode === 'llm' ? '🧠 LLM' : '⚙️ 公式'}
                          </button>
                          <button
                            onClick={() => handleUnassignAI(activeGame.id, c.countryId)}
                            disabled={aiCountryLoading === c.countryId}
                            className="btn-secondary"
                            style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                          >
                            {aiCountryLoading === c.countryId ? '...' : '撤除'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Unit Design Tab — read-only monitoring; players design their own units in-game */}
      {tab === 'units' && (
        <div>
          <h3 style={{ marginBottom: '1rem' }}>⚔️ 兵種設計監控</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            兵種設計已改為由玩家在遊戲內自行設計。此頁僅供查看每位玩家設計了哪些兵種，並可設定套用於所有玩家的硬規則。
          </p>

          {/* Hard Rules (configurable) */}
          {unitRules && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '0.75rem' }}>⚙️ 硬規則設定</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>年代</label>
                  <input type="text" value={unitRules.era || ''} onChange={(e) => handleUpdateRules('era', e.target.value)} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>每類上限</label>
                  <input type="number" value={unitRules.maxPerCategory ?? 5} onChange={(e) => handleUpdateRules('maxPerCategory', Number(e.target.value))} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>最大攻擊</label>
                  <input type="number" value={unitRules.maxAttack ?? 100} onChange={(e) => handleUpdateRules('maxAttack', Number(e.target.value))} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>最大防禦</label>
                  <input type="number" value={unitRules.maxDefense ?? 100} onChange={(e) => handleUpdateRules('maxDefense', Number(e.target.value))} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>最大速度</label>
                  <input type="number" value={unitRules.maxSpeed ?? 50} onChange={(e) => handleUpdateRules('maxSpeed', Number(e.target.value))} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>最低黃金消耗</label>
                  <input type="number" value={unitRules.minCostGold ?? 10} onChange={(e) => handleUpdateRules('minCostGold', Number(e.target.value))} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text)' }} />
                </div>
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>禁用技術（逗號分隔）</label>
                <textarea value={unitRules.forbiddenTechs || ''} onChange={(e) => handleUpdateRules('forbiddenTechs', e.target.value)} rows={2} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.8rem', fontFamily: 'monospace' }} />
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>允許技術（逗號分隔）</label>
                <textarea value={unitRules.allowedEra || ''} onChange={(e) => handleUpdateRules('allowedEra', e.target.value)} rows={2} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.8rem', fontFamily: 'monospace' }} />
              </div>
            </div>
          )}

          {/* Units grouped by designer (player) — read-only record */}
          <h4 style={{ marginBottom: '0.75rem' }}>📋 玩家設計紀錄（共 {unitList.length} 個兵種）</h4>
          {unitList.length === 0 ? (
            <div className="card" style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              目前還沒有玩家設計任何兵種
            </div>
          ) : (
            (() => {
              // Group units by designer username (fallback to '未知玩家' for legacy admin-designed units)
              const byPlayer: Record<string, any[]> = {};
              for (const u of unitList) {
                const key = u.designedByUsername || '未知玩家（舊資料）';
                if (!byPlayer[key]) byPlayer[key] = [];
                byPlayer[key].push(u);
              }
              return Object.entries(byPlayer).map(([username, units]) => (
                <div key={username} style={{ marginBottom: '1.25rem' }}>
                  <h4 style={{ marginBottom: '0.5rem', color: 'var(--accent-gold)', fontSize: '0.95rem' }}>
                    👤 {username}（{units.length} 個兵種）
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                    {units.map((u) => (
                      <div key={u.id} className="card" style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{CATEGORY_LABELS[u.category] || u.category}</span>
                            <p style={{ fontWeight: 700, fontSize: '1rem' }}>{u.nameZh}</p>
                            {u.nameEn && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.nameEn}</p>}
                          </div>
                          <button
                            onClick={() => handleDeleteUnit(u.id)}
                            title="管理員移除（審核用）"
                            style={{ padding: '0.15rem 0.4rem', color: '#ef4444', background: 'transparent', border: '1px solid #ef4444', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                          >
                            ✕
                          </button>
                        </div>
                        {u.description && <p style={{ fontSize: '0.8rem', marginTop: '0.25rem', color: 'var(--text-muted)' }}>{u.description}</p>}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.25rem', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                          <span>⚔️ 攻: {u.attack}</span>
                          <span>🛡️ 防: {u.defense}</span>
                          <span>💨 速: {u.speed}</span>
                          <span>💰 金/百人: {u.costGold}</span>
                          <span>👥 人力/人: {u.costManpower.toLocaleString()}</span>
                          <span>🏭 工/百人: {u.costIndustry}</span>
                        </div>
                        {u.prompt && <p style={{ fontSize: '0.7rem', marginTop: '0.25rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>提示: {u.prompt}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()
          )}
        </div>
      )}

      {/* Players Tab */}
      {tab === 'players' && (
        <div>
          <h3 style={{ marginBottom: '1rem' }}>👥 玩家管理 (共 {playerTotal} 人)</h3>
          {playerList.length === 0 ? (
            <div className="card"><p style={{ color: 'var(--text-muted)' }}>尚無玩家資料</p></div>
          ) : (
            <div className="card" style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>玩家</th>
                    <th style={{ padding: '0.5rem' }}>國家</th>
                    <th style={{ padding: '0.5rem' }}>戰局</th>
                    <th style={{ padding: '0.5rem' }}>類型</th>
                    <th style={{ padding: '0.5rem' }}>就緒</th>
                    <th style={{ padding: '0.5rem' }}>加入時間</th>
                  </tr>
                </thead>
                <tbody>
                  {playerList.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.5rem' }}>{p.username}</td>
                      <td style={{ padding: '0.5rem' }}>{p.countryId}</td>
                      <td style={{ padding: '0.5rem' }}>{p.gameName}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {p.isAI ? <span style={{ color: '#22c55e' }}>🤖 AI</span> : <span style={{ color: '#3b82f6' }}>👤 玩家</span>}
                      </td>
                      <td style={{ padding: '0.5rem' }}>{p.isReady ? '✓' : '—'}</td>
                      <td style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(p.joinedAt).toLocaleString('zh-TW')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {playerSkip > 0 && (
                <button onClick={() => setPlayerSkip(Math.max(0, playerSkip - 50))} className="btn-secondary" style={{ marginTop: '1rem', marginRight: '0.5rem' }}>
                  ← 上一頁
                </button>
              )}
              {playerSkip + 50 < playerTotal && (
                <button onClick={() => setPlayerSkip(playerSkip + 50)} className="btn-secondary" style={{ marginTop: '1rem' }}>
                  下一頁 →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Accounts Tab — manage account-bound admin rights */}
      {tab === 'accounts' && (
        <div>
          <h3 style={{ marginBottom: '1rem' }}>🔑 帳號管理 (共 {accountTotal} 人)</h3>

          {/* Search */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              className="input-field"
              placeholder="搜尋帳號名稱..."
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setAccountSkip(0); loadAccounts(0); } }}
              style={{ flex: 1, maxWidth: '300px' }}
            />
            <button className="btn-secondary" onClick={() => { setAccountSkip(0); loadAccounts(0); }}>
              搜尋
            </button>
          </div>

          {accountLoading ? (
            <div className="card"><p style={{ color: 'var(--text-muted)' }}>載入中...</p></div>
          ) : accountList.length === 0 ? (
            <div className="card"><p style={{ color: 'var(--text-muted)' }}>尚無帳號資料</p></div>
          ) : (
            <div className="card" style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>帳號</th>
                    <th style={{ padding: '0.5rem' }}>Discord ID</th>
                    <th style={{ padding: '0.5rem' }}>頭像</th>
                    <th style={{ padding: '0.5rem' }}>管理員</th>
                    <th style={{ padding: '0.5rem' }}>註冊時間</th>
                    <th style={{ padding: '0.5rem' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {accountList.map((a) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.5rem' }}>{a.username}</td>
                      <td style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{a.discordId || '—'}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {a.avatar ? <img src={a.avatar} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%' }} /> : '—'}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {a.isAdmin ? (
                          <span style={{ color: '#22c55e' }}>✓ 管理員</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>一般帳號</span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {a.createdAt ? new Date(a.createdAt).toLocaleString('zh-TW') : '—'}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <button
                          onClick={() => handleToggleAdmin(a.id, a.isAdmin)}
                          style={{
                            padding: '0.35rem 0.8rem',
                            fontSize: '0.85rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            cursor: 'pointer',
                            backgroundColor: a.isAdmin ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                            color: a.isAdmin ? '#ef4444' : '#22c55e',
                          }}
                        >
                          {a.isAdmin ? '撤銷管理員' : '設為管理員'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {accountSkip > 0 && (
                <button onClick={() => { const s = Math.max(0, accountSkip - 50); setAccountSkip(s); loadAccounts(s); }} className="btn-secondary" style={{ marginTop: '1rem', marginRight: '0.5rem' }}>
                  ← 上一頁
                </button>
              )}
              {accountSkip + 50 < accountTotal && (
                <button onClick={() => { const s = accountSkip + 50; setAccountSkip(s); loadAccounts(s); }} className="btn-secondary" style={{ marginTop: '1rem' }}>
                  下一頁 →
                </button>
              )}
            </div>
          )}
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1rem' }}>
            被設為管理員的帳號，下次進入後台時可免密碼直接登入。密碼登入方式仍然保留作為備用。
          </p>
        </div>
      )}
    </div>
  );
};

export default Admin;
