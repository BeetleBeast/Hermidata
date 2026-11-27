import { afterEach, describe, expect, it, vi } from 'vitest';
import { withViewTransition } from '../../scripts/shared/utils/PageTransition';

function stubTransition(startViewTransition?: (update: () => void) => unknown, reducedMotion = false) {
    vi.stubGlobal('document', startViewTransition ? { startViewTransition } : {});
    vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
}

afterEach(() => vi.unstubAllGlobals());

describe('withViewTransition', () => {
    it('applies the change straight away when the browser has no View Transition API', async () => {
        stubTransition();
        const update = vi.fn();

        await withViewTransition(update);

        expect(update).toHaveBeenCalledOnce();
    });

    it('skips the animation when the user prefers reduced motion', async () => {
        const start = vi.fn();
        stubTransition(start, true);
        const update = vi.fn();

        await withViewTransition(update);

        expect(start).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledOnce();
    });

    it('hands the change to the browser and resolves once it was applied', async () => {
        const update = vi.fn();
        stubTransition(cb => {
            cb();
            return {
                ready: Promise.reject(new Error('skipped')),
                finished: Promise.reject(new Error('skipped')),
                updateCallbackDone: Promise.resolve(),
            };
        });

        await expect(withViewTransition(update)).resolves.toBeUndefined();

        expect(update).toHaveBeenCalledOnce();
    });
});
