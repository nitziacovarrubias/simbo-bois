import './AppErrorBoundary.css';
import React from 'react';

interface State {
  error?: Error;
}

export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error('SIMBO render error', error);
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="app-error-boundary" role="alert">
        <h1>Algo salió mal al mostrar el diseño.</h1>
        <p>Recarga la página. El guardado local no se elimina por este error.</p>
        {import.meta.env.DEV && (
          <details>
            <summary>Detalle técnico</summary>
            <pre>{this.state.error.message}</pre>
          </details>
        )}
        <button onClick={() => window.location.reload()}>Recargar</button>
      </main>
    );
  }
}
