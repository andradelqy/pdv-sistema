// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { instalarCapturaGlobalDeErros } from './lib/telemetry.ts'
import './index.css'

// Uma PWA já instalada pode continuar servindo o bundle de produção mesmo
// com o Vite aberto. Em desenvolvimento removemos apenas o Service Worker;
// localStorage, sessão e fila offline permanecem intactos.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations()
    .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
}

instalarCapturaGlobalDeErros()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Os dados ficam em cache por 5 minutos antes de precisarem ser revalidados
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
