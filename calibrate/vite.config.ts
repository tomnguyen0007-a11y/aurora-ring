import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' so the built app works on GitHub Pages subpaths and any static host
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
