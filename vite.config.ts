import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'CodeScope — локальный анализ кода',
        short_name: 'CodeScope',
        description: 'Статистика, сравнение версий и сниппеты для разработчиков.',
        theme_color: '#080d13',
        background_color: '#080d13',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,woff,woff2,png}'],
        navigateFallback: null,
        runtimeCaching: [{ urlPattern: ({ request }) => request.mode === 'navigate', handler: 'NetworkOnly' }],
      },
    }),
  ],
  server: { port: 3000 },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
