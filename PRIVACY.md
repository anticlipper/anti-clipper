# Anti-clipper — Privacy Policy

_Last updated: July 14, 2026_

## Summary

Anti-clipper does not collect, transmit, sell, or share any personal data. Everything the extension knows stays in your browser.

## Data stored by the extension

All data is stored locally in your browser using Chrome's extension storage:

- **Whitelist and blacklist** (channel handles you add) — stored in `chrome.storage.sync`, which Chrome may sync across your own devices through your Google account. The developer has no access to it.
- **On/off state of the filters** — stored in `chrome.storage.sync`.
- **Session block counters** (how many Shorts per channel were blocked) — stored in `chrome.storage.session`, which is kept in memory only and is automatically erased when you close the browser.

None of this data is ever sent to the developer or to any third party.

## Network requests

The extension makes exactly one type of network request: a call to YouTube's public oEmbed endpoint (`https://www.youtube.com/oembed`) containing the ID of the Short currently on screen, used to identify which channel published it. This request:

- goes only to `youtube.com` (a domain you are already on);
- contains no personal information, account data, or identifiers added by the extension;
- is not routed through any server operated by the developer.

The extension contacts no other server. It includes no analytics, no telemetry, and no advertising.

## Permissions

- **`storage`** — used to save your channel lists, the on/off state, and the session counters described above.
- **Host access to `https://www.youtube.com/*`** — required to read which channel a Short belongs to, to show badges, and to pause/skip blocked videos. The extension runs only on YouTube.

## Changes

Any change to this policy will be published in this repository together with the corresponding extension update.

## Contact

For questions about this policy, open an issue at https://github.com/anticlipper/anti-clipper/issues
