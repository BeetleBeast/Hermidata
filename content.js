// content.js
(async () => {
    console.log("[Hermidata] content.js loaded on", window.location.href);

    const GlobalFeeds = [];

    // --- 1. Detect RSS <link rel="alternate"> in head ---
    const rssLinks = [...document.querySelectorAll('link[rel="alternate"][type="application/rss+xml"], link[rel="alternate"][type="application/atom+xml"]')];
    const feeds = rssLinks.map(link => ({
        title: link.getAttribute('title') || document.title,
        url: new URL(link.getAttribute('href'), location.origin).href
    }));

    // --- 2. Detect RSS-looking <a> links in body ---
    const anchorCandidates = [...document.querySelectorAll('a[href*="rss"], a[href*="feed"], a[href$=".xml"]')];
    for (const a of anchorCandidates) {
        const text = (a.textContent || "").toLowerCase();
        const href = a.getAttribute("href");
        if (!href) continue;

        // If it *looks* like an RSS link based on text or href pattern
        if (text.includes("rss") || text.includes("feed") || href.match(/\/(rss|feed|atom)(\.xml)?$/i)) {
            const fullUrl = new URL(href, location.origin).href;
            feeds.push({
                title: a.title || a.textContent.trim() || document.title,
                url: fullUrl
            });
        }
    }

    console.log('Detected possible RSS links:', feeds);

    // --- 3. Try common default paths ---
    const possibleFeeds = ['/feed', '/rss', '/atom.xml', '/rss.xml'];
    for (const path of possibleFeeds) {
        const testUrl = new URL(path, location.origin).href;
        try {
            const response = await fetch(testUrl, { method: 'HEAD' });
            if (response.ok && response.headers.get('Content-Type')?.includes('xml')) {
                console.log('Found valid RSS feed at', testUrl);
                feeds.push({ title: document.title, url: testUrl });
                break;
            }
        } catch (err) {
            // ignore CORS/404
            console.warn('Error checking feed URL', testUrl, err);
        }
    }

    // --- 4. Normalize & store ---
    const normFeeds = feeds.map(feed => normalizeFeedData(feed));
    for (const feed of normFeeds) addFeedToGlobal(feed, GlobalFeeds);

    // --- 5. Fetch sample items ---
    for (const feed of GlobalFeeds) {
        try {
            const items = await fetchAndParseRSS(feed.url);
            feed.items = items;
            feed.lastFetched = new Date().toISOString();
            console.log(`Fetched ${items.length} items from ${feed.url}`);
        } catch (err) {
            console.error(`Failed to fetch/parse RSS from ${feed.url}:`, err);
        }
    }

    console.log('Final GlobalFeeds:', GlobalFeeds);

    // // Send to background for storage or popup UI
    // browser.runtime.sendMessage({ action: "foundFeeds", data: GlobalFeeds });

    // Save all found feeds to local storage
    browser.storage.local.get({ savedFeeds: [] }).then(({ savedFeeds }) => {
        const combined = [...savedFeeds];
        for (const feed of GlobalFeeds) {
            if (!combined.find(f => f.url === feed.url)) {
                combined.push(feed);
            }
        }
        browser.storage.local.set({ savedFeeds: combined }).then(() => {
            console.log(`[Hermidata] ${GlobalFeeds.length} feeds saved to local storage`);
        });
    });


    // --- Helper functions ---
    function normalizeFeedData(feed) {
        const domain = new URL(feed.url).hostname.replace(/^www\./, '');
        return {
            title: feed.title.trim(),
            url: feed.url,
            domain,
            lastFetched: null,
            items: []
        };
    }

    async function fetchAndParseRSS(feedUrl) {
        const response = await fetch(feedUrl);
        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "text/xml");
        const items = [...xml.querySelectorAll("item")].map(item => ({
            title: item.querySelector("title")?.textContent ?? "",
            link: item.querySelector("link")?.textContent ?? "",
            pubDate: new Date(item.querySelector("pubDate")?.textContent ?? 0)
        }));
        return items;
    }

    function addFeedToGlobal(feed, globalArr) {
        if (!globalArr.find(f => f.url === feed.url)) {
            globalArr.push(feed);
        }
    }

})();
