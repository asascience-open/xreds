import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()], 
  server: {
    proxy: {
      '/datasets': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
