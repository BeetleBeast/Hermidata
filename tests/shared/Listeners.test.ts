import { describe, expect, it, vi } from 'vitest';
import { renewListeners } from '../../scripts/shared/utils/Listeners';

describe('renewListeners', () => {
    it('replaces the listeners of the previous run instead of adding to them', () => {
        const button = new EventTarget();
        const handler = vi.fn();

        for (let run = 0; run < 3; run++) button.addEventListener('click', () => handler(run), { signal: renewListeners(button, 'setup') });
        button.dispatchEvent(new Event('click'));

        expect(handler).toHaveBeenCalledOnce();
        expect(handler).toHaveBeenCalledWith(2);          // the newest run's listener, with its own state
    });

    it('keeps separate names apart', () => {
        const button = new EventTarget();
        const first = vi.fn();
        const second = vi.fn();

        button.addEventListener('click', first, { signal: renewListeners(button, 'one') });
        button.addEventListener('click', second, { signal: renewListeners(button, 'two') });
        button.dispatchEvent(new Event('click'));

        expect(first).toHaveBeenCalledOnce();
        expect(second).toHaveBeenCalledOnce();
    });
});
