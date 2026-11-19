import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HermidataModel } from '../scripts/shared/utils/HermidataSelector';
import type { Hermidata } from '../scripts/shared/types';

const store = vi.hoisted(() => ({
    enabled: false,
    items: {} as Record<string, unknown>,
    saved: [] as Array<{ key: string; entry: any }>,
}));

vi.mock('../scripts/shared/db/Storage', () => ({
    getSettings: vi.fn(async () => ({ ExtensionBehaviour: { AltTitleLookup: { Enable: store.enabled } } })),
    getHermidataViaKey: vi.fn(async (key: string) => store.items[key] ? structuredClone(store.items[key]) : null),
    saveHermidata: vi.fn(async (key: string, entry: unknown) => { store.saved.push({ key, entry }); }),
}));

import { scheduleAltTitleLookup } from '../scripts/background/altTitles';

const dragonnap = { id: 203800, format: 'MANGA', title: { romaji: 'Dragon-eul Yugoehada', english: 'Dragonnap', native: null }, synonyms: ['Kidnapped Dragons'] };

function saved(id: string, title: string): Hermidata {
    const model = HermidataModel.from('Manhwa', 'Viewing', 'Ongoing');
    model.title = title;
    model.id = id;
    model.meta.altTitles = [title];
    return model.toJSON();
}

const server = () => vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const detail = String(init?.body).includes('Media(id');
    return new Response(JSON.stringify(detail ? { data: { Media: dragonnap } } : { data: { Page: { media: [dragonnap] } } }), { status: 200 });
});

beforeEach(() => {
    store.enabled = false;
    store.items = {};
    store.saved = [];
});

describe('scheduleAltTitleLookup', () => {
    it('sends nothing and saves nothing while the setting is off', async () => {
        const fetcher = server();
        vi.stubGlobal('fetch', fetcher);
        store.items.a = saved('a', 'Kidnapped Dragons');

        scheduleAltTitleLookup('a');
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(fetcher).not.toHaveBeenCalled();
        expect(store.saved).toEqual([]);
    });

    it('adds the alt titles of a saved item once the setting is on', async () => {
        vi.stubGlobal('fetch', server());
        store.enabled = true;
        store.items.b = saved('b', 'Kidnapped Dragons');

        scheduleAltTitleLookup('b');
        await vi.waitFor(() => expect(store.saved).toHaveLength(1), { timeout: 8000 });

        const { key, entry } = store.saved[0];
        expect(key).toBe('b');
        expect(entry.meta.altTitles).toEqual(['Kidnapped Dragons', 'Dragon-eul Yugoehada', 'Dragonnap']);
        expect(entry.meta.external).toMatchObject({ status: 'matched', source: 'anilist', id: '203800' });
    });

    it('survives a server that answers nothing, and keeps the item as it was', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));
        store.enabled = true;
        store.items.c = saved('c', 'Goblin Inc');

        scheduleAltTitleLookup('c');
        await vi.waitFor(() => expect(store.saved).toHaveLength(1), { timeout: 8000 });

        const { entry } = store.saved[0];
        expect(entry.meta.altTitles).toEqual(['Goblin Inc']);
        expect(entry.meta.external.status).toBe('error');
    });
});
