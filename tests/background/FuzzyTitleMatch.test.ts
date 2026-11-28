import { describe, expect, it, vi } from 'vitest';
import { HermidataModel } from '../../scripts/shared/utils/HermidataSelector';

vi.mock('../../scripts/background/bookmarks', () => ({ findNestedFolder: vi.fn(), getBookmarkChildren: vi.fn() }));
vi.mock('../../scripts/background/state', () => ({ setState: {}, settingsCashed: null }));
vi.mock('../../scripts/shared/db/Storage', () => ({ getSettings: vi.fn() }));

import { bestTitleSimilarity } from '../../scripts/background/fuzzy';

function createHermidata(title: string, altTitles: string[]): HermidataModel {
    const hermidata = HermidataModel.from('Manga', 'Viewing', 'Ongoing');
    hermidata.title = title;
    hermidata.meta.altTitles = altTitles;
    return hermidata;
}

describe('bestTitleSimilarity', () => {
    it('matches on the title of an item without alt titles', () => {
        const hermidata = createHermidata('Solo Leveling', []);

        expect(bestTitleSimilarity(hermidata, 'Solo Leveling')).toBe(1);
    });

    it('still matches on the title when the alt titles are unrelated', () => {
        const hermidata = createHermidata('Solo Leveling', ['Na Honjaman Level Up']);

        expect(bestTitleSimilarity(hermidata, 'Solo Leveling')).toBe(1);
    });

    it('keeps the best score across the title and every alt title', () => {
        const hermidata = createHermidata('Na Honjaman Level Up', ['Something Else', 'Solo Leveling']);

        expect(bestTitleSimilarity(hermidata, 'Solo Leveling')).toBe(1);
    });

    it('scores below the match threshold when no title is close', () => {
        const hermidata = createHermidata('Solo Leveling', ['Na Honjaman Level Up']);

        expect(bestTitleSimilarity(hermidata, 'Omniscient Reader')).toBeLessThan(0.8);
    });
});
