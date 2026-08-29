import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import Admin from './pages/Admin';
import ErrorBoundary from './components/ErrorBoundary';

const App: React.FC = () => {
  return (
    <ErrorBoundary
      fallback={
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <h2>⚠️ 遊戲發生錯誤</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>請重新整理頁面。</p>
          <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => window.location.reload()}>
            重新整理
          </button>
        </div>
      }
    >
      <Router>
        <div className="app-container">
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/lobby" element={<Lobby />} />
            <Route path="/game/:id" element={<Game />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
