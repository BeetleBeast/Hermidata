// vite.content.config.ts
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
    root: resolve(__dirname, 'pages'),
    build: {
        outDir: 'dist',
        emptyOutDir: false,   // ← important, don't wipe the main build
        rollupOptions: {
            input: { content: resolve(__dirname, 'scripts/content/content.ts'), },
            output: { format: 'iife', entryFileNames: 'scripts/content/content.ts' }
        }
    }
})