import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

/** Se houver uma versão nova à espera, ativa-a antes de recarregar (evita ficar preso numa versão com erro). */
async function reloadWithFreshVersion() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    const waiting = reg?.waiting;
    if (waiting) {
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      waiting.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => location.reload(), 3000);
      return;
    }
  } catch {
    /* sem service worker: recarrega normalmente */
  }
  location.reload();
}

interface State {
  error: Error | null;
}

/** Impede que um erro num ecrã deixe a aplicação em branco. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro na interface', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card card-pad" role="alert">
        <div className="empty">
          <span className="empty-icon" style={{ background: 'var(--st-pendente-bg)', color: 'var(--st-pendente)' }}>
            <TriangleAlert aria-hidden />
          </span>
          <h3>Algo correu mal neste ecrã</h3>
          <p>Os seus dados estão seguros neste dispositivo. Tente recarregar; se o problema persistir, exporte uma cópia de segurança nas Definições.</p>
          <p className="tiny subtle" style={{ fontFamily: 'ui-monospace, monospace' }}>
            {this.state.error.message}
          </p>
          <button type="button" className="btn primary" onClick={() => void reloadWithFreshVersion()}>
            <RefreshCw aria-hidden /> Recarregar
          </button>
        </div>
      </div>
    );
  }
}
