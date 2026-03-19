// vite.content.config.ts
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: false,   // ← important, don't wipe the main build
        sourcemap: true,       // ← adds .js.map files next to each .js
        minify: false,         // ← keeps function names readable during dev
        rollupOptions: {
            input: { content: resolve(__dirname, 'scripts/content/content.ts'), },
            output: { format: 'iife', entryFileNames: 'scripts/[name].js', chunkFileNames: 'scripts/chunks/[name].js', assetFileNames: 'assets/[name].[ext]' }
        }
    }
})