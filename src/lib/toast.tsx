import { useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

type ToastType = 'success' | 'danger' | 'warning'
type Toast = { id: number; msg: string; type: ToastType }

let _add: ((msg: string, type?: ToastType) => void) | null = null

export function toast(msg: string, type: ToastType = 'success') {
  _add?.(msg, type)
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const icons = { success: CheckCircle, danger: XCircle, warning: AlertTriangle }

  const add = useCallback((msg: string, type: ToastType = 'success') => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }, [])

  _add = add

  return (
    <div className="toast-wrap">
      {toasts.map(t => {
        const Icon = icons[t.type]
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
