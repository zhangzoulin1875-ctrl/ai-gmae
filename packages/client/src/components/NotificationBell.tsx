import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api';
import { GameNotification } from '../types/military';

interface NotificationBellProps {
  refreshTrigger?: number;
}

const TYPE_ICONS: Record<string, string> = {
  BATTLE: '⚔️',
  POLICY: '📜',
  RECRUIT: '🪣',
  ECONOMY: '💰',
  SYSTEM: '⚙️',
  AI_ORDER: '🤖',
};

const NotificationBell: React.FC<NotificationBellProps> = ({ refreshTrigger }) => {
  const [notifications, setNotifications] = useState<GameNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiFetch('/api/notifications?limit=30');
      if (res.ok) {
        const data = await res.json();
        if (data.notifications) {
          setNotifications(data.notifications);
        }
      }
    } catch (err) {
      console.error('載入通知失敗', err);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => {
      fetchNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      fetchNotifications();
    }
  }, [refreshTrigger, fetchNotifications]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (id: string) => {
    try {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
    } catch (err) {
      console.error('標記已讀失敗', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      setLoading(true);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
    } catch (err) {
      console.error('全部標記已讀失敗', err);
    } finally {
      setLoading(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={popoverRef}>
      <button
        type="button"
        className="btn-secondary"
        style={{
          position: 'relative',
          padding: '0.4rem 0.75rem',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
        }}
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        title="通知中心"
      >
        <span>🔔</span>
        <span>通知</span>
        {unreadCount > 0 && (
          <span
            style={{
              backgroundColor: '#ef4444',
              color: '#ffffff',
              borderRadius: '10px',
              padding: '0.1rem 0.45rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '360px',
            maxHeight: '480px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--accent-gold)',
            borderRadius: '6px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 1100,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '0.75rem 1rem',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-tertiary)',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>
              🔔 戰情報定通知
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                className="btn-secondary"
                disabled={loading}
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                onClick={handleMarkAllRead}
              >
                全部已讀
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                }}
              >
                尚無戰情通知
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.isRead && handleMarkAsRead(n.id)}
                  style={{
                    padding: '0.625rem 1rem',
                    borderBottom: '1px solid var(--border-color)',
                    backgroundColor: n.isRead ? 'transparent' : 'rgba(201, 168, 107, 0.08)',
                    cursor: n.isRead ? 'default' : 'pointer',
                    transition: 'background-color 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: n.isRead ? 500 : 700, color: 'var(--text)' }}>
                      {TYPE_ICONS[n.type] || '📌'} {n.title}
                    </span>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.1rem 0.35rem',
                        borderRadius: '3px',
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--accent-gold)',
                      }}
                    >
                      第 {n.turn} 回合
                    </span>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.8rem',
                      color: n.isRead ? 'var(--text-muted)' : 'var(--text)',
                      lineHeight: '1.4',
                    }}
                  >
                    {n.message}
                  </p>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                    {new Date(n.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
