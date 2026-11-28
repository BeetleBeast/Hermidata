import { afterEach, describe, expect, it, vi } from 'vitest';

// The setup file stubs `chrome` only, so the global scope here looks like Chrome: no `browser` global
describe('BrowserCompat', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('falls back to chrome when there is no browser global (Chrome)', async () => {
        const { browserApi, ext } = await import('../../scripts/shared/utils/BrowserCompat');

        expect('browser' in globalThis).toBe(false);
        expect(browserApi).toBeUndefined();
        expect(ext).toBe(globalThis.chrome);
    });

    it('prefers the browser global when it exists (Firefox)', async () => {
        const firefox = { runtime: { id: 'firefox' } };
        vi.stubGlobal('browser', firefox);

        const { browserApi, ext } = await import('../../scripts/shared/utils/BrowserCompat');

        expect(browserApi).toBe(firefox);
        expect(ext).toBe(firefox);
    });

    it('loads the content script feed detection without a browser global', async () => {
        await expect(import('../../scripts/content/feedDetection')).resolves.toHaveProperty('FeedDetection');
    });
});
