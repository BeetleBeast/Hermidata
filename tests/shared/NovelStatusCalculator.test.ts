import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../scripts/shared/constants';
import { resolveAutoSetStatusMode } from '../../scripts/shared/utils/SettingsValues';
import type { AutoSetStatusMode, Feed, Hermidata, Settings } from '../../scripts/shared/types';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';

const storage = vi.hoisted(() => ({
    getSettings: vi.fn(),
    getAllHermidata: vi.fn(),
    saveAllHermidata: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../scripts/shared/db/Storage', () => storage);

import {
    DEFAULT_STATUS_THRESHOLDS,
    FALLBACK_STATUS_THRESHOLD,
    applyNovelStatusUpdates,
    evaluateStatus,
    lastActivityAt,
    type StatusInput,
} from '../../scripts/shared/utils/NovelStatusCalculator';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-24T12:00:00Z');
const daysAgo = (days: number) => NOW - days * DAY;

const input = (overrides: Partial<StatusInput>): StatusInput => ({
    status: 'Ongoing',
    novelType: 'Webnovel',
    lastActivity: daysAgo(0),
    now: NOW,
    ...overrides,
});

describe('evaluateStatus', () => {
    it('keeps an active novel and says when the next status is due', () => {
        expect(evaluateStatus(input({ lastActivity: daysAgo(10) }))).toEqual({
            kind: 'keep', status: 'Ongoing', inactiveDays: 10, next: { status: 'Hiatus', inDays: 20 },
        });
    });

    it('moves an ongoing novel to hiatus once the threshold is reached', () => {
        expect(evaluateStatus(input({ lastActivity: daysAgo(30) }))).toMatchObject({ kind: 'change', from: 'Ongoing', to: 'Hiatus', inactiveDays: 30 });
    });

    it('jumps straight to canceled when both thresholds have passed', () => {
        expect(evaluateStatus(input({ lastActivity: daysAgo(400) }))).toMatchObject({ kind: 'change', from: 'Ongoing', to: 'Canceled' });
    });

    it('moves hiatus on to canceled', () => {
        expect(evaluateStatus(input({ status: 'Hiatus', lastActivity: daysAgo(365) }))).toMatchObject({ kind: 'change', from: 'Hiatus', to: 'Canceled' });
    });

    it('never moves a status back', () => {
        expect(evaluateStatus(input({ status: 'Canceled', lastActivity: daysAgo(1) }))).toEqual({
            kind: 'keep', status: 'Canceled', inactiveDays: 1, next: null,
        });
    });

    it('treats a missing status as ongoing', () => {
        expect(evaluateStatus(input({ status: undefined, lastActivity: daysAgo(30) }))).toMatchObject({ kind: 'change', from: 'Ongoing', to: 'Hiatus' });
    });

    it.each(['Completed', 'Reading', 'Dropped by author'])('skips status %s instead of throwing', (status) => {
        expect(evaluateStatus(input({ status, lastActivity: daysAgo(5000) }))).toMatchObject({ kind: 'skip' });
    });

    it('skips a novel without an activity date', () => {
        expect(evaluateStatus(input({ lastActivity: null }))).toEqual({ kind: 'skip', reason: 'no activity date' });
    });

    it('uses the fallback thresholds for a type the user added', () => {
        const days = FALLBACK_STATUS_THRESHOLD.Hiatus;
        expect(evaluateStatus(input({ novelType: 'Light Novel', lastActivity: daysAgo(days - 1) }))).toMatchObject({ kind: 'keep' });
        expect(evaluateStatus(input({ novelType: 'Light Novel', lastActivity: daysAgo(days) }))).toMatchObject({ kind: 'change', to: 'Hiatus' });
    });

    it('finds the thresholds of a type stored under its folder alias', () => {
        const typeAliases = { Novel: 'Light Novels' };
        expect(evaluateStatus(input({ novelType: 'Light Novels', typeAliases, lastActivity: daysAgo(200) }))).toMatchObject({ kind: 'keep' });
    });

    it('never sets a status the user removed from their list', () => {
        const availableStatuses = ['Ongoing', 'Completed', 'Canceled'];
        expect(evaluateStatus(input({ availableStatuses, lastActivity: daysAgo(100) }))).toMatchObject({ kind: 'keep', next: { status: 'Canceled' } });
        expect(evaluateStatus(input({ availableStatuses, lastActivity: daysAgo(365) }))).toMatchObject({ kind: 'change', to: 'Canceled' });
    });

    it('counts an activity date in the future as zero days', () => {
        expect(evaluateStatus(input({ lastActivity: NOW + 5 * DAY }))).toMatchObject({ kind: 'keep', inactiveDays: 0 });
    });

    it('has every default hiatus come before its canceled', () => {
        for (const threshold of Object.values(DEFAULT_STATUS_THRESHOLDS)) expect(threshold.Hiatus).toBeLessThan(threshold.Canceled);
        expect(FALLBACK_STATUS_THRESHOLD.Hiatus).toBeLessThan(FALLBACK_STATUS_THRESHOLD.Canceled);
    });
});

function feed(pubDate: Date | string | undefined): Feed {
    return { latestItem: pubDate === undefined ? undefined : { pubDate } } as unknown as Feed;
}

function createItem(id: string, { status = 'Ongoing', type = 'Webnovel', rss = [] as Feed[], lastChecked = new Date(daysAgo(0)).toISOString() } = {}): Hermidata {
    const hermidata = HermidataModel.from(type, 'Viewing', status).toJSON();
    hermidata.id = id;
    hermidata.title = `Title ${id}`;
    hermidata.rss = rss;
    hermidata.chapter.lastChecked = lastChecked;
    hermidata.meta.updated = new Date(daysAgo(0)).toISOString();
    return hermidata;
}

describe('lastActivityAt', () => {
    it('uses the newest RSS item across feeds, whether stored as a Date or a string', () => {
        const item = createItem('a', { rss: [feed(new Date(daysAgo(40))), feed(new Date(daysAgo(10)).toISOString()), feed(undefined)] });
        expect(lastActivityAt(item, 'rss')).toBe(daysAgo(10));
    });

    it('has no RSS date when no feed has a latest item', () => {
        expect(lastActivityAt(createItem('a', { rss: [feed(undefined)] }), 'rss')).toBeNull();
    });

    it('adds the last chapter check in "all" mode, but never meta.updated', () => {
        const item = createItem('a', { rss: [feed(new Date(daysAgo(40)))], lastChecked: new Date(daysAgo(20)).toISOString() });
        expect(lastActivityAt(item, 'rss')).toBe(daysAgo(40));
        expect(lastActivityAt(item, 'all')).toBe(daysAgo(20));
    });

    it('ignores dates that do not parse', () => {
        expect(lastActivityAt(createItem('a', { lastChecked: 'not a date' }), 'all')).toBeNull();
    });
});

describe('resolveAutoSetStatusMode', () => {
    it.each([
        [{ mode: 'rss' }, 'rss'],
        [{ mode: 'nonsense' }, 'off'],
        [{ onlyRSS: false, allowAllDateFields: true }, 'all'],
        [undefined, 'off'],
        ['rss', 'off'],
    ])('reads %o as %s', (value, mode) => {
        expect(resolveAutoSetStatusMode(value)).toBe(mode);
    });
});

describe('applyNovelStatusUpdates', () => {
    const settingsWith = (mode: AutoSetStatusMode): Settings => ({
        ...defaultSettings,
        ExtensionBehaviour: { ...defaultSettings.ExtensionBehaviour, AutoSetStatusScore: { mode } },
    });

    beforeEach(() => {
        storage.getSettings.mockReset();
        storage.getAllHermidata.mockReset();
        storage.saveAllHermidata.mockClear();
    });

    it('does nothing when turned off', async () => {
        storage.getSettings.mockResolvedValue(settingsWith('off'));

        expect(await applyNovelStatusUpdates(NOW)).toEqual([]);
        expect(storage.getAllHermidata).not.toHaveBeenCalled();
    });

    it('saves only the changed entries, in one batch', async () => {
        storage.getSettings.mockResolvedValue(settingsWith('rss'));
        storage.getAllHermidata.mockResolvedValue({
            stale: createItem('stale', { rss: [feed(new Date(daysAgo(45)))] }),
            fresh: createItem('fresh', { rss: [feed(new Date(daysAgo(2)))] }),
            unlinked: createItem('unlinked'),
            done: createItem('done', { status: 'Completed', rss: [feed(new Date(daysAgo(900)))] }),
        });

        const changes = await applyNovelStatusUpdates(NOW);

        expect(changes).toMatchObject([{ id: 'stale', from: 'Ongoing', to: 'Hiatus', inactiveDays: 45 }]);
        expect(storage.saveAllHermidata).toHaveBeenCalledOnce();
        const saved: Hermidata[] = storage.saveAllHermidata.mock.calls[0][0];
        expect(saved.map(entry => [entry.id, entry.meta.novelStatus])).toEqual([['stale', 'Hiatus']]);
    });

    it('skips a broken entry and still updates the rest', async () => {
        storage.getSettings.mockResolvedValue(settingsWith('all'));
        const broken = { id: 'broken', meta: null } as unknown as Hermidata;
        storage.getAllHermidata.mockResolvedValue({
            broken,
            stale: createItem('stale', { lastChecked: new Date(daysAgo(400)).toISOString() }),
        });

        const changes = await applyNovelStatusUpdates(NOW);

        expect(changes).toMatchObject([{ id: 'stale', to: 'Canceled' }]);
    });

    it('never throws, even when storage does', async () => {
        storage.getSettings.mockRejectedValue(new Error('db closed'));

        await expect(applyNovelStatusUpdates(NOW)).resolves.toEqual([]);
    });
});
