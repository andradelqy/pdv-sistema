import { useState, useCallback, type ReactNode } from 'react'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

type ToastType = 'success' | 'danger' | 'warning'
type Toast = { id: number; msg?: string; type?: ToastType; render?: ReactNode }

let _add: ((toast: Toast) => void) | null = null

export function toast(msg: string, type: ToastType = 'success') {
  _add?.({ id: Date.now(), msg, type })
}

// Suporte para custom toast
toast.custom = (render: ReactNode, opts?: { duration?: number }) => {
  const id = Date.now()
  _add?.({ id, render })
  if (opts?.duration) setTimeout(() => toast.dismiss(), opts.duration)
}

toast.dismiss = () => {}

export function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const icons = { success: CheckCircle, danger: XCircle, warning: AlertTriangle }

  const add = useCallback((t: Toast) => {
    setToasts(prev => [...prev, t])
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3500)
  }, [])

  _add = add

  return (
    <div className="toast-wrap">
      {toasts.map(t => {
        if (t.render) return <div key={t.id}>{t.render}</div>
        const Icon = icons[t.type!]
        return (
          <div key={t.id} className={`toast-item ${t.type}`}>
            <Icon size={16} />
            {t.msg}
          </div>
        )
      })}
    </div>
  )
}
