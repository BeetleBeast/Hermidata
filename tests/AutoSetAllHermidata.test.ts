import { describe, expect, it } from 'vitest';
import { AutoSetAllHermidata } from '../scripts/shared/utils/AutoSetAllHermidata';
import { HermidataModel } from '../scripts/shared/utils/HermidataSelector';
import type { Hermidata } from '../scripts/shared/types';

function createItem(id: string, title: string): Hermidata {
    const hermidata = HermidataModel.from('Manga', 'Viewing', 'Ongoing');
    hermidata.id = id;
    hermidata.title = title;
    hermidata.SetUrl(`https://site.com/${id}/chapter-1`);
    return hermidata.toJSON();
}

describe('AutoSetAllHermidata.withoutStored', () => {
    it('keeps imported items whose id is free', () => {
        const imported = { a: createItem('a', 'New Series') };
        expect(AutoSetAllHermidata.withoutStored(imported, {})).toEqual(imported);
    });

    it('drops imported items that would replace a stored item', () => {
        const stored = { a: createItem('a', 'Saved Series') };
        const imported = { a: createItem('a', 'Colliding Series'), b: createItem('b', 'New Series') };

        expect(Object.keys(AutoSetAllHermidata.withoutStored(imported, stored))).toEqual(['b']);
    });
});
