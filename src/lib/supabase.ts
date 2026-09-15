// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltam as variáveis de ambiente do Supabase.');
}

const REMEMBER_SESSION_KEY = 'orbita:remember-session';

function armazenamentosDoNavegador() {
  if (typeof window === 'undefined') return { local: null, session: null };
  return { local: window.localStorage, session: window.sessionStorage };
}

/**
 * Define onde o Supabase guardará a próxima sessão:
 * - `true`: localStorage, preservada após fechar o navegador;
 * - `false`: sessionStorage, apagada quando a sessão do navegador termina.
 */
export function definirPersistenciaDaSessao(lembrar: boolean) {
  const { local } = armazenamentosDoNavegador();
  if (!local) return;
  if (lembrar) {
    local.setItem(REMEMBER_SESSION_KEY, 'true');
  } else {
    local.removeItem(REMEMBER_SESSION_KEY);
  }
}

const armazenamentoDaSessao = {
  getItem: (key: string) => {
    const { local, session } = armazenamentosDoNavegador();
    return session?.getItem(key) ?? local?.getItem(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    const { local, session } = armazenamentosDoNavegador();
    if (!local || !session) return;
    const persistir = local.getItem(REMEMBER_SESSION_KEY) === 'true';
    const destino = persistir ? local : session;
    const outro = persistir ? session : local;
    outro.removeItem(key);
    destino.setItem(key, value);
  },
  removeItem: (key: string) => {
    const { local, session } = armazenamentosDoNavegador();
    local?.removeItem(key);
    session?.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: armazenamentoDaSessao,
    persistSession: true,
    autoRefreshToken: true,
  },
});
