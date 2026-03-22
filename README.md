# 📚 Novel & Bookmark Tracker Extension

**Hermidata** is a browser extension designed to help you efficiently track your progress across novels, manga, anime, or any serialized content by saving entries directly into a linked Google Spreadsheet.

---

## 🚀 Features

- ✅ One-click saving of your current tab’s info (title, URL, etc.)
- ✅ Automatically detects and pre-fills:
  - Title
  - Chapter number (if present in URL)
  - URL
  - Default date (today’s date)
- ✅ Editable fields for:
  - Title, Type (e.g. Manga, Novel, Anime)
  - Chapter number
  - Status (Finished, Viewing, Dropped, Planned)
  - Tags and Notes
- ✅ Data saved directly to your Google Spreadsheet
- ✅ Optional **Replace Mode** to update existing entries
- ✅ Integrated Settings Page to:
  - Save & update your target Google Spreadsheet URL
  - Enable dark mode toggle
  - Edit default Type, Status, Tags & Notes
  - Export/import Settings
  - Disable context menu option
  - Edit bookmark folder path mapping
  - Sign out option
- ✅ Uses secure Google OAuth authentication (`chrome.identity`)
- ✅ Detects duplicates and warns you if:
  - An entry with the same title & chapter exists but has a newer date
  - Automatically replaces older entries if `Replace` is checked
- ✅ Settings saved using `chrome.storage.sync`
- ✅ Minimal, responsive UI with popup and full-page entry views
- ✅ Datalist autocomplete for Type and Status fields
- ✅ Works correctly on sites that use redirects
- ✅ Automatically adds a browser bookmark for the entry

---

## 🛠️ How It Works

1. Open a tab with a novel/manga/anime you want to track.
2. Click the extension icon.
3. The popup auto-fills the form using the tab’s metadata.
4. Edit or complete the fields as needed.
5. Click **Save**.
6. Data is sent to your linked Google Spreadsheet via the Google Sheets API.
7. A bookmark is created in your browser as well.

---

## 📦 Setup Instructions (For Developers)

### 1. Create Google Cloud OAuth Credentials

- Visit [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials)
- Create an **OAuth 2.0 Client ID** (type: Web application)
- Add **Authorized Redirect URI**:  
  `chrome-extension://<your-extension-id>/`
- Enable the **Google Sheets API**
- Retrieve your `client_id` and configure it in your extension’s background script

### 2. Load the Extension

1. Open Chrome/Firefox Extension Management page
2. Click **"Load unpacked"** and select the extension folder
3. Grant requested permissions when prompted

---

## 📋 Data Format in Google Sheet

| Title | Type | Chapter | URL | Status | Date | Tags | Notes |
|-------|------|---------|-----|--------|------|------|-------|

---

## ⚠️ Important Notes

- The Sheet URL is parsed to extract the `spreadsheetId`
- Entries are appended using the Google Sheets API `append` endpoint
- Requires OAuth sign-in (interactive)

---

## problems

## general problems

- [ ] RSS is not efficient
- [ ] Reincarnation of the hero party's grand mage RSS is stuck at 100 ( edge case )
  - let it be able to exept out of it if notice current is bigger than latest

### RSS

- [ ] alt names need to be manualy set-up if not wil result in out-of-sync duplicate entry.

## TO-DO

- [ ] select saving option:
  - Browser bookmark
  - Browser sync
  - google sheet
  - ( FUTURE: Browser database ) <- maybe

## 🧪 To-Do List

- [ ] Allow editing, adding, or removing values inside `TYPE_OPTIONS`, `STATUS_OPTIONS`, and `FolderMapping` in Settings

- [ ] able to see at aglace type of RSS ( basic local hermidata ( not linked ), linked hermidata with rss, other? )

- [ ] upgrade background.ts ( in particular the web )

---
