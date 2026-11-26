import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Filters } from '../../scripts/shared/types/index';
import { SortLogic } from '../../scripts/rss/build/SortLogic';

vi.mock('../../scripts/rss/build', () => ({
    RssBuild: class {},
}));
vi.mock('../../scripts/shared/db/Storage', () => ({
    getLastFilter: vi.fn(),
    setLastFilter: vi.fn(),
}));

type FakeRow = { dataset: { state: string } };
type SortLogicUnderTest = {
    selectSort: (cb: unknown, label: string, filters: Filters) => void;
    applySortToEntries: ReturnType<typeof vi.fn>;
};

const SORTS = ['Alphabet', 'Novel-Type', 'Recently-Added', 'Latest-Updates'] as const;

function setup(sort: Filters['sort']) {
    const rows: FakeRow[] = SORTS.map(() => ({ dataset: { state: '0' } }));
    const section = { querySelectorAll: () => rows };
    // selectSort is private: the prototype is reached through a type that exposes it, with the DOM-touching steps replaced
    const logic: SortLogicUnderTest = Object.assign(Object.create(SortLogic.prototype), {
        applySortToEntries: vi.fn(),
        applySortToNotification: vi.fn(),
        updateFilterButton: vi.fn(),
    });
    const filters: Filters = { include: {}, exclude: {}, sort };
    const click = (index: number) => {
        const cb = Object.assign(rows[index], { closest: () => section });
        logic.selectSort(cb, SORTS[index], filters);
    };
    return { rows, filters, click, logic };
}

describe('RSS sort selection', () => {
    let ctx: ReturnType<typeof setup>;
    beforeEach(() => { ctx = setup('Alphabet'); });

    const states = () => ctx.rows.map(row => row.dataset.state);

    it('selects another option and unselects the previous one', () => {
        ctx.click(2);
        expect(ctx.filters.sort).toBe('Recently-Added');
        expect(states()).toEqual(['0', '0', '1', '0']);
        expect(ctx.logic.applySortToEntries).toHaveBeenCalledWith('Recently-Added');
    });

    it('reverses the active option when it is picked again', () => {
        ctx.click(0);
        expect(ctx.filters.sort).toBe('Reverse-Alphabet');
        expect(states()).toEqual(['2', '0', '0', '0']);
    });

    it('flips back to ascending on a third pick and never ends up with nothing selected', () => {
        ctx.click(0);
        ctx.click(0);
        expect(ctx.filters.sort).toBe('Alphabet');
        expect(states()).toEqual(['1', '0', '0', '0']);
        for (let pick = 0; pick < 9; pick++) {
            ctx.click(pick % SORTS.length);
            expect(ctx.filters.sort).not.toBe('');
            expect(states().filter(state => state !== '0')).toHaveLength(1);
        }
    });

    it('starts ascending when a reversed sort is replaced by another option', () => {
        ctx.click(0);
        ctx.click(1);
        expect(ctx.filters.sort).toBe('Novel-Type');
        expect(states()).toEqual(['0', '1', '0', '0']);
    });
});
