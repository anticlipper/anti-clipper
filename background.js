// Session-scoped block statistics live in chrome.storage.session, which
// content scripts cannot touch by default - grant them access here.
chrome.storage.session.setAccessLevel({
  accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
});

// Toolbar icon reflects the global on/off state: green dot when the
// filters are active, red dot when disabled.
function updateIcon(enabled) {
  chrome.action.setIcon({ path: enabled ? "icon128-on.png" : "icon128-off.png" });
}

function refreshIcon() {
  chrome.storage.sync.get(["enabled"], (data) => {
    updateIcon(data.enabled !== false);
  });
}

refreshIcon();
chrome.runtime.onStartup.addListener(refreshIcon);
chrome.runtime.onInstalled.addListener(refreshIcon);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.enabled) {
    updateIcon(changes.enabled.newValue !== false);
  }
});
