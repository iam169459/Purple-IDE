import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name || 'unknown'}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', padding: 24, gap: 12, color: 'var(--text-secondary)',
          background: 'var(--bg-primary)',
        }}>
          <div style={{ fontSize: 32, opacity: 0.3 }}>!</div>
          <p style={{ fontSize: 13, textAlign: 'center', maxWidth: 300 }}>
            {this.props.name || 'Component'} encountered an error.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '6px 16px', background: 'var(--button-bg)', color: 'var(--button-text)',
              border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
            }}
          >
            Retry
          </button>
          {this.state.error && (
            <code style={{ fontSize: 11, color: 'var(--error-text)', marginTop: 8, maxWidth: 400, wordBreak: 'break-all' }}>
              {this.state.error.message}
            </code>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
