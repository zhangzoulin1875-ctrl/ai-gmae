import React, { useState, useEffect } from 'react';
import type { AIConfig, AIProvider, AdminConfig } from '@wwi/shared';

const Admin: React.FC = () => {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Config state
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [tab, setTab] = useState<'dashboard' | 'ai' | 'games' | 'players'>('dashboard');
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('adminToken', data.token);
        setAuthed(true);
        loadConfig();
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
      const res = await fetch('/api/admin/config', {
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
      const res = await fetch('/api/admin/ai-config', {
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
      const res = await fetch('/api/admin/test-provider', {
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div className="card">
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>進行中戰局</p>
            <p style={{ fontSize: '2rem', fontWeight: 700 }}>—</p>
          </div>
          <div className="card">
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>在線玩家</p>
            <p style={{ fontSize: '2rem', fontWeight: 700 }}>—</p>
          </div>
          <div className="card">
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>今日 API 呼叫次數</p>
            <p style={{ fontSize: '2rem', fontWeight: 700 }}>—</p>
          </div>
          <div className="card">
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>下次回合結算</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>—</p>
          </div>
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
      {tab === 'games' && (
        <div className="card">
          <h3>進行中戰局</h3>
          <p style={{ color: 'var(--text-muted)' }}>戰局資料載入中...</p>
        </div>
      )}

      {/* Players Tab */}
      {tab === 'players' && (
        <div className="card">
          <h3>玩家管理</h3>
          <p style={{ color: 'var(--text-muted)' }}>玩家資料載入中...</p>
        </div>
      )}
    </div>
  );
};

export default Admin;
