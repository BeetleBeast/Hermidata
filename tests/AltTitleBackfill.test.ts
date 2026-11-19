import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExternalMatch, Hermidata } from '../scripts/shared/types';

const env = vi.hoisted(() => ({
    enabled: true,
    items: {} as Record<string, any>,
    local: {} as Record<string, unknown>,
    alarms: new Set<string>(),
    failIds: new Set<string>(),
    looked: [] as string[],
}));

vi.mock('../scripts/shared/db/Storage', () => ({
    getAllHermidata: vi.fn(async () => structuredClone(env.items)),
    getSettings: vi.fn(async () => ({ ExtensionBehaviour: { AltTitleLookup: { Enable: env.enabled } } })),
}));
vi.mock('../scripts/shared/utils/BrowserCompat', () => ({
    ext: {
        runtime: { getURL: () => '' },
        storage: {
            local: {
                get: vi.fn(async (key: string) => ({ [key]: structuredClone(env.local[key]) })),
                set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(env.local, structuredClone(values)); }),
            },
        },
    },
}));
vi.mock('../scripts/shared/sync/syncAlarms', () => ({
    backgroundAlarms: () => ({
        create: (name: string) => { env.alarms.add(name); },
        clear: (name: string) => { env.alarms.delete(name); },
        onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
    }),
}));
// the real lookup is tested elsewhere: here it only stores a result on the item, like the real one does
vi.mock('../scripts/background/altTitles', () => ({
    runAltTitleLookup: vi.fn(async (id: string) => {
        env.looked.push(id);
        const status = env.failIds.has(id) ? 'error' : 'matched';
        const external: ExternalMatch = status === 'matched'
            ? { status, source: 'anilist', id: '1', checkedAt: new Date().toISOString() }
            : { status, checkedAt: new Date().toISOString() };
        env.items[id].meta.external = external;
        return status;
    }),
}));

import { BACKFILL_ALARM, countBackfill, resumeBackfill, runBackfillBatch, startBackfill, stopBackfill } from '../scripts/background/altTitleBackfill';
import { BACKFILL_BATCH_SIZE, BACKFILL_STATE_KEY, backfillLabel, backfillMinutes, dueForBackfill, type BackfillState } from '../scripts/shared/lookup/backfill';

function item(id: string, { novelType = 'Manhwa', rss = false, external }: { novelType?: string; rss?: boolean; external?: ExternalMatch } = {}): Hermidata {
    return { id, title: id, novelType, rss: rss ? [{}] : [], meta: { altTitles: [], ...(external ? { external } : {}) } } as unknown as Hermidata;
}
function addItems(count: number, prefix = 'item') {
    for (let index = 0; index < count; index++) env.items[`${prefix}${index}`] = item(`${prefix}${index}`);
}
const state = () => env.local[BACKFILL_STATE_KEY] as BackfillState | undefined;

beforeEach(() => {
    env.enabled = true;
    env.items = {};
    env.local = {};
    env.alarms.clear();
    env.failIds.clear();
    env.looked = [];
});

describe('dueForBackfill', () => {
    const startedAt = Date.parse('2026-11-19T12:00:00.000Z');
    const now = startedAt + 60_000;

    it('looks up items with an RSS feed first and skips what is done or not covered', () => {
        const due = dueForBackfill([
            item('plain'),
            item('feed', { rss: true }),
            item('matched', { external: { status: 'matched', source: 'anilist', id: '1', checkedAt: '2026-01-01T00:00:00.000Z' } }),
            item('anime', { novelType: 'Anime' }),
        ], startedAt, now);
        expect(due.map(entry => entry.id)).toEqual(['feed', 'plain']);
    });

    it('tries an item that failed before this run, but not one that failed during it', () => {
        const due = dueForBackfill([
            item('failedBefore', { external: { status: 'error', checkedAt: '2026-11-18T00:00:00.000Z' } }),
            item('failedNow', { external: { status: 'error', checkedAt: '2026-11-19T12:00:30.000Z' } }),
        ], startedAt, now);
        expect(due.map(entry => entry.id)).toEqual(['failedBefore']);
    });
});

describe('labels', () => {
    it('describes a running, a finished and a stopped backfill', () => {
        expect(backfillLabel({ running: true, total: 300, done: 42, startedAt: '' })).toBe('Looking up alt titles: 42 of 300');
        expect(backfillLabel({ running: false, total: 300, done: 300, startedAt: '' })).toBe('Alt titles looked up for 300 items.');
        expect(backfillLabel({ running: false, total: 300, done: 42, startedAt: '' })).toBe('Stopped at 42 of 300.');
    });
    it('estimates about one minute per batch', () => {
        expect(backfillMinutes(1)).toBe(1);
        expect(backfillMinutes(BACKFILL_BATCH_SIZE * 3 + 1)).toBe(4);
    });
});

describe('backfill batches', () => {
    it('counts the items it would look up', async () => {
        addItems(3);
        env.items.done = item('done', { external: { status: 'matched', source: 'anilist', id: '1', checkedAt: new Date().toISOString() } });
        expect(await countBackfill()).toBe(3);
    });

    it('runs one batch at once, the rest on the alarm, then stops the alarm', async () => {
        addItems(BACKFILL_BATCH_SIZE + 2);
        await startBackfill();
        await runBackfillBatch(); // joins the batch the start began
        expect(state()).toMatchObject({ running: true, total: BACKFILL_BATCH_SIZE + 2, done: BACKFILL_BATCH_SIZE });
        expect(env.alarms.has(BACKFILL_ALARM)).toBe(true);

        await runBackfillBatch(); // the next alarm
        expect(state()).toMatchObject({ running: false, total: BACKFILL_BATCH_SIZE + 2, done: BACKFILL_BATCH_SIZE + 2 });
        expect(env.alarms.has(BACKFILL_ALARM)).toBe(false);
        expect(new Set(env.looked).size).toBe(BACKFILL_BATCH_SIZE + 2);
    });

    it('ends a batch at the first failed lookup and does not retry that item in the same run', async () => {
        addItems(5);
        env.failIds.add('item1');
        await startBackfill();
        await runBackfillBatch();
        expect(env.looked).toEqual(['item0', 'item1']);
        expect(state()).toMatchObject({ running: true, done: 2 });

        await runBackfillBatch();
        expect(env.looked).toEqual(['item0', 'item1', 'item2', 'item3', 'item4']);
        expect(state()).toMatchObject({ running: false, done: 5, total: 5 });
    });

    it('does nothing when there is nothing to look up', async () => {
        const started = await startBackfill();
        expect(started).toMatchObject({ running: false, total: 0 });
        expect(env.alarms.size).toBe(0);
    });

    it('stops when the setting was switched off, keeping how far it got', async () => {
        addItems(BACKFILL_BATCH_SIZE + 2);
        await startBackfill();
        await runBackfillBatch();
        expect(state()?.done).toBe(BACKFILL_BATCH_SIZE);

        env.enabled = false;
        await runBackfillBatch();
        expect(state()).toMatchObject({ running: false, done: BACKFILL_BATCH_SIZE });
        expect(env.alarms.has(BACKFILL_ALARM)).toBe(false);
        expect(env.looked).toHaveLength(BACKFILL_BATCH_SIZE);
    });

    it('stops on request', async () => {
        env.local[BACKFILL_STATE_KEY] = { running: true, total: 10, done: 3, startedAt: new Date().toISOString() };
        env.alarms.add(BACKFILL_ALARM);
        await stopBackfill();
        expect(state()).toMatchObject({ running: false, done: 3 });
        expect(env.alarms.has(BACKFILL_ALARM)).toBe(false);
    });

    it('carries on with an unfinished backfill after a restart', async () => {
        addItems(3);
        env.local[BACKFILL_STATE_KEY] = { running: true, total: 3, done: 0, startedAt: new Date().toISOString() };
        await resumeBackfill();
        await runBackfillBatch();
        expect(state()).toMatchObject({ running: false, done: 3 });
    });
});
