import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  base: '/anticipated/',
  build: {
    outDir: path.resolve(__dirname, '../demo-dist'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      'anticipated/react': path.resolve(__dirname, '../src/react/index.ts'),
      'anticipated/core': path.resolve(__dirname, '../src/core/index.ts'),
      'anticipated/devtools/react': path.resolve(__dirname, '../src/devtools/react/index.ts'),
      'anticipated/devtools': path.resolve(__dirname, '../src/devtools/index.ts'),
    },
  },
})
