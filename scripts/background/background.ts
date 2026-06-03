import { initTabs } from './tabs'
import { initMessaging, initInstalled } from './messaging'
import { initContextMenus } from './contextMenus'
import { initFeeds } from './feeds'
import { initRssCache } from './rssCache'
import { initSync } from '../shared/db/sync'
import { migrateFromChromeStorage, migrateHermidataToLatest } from '../shared/db/db'
import { migrateSettings, resetSettings } from '../shared/db/Storage'
import { calculateNovelStatusForAll } from '../shared/utils/NovelStatusCalculator'

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
../shared/...
    initSync.ts            ← sync logic + onChanged listener for syncing across devices
    migrateFromChromeStorage() ← migrate from chrome.storage to IndexedDB
    ../utils/..
    resetSettings.ts       ← dev-only function to reset settings in IndexedDB
    migrationSettings()    ← migrate from old settings to new version
*/

// setTimeout(() => resetSettings(), 100) // dev-only
setTimeout(() => migrateSettings(), 100)
setTimeout(() => migrateFromChromeStorage(), 100)
setTimeout(() => migrateHermidataToLatest(), 100)
setTimeout(() => calculateNovelStatusForAll(), 100)
initRssCache()
initTabs()
initMessaging()
initContextMenus()
initFeeds()
initInstalled()
initSync()