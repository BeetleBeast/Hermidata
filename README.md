# Hermidata

> Track your reading and watching progress across novels, manga, and anime — synced to Google Sheets and your browser bookmarks.

Hermidata is a cross-browser extension (Chrome + Firefox) that captures your current tab, extracts the title and chapter, and saves the entry to a linked Google Spreadsheet and a structured bookmark folder — automatically.

---

## Features

### Core

- One-click save from any tab — title, chapter, URL, and date are auto-detected
- Writes directly to Google Sheets via the Sheets API (append or replace)
- Creates a matching browser bookmark in a configurable folder structure
- Duplicate detection: warns on same title + chapter with a newer date, auto-replaces older entries when Replace is enabled
- Context menu entry: right-click any link to save it without opening the tab

### RSS Feed Tracking

- Subscribe to RSS feeds and link them to tracked entries
- Background feed polling every 30 minutes — notifies you of new chapters
- Feed viewer with sort, filter, and search across all subscribed titles
- Filters by type, status, novel status, source, tags, and date range
- Smart title matching using fuzzy search and alternate title support

### Smart Detection

- Chapter number extracted from URL, page title, and common patterns (e.g. `Chapter 12`, `ch.4`, `Episode 3`)
- Title trimming: strips site names, junk keywords, and separator noise automatically
- Fuzzy bookmark and Hermidata matching to detect when you revisit a tracked page
- Icon changes to indicate whether the current page is already bookmarked

### Settings

- Google Spreadsheet URL configuration
- Folder path mapping per type (Manga, Novel, Anime, TV-Series) and status (Viewing, Finished, Dropped, Planned)
- Default values for Type, Status, Tags, and Notes
- Dark mode toggle
- Context menu enable/disable
- Export and import settings as JSON
- Sign out / re-authenticate

---

## How It Works

1. Open a tab with content you want to track
2. Click the extension icon — the form auto-fills from the tab metadata
3. Adjust fields if needed (title, chapter, type, status, tags, notes)
4. Click **Save**
5. The entry is written to your Google Sheet and a browser bookmark is created

For RSS: navigate to the RSS page for a title, click **Subscribe**, and Hermidata links the feed to the tracked entry. New chapters trigger a browser notification.

---

## Installation (Developer)

### 1. Clone and build

```bash
git clone https://github.com/your-repo/hermidata
cd hermidata
npm install
npm run build
```

The build outputs to `dist/`.

### 2. Load the extension

#### **Chrome / Edge / Opera**

1. Go to `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked** → select the `dist/` folder

#### **Firefox**

1. Go to `about:debugging`
2. Click **This Firefox** → **Load Temporary Add-on**
3. Select `dist/manifest.json`

### 3. Set up Google OAuth

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (type: Web application)
3. Add the redirect URI for your extension:
   - Chrome: `https://<your-extension-id>.chromiumapp.org/`
   - Firefox: `https://<your-extension-id>.extensions.allizom.org/`
4. Enable the **Google Sheets API** in your project
5. Add your `client_id` to the manifest under `oauth2.client_id`

### 4. Configure a Google Sheet

1. Create a new Google Spreadsheet
2. Open extension Settings and paste the spreadsheet URL
3. The extension uses `Sheet1!A2` onward with the following column layout:

| A: Title | B: Type | C: Chapter | D: URL | E: Status | F: Date | G: Tags | H: Notes |
|----------|---------|------------|--------|-----------|---------|---------|--------- |

---

## Project Structure

```MD
scripts/
  background/
    background.ts       ← entry point, wires all modules
    messaging.ts        ← onMessage + onInstalled handlers
    tabs.ts             ← tab listeners + icon logic
    bookmarks.ts        ← all bookmark operations
    sheets.ts           ← Google Sheets API calls
    auth.ts             ← OAuth flow
    feeds.ts            ← RSS feed polling + parsing
    rssCache.ts         ← background RSS cache
    fuzzy.ts            ← fuzzy title matching
    contextMenus.ts     ← context menu setup
    state.ts            ← shared mutable state
  popup/                ← popup UI
  rss/                  ← RSS page + feed builder
  settings/             ← settings page
  content/              ← content script
  shared/
    types/              ← all TypeScript types
    StringOutput.ts     ← title trimming + chapter parsing
    BrowserCompat.ts    ← chrome/browser shim
```

---

## Permissions

| Permission | Reason |
| --- | --- |
| `bookmarks` | Create and manage browser bookmarks |
| `tabs` | Read current tab URL and title |
| `activeTab` | Access the active tab on click |
| `storage` | Persist settings and cache |
| `identity` | Google OAuth authentication |
| `contextMenus` | Right-click save option |
| `notifications` | New chapter alerts |
| `scripting` | Content script injection |
| `host_permissions` | Google Sheets API + RSS feed fetching |

---

## Development

```bash
npm run dev        # watch mode — rebuilds on save
npm run build      # production build
npm run typecheck  # type-check without building
npm test           # run unit tests (Vitest)
```

Source maps are included in dev builds. Each background module registers its own listeners via an `init*()` function called from `background.ts`.

---

## Known Issues

### **RSS**

- Alternate titles need to be set manually — if a feed uses a different title than your saved entry, it may appear as a duplicate
- Similar tags (e.g. `fav`, `favorite`, `favorites`) are stored separately instead of being merged

- notification RSS item's polygon ( to indicate that it is linked ) `sometimes` don't get set at the correct position

---

### To-Do

- [ ] Choose which save targets are active per entry (bookmark only, sheet only, or both)
- [ ] Manual alternate title entry for out-of-sync RSS matches
- [ ] auto link RSS to entry without setting it manually

- [ ] subscribe button ( and system ) is very fidelly and can easely break if not done in correct order.

- [ ] update the storage of load from build rss

- [ ] update red_icon to only show when it detect the bookmark inside the allowed root & its a Hermidata its saved.

- [ ] content file doesn't load

- [ ] feeds are still local

- [ ] clean whipe of storage.sync
- [ ] backup storage.cync

---

## Data & Privacy

- Hermidata only accesses Google Sheets — no other Google services
- Your data is stored in your own spreadsheet and your own browser
- No data is sent to any external server other than Google's API
- Authentication uses the official Google OAuth flow — Hermidata never sees your password

---

## License

MIT
