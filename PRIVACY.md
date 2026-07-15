# Anti-clipper — Privacy Policy

_Last updated: July 15, 2026_

## Summary

Anti-clipper does not collect, transmit, sell, or share any personal data. Everything the extension knows stays in your browser.

## Data stored by the extension

All data is stored locally in your browser using Chrome's extension storage:

- **Whitelist and blacklist** (channel handles you add) — stored in `chrome.storage.sync`, which your browser may sync across your own devices through your browser account. The developer has no access to it.
- **On/off state of the filters and of the community list** — stored in `chrome.storage.sync`.
- **Community list** (the public curated list of channels shipped with the extension and updated from the project's GitHub repository) — stored in `chrome.storage.local`. It contains no user data.
- **Session block counters** (how many Shorts per channel were blocked) — stored in `chrome.storage.session`, which is kept in memory only and is automatically erased when you close the browser.

None of this data is ever sent to the developer or to any third party.

## Network requests

The extension makes exactly two types of network request:

1. A call to YouTube's public oEmbed endpoint (`https://www.youtube.com/oembed`) containing the ID of the Short currently on screen, used to identify which channel published it. This request goes only to `youtube.com` (a domain you are already on) and contains no personal information, account data, or identifiers added by the extension.
2. A download of the public community list file from this project's GitHub repository (`https://raw.githubusercontent.com/anticlipper/anti-clipper/...`), used to check whether a newer version of the curated list is available and, only when you press the update button, to install it. This request contains no personal information and sends nothing about you or your lists; it only downloads a public file. It runs at most once every few hours.

Neither request is routed through any server operated by the developer. The extension contacts no other server. It includes no analytics, no telemetry, and no advertising.

## Permissions

- **`storage`** — used to save your channel lists, the community list, the on/off states, and the session counters described above.
- **Host access to `https://www.youtube.com/*`** — required to read which channel a Short belongs to, to show badges, and to pause/skip blocked videos. The extension runs only on YouTube.
- **Host access to `https://raw.githubusercontent.com/*`** — required only to download the public community list file from this repository, as described above. No page content is read from GitHub and no code runs there.

## Changes

Any change to this policy will be published in this repository together with the corresponding extension update.

## Contact

For questions about this policy, open an issue at https://github.com/anticlipper/anti-clipper/issues
