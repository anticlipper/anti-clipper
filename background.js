// Session-scoped block statistics live in chrome.storage.session, which
// content scripts cannot touch by default - grant them access here.
chrome.storage.session.setAccessLevel({
  accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
});

// ==========================================================
// Community list
// ==========================================================
// A curated whitelist/blacklist maintained in the public GitHub repo.
// A copy ships inside the extension package (anti-clipper-lists.json)
// so it works out of the box; updates are pulled manually by the user
// from the raw file on GitHub when a newer revision is detected.
// The list itself lives in storage.local (it is re-downloadable, no
// point syncing it and it could outgrow storage.sync quotas).

const COMMUNITY_LIST_URL =
  "https://raw.githubusercontent.com/anticlipper/anti-clipper/main/anti-clipper-lists.json";
// Remote checks are throttled: at most one every 6 hours, triggered by
// browser startup or by opening the popup.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function normalizeHandle(raw) {
  if (!raw) return null;
  return String(raw).trim().toLowerCase().replace(/^@/, "");
}

function sanitizeCommunityList(json) {
  if (!json || json.type !== "original-creators-only-lists") return null;
  return {
    revision: Number(json.revision) || 0,
    whitelist: (json.whitelist || []).map(normalizeHandle).filter(Boolean),
    blacklist: (json.blacklist || []).map(normalizeHandle).filter(Boolean),
  };
}

function setUpdateBadge(on) {
  chrome.action.setBadgeText({ text: on ? "NEW" : "" });
  if (on) {
    chrome.action.setBadgeBackgroundColor({ color: "#2ecc71" });
  }
}

// Load the list bundled in the package into storage.local, unless a
// same-or-newer revision is already installed (e.g. previously synced
// from GitHub). Runs on install and on every extension update, so
// shipping a fresher list with an update also works.
function seedBundledList() {
  fetch(chrome.runtime.getURL("anti-clipper-lists.json"))
    .then((r) => r.json())
    .then((json) => {
      const bundled = sanitizeCommunityList(json);
      if (!bundled) return;
      chrome.storage.local.get(["communityList"], (data) => {
        const current = data.communityList;
        if (!current || bundled.revision > current.revision) {
          chrome.storage.local.set({ communityList: bundled });
        }
      });
    })
    .catch(() => {});
}

function fetchRemoteList() {
  return fetch(COMMUNITY_LIST_URL, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => sanitizeCommunityList(json))
    .catch(() => null);
}

// Compare the remote revision with the installed one; if newer, flag it
// (popup shows the update button, icon shows a NEW badge). Never applies
// the update by itself - that is the user's click.
function checkForListUpdate(sendResponse) {
  chrome.storage.local.get(
    ["communityList", "communityLastCheck", "communityUpdateAvailable"],
    (data) => {
      const last = data.communityLastCheck || 0;
      if (data.communityUpdateAvailable || Date.now() - last < CHECK_INTERVAL_MS) {
        if (sendResponse) sendResponse({ updateAvailable: !!data.communityUpdateAvailable });
        return;
      }
      chrome.storage.local.set({ communityLastCheck: Date.now() });
      fetchRemoteList().then((remote) => {
        const installed = data.communityList || { revision: 0 };
        const available = !!remote && remote.revision > installed.revision;
        if (available) {
          chrome.storage.local.set({ communityUpdateAvailable: true });
          setUpdateBadge(true);
        }
        if (sendResponse) sendResponse({ updateAvailable: available });
      });
    }
  );
}

// Download the current remote list and install it as the community list.
function applyListUpdate(sendResponse) {
  fetchRemoteList().then((remote) => {
    if (!remote) {
      if (sendResponse) sendResponse({ ok: false });
      return;
    }
    chrome.storage.local.set(
      {
        communityList: remote,
        communityUpdateAvailable: false,
        communityLastCheck: Date.now(),
      },
      () => {
        setUpdateBadge(false);
        if (sendResponse) sendResponse({ ok: true, revision: remote.revision });
      }
    );
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "community-check") {
    checkForListUpdate(sendResponse);
    return true; // async response
  }
  if (msg && msg.type === "community-apply-update") {
    applyListUpdate(sendResponse);
    return true; // async response
  }
});

// ==========================================================
// Toolbar icon
// ==========================================================
// Green dot when the filters are active, red dot when disabled.
function updateIcon(enabled) {
  chrome.action.setIcon({ path: enabled ? "icon128-on.png" : "icon128-off.png" });
}

function refreshIcon() {
  chrome.storage.sync.get(["enabled"], (data) => {
    updateIcon(data.enabled !== false);
  });
}

function restoreBadge() {
  chrome.storage.local.get(["communityUpdateAvailable"], (data) => {
    setUpdateBadge(!!data.communityUpdateAvailable);
  });
}

refreshIcon();
chrome.runtime.onStartup.addListener(() => {
  refreshIcon();
  restoreBadge();
  checkForListUpdate();
});
chrome.runtime.onInstalled.addListener(() => {
  refreshIcon();
  restoreBadge();
  seedBundledList();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.enabled) {
    updateIcon(changes.enabled.newValue !== false);
  }
});
