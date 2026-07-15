# Anti-clipper

Block clipper and re-upload channels on YouTube Shorts. Anti-clipper keeps a personal blacklist of channels: when a Short from a blacklisted channel comes up, it is paused instantly and skipped automatically — you never watch it.

## Features

- **Auto-skip blocked channels** — Shorts from blacklisted channels are paused immediately and skipped before they play.
- **Classify channels while you scroll** — every Short from an unlisted channel shows a small badge with the channel handle and two buttons: whitelist (✓) or blacklist (✕).
- **OFFICIAL badge** — whitelisted channels are highlighted in green so you can recognize original creators at a glance.
- **Session stats** — the popup shows the top 3 most-blocked channels of the current browser session, updated live.
- **One-click on/off** — a toggle disables all filters; the toolbar icon shows a green dot when active and a red dot when disabled.
- **Import / export** — back up both lists to a JSON file or merge someone else's lists into yours.

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
- Your lists live in `chrome.storage.sync` (synced with your browser profile). Session statistics live in `chrome.storage.session` and are cleared when the browser closes.

## Privacy

Anti-clipper collects **no data whatsoever**: no analytics, no tracking, no accounts. Your lists stay in your browser (`chrome.storage`), and the only network request the extension makes is to YouTube's own public oEmbed endpoint to identify the channel of the Short on screen. Full policy: [PRIVACY.md](PRIVACY.md).

## Contributing

Issues and pull requests are welcome. If a badge or the auto-skip stops working, YouTube probably changed its DOM: please open an issue with the console output (set `DEBUG = true` at the top of `content.js` to enable logging).
