import React from 'react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
  onError?: (error: Error, info: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Kasumi] Unhandled error in component tree:', error, info)
    this.props.onError?.(error, info)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', minHeight: 200, padding: 32, textAlign: 'center',
          background: '#fff8f8', border: '1px solid #ffcdd2', borderRadius: 8, margin: 16,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#c62828', marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 16, maxWidth: 400 }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '6px 16px', background: '#1b5e20', color: 'white',
              border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Lightweight functional wrapper for common use
export function WithErrorBoundary({ children, name }: { children: React.ReactNode; name?: string }) {
  return (
    <ErrorBoundary
      onError={(err) => console.error(`[${name ?? 'Component'}] Error:`, err)}
    >
      {children}
    </ErrorBoundary>
  )
}
