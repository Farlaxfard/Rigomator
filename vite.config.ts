
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Changed to relative path so it works on any repo name (e.g. /rigomator/ or /my-game/)
  base: './', 
  server: {
    host: true
  },
  build: {
    target: 'esnext' // Optimizes for modern browsers, required for some WASM features
  }
})
