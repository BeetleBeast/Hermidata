import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
    root: resolve(__dirname, 'pages'),
    build: {
        outDir: 'dist',
        rollupOptions: {
        input: {
            background: resolve(__dirname, 'scripts/background/background.ts'),
            popup:      resolve(__dirname, 'scripts/popup/in/main.ts'),
            settings:   resolve(__dirname, 'scripts/settings/Settings.ts'),
            RSS:        resolve(__dirname, 'scripts/rssPage/RSS.ts'),
        },
        output: {
            format: 'es',
            entryFileNames: 'scripts/popup/in/main.ts',
        }
        }
    }
})
