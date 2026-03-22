import type { SettingsInput } from "../shared/types/settings"
import type { Hermidata } from "../shared/types/popupType"

// state.ts
export let currentBookmark: chrome.bookmarks.BookmarkTreeNode | null = null
export let currentTab: chrome.tabs.Tab | null = null
export let allHermidataCashed: Record<string, Hermidata> | undefined
export let settingsCashed: SettingsInput | null = null
export let lastAutoFeedCkeck = 0
export let lastFeedCkeck = 0

// Setters — since you can't reassign named exports directly
export const setState = {
    currentBookmark: (v: typeof currentBookmark) => { currentBookmark = v },
    currentTab: (v: typeof currentTab) => { currentTab = v },
    allHermidataCashed: (v: typeof allHermidataCashed) => { allHermidataCashed = v },
    settingsCashed: (v: typeof settingsCashed) => { settingsCashed = v },
    lastAutoFeedCkeck: (v: number) => { lastAutoFeedCkeck = v },
    lastFeedCkeck: (v: number) => { lastFeedCkeck = v },
}