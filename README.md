# Hermidata

>Track your reading and watching progress across novels, manga, and anime - stored locally in your browser and optionally synced to Google Sheets.

Hermidata is a cross-browser extension (Chrome + Firefox) that captures your current tab, extracts the title and chapter, and saves the entry to an internal IndexedDB store. Each entry supports multiple bookmarks that are named progress snapshots that let you track separate read-throughs of the same title. Google Sheets sync is available as an optional feature.

---

## Features

### Core

- One-click save from any tab with the exeption of Novel Type, everything is auto-detected
- Reduced, streamlined form - only the fields that matter, auto-filled from tab metadata
- Creates a matching browser bookmark in a configurable folder structure
- All data stored locally in the browser via IndexedDB - no account required
- Duplicate detection: warns on same title + chapter with a newer date, auto-replaces older entries when Replace is enabled
- Context menu entry: right-click any link to save it without opening the tab

### Bookmark System

Each entry has at least one bookmark. A bookmark stores:

- The current chapter and URL
- A label (e.g. "First read", "Re-read 2024")
- Reading status for that read-through
- Extra notes for yourself
- A colour to easily notice your prefered bookmark
- Full chapter history

You can create multiple bookmarks per entry, making it easy to track separate read-throughs of the same novel and remember exactly where you left off each time.

### RSS Feed Tracking

- Subscribe to RSS feeds and link them to tracked entries
- Background feed polling every 30 minutes notifying you of new chapters
- Feed viewer with sort, filter, and search across all titles not only subscribed ones!
- Filters by type, status, novel status, source, tags, date range and more
- Smart title matching using fuzzy search and alternate title support

### Smart Detection

- Chapter number extracted from URL, page title, and common patterns (e.g. `Chapter 12`, `ch.4`, `Episode 3`)
- Title trimming: strips site names, junk keywords, and separator noise automatically
- Fuzzy bookmark and Hermidata matching to detect when you revisit a tracked page
- Icon changes to indicate whether the current page is already bookmarked

## Tags

- Tag autocomplete - start typing to match existing tags instantly
- Add tags that fit your unique taste
- Tags are stored per-entry and searchable in the feed viewer

## Google Sheets Sync (optional)

- Write entries to a linked Google Spreadsheet via the Sheets API
- Append or replace rows based on duplicate detection rules
- Requires Google OAuth setup and a spreadsheet URL in Settings (see setup below)

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
2. Click the extension icon - the form auto-fills title and chapter from the tab
3. Adjust fields if needed (type, status, tags, notes)
4. Click **Save** - the entry is stored locally in IndexedDB, and synced to Google Sheets if enabled
5. A bookmark is created for this entry, recording the chapter, URL, and label unless disabled

To track a new read-through of an existing entry, open the entry and add a new bookmark with a distinct label. Each bookmark maintains its own chapter history independently.

For RSS: navigate to the RSS page for a title, click Subscribe, and Hermidata links the feed to the tracked entry. New chapters trigger a browser notification.

---

## Installation (Developer)

### 1. Clone and build

```bash
git clone https://github.com/BeetleBeast/Hermidata.git
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
  background/ <- background scripts
  popup/ <- core popup
  rss/ <- RSS mode of popup
  rssPage/ <- Seperate RSS page
  settings/ <- settings page
  content/ <- content script
  shared/
    constants/ <- All major TypeScript constants
    db/ <- storage functions
    migration/ <- migration plans
    types/ <- All TypeScript types
    utils/ <- All functions that touch all major places
```

---

## Permissions

| Permission | Reason |
| --- | --- |
| `bookmarks` | Create and manage browser bookmarks |
| `tabs` | Read current tab URL and title |
| `activeTab` | Access the active tab on click |
| `storage` | Persist settings and cache |
| `identity` | Google OAuth authentication (Sheets sync only) |
| `contextMenus` | Right-click save option |
| `notifications` | New chapter alerts |
| `scripting` | Content script injection |
| `host_permissions` | Google Sheets API + RSS feed fetching |

---

## Development

```bash
npm run dev        # watch mode - rebuilds on save
npm run build      # production build
npm run typecheck  # type-check without building
npm test           # run unit tests (Vitest)
```

Source maps are included in dev builds. Each background module registers its own listeners via an `init*()` function called from `background.ts`.

---

## Known Issues

### RSS

- Alternate titles need to be set manually - if a feed uses a different title than your saved entry, it may appear as a duplicate

---

## Data & Privacy

- All tracking data is stored locally in your browser via IndexedDB
- Google Sheets sync is optional - if disabled, no data leaves your browser
- When Sheets sync is enabled, Hermidata only accesses the configured spreadsheet - no other Google services
- Authentication uses the official Google OAuth flow - Hermidata never sees your password


---

## License

MIT
