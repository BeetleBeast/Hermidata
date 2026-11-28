// Confirm messages carry titles from pages and feeds, so the dialog shows them as text and never parses HTML.

import { describe, expect, it, vi } from 'vitest';
import type { RawFeed } from '../../scripts/shared/types';

/** A node made by the fake document: what the dialog and the preview builder set on it */
class FakeNode extends EventTarget {
    readonly children: unknown[] = [];
    readonly style: Record<string, string> = {};
    readonly attributes: Record<string, string> = {};
    textContent = '';
    id = '';
    className = '';
    src = '';
    alt = '';
    href = '';
    target = '';
    rel = '';
    readonly tagName: string;
    constructor(tagName = '') { super(); this.tagName = tagName; }
    set innerHTML(_html: string) { throw new Error('innerHTML must not be used'); }
    append(...nodes: unknown[]) { this.children.push(...nodes); }
    replaceChildren(...nodes: unknown[]) { this.children.splice(0, this.children.length, ...nodes); }
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    focus() {}
}

vi.stubGlobal('document', {
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: { classList: { add: vi.fn(), remove: vi.fn() } },
    createElement: (tag: string) => new FakeNode(tag),
    createDocumentFragment: () => new FakeNode('#fragment'),
});

import { customConfirm } from '../../scripts/popup/frontend/confirm';
import { buildSubscribePreview } from '../../scripts/rss/build/SubscribePreview';

const HOSTILE = '<img src=x onerror="alert(1)"> Solo Leveling';

function dialog() {
    const elements = { container: new FakeNode(), label: new FakeNode(), btn1: new FakeNode(), btn2: new FakeNode() };
    return { elements, typed: elements as never };   // the dialog's element type is private to confirm.ts
}

describe('customConfirm', () => {
    it('shows a string message and the button labels as text', async () => {
        const { elements, typed } = dialog();
        const answer = customConfirm(`  Remove "${HOSTILE}"?  `, { elements: typed, accept: '<b>Remove</b>', reject: 'Cancel' });

        expect(elements.label.children).toEqual([`Remove "${HOSTILE}"?`]);   // one text node, trimmed, markup and all
        expect(elements.btn1.textContent).toBe('<b>Remove</b>');
        expect(elements.btn2.textContent).toBe('Cancel');

        elements.btn1.dispatchEvent(new Event('click'));
        await expect(answer).resolves.toBe(true);
    });

    it('shows nodes the caller built as they are', async () => {
        const { elements, typed } = dialog();
        const message = new FakeNode('p');
        const answer = customConfirm(message as unknown as Node, { elements: typed });

        expect(elements.label.children).toEqual([message]);

        elements.btn2.dispatchEvent(new Event('click'));
        await expect(answer).resolves.toBe(false);
    });
});

function feed(latestItem: { title: string; link: string }, image: string): RawFeed {
    return { image, latestItem } as unknown as RawFeed;
}

/** Every node in the preview, depth first */
function nodesOf(node: FakeNode): FakeNode[] {
    return node.children.filter((c): c is FakeNode => c instanceof FakeNode).flatMap(c => [c, ...nodesOf(c)]);
}

describe('the auto-subscribe preview', () => {
    it('puts feed titles in as text', () => {
        const preview = buildSubscribePreview('My item', feed({ title: HOSTILE, link: 'https://example.com/c/1' }, 'https://example.com/cover.png')) as unknown as FakeNode;
        const nodes = nodesOf(preview);

        expect(nodes.map(n => n.textContent)).toContain(`title: ${HOSTILE}`);
        const link = nodes.find(n => n.tagName === 'a')!;
        expect(link.textContent).toBe(HOSTILE);
        expect(link.href).toBe('https://example.com/c/1');
        expect(link.rel).toBe('noopener noreferrer');
        const img = nodes.find(n => n.tagName === 'img')!;
        expect(img.src).toBe('https://example.com/cover.png');
        expect(img.alt).toBe(HOSTILE);
    });

    it('leaves out a link or image that is not a web address', () => {
        const preview = buildSubscribePreview('My item', feed({ title: 'Chapter 1', link: 'javascript:alert(1)' }, 'data:image/svg+xml,<svg onload=alert(1)>')) as unknown as FakeNode;
        const tags = nodesOf(preview).map(n => n.tagName);

        expect(tags).not.toContain('a');
        expect(tags).not.toContain('img');
    });
});
