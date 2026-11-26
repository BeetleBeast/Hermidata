import { describe, expect, it } from 'vitest';
import { parseChannelInfo, parseFeedXml, parseItems } from '../../scripts/background/parseXML';

// the shape api.mangaupdates.com/v1/series/<id>/rss answers with: items without link, date or guid
const MANGAUPDATES_FEED = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Naruto - Releases on MangaUpdates</title>
    <link>https://www.mangaupdates.com/series/7z3yqqk/naruto</link>
    <description>This feed shows the latest releases for the series Naruto as shown on MangaUpdates.com</description>
    <item><title>Naruto c.700</title><description>MANGA Plus</description></item>
    <item><title>Naruto c.699</title><description>MANGA Plus</description></item>
  </channel>
</rss>`;

const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Series</title>
  <link rel="self" href="https://example.com/series/1/atom.xml"/>
  <link rel="alternate" href="https://example.com/series/1"/>
  <updated>2026-11-20T10:00:00Z</updated>
  <logo>https://example.com/cover.png</logo>
  <entry>
    <title>Example Series Chapter 12</title>
    <link rel="alternate" href="https://example.com/series/1/chapter-12"/>
    <link rel="replies" href="https://example.com/series/1/chapter-12#comments"/>
    <id>tag:example.com,2026:12</id>
    <updated>2026-11-20T10:00:00Z</updated>
  </entry>
</feed>`;

const RDF_FEED = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
  <channel rdf:about="https://example.org/"><title>Old Site</title><link>https://example.org/</link></channel>
  <item rdf:about="https://example.org/ch-8"><title>Old Series Chapter 8</title><link>https://example.org/ch-8</link></item>
</rdf:RDF>`;

describe('parseFeedXml', () => {
    it('accepts RSS 2.0, Atom and RSS 1.0 ( RDF )', () => {
        expect(parseFeedXml(MANGAUPDATES_FEED)).not.toBeNull();
        expect(parseFeedXml(ATOM_FEED)).not.toBeNull();
        expect(parseFeedXml(RDF_FEED)).not.toBeNull();
    });

    it('rejects a page or text that is not a feed', () => {
        expect(parseFeedXml('<!doctype html><html><body>Chapter 5</body></html>')).toBeNull();
        expect(parseFeedXml('<sitemap><url>x</url></sitemap>')).toBeNull();
        expect(parseFeedXml('not xml at all')).toBeNull();
    });
});

describe('parseItems', () => {
    it('reads a MangaUpdates release: chapter from "c.700", the series page as link', () => {
        const item = parseItems(parseFeedXml(MANGAUPDATES_FEED)!, 'Naruto');
        expect(item?.chapter).toBe(700);
        expect(item?.rawTitle).toBe('Naruto c.700');
        expect(item?.link).toBe('https://www.mangaupdates.com/series/7z3yqqk/naruto');
    });

    it('reads the newest Atom entry with its own link', () => {
        const item = parseItems(parseFeedXml(ATOM_FEED)!, 'Example Series');
        expect(item?.chapter).toBe(12);
        expect(item?.link).toBe('https://example.com/series/1/chapter-12');
    });

    it('reads RSS 1.0 items, which sit next to the channel', () => {
        const item = parseItems(parseFeedXml(RDF_FEED)!, 'Old Series');
        expect(item?.chapter).toBe(8);
        expect(item?.link).toBe('https://example.org/ch-8');
    });
});

describe('parseChannelInfo', () => {
    it("takes the Atom feed's site page, not its own address", () => {
        const info = parseChannelInfo(parseFeedXml(ATOM_FEED)!);
        expect(info.link).toBe('https://example.com/series/1');
        expect(info.image).toBe('https://example.com/cover.png');
        expect(info.lastBuildDate?.toISOString()).toBe('2026-11-20T10:00:00.000Z');
    });

    it('gives no build date when the feed has none', () => {
        expect(parseChannelInfo(parseFeedXml(MANGAUPDATES_FEED)!).lastBuildDate).toBeNull();
    });
});
