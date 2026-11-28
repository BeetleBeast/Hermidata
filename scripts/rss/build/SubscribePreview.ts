import type { RawFeed } from "../../shared/types/index";

/** A web address from a feed, if it is one: anything else ( javascript:, data: ) is never put in a link or an image */
function webUrl(value: string | undefined): string | null {
    try {
        const url = new URL(value ?? '');
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch {
        return null;
    }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
}

/**
 * The auto-subscribe question for the confirm dialog. Built from nodes, never from HTML: the titles, link and
 * image come from the feed, so they are set as text and attributes only.
 */
export function buildSubscribePreview(itemTitle: string, feed: RawFeed): DocumentFragment {
    const preview = document.createDocumentFragment();
    const { title, link } = feed.latestItem;

    preview.append(element('p', `Subscribe to "${itemTitle}"?`));

    const image = webUrl(feed.image);
    if (image) {
        const img = element('img');
        img.className = 'rss-subscribe-confirmation-image';
        img.src = image;
        img.alt = title;
        preview.append(img);
    }

    preview.append(element('p', `title: ${title}`));

    const href = webUrl(link);
    if (href) {
        const anchor = element('a', title);
        anchor.href = href;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        preview.append(anchor);
    }

    const tip = element('small');
    tip.append(element('p', 'Tip: you can always unsubscribe at any time by clicking the "Unsubscribe" button by right clicking on the RSS feed item'));
    preview.append(tip);
    return preview;
}
