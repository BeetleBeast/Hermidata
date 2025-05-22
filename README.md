# 📚 Novel Tracker Extension

**Novel Tracker** is a browser extension that helps you keep track of your progress across novels, manga, anime, or any serialized content by saving entries directly into a linked Google Spreadsheet.

---

## 🚀 Features

- ✅ One-click saving of your current tab’s info (title, URL, etc.)
- ✅ Automatically detects and pre-fills:
  - Title
  - Chapter number (if present in URL)
  - URL
  - Default date (today's date)
- ✅ Editable fields for:
  - Title, Type (e.g. Manga, Novel, Anime)
  - Chapter number
  - Status (Finished, Viewing, Dropped, Planned)
  - Tags and Notes
- ✅ Data is stored in your Google Spreadsheet
- ✅ Optional **Replace mode** if the same item already exists
- ✅ Integrated Settings Page:
  - Save & update your target Google Spreadsheet URL
- ✅ Uses secure Google OAuth for authentication (via `chrome.identity`)
- ✅ Detects duplicates and gives warnings:
  - If a matching entry (same title & chapter) exists but date is newer
  - Replaces older entries if `Replace` is checked
- ✅ Settings saved using `chrome.storage.sync`
- ✅ Minimal and responsive UI
- ✅ Popup and full-page entry view
- ✅ Datalist autocomplete for `Type` and `Status` fields
- ✅ even works for sites that uses redirects
- ✅ has dark mode

---

## 🛠️ How It Works

1. Open a tab with a novel/manga/anime you're reading.
2. Click the extension icon.
3. The popup auto-fills the form using the tab's metadata.
4. Edit or complete the fields if needed.
5. Click **Save**.
6. Data is written to your linked Google Spreadsheet via the Google Sheets API.

---

## 📦 Setup Instructions (For Developers)

### 1. Create Google Cloud OAuth Credentials

- Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
- Create an **OAuth 2.0 Client ID** (type: Web app)
- Add **Authorized Redirect URI**:  
  `chrome-extension://<your-extension-id>/`
- Enable the **Google Sheets API**
- Get the `client_id` and add it in your background script

### 2. Load the Extension

1. Open Chrome/Firefox Extension Settings
2. Click **"Load unpacked"** and select the extension folder
3. Grant permissions when prompted

---

## 📋 Data Format in Google Sheet

| Title | Type | Chapter | URL | Status | Date | Tags | Notes |
|-------|------|---------|-----|--------|------|------|-------|

---

## ⚠️ Notes

- Uses `chrome.identity.getAuthToken()` for secure OAuth2 access
- No sensitive keys (`client_secret`) are stored
- Sheet URL is extracted to get the `spreadsheetId`
- Entries are added via Google Sheets `append` endpoint
- Requires interactive sign-in (OAuth) the first time

---

## 🧪 To-Do

- [ ] Export/import backup options
- [ ] Track reading history or stats
- [ ] Keyboard shortcuts for quick-save
- [ ] add a setting to (dis)-able context-menu 

---

## 🕶️ Reminder

👉 Make **Dark Mode** Prittier with better colors

---
