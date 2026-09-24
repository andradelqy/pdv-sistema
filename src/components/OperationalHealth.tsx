import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

type AppError = {
  id: number
  fingerprint: string
  origem: string
  mensagem: string
  versao: string
  criado_em: string
}

export function OperationalHealth() {
  const [errors, setErrors] = useState<AppError[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('erros_aplicacao')
      .select('id,fingerprint,origem,mensagem,versao,criado_em')
      .order('criado_em', { ascending: false })
      .limit(20)
    setLoading(false)
    if (error) {
      setUnavailable(true)
      return
    }
    setUnavailable(false)
    setErrors((data ?? []) as AppError[])
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  const last24h = useMemo(() => {
    const since = Date.now() - 24 * 60 * 60 * 1000
    return errors.filter(item => new Date(item.criado_em).getTime() >= since)
  }, [errors])

  return (
    <section className="card-adega overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <div>
          <h3 className="flex items-center gap-2 font-semibold"><Activity size={17} /> Saúde da aplicação</h3>
          <p className="mt-1 text-xs text-muted-foreground">Falhas técnicas sanitizadas registradas para esta loja.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border p-2 text-muted-foreground hover:text-foreground disabled:opacity-50" aria-label="Atualizar saúde da aplicação">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {unavailable ? (
        <p className="p-4 text-sm text-muted-foreground">Monitoramento interno aguardando a migration de produção.</p>
      ) : !errors.length ? (
        <p className="p-4 text-sm text-success">Nenhuma falha técnica registrada.</p>
      ) : (
        <div>
          <div className="grid grid-cols-2 gap-3 border-b p-4 text-sm">
            <div><span className="text-muted-foreground">Últimas 24h</span><strong className="ml-2">{last24h.length}</strong></div>
            <div><span className="text-muted-foreground">Tipos distintos</span><strong className="ml-2">{new Set(last24h.map(item => item.fingerprint)).size}</strong></div>
          </div>
          <div className="max-h-64 divide-y overflow-y-auto">
            {errors.map(item => (
              <div key={item.id} className="p-4 text-sm">
                <div className="flex flex-wrap justify-between gap-2"><strong>{item.origem}</strong><span className="text-xs text-muted-foreground">{new Date(item.criado_em).toLocaleString('pt-BR')} · v{item.versao}</span></div>
                <p className="mt-1 break-words text-muted-foreground">{item.mensagem}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

