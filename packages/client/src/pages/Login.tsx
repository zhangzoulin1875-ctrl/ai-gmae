import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiUrl, apiFetch } from '../lib/api';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('尚未登入');
      })
      .then((user) => {
        if (user && user.id) {
          localStorage.setItem('user', JSON.stringify(user));
          navigate('/lobby');
        }
      })
      .catch(() => {
        // 尚未登入,忽略
      });

    // Discord 登入失敗會導回 /?error=auth_failed
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'auth_failed') {
      setError('Discord 登入失敗,請再試一次');
    }
  }, [navigate]);

  const handleDiscordLogin = () => {
    setLoading(true);
    window.location.href = getApiUrl('/api/auth/discord');
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
      background: 'radial-gradient(circle at center, #1e2836 0%, #0f1419 100%)'
    }}>
      <div className="card" style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>1914：世界大戰</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
          全球多人戰略與外交引擎
        </p>

        {error && (
          <div style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            borderRadius: '4px',
            color: '#ef4444'
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button
            onClick={handleDiscordLogin}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              backgroundColor: '#5865F2',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '0.875rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            使用 Discord 登入
          </button>
        </div>

        <div style={{ marginTop: '2rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <a href="/admin">管理員後台入口</a>
        </div>
      </div>
    </div>
  );
};

export default Login;
