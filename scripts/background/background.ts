import { initTabs } from './tabs'
import { initMessaging, initInstalled } from './messaging'
import { initContextMenus } from './contextMenus'
import { initFeedListeners, initFeeds } from './feeds'
import { initRssCache } from './rssCache'
import { initSync, initSyncOwner } from '../shared/sync/sync.engine'
import { initSyncAlarmListener } from '../shared/sync/syncAlarms'
import { migrationSteps } from '../shared/migration'
import { readAllHermidata } from '../shared/db/db'
import { logConsoleError } from '../shared/utils/ErrorMessage'
import { scheduleCull } from './culling'
import { initShortcuts } from './shortcuts'
import { initBackfillAlarm, resumeBackfill } from './altTitleBackfill'
import { markFailed, markReady } from './ready'
import { allowMangaUpdatesRequests } from './mangaUpdatesRequests'
import { initMangaUpdatesFeedAlarm, kickMangaUpdatesFeeds } from './mangaUpdatesFeedLinker'

/*
./background/
    background.ts          ← entry point, wiring only
    messaging.ts           ← all onMessage handlers
    tabs.ts                ← tab listeners + icon logic
    bookmarks.ts           ← all bookmark operations
    sheets.ts              ← Google Sheets API calls
    auth.ts                ← getToken / OAuth flow
    feeds.ts               ← RSS feed checking + parsing
    rssCache.ts            ← RSS cache + GET_RSS handler
    fuzzy.ts               ← fuzzy bookmark/hermidata matching
    contextMenus.ts        ← context menu setup + handler
    shortcuts.ts           ← keyboard shortcuts
    culling.ts             ← culling logic for bookmarks/hermidata
../shared/...
    initSync.ts            ← sync logic + onChanged listener for syncing across devices
    migrateFromChromeStorage() ← migrate from chrome.storage to IndexedDB
    ../utils/..
    resetSettings.ts       ← dev-only function to reset settings in IndexedDB
    migrationSettings()    ← migrate from old settings to new version
*/

// Phase 1: synchronous, first tick. Listeners only, no awaits.
initSyncOwner(); // first: every library write from here on reports to this engine
initShortcuts();
initTabs();
initMessaging();
initContextMenus();
initInstalled();
initSyncAlarmListener();
initBackfillAlarm();
initMangaUpdatesFeedAlarm();
initFeedListeners();

// Phase 2: async startup. Things that need migrated data.
(async () => {
    try {
        await migrationSteps();
        await allowMangaUpdatesRequests(); // before the first feed check or alt-title lookup talks to MangaUpdates
        initRssCache();
        initFeeds();
        initSync();
        // the cull deletes feeds no item uses: on a failed read every feed would look unused
        const cached = await readAllHermidata().catch(err => { logConsoleError('[Hermidata] library read failed, feed cull skipped', err); return null; });
        if (cached) scheduleCull(() => cached);
        markReady();
        void resumeBackfill(); // an alt-title backfill that the browser interrupted
        void kickMangaUpdatesFeeds(); // MangaUpdates links the browser interrupted ( Firefox keeps no alarms over a restart )
    } catch (e) {
        console.error('[Hermidata] startup failed', e);
        markFailed(e);
    }
})();