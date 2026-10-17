# Hermidata

> Track your reading and watching progress across novels, manga, anime, and other serialized content. Your library is stored in your browser and can optionally be synced to Google Sheets.

Hermidata is a browser extension for Chromium-based browsers and Firefox. It can detect a title and chapter from the current page, then save the entry to a local IndexedDB library. Entries can have multiple markers: named progress snapshots that let you track separate reading progress of the same title. Google Sheets sync is optional.

---

## Features

### Core

- Save the current page from the extension popup, with title and chapter detection where supported; review or edit the details before saving
- Choose content type, reading status, tags, and notes in the save form
- Optionally create a matching browser bookmark in a configurable folder structure
- Store your library locally in the browser with IndexedDB; no account is required
- Detect duplicates by title and chapter, warn about newer entries, and optionally replace older entries
- Use the context menu to save a link without opening it
- Import existing entries from browser bookmarks
- Browse, search, filter, sort, and merge entries in the Library
- Add and edit title information, including alternative titles, genres, ratings, and other metadata

### Marker System

Each entry has at least one marker. A marker stores:

- The current chapter and URL
- A label (e.g. "First read", "Re-read 2024")
- Reading status for that read-through
- Extra notes for yourself
- A colour to easily recognize your preferred marker
- Full chapter history

You can create multiple markers per entry, making it easy to track separate reading progress for the same title of the same novel and remember exactly where you left off each time.

### RSS Feed Tracking

- Subscribe to RSS feeds and link them to tracked entries
- Background feed checks every 60 minutes for new chapters
- Feed viewer with search, sorting, and filters across titles, including titles without a linked feed
- Filters for type, reading status, series status, source, tags, date range, and more
- Smart title matching using fuzzy search and alternate title support

### Smart Detection

- Chapter number extracted from URL, page title, and common patterns (e.g. `Chapter 12`, `ch.4`, `Episode 3`)
- Title trimming: strips site names, junk keywords, and separator noise automatically
- Fuzzy bookmark and Hermidata matching to detect when you revisit a tracked page
- Icon changes to indicate whether the current page is already bookmarked

## Tags

- Tag autocomplete: start typing to match existing tags
- Create tags and manage their colours in Settings
- Tags are stored per entry and can be used when searching and filtering

## Google Sheets Sync (optional)

- Write entries to a linked Google Spreadsheet using the Sheets API
- Append or replace rows according to the duplicate-handling settings
- Requires Google OAuth setup and a spreadsheet URL in Settings (see setup below)

### Settings

- Configure the Google Spreadsheet connection and extension behavior
- Set default content types, statuses, tags, and notes for saved entries
- Customize content types, reading statuses, series statuses, and tag colours
- Map content types and reading statuses to browser bookmark folders
- Choose whether saves go to the local library, browser bookmarks, and/or Google Sheets
- Configure context-menu behavior, keyboard shortcuts, notifications, and RSS auto-subscription
- Import and export settings, and import entries from browser bookmarks
- Toggle light mode and manage Google account authentication

---

## How It Works

1. Open a tab with content you want to track
2. Click the extension icon. Hermidata attempts to detect the title and chapter from the page.
3. Review the form and adjust details such as content type, status, tags, or notes.
4. Click **Save**. The entry is saved to the destinations enabled in Settings (the local library is enabled by default; Google Sheets sync is optional).
5. If browser bookmark saving is enabled, Hermidata creates or updates a bookmark with the entry's progress details.

To track a new read-through of an existing entry, open the entry and add a new marker with a distinct label. Each marker maintains its own chapter history independently.

For RSS, open a title's page in the RSS viewer and use **Subscribe** to link a feed to a tracked entry. Feed checks run approximately hourly. New chapters can trigger a browser notification, depending on your notification settings.

---

## Installation

You can install a packaged release manually without installing build tools. Download and extract the release ZIP, and keep its files together. The extension folder must contain `manifest.json` and the files referenced by it, including the built `dist/` files and `assets/`.

### Chromium-based browsers (Chrome, Edge, Brave)

1. Go to the [Releases](https://github.com/BeetleBeast/Hermidata/releases) page of this repository.
2. Download the latest `.zip` package from the assets, it contains:
   - `manifest.json`
   - `dist/` folder
   - `assets/` folder
   - `README.md`
3. Extract the `.zip` to a folder on your computer. Do not move or delete files inside the extracted extension folder.
4. Open your browser and navigate to the extensions page:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
5. Enable **Developer mode** (toggle in the top-right corner).
6. Click **Load unpacked** and select the extracted folder containing `manifest.json`.

The extension is now installed and ready to use.

### Firefox-based browsers

Firefox requires a different approach depending on how long you need the extension installed.

**Temporary install** (lost on restart):

1. Download and extract the release `.zip` package as described above.
2. Navigate to `about:debugging` in Firefox.
3. Click **This Firefox** in the left sidebar.
4. Click **Load Temporary Add-on…** and select the `manifest.json` file inside the extracted folder.

> The extension will be active until you close or restart Firefox.

**Permanent install via policies** (no signing or store required):

1. Download and extract the release `.zip` package to a permanent location on your computer (don't move it afterwards).
2. Find your browser's installation folder:
   - **Windows**: `C:\Program Files\YourBrowserName\`
   - **Linux**: `/opt/your-browser/`
   - **macOS**: `/Applications/YourBrowser.app/Contents/Resources/`
3. Inside that folder, create a `distribution/` folder if it doesn't exist yet.
4. Inside `distribution/`, create a file named `policies.json` with the following content, replacing the example path with the actual location of your extracted extension. Use forward slashes `/` even on Windows, and make sure the path starts with `file:///`.

   ```json
   {
     "policies": {
       "Extensions": {
         "Install": [
           "file:///C:/Users/your-permanent/location/Hermidata.zip"
         ]
       }
     }
   }
   ```

5. The extension will now load automatically on every start-up after a restart of your browser.

> This method works with any Firefox-based browser that supports the Enterprise Policy Engine. No signing or publishing is required.

The extension is now installed and ready to use.

## Installation (Developer)

### 1. Clone and build

```bash
git clone https://github.com/BeetleBeast/Hermidata.git
cd hermidata
npm install
npm run build
```

The build writes generated files to `dist/`. The root `manifest.json` refers to those files, so load the project root folder (the folder containing `manifest.json`) as an unpacked extension.

### 2. Load the extension

#### **Chrome / Edge / Opera**

1. Go to `chrome://extensions` (or the equivalent extensions page in Edge or Opera).
2. Enable **Developer Mode**.
3. Click **Load unpacked** and select the cloned project root folder.

#### **Firefox**

1. Go to `about:debugging`.
2. Click **This Firefox** → **Load Temporary Add-on**.
3. Select the root `manifest.json` file in the cloned project.

### 3. Set up Google OAuth

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (type: Web application)
3. Add the redirect URI for your extension:
   - Chrome: `https://<your-extension-id>.chromiumapp.org/`
   - Firefox: `https://<your-extension-id>.extensions.allizom.org/`
4. Enable the **Google Sheets API** in your project
5. Configure the OAuth client ID in `manifest.json` under `oauth2.client_id` for your development setup.

### 4. Configure a Google Sheet

1. Create a new Google Spreadsheet
2. Open extension Settings and paste the spreadsheet URL
3. The extension uses `Sheet1!A2` onward with the following column layout:

| Colum A | Colum B | Colum C | Colum D | Colum E | Colum F | Colum G | Colum H |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Title | Type | Chapter | URL | Status | Date | Tags | Notes |

---

## Project Structure

```text
pages/       Extension popup, Settings, Library, and Overview pages
scripts/
  background/ Background tasks, bookmarks, RSS feeds, and Google Sheets
  content/   Page detection and content-script features
  library/   Library and entry-detail page behavior
  popup/     Save form and popup behavior
  rss/       RSS viewer
  settings/  Settings page behavior
  shared/    Shared constants, types, storage, migrations, and utilities
assets/      Icons and stylesheets
tests/       Vitest tests
dist/        Generated build output (created by `npm run build`)
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
| `host_permissions` | Broad access to websites for page detection and RSS feeds, plus Google APIs for Sheets sync |

---

## Development

```bash
npm run dev        # watch mode - rebuilds on save
npm run build      # production build
npm run typecheck  # type-check without building
npm test -- --run  # run unit tests once (Vitest)
```

`npm test` runs Vitest in its default watch mode; use `npm test -- --run` for a single test run. Build output includes source maps. Background features are initialized from `scripts/background/background.ts`.

---

## Known Issues

### RSS

- Automatic feed matching may not recognize every alternate title. Add alternative titles to the entry or link the feed manually if it is matched incorrectly.

---

## Data & Privacy

- Your library and settings are stored in your browser, including the library in IndexedDB.
- The extension declares access to all website hosts so its content script can detect page information; RSS feed checks also make requests to the feed's server.
- Google Sheets sync is optional. When enabled, Hermidata sends saved entry data to the spreadsheet you configure, using Google OAuth and the Sheets API.
- RSS feed URLs are fetched to check for updates. The feed server receives the normal network request information required to respond (such as your IP address).
- Authentication uses the browser's Google OAuth flow; Hermidata does not receive your Google password.

---

## License

MIT
