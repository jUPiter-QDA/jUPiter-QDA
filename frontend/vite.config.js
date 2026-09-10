import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

// ESM configs have no __dirname; derive it from this file's own URL.
const configDir = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      // This forces all packages to use your main React installation
      react: path.resolve(configDir, './node_modules/react'),
      'react-dom': path.resolve(configDir, './node_modules/react-dom')
    }
  },
  optimizeDeps: {
    // Helps Vite pre-bundle the panels correctly
    include: ['react-resizable-panels']
  }
})