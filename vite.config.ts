
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // IMPORTANT: Change 'rigomator' to your exact repository name if it is different
  base: '/rigomator/', 
  server: {
    host: true
  },
  build: {
    target: 'esnext' // Optimizes for modern browsers, required for some WASM features
  }
})
