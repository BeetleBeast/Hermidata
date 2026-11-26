import { beforeEach, describe, expect, it, vi } from 'vitest';

const dnr = vi.hoisted(() => ({ api: undefined as undefined | { updateSessionRules: ReturnType<typeof vi.fn> } }));

vi.mock('../../scripts/shared/utils/BrowserCompat', () => ({
    ext: {
        get declarativeNetRequest() { return dnr.api; },
        runtime: { getURL: (path: string) => `chrome-extension://abcdefghijklmnop/${path}` },
    },
}));

import { allowMangaUpdatesRequests } from '../../scripts/background/mangaUpdatesRequests';

beforeEach(() => {
    dnr.api = { updateSessionRules: vi.fn(async () => {}) };
});

describe('allowMangaUpdatesRequests', () => {
    it("removes the Origin header from this extension's own requests to the MangaUpdates API only", async () => {
        await allowMangaUpdatesRequests();

        const update = dnr.api!.updateSessionRules.mock.calls[0][0];
        expect(update.removeRuleIds).toEqual([1]); // replaces the rule on every start, never stacks it
        expect(update.addRules).toHaveLength(1);
        const [rule] = update.addRules;
        expect(rule.action).toEqual({ type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] });
        expect(rule.condition.requestDomains).toEqual(['api.mangaupdates.com']);
        expect(rule.condition.initiatorDomains).toEqual(['abcdefghijklmnop']);
    });

    it('does not throw when the API is missing or fails', async () => {
        dnr.api = undefined;
        await expect(allowMangaUpdatesRequests()).resolves.toBeUndefined();

        dnr.api = { updateSessionRules: vi.fn(async () => { throw new Error('invalid rule'); }) };
        await expect(allowMangaUpdatesRequests()).resolves.toBeUndefined();
    });
});
