import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
    build: {
        outDir: 'dist',
        rollupOptions: {
        input: {
            background: resolve(__dirname, 'src/background.ts'),
            content:    resolve(__dirname, 'src/content.ts'),
            popup:      resolve(__dirname, 'src/popup/popup.ts'),
            settings:   resolve(__dirname, 'src/settings/settings.ts'),
            RSS:        resolve(__dirname, 'src/RSS.ts'),
        },
        output: {
            // Content scripts MUST be IIFE — no ES modules allowed
            format: 'es',
            entryFileNames: 'scripts/popup/in/main.js',
        }
        }
    }
})
