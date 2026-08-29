import path from "path"          // ← adicione esta linha
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'Sistema ERP & PDV',
        short_name: 'ERP Mobile',
        description: 'Sistema de gestão, PDV e entregas.',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        icons: [
          {
            src: '/vite.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/vite.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  // 👇 ADICIONE esta seção resolve
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})