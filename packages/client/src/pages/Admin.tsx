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
  const [tab, setTab] = useState<'dashboard' | 'ai' | 'games' | 'players' | 'aicountries'>('dashboard');
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  // Game management state
  const [games, setGames] = useState<any[]>([]);
  const [newGameName, setNewGameName] = useState('');
  const [gameActionLoading, setGameActionLoading] = useState(false);
  const [gameError, setGameError] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [playerList, setPlayerList] = useState<any[]>([]);
  const [playerTotal, setPlayerTotal] = useState(0);
  const [playerSkip, setPlayerSkip] = useState(0);
  const [aiCountries, setAiCountries] = useState<any[]>([]);
  const [aiCountryLoading, setAiCountryLoading] = useState<string | null>(null);

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

  // Load data when tab changes
  useEffect(() => {
    if (!authed) return;
    if (tab === 'dashboard') loadStats();
    if (tab === 'players') loadPlayers(playerSkip);
    if (tab === 'aicountries') loadAICountries();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, tab]);

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
        body: JSON.stringify({ name: newGameName.trim() }),
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
    { key: 'players' as const, label: '👥 玩家管理' },
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
        const currentGame = games.find((g) => g.status === 'WAITING' || g.status === 'ACTIVE');
        const history = games.filter((g) => g !== currentGame);
        return (
          <div>
            {gameError && (
              <div style={{ padding: '0.75rem', marginBottom: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '4px', color: '#ef4444' }}>
                {gameError}
              </div>
            )}

            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>目前戰局</h3>
              {currentGame ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
              ) : (
                <form onSubmit={createGame} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
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
                  <button
                    type="submit"
                    disabled={gameActionLoading}
                    style={{ padding: '0.75rem 1.5rem', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {gameActionLoading ? '開啟中...' : '開啟新戰局'}
                  </button>
                </form>
              )}
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
                一次只能有一場進行中的戰局。玩家進入大廳後採先搶先贏方式選擇國家,選完就只能等下一局。
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
                        <button
                          onClick={() => handleUnassignAI(activeGame.id, c.countryId)}
                          disabled={aiCountryLoading === c.countryId}
                          className="btn-secondary"
                          style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                        >
                          {aiCountryLoading === c.countryId ? '...' : '撤除 AI'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
    </div>
  );
};

export default Admin;
