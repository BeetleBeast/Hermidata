# Library sync

Hermidata can keep your library the same on several devices. Each device chooses **where** its synced copy
lives:

| | Browser sync | Your own server (WebDAV) |
| --- | --- | --- |
| Setup | None | A WebDAV server, its URL and an account |
| Space | About 100 KB (the browser's sync quota): a few hundred typical entries, fewer with long notes and histories | Whatever your server allows |
| How fast other devices see a change | Usually within seconds | Within 5 minutes, or right away when you open the popup |
| Who stores your data | Your browser vendor (Google, Mozilla, …), with your browser account | You |
| Works across browsers | No: Chrome syncs with Chrome, Firefox with Firefox | Yes |

Browser sync is the default. Devices only sync with devices that use the **same place**: a laptop on browser sync
and a phone on your WebDAV server do not see each other's changes.

- [What gets synced](#what-gets-synced)
- [Setting up a WebDAV server](#setting-up-a-webdav-server)
- [Switching a device over](#switching-a-device-over)
- [Troubleshooting](#troubleshooting)
- [Security and privacy](#security-and-privacy)
- [For developers](#for-developers)

---

## What gets synced

- **Your whole library** (entries, markers, tags, notes, metadata), as one compressed file.
- **Deletions.** A deleted entry stays deleted on other devices, as long as they sync within 30 days.
- **Not part of library sync:** your settings, which always sync through your browser account whichever place
  you pick; the RSS cache (each device fetches its own feeds); and the sync choice and password themselves, which
  stay on the device.

When two devices edit **different** entries at the same time, both edits are kept. When they edit the **same**
entry, the most recently edited version wins.

---

## Setting up a WebDAV server

Hermidata needs the URL of **one file** on a WebDAV server, for example
`https://cloud.example.com/remote.php/dav/files/me/Hermidata/hermidata.sync`. The folder is created on the first
write if it does not exist, but only one level deep: the folder above it must already exist.

**https is required.** Plain `http://` is accepted only for `localhost` and private network addresses
(`192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`, `*.local`, `*.lan`), and Hermidata shows a warning, because the
password and the library then travel unencrypted.

### Quick local server for trying it out (rclone)

[rclone](https://rclone.org/downloads/) can serve any folder over WebDAV with one command:

```bash
rclone serve webdav ./hermidata-dav --addr 127.0.0.1:8080 --user hermidata --pass hermidata
```

Or with Docker, without installing rclone:

```bash
docker run --rm -p 127.0.0.1:8080:8080 -v "$PWD/hermidata-dav:/data" rclone/rclone serve webdav /data --addr :8080 --user hermidata --pass hermidata
```

From a clone of this repository, `npm run sync:server` runs the same rclone command and stores the files in
`.dav-server/` (ignored by git).

Then in Hermidata use:

| Field | Value |
| --- | --- |
| Sync file URL | `http://localhost:8080/Hermidata/hermidata.sync` |
| Username | `hermidata` |
| Password | `hermidata` |

This server only listens on your own computer, so only browsers on that computer can reach it. To use it from
other devices, run rclone on a machine they can reach, add `--cert` and `--key` for https, and pick a real
password.

### Nextcloud

- **URL:** `https://<your server>/remote.php/dav/files/<username>/Hermidata/hermidata.sync`. The username in the
  path is your Nextcloud login name; the Files app shows the exact WebDAV address under *Files settings*.
- **Password:** create an app password under *Personal settings → Security → Devices & sessions*. It is required
  when two-factor sign-in is on, and recommended anyway: you can revoke it without changing your real password.
- Create the `Hermidata` folder in the Files app first if it does not exist (or let Hermidata create it).

### ownCloud

Same as Nextcloud: `https://<your server>/remote.php/dav/files/<username>/Hermidata/hermidata.sync`, with an app
password if your account uses two-factor sign-in.

### A NAS (Synology, QNAP, …) or your own web server

Turn on the NAS's WebDAV service (on Synology: the *WebDAV Server* package; https usually on port 5006), then use
`https://<nas address>:<port>/<shared folder>/Hermidata/hermidata.sync` with your NAS account. Apache
(`mod_dav`), nginx (`dav_methods PUT DELETE MKCOL`), Caddy, and other WebDAV servers work the same way: Hermidata
only uses `GET`, `PUT`, `DELETE` and `MKCOL` on a single file.

### What "Test connection" tells you

The test writes a small temporary file next to your sync file, reads it back, checks how the server handles
updates, and deletes it again. Possible results:

- **Connected. The server protects against two devices overwriting each other.** Best case: the server supports
  safe concurrent updates (strong ETags and `If-Match`).
- **Connected. This server does not enforce safe concurrent updates.** Sync still works. If two devices write at
  the very same moment, one write can replace the other; the lost changes come back on the next sync of the
  device that made them, as long as it still has them. Fine for one person with a few devices.
- **An error**, with a hint on what to check. See [Troubleshooting](#troubleshooting).

---

## Switching a device over

1. Open **Settings → Account & Connection → Library sync**.
2. Choose **Your own server (WebDAV)** and fill in the URL, username and password (or choose **Browser sync** to go
   back).
3. Click **Test connection** if you like, then **Save and switch**. The browser may ask for permission to contact
   the server; Hermidata only asks for that one server.
4. Hermidata then looks at both sides:
   - **The server is empty:** this device's library is uploaded.
   - **This device is empty:** the server's library is downloaded.
   - **Both have a library:** you choose:
     - **Merge both** keeps everything; where the same entry exists on both, the most recently edited one wins.
     - **Use the copy in …** replaces this device's library with the server's. Entries that only exist on this
       device are **removed from it** and cannot be brought back by sync. Make a quick backup first
       (*Import & Export → Create quick backup*) if you are unsure.
5. Repeat on every other device that should share this library. The setting is per device.

Switching away from browser sync does not delete the copy in browser sync, so other devices still using browser
sync keep working.

---

## Troubleshooting

| What you see | What to check |
| --- | --- |
| *The server rejected the username or password.* | The username and password. Nextcloud and ownCloud with two-factor sign-in need an app password. |
| *You are not allowed to write to this location.* | Your account may not write to that folder. Pick a folder you own. |
| *The folder does not exist and could not be created.* | Hermidata creates one missing folder level only. Create the folders on the server, or fix the path. |
| *The server has no space left.* | Free some space or raise your quota on the server. |
| *The server answered with status …* | The URL may not be a WebDAV address (for Nextcloud it must contain `/remote.php/dav/files/`). |
| *Could not reach the server.* | The address and port, that the server is running, and that this device can reach it (VPN, firewall, local network). |
| *Hermidata needs your permission to contact …* | You declined the browser's permission prompt. Click **Save and switch** again and allow it. |
| *Use https://. Plain http:// is only allowed for …* | Use the server's https address. |
| Changes take a while to show up | WebDAV is checked every 5 minutes and when you open the popup. Browser sync can take longer when the browser is offline or signed out. |

Sync problems are also written to the extension's console: open `chrome://extensions` (or `about:debugging` in
Firefox), find Hermidata, and inspect its service worker / background page. Messages start with `[Sync]`.

---

## Security and privacy

- **No third party is involved** in WebDAV sync: the extension talks directly to the server you entered.
- **The sync file is not encrypted.** It is compressed, not secret: anyone who can read files on the server (the
  server admin, or someone with your account) can read your library. Optional encryption is planned.
- **The password is stored on this device only**, in the extension's local storage, unencrypted, like most
  browser extensions store credentials. It is never synced and never put in exports. Prefer an app password you
  can revoke.
- **Host permission:** Hermidata asks for permission to contact the server you enter, when you click **Test
  connection** or **Save and switch**. On Chromium browsers this permission is already covered by the extension's
  site access and no prompt appears.
- **Browser sync** stores the same compressed file in your browser account's sync storage, under that vendor's
  privacy terms.

---

## For developers

### Architecture

```text
HermidataSync (engine)            SyncBackend (interface)            Implementations
  queue, merge, tombstones   -->    read(ifNoneMatch?)           -->   BrowserSyncBackend  (storage.sync, chunked)
  pull-before-push                  write(data, ifMatch?)              WebDavBackend       (one file, ETag = version)
  read-merge-write push loop        watch?(onChange)
```

The engine decides **what** to publish; a backend decides **where**. Exactly one backend is active per device.

| File | Role |
| --- | --- |
| `scripts/shared/sync/sync.engine.ts` | `HermidataSync`: queue, merge, tombstones, push loop, `switchBackend()`; plus the wiring (`initSync`, `pushToSync`, `removeFromSync`, `refreshSync`, `switchSyncBackend`) |
| `scripts/shared/sync/BrowserSyncBackend.ts` | `storage.sync`: chunks (`lib:0…n`) plus `lib:meta`, quota guard, legacy-key cleanup |
| `scripts/shared/sync/WebDavBackend.ts` | One file over HTTP: ETag versions, `If-Match` / `If-None-Match`, `MKCOL`, alarm polling, `testConnection()` |
| `scripts/shared/sync/syncConfig.ts` | Per-device config in `storage.local`, URL validation, host permission pattern, backend factory |
| `scripts/shared/sync/syncAlarms.ts` | The one `alarms.onAlarm` listener, registered synchronously at startup (MV3), fanned out to the active backend |
| `scripts/shared/types/sync.ts` | `SyncBackend`, `RemoteBlob`, `WriteResult`, `SyncBackendConfig`, … |
| `scripts/settings/build/LibrarySync.ts` | The settings card: form, permission request, test, first-run choice |
| `scripts/background/syncSettings.ts` | Background handlers for `SYNC_SET_BACKEND` and `SYNC_REFRESH` |

### The backend contract

- The snapshot is one opaque string; `version` is an opaque string (revision, ETag, content hash).
- `read(ifNoneMatch?)` returns `null` (nothing published), `'incomplete'` (cannot be read whole yet),
  `'unchanged'` (only when `ifNoneMatch` matched; never without it), or `{ data, version }`.
- `write(data, ifMatch?)`: with `ifMatch`, a conditional backend throws `ConflictError` if the remote moved;
  without it the write is unconditional. A write that does not fit returns `{ status: 'too-big' }` and leaves the
  previous snapshot untouched.
- `watch(onChange)` means "another device may have written" and returns a function that stops watching.

The engine never writes over a remote it cannot read whole or decode, merges whatever is newer on the remote
before every write, and retries a conflicting write up to 4 times before reporting
`[Sync] gave up publishing after repeated conflicts`.

### Snapshot format

`base64(gzip(JSON))` of `{ e: entries, t: tombstones }`. Entries have the per-device RSS cache (`lastFetched`,
`latestItem`) stripped, and ISO timestamps packed to epoch milliseconds where that round-trips exactly. Tombstones
map an entry id to its deletion time and expire after 30 days.

### Per-device state (`storage.local`)

| Key | Content |
| --- | --- |
| `syncBackend` | `{ kind: 'browser' }` or `{ kind: 'webdav', url, username?, password?, pollMinutes? }` |
| `syncAdoptPending` | `true` while a "use the server copy" switch waits for its first successful pull |
| `syncTombstones` | Deletions not yet expired |
| `syncBlocked`, `syncWarnAt` | Quota state for the "too big" / "nearly full" warnings |

The synced `Settings` key in `storage.sync` is never touched by sync.

### Tests

```bash
npx vitest run tests/sync          # every sync suite, against in-memory fakes
```

| Suite | Covers |
| --- | --- |
| `sync.test.ts`, `sync.rss.test.ts` | The original behavior of browser sync; RSS refreshes |
| `sync.backend.test.ts` | The contract, run against every backend |
| `sync.webdav.test.ts` | WebDAV requests, preconditions, folders, servers without ETags, `testConnection`, polling; the engine on WebDAV |
| `sync.switch.test.ts` | Switching backends, merge and adopt |
| `sync.config.test.ts` | URL validation, config storage, the alarm hub |

`tests/sync.fakeDav.ts` has `FakeDavServer` (an in-memory WebDAV server behind a real `fetch` signature) and
`FakeAlarms`.

**Against a real server.** `tests/sync.live.test.ts` runs the backend against a real WebDAV server and is skipped
unless you point it at a **folder** it may write to (it creates and deletes its own files there):

```bash
npm run sync:server                # in a second terminal (needs rclone)
HERMIDATA_DAV_URL=http://127.0.0.1:8080/ HERMIDATA_DAV_USER=hermidata HERMIDATA_DAV_PASS=hermidata npx vitest run tests/sync.live.test.ts --reporter=verbose
```

In PowerShell, set the variables first with `$env:HERMIDATA_DAV_URL = '…'`. With `--reporter=verbose` the test
prints what `testConnection()` found, including whether the server enforces conditional writes; when it does
not, the conflict check is skipped rather than failed.

### Adding a backend

Implement `SyncBackend`, add it to the `implementations` list in `sync.backend.test.ts` so it runs the contract,
add a `kind` to `SyncBackendConfig` and a branch to `createBackend()`, then extend the settings card. Backends that
need OAuth (Google Drive, Dropbox, OneDrive) are not planned unless requested.

### Notes for the store listing and privacy policy

- The `alarms` permission is used to check the WebDAV server for changes every 5 minutes.
- `optional_host_permissions` (`*://*/*`) lets the user grant access to their own server at runtime; nothing is
  requested at install time for it.
- Privacy policy: when the user configures a WebDAV server, the library is sent to that server and the
  credentials are stored locally on the device. No data goes to the developer or any other third party.
