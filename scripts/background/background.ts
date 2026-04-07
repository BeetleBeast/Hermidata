import { initTabs } from './tabs'
import { initMessaging, initInstalled } from './messaging'
import { initContextMenus } from './contextMenus'
import { initFeeds } from './feeds'
import { initRssCache } from './rssCache'
import { initSync } from '../shared/db/sync'

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
    initSync.ts              ← sync logic + onChanged listener for syncing across devices
*/

initRssCache()
initTabs()
initMessaging()
initContextMenus()
initFeeds()
initInstalled()
initSync()