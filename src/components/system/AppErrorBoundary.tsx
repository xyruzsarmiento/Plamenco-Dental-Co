import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Plamenco page render error]', error, info)
  }

  private retry = () => {
    this.setState({ error: null })
  }

  private reload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <section
          role="alert"
          style={{
            width: 'min(560px, 100%)',
            padding: 28,
            border: '1px solid #e2e8f0',
            borderRadius: 20,
            background: '#fff',
            boxShadow: '0 24px 70px rgba(15, 23, 42, .10)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#2563eb' }}>
            Workspace recovery
          </div>
          <h2 style={{ margin: '8px 0 8px', fontSize: 22, color: '#0f172a' }}>This page hit an unexpected error</h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13, lineHeight: 1.65 }}>
            Your clinic database has not been cleared. Retry the page first; if the same error returns, reload the application.
          </p>
          <details style={{ marginTop: 16, padding: 12, borderRadius: 12, background: '#f8fafc', color: '#475569', fontSize: 12 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Technical details</summary>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '10px 0 0', fontFamily: 'monospace', fontSize: 11 }}>
              {this.state.error.message}
            </pre>
          </details>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
            <button type="button" className="btn btn-primary btn-md" onClick={this.retry}><span>Retry page</span></button>
            <button type="button" className="btn btn-secondary btn-md" onClick={this.reload}><span>Reload application</span></button>
          </div>
        </section>
      </main>
    )
  }
}
