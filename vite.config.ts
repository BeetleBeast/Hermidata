import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                // HTML pages — Vite finds the .ts files inside them automatically
                popup:      resolve(__dirname, 'pages/popup.html'),
                settings:   resolve(__dirname, 'pages/settings.html'),
                RSS:        resolve(__dirname, 'pages/RSSFullpage.html'),
                // Background has no HTML, so it's listed directly
                background: resolve(__dirname, 'scripts/background/background.ts'),
            },
            output: {
                format: 'es',
                entryFileNames: 'scripts/[name].js',
                chunkFileNames: 'scripts/chunks/[name].js',
                assetFileNames: 'assets/[name].[ext]',
            }
        }
    }
})
