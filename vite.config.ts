import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
    base: './',  // ← this is the fix, makes all asset paths relative
    build: {
        outDir: 'dist',
        sourcemap: true,       // ← adds .js.map files next to each .js
        minify: false,         // ← keeps function names readable during dev
        rollupOptions: {
            input: {
                // HTML pages — Vite finds the .ts files inside them automatically
                popup:      resolve(__dirname, 'pages/popup.html'),
                settings:   resolve(__dirname, 'pages/settings.html'),
                library:    resolve(__dirname, 'pages/Library.html'),
                info:       resolve(__dirname, 'pages/Hermidata.html'),
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
