# Anti-clipper

Block clipper and re-upload channels on YouTube Shorts. Anti-clipper keeps a personal blacklist of channels: when a Short from a blacklisted channel comes up, it is paused instantly and skipped automatically — you never watch it.

## Features

- **Auto-skip blocked channels** — Shorts from blacklisted channels are paused immediately and skipped before they play.
- **Classify channels while you scroll** — every Short from an unlisted channel shows a small badge with the channel handle and two buttons: whitelist (✓) or blacklist (✕).
- **OFFICIAL badge** — whitelisted channels are highlighted in green so you can recognize original creators at a glance.
- **Session stats** — the popup shows the top 3 most-blocked channels of the current browser session, updated live.
- **One-click on/off** — a toggle disables all filters; the toolbar icon shows a green dot when active and a red dot when disabled.
- **Community list** — a curated blacklist of known clipper channels ([anti-clipper-lists.json](anti-clipper-lists.json)) ships with the extension and works out of the box, alongside your personal lists. Your own lists always win: a channel you whitelist is never blocked by the community list.
- **One-click sync** — when the community list is updated in this repository, the extension shows a NEW badge and an update button in the popup; the new list is downloaded only when you press it. A separate toggle disables the community list entirely.
- **Import / export** — back up both personal lists to a JSON file or merge someone else's lists into yours.

## Install

**From the Chrome Web Store (recommended):** _link coming soon_.

**Manual (developer mode):**

1. Clone or download this repository.
2. Open `chrome://extensions` and enable **Developer mode** (top right).
3. Click **Load unpacked** and select the repository folder.

## How it works

Anti-clipper is a Manifest V3 extension made of a content script that runs only on `youtube.com`:

- The channel of the Short you are watching is resolved through YouTube's public **oEmbed** endpoint (the channel metadata rendered in the page lags behind the video during scrolling, so the DOM alone is not reliable).
- Verdicts are applied every 100 ms: blacklisted → pause + auto-skip, whitelisted → OFFICIAL badge, unlisted → classification badge.
- Two lists are combined for every verdict: your **personal lists** and the **community list**. Your personal lists always win — whitelisting a channel personally overrides a community block, and vice versa.
- Your personal lists live in `chrome.storage.sync` (synced with your browser profile). The community list lives in `chrome.storage.local`. Session statistics live in `chrome.storage.session` and are cleared when the browser closes.

### Community list updates

The community list is [anti-clipper-lists.json](anti-clipper-lists.json) in this repository. A copy ships inside the extension package, so it works offline and out of the box. The extension periodically (at most once every 6 hours, on browser startup or when the popup opens) downloads the file from this repository and compares its `revision` number with the installed one. When a newer revision exists, the toolbar icon shows a NEW badge and the popup shows an **Update community list** button — nothing is applied until you press it. The community list can be turned off entirely with its own toggle in the popup.

Want a channel added to (or removed from) the community list? Open an issue.

## Privacy

Anti-clipper collects **no data whatsoever**: no analytics, no tracking, no accounts. Your lists stay in your browser (`chrome.storage`), and the extension makes only two kinds of network request: YouTube's own public oEmbed endpoint (to identify the channel of the Short on screen) and the public community list file in this repository (to check for and download list updates). Neither sends anything about you. Full policy: [PRIVACY.md](PRIVACY.md).

## Contributing

Issues and pull requests are welcome. If a badge or the auto-skip stops working, YouTube probably changed its DOM: please open an issue with the console output (set `DEBUG = true` at the top of `content.js` to enable logging).
