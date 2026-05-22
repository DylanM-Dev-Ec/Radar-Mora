import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Radar Mora]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, maxWidth: 560, margin: '40px auto' }}>
          <h2 style={{ color: '#dc3545', marginBottom: 12 }}>Error al cargar la vista</h2>
          <p style={{ color: '#666', marginBottom: 16 }}>
            Recarga la página. Si persiste, reinicia el servidor de desarrollo.
          </p>
          <pre style={{ fontSize: 12, background: '#f5f5f5', padding: 12, borderRadius: 8, overflow: 'auto' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
