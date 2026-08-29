import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Generic error boundary. Prevents a crash in any subtree (e.g. the
 * WebGL map) from unmounting the ENTIRE React app to a blank/black
 * screen — which is what happens by default when an error is thrown
 * during render/effects with no boundary present.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
            }}
          >
            <p>⚠️ 這個區塊載入失敗，但遊戲其他部分仍正常運作。</p>
            <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
              {this.state.error?.message}
            </p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
