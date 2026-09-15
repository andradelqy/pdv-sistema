import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Bundles PWA são código de terceiros gerado pelo build. A cópia antiga da
  // tela de entregas não é importada pelo aplicativo e fica fora do escopo do
  // código executável até ser removida em uma limpeza de histórico separada.
  globalIgnores(['dist', 'dev-dist', 'src/pages/EntregasPDV - Copia.tsx']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Há contratos legados amplos no PDV. Mantemos-os visíveis como aviso
      // durante a migração incremental para tipos específicos, sem bloquear CI.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'react-refresh/only-export-components': 'off',
      // O projeto ainda não usa o React Compiler. Estas regras exigem uma
      // reestruturação arquitetural dos hooks e não representam falha de
      // execução; os efeitos continuam cobertos por exhaustive-deps.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
    },
  },
])
