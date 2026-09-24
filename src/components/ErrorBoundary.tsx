import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { registrarErroAplicacao } from '../lib/telemetry'

type Props = { children: ReactNode }
type State = { error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void registrarErroAplicacao({
      origem: 'react.error-boundary',
      mensagem: error.message,
      stack: error.stack,
      contexto: { componentStack: info.componentStack?.slice(0, 3000) },
    })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle size={24} />
          </div>
          <h1 className="mt-4 text-xl font-bold">O Órbita encontrou um problema</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            O diagnóstico técnico foi registrado. Recarregue a tela; suas operações pendentes permanecem salvas.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <RefreshCw size={16} /> Recarregar
          </button>
        </section>
      </main>
    )
  }
}

