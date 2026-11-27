import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openLink } from '../../scripts/shared/utils/StringOutput';

const assign = vi.fn();
const update = vi.fn().mockResolvedValue(undefined);
const chromeStub = chrome as unknown as { tabs?: unknown };

beforeEach(() => {
    vi.stubGlobal('window', { location: { assign } });
    chromeStub.tabs = { update };
});

afterEach(() => {
    vi.unstubAllGlobals();
    assign.mockClear();
    update.mockClear();
    delete chromeStub.tabs;
});

describe('openLink in the sameTab', () => {
    it('navigates an extension page from the page itself so the view transition can play', async () => {
        await openLink('./Overview.html#/id/7', 'sameTab');

        expect(assign).toHaveBeenCalledWith('chrome-extension://test-extension-id/dist/pages/./Overview.html#/id/7');
        expect(update).not.toHaveBeenCalled();
    });

    it('leaves an external page to the browser tab', async () => {
        await openLink('https://example.com/ch-1', 'sameTab');

        expect(assign).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledWith({ url: 'https://example.com/ch-1', active: true });
    });

    it('leaves a page with a scroll position to restore to the browser tab', async () => {
        await openLink('Library.html', 'sameTab', 300);

        expect(assign).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledOnce();
    });
});
