# Library sync

Hermidata can keep your library the same on several devices. Each device chooses **where** its synced copy
lives, or **not to sync at all**:

| | Browser sync | Your own server (WebDAV) | This device only |
| --- | --- | --- | --- |
| Setup | None | A WebDAV server, its URL and an account | None |
| Space | About 100 KB (the browser's sync quota): a few hundred typical entries, fewer with long notes and histories | Whatever your server allows | This device's own storage |
| How fast other devices see a change | Usually within seconds | Within 5 minutes, or right away when you open the popup | Other devices never see it |
| Who stores your data | Your browser vendor (Google, Mozilla, …), with your browser account | You | Only this device |
| Works across browsers | No: Chrome syncs with Chrome, Firefox with Firefox | Yes | Not applicable |
| Settings | Sync through your browser account | Sync through your browser account | Stay on this device |
| Encryption | Optional | Recommended | Not available (nothing is published) |

Browser sync is the default. Devices only sync with devices that use the **same place**: a laptop on browser sync
and a phone on your WebDAV server do not see each other's changes.

- [What gets synced](#what-gets-synced)
- [Setting up a WebDAV server](#setting-up-a-webdav-server)
- [Switching a device over](#switching-a-device-over)
- [Encryption (optional)](#encryption-optional)
- [Troubleshooting](#troubleshooting)
- [Security and privacy](#security-and-privacy)
- [For developers](#for-developers)

---

## What gets synced

- **Your whole library** (entries, markers, tags, notes, metadata), as one compressed file.
- **Deletions.** A deleted entry stays deleted on other devices, as long as they sync within 30 days.
- **Not part of library sync:** your settings, which sync through your browser account whether you pick browser
  sync or your own server (on a device set to **This device only** they stay on the device); the RSS cache (each device fetches its own feeds); and the sync choice and password themselves, which
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

### Keeping everything on this device

Choose **This device only** and click **Save and switch**. From then on this device:

- publishes nothing and reads nothing, so there is no server, no polling and no quota;
- keeps its settings in the extension's local storage instead of your browser account's sync storage, so they
  are not synced either;
- does not record deletions (there is nobody to tell);
- greys out the Encryption card, with the reason, because there is no synced copy to protect.

Copies that were already published to browser sync or a server are left as they are: Hermidata does not delete
them. Switching to another place later asks the usual merge-or-use-the-copy question when both sides hold a
library. Entries you deleted while local only can come back from a copy that still holds them, so back up
(*Import & Export → Create quick backup*) before switching a device that has deleted entries.

---

## Encryption (optional)

Hermidata can encrypt the synced library so that only your own devices can read it. The server, or your browser
vendor, then only stores data it cannot read. Each device's own library is not changed.

**Should you turn it on?**

- **WebDAV: recommended** for a server you do not fully control. Without it, anyone who can read files on the
  server (its admin, or anyone with your account) can read your library.
- **Browser sync: optional.** Your browser already protects synced data: Firefox encrypts it end to end, and
  Chrome encrypts it with your Google account (or with your own sync passphrase, if you set one in Chrome). Turn it
  on if you want only your own devices to be able to read the library. It costs about 2 KB of the 100 KB space.

### Turning it on

1. Open **Settings → Account & Connection → Encryption**.
2. Choose a passphrase of at least 10 characters (a few unrelated words work well) and click **Turn on encryption**.
   The fields are ordinary new-password / current-password forms with a hidden username ("Hermidata library"), so a
   password manager can generate, save and fill the passphrase for you. This is a good place to keep it, and its
   notes are a good place for the recovery keys.
3. Hermidata shows **5 recovery keys**. Download them as a text file or copy them, store them somewhere safe away
   from this device, tick *I have saved these recovery keys*, and click **Continue**. They are only shown once.
   Nothing is encrypted until you click Continue.
4. On each of your other devices, open the same settings and enter the passphrase once. Until then, that device
   shows a notice and pauses syncing: it never overwrites the encrypted library and never publishes in the clear.

### Recovery keys

If you forget the passphrase, open the Encryption settings on a locked device, choose **Forgot the passphrase? Use
a recovery key**, and enter one recovery key together with a new passphrase. Each recovery key works **once**;
the card shows how many are left. Devices that are already unlocked keep working throughout.

When only one or two are left, create new ones under **Create new recovery keys** (this needs the passphrase). The
new set replaces the old one completely.

**There is no other way back.** If you lose the passphrase and every recovery key, the synced copy cannot be read
by anyone, including the developer. The library on each of your devices is not affected, though:

- On a device that is **still unlocked**, turn encryption off (or off and on again with a new passphrase).
- If **no device is unlocked**, open *Lost the passphrase and every recovery key?* on one of them and choose
  **Replace the synced copy**. It publishes that device's library, encrypted with a new passphrase, over the
  unreadable copy. Unlock your other devices with the new passphrase and their entries are merged back in. Only
  what existed solely in the unreadable copy is lost.

### Changing the passphrase, turning it off

- **Change the passphrase** under *Change the passphrase*. Devices that are already unlocked keep working; new
  devices need the new passphrase.
- **Turn off encryption** publishes the library readable again, for every device that syncs with it.

### What is protected, and what is not

- Protected: every entry, marker, note, tag and deletion in the synced library, plus its integrity (a changed file
  is refused, not merged).
- Not protected by this: your settings (they sync through your browser account), Google Sheets exports, quick
  backups and exports you save yourself, and the library stored in each browser.
- Someone who can read the server still sees that a library exists, roughly how big it is, and when it changes.
- A device that was unlocked keeps the key until encryption is turned off or that browser's site data is cleared.
  Changing the passphrase does not lock it out. To lock out a lost device, turn encryption off and on again with a
  new passphrase: that creates a new key.

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
| *Paused: the synced library is encrypted…* | Another device turned on encryption. Enter the passphrase in **Settings → Account & Connection → Encryption**. |
| *The passphrase is not correct.* | Check for typos and keyboard layout. Forgot it? Use a recovery key. |
| *This recovery key does not unlock this library, or it was already used.* | Each key works once. Try another of your 5 keys. |
| *The synced copy is damaged and cannot be decrypted* (also *[Sync] could not decrypt remote snapshot* in the console) | The file on the server is damaged or was changed. Hermidata leaves it alone. Restore it from a server backup, or use **Replace the synced copy** in the Encryption settings. |
| Changes take a while to show up | WebDAV is checked every 5 minutes and when you open the popup. Browser sync can take longer when the browser is offline or signed out. |

Sync problems are also written to the extension's console: open `chrome://extensions` (or `about:debugging` in
Firefox), find Hermidata, and inspect its service worker / background page. Messages start with `[Sync]`.

---

## Security and privacy

- **No third party is involved** in WebDAV sync: the extension talks directly to the server you entered.
- **The sync file is readable unless you turn on [encryption](#encryption-optional).** Without it, the file is
  only compressed: anyone who can read files on the server (the server admin, or someone with your account) can
  read your library. With it, they see only ciphertext.
- **The encryption key** is stored per device in the extension's IndexedDB as a non-extractable key: it can be
  used on that device but not read back out, and the passphrase itself is never stored.
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
| `scripts/shared/sync/LocalBackend.ts` | The "backend" of a device that does not sync: reads nothing, refuses to write; the engine never pulls or pushes while it is active |
| `scripts/shared/sync/WebDavBackend.ts` | One file over HTTP: ETag versions, `If-Match` / `If-None-Match`, `MKCOL`, alarm polling, `testConnection()` |
| `scripts/shared/sync/syncConfig.ts` | Per-device config in `storage.local`, URL validation, host permission pattern, backend factory |
| `scripts/shared/sync/syncAlarms.ts` | The one `alarms.onAlarm` listener, registered synchronously at startup (MV3), fanned out to the active backend |
| `scripts/shared/sync/libraryCrypto.ts` | Envelope, data key wrapping (passphrase and recovery keys), rewrapping; WebCrypto only |
| `scripts/shared/sync/keyStore.ts` | `IdbKeyStore`: unlocked data keys in IndexedDB (`hermidata-sync-keys`), non-extractable |
| `scripts/shared/types/sync.ts` | `SyncBackend`, `RemoteBlob`, `WriteResult`, `SyncBackendConfig`, … |
| `scripts/settings/build/LibrarySync.ts` | The settings card: form, permission request, test, first-run choice |
| `scripts/settings/build/LibraryEncryption.ts` | The encryption card: turn on/off, unlock, recover, change passphrase, recovery keys |
| `scripts/background/syncSettings.ts` | Background handlers for `SYNC_SET_BACKEND`, `SYNC_REFRESH` and `SYNC_SET_ENCRYPTION` |

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

**Encrypted**, the published string is an envelope instead:

```text
HMENC1.<base64url(JSON header)>.<base64 IV>.<base64 AES-256-GCM ciphertext of the gzip bytes>
```

- One random **data key** (AES-256-GCM) encrypts the gzip bytes, with a fresh 12-byte IV per write. The header
  segment is the additional authenticated data, so an edited or swapped header fails to decrypt.
- The header carries the data key **wrapped** (AES-GCM, bound to the key id) once with a key derived from the
  passphrase (PBKDF2-SHA256, 600,000 iterations, random salt) and once per recovery key (HKDF-SHA256; recovery
  keys are 160 random bits, shown as 32 Crockford base32 characters).
- `kid` names the data key and changes only when encryption is turned on again; `rev` changes on every rewrap
  (passphrase change, recovery key used, new recovery keys). Rewrapping never re-keys, so unlocked devices keep
  working.
- The prefix can never occur in a plain snapshot (plain snapshots are base64, which has no `.`), so plain and
  encrypted snapshots are told apart without configuration.

**Replacing an unreadable copy** (`replaceUnreadable()`) is the only path that writes over a snapshot the device
cannot open. It is an explicit user choice, stored in `syncSealPending` as `{ header, replace: true }`, still
conditional on the version it replaces, and it merges normally instead if the copy turns out to be readable.

**How a push decides how to seal:** a choice made in Settings and not yet published wins; otherwise the device
does what the published snapshot does (so turning encryption on or off on one device is followed by all);
with nothing published it keeps doing what it last did. Without the key for that choice, it writes nothing.
Because every encryption differs, the "cloud already holds this" check compares the decrypted plaintext and the
header revision, not the stored string.

### Per-device state (`storage.local`)

| Key | Content |
| --- | --- |
| `syncBackend` | `{ kind: 'browser' }`, `{ kind: 'local' }` or `{ kind: 'webdav', url, username?, password?, pollMinutes? }` |
| `syncAdoptPending` | `true` while a "use the server copy" switch waits for its first successful pull |
| `syncTombstones` | Deletions not yet expired |
| `syncBlocked`, `syncWarnAt` | Quota state for the "too big" / "nearly full" warnings |
| `syncSealHeader` | The envelope header of the newest snapshot this device knows, or `null` when it was plain |
| `syncSealPending` | `{ header, replace? }` (header `null` turns encryption off) chosen in Settings, until a write carrying it succeeds |

Unlocked data keys live in IndexedDB (`hermidata-sync-keys`, store `keys`, keyed by `kid`), not in `storage.local`.

The `Settings` key in `storage.sync` is never touched by library sync. On a `local` device `setSettings()` writes the
`Settings` mirror to `storage.local` instead, and the theme and RSS listeners follow either area.

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
| `sync.local.test.ts` | A local-only device: no pulls, pushes or tombstones, no encryption, syncing again afterwards |
| `sync.config.test.ts` | URL validation, config storage, the alarm hub |
| `sync.crypto.test.ts` | Envelope, passphrase and recovery keys, rewrapping, tampering, hostile headers |
| `sync.encryption.test.ts` | The engine encrypted: turning it on and off, locked devices, rewraps, the plaintext dedupe, browser sync |

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
- Privacy policy: optional end-to-end encryption of the synced library (AES-256-GCM, key derived from a passphrase
  on the user's devices). The passphrase and recovery keys never leave the device; the developer cannot recover
  them.
