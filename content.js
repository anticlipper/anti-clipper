// ==========================================================
// Anti-clipper - content.js
// ==========================================================
// Logic (hybrid mode):
// - Channel in WHITELIST -> highlighted in green ("original")
// - Channel in BLACKLIST -> red "BLOCKED" overlay + playback stopped
// - Everyone else        -> shown normally, no label
//
// APPROACH: YouTube's Shorts internals are obfuscated/minified and
// change often, so trying to react "cleverly" to specific DOM events
// (play, loadeddata, intersection...) is fragile - their timing
// relative to the channel metadata being updated is not reliable.
//
// Instead, this version brute-forces it: every 100ms, it freshly
// re-reads EVERY currently rendered card and EVERY currently playing
// video from scratch (no cached/remembered state carried over), and
// re-applies the correct badge/overlay/pause decision. No card is
// ever "trusted" to keep an old state - it's fully recomputed each
// tick. This costs a little CPU but removes the lag/desync issues
// that come from trying to track state across DOM node reuse.
// ==========================================================

const CARD_SELECTOR =
  "ytd-reel-video-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model, ytd-video-renderer";

// ---- Debug instrumentation (logs only on state CHANGES, low noise) ----
const DEBUG = false;
// Set to false to show the BLOCKED overlay without skipping (useful for
// screenshots/debugging). Blocked videos stay paused either way.
const AUTO_SKIP = true;
let cardIdCounter = 0;
function dbg(...args) {
  if (DEBUG) console.log("[OCF " + (performance.now() / 1000).toFixed(2) + "s]", ...args);
}
function cardId(card) {
  if (!card.dataset.ocfId) card.dataset.ocfId = String(++cardIdCounter);
  return (
    card.tagName.toLowerCase().replace("ytd-reel-video-renderer", "reel") +
    "#" + card.dataset.ocfId +
    (card.hasAttribute("is-active") ? "*ACTIVE*" : "")
  );
}

const STATE = {
  whitelist: new Set(), // user's own lists (storage.sync) - always win
  blacklist: new Set(),
  communityWhitelist: new Set(), // curated list from GitHub (storage.local)
  communityBlacklist: new Set(),
  communityEnabled: true,
  enabled: true,
};

function normalizeHandle(raw) {
  if (!raw) return null;
  return raw.trim().toLowerCase().replace(/^@/, "");
}

// Combined verdicts. The user's own lists always override the community
// list: a channel the user whitelisted is never blocked, a channel the
// user blacklisted is always blocked.
function isBlocked(handle) {
  if (STATE.whitelist.has(handle)) return false;
  if (STATE.blacklist.has(handle)) return true;
  return STATE.communityEnabled && STATE.communityBlacklist.has(handle);
}

function isOfficial(handle) {
  if (STATE.blacklist.has(handle)) return false;
  if (STATE.whitelist.has(handle)) return true;
  return STATE.communityEnabled && STATE.communityWhitelist.has(handle);
}

function applyCommunityList(list) {
  STATE.communityWhitelist = new Set(((list && list.whitelist) || []).map(normalizeHandle));
  STATE.communityBlacklist = new Set(((list && list.blacklist) || []).map(normalizeHandle));
}

function loadSettings() {
  const syncReady = new Promise((resolve) => {
    chrome.storage.sync.get(
      ["whitelist", "blacklist", "enabled", "communityEnabled"],
      (data) => {
        STATE.whitelist = new Set((data.whitelist || []).map(normalizeHandle));
        STATE.blacklist = new Set((data.blacklist || []).map(normalizeHandle));
        STATE.enabled = data.enabled !== false;
        STATE.communityEnabled = data.communityEnabled !== false;
        resolve();
      }
    );
  });
  const localReady = new Promise((resolve) => {
    chrome.storage.local.get(["communityList"], (data) => {
      applyCommunityList(data.communityList);
      resolve();
    });
  });
  return Promise.all([syncReady, localReady]);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    if (changes.whitelist) {
      STATE.whitelist = new Set((changes.whitelist.newValue || []).map(normalizeHandle));
    }
    if (changes.blacklist) {
      STATE.blacklist = new Set((changes.blacklist.newValue || []).map(normalizeHandle));
    }
    if (changes.enabled) {
      STATE.enabled = changes.enabled.newValue !== false;
      dbg("filters", STATE.enabled ? "ENABLED" : "DISABLED");
    }
    if (changes.communityEnabled) {
      STATE.communityEnabled = changes.communityEnabled.newValue !== false;
      dbg("community list", STATE.communityEnabled ? "ENABLED" : "DISABLED");
    }
  }
  if (area === "local" && changes.communityList) {
    applyCommunityList(changes.communityList.newValue);
    dbg("community list updated");
  }
});

// ---- Authoritative channel lookup for the active Short ----
// Evidence from debugging: when YouTube recycles the reel renderer for
// the next Short, it swaps the <video> immediately but leaves the OLD
// channel metadata in the DOM for up to ~1s. Any DOM read in that window
// reports the PREVIOUS video's channel, so DOM alone cannot be trusted
// for the currently playing Short. The URL (/shorts/<id>) changes
// instantly, and YouTube's public oEmbed endpoint maps id -> channel
// reliably, so we use that as the source of truth for the active Short.

function getActiveShortId() {
  const m = location.pathname.match(/^\/shorts\/([\w-]+)/);
  return m ? m[1] : null;
}

const HANDLE_CACHE = new Map(); // videoId -> normalized handle (null = lookup failed)
const HANDLE_PENDING = new Set();

function requestHandleLookup(videoId) {
  if (HANDLE_CACHE.has(videoId) || HANDLE_PENDING.has(videoId)) return;
  HANDLE_PENDING.add(videoId);
  const url =
    "https://www.youtube.com/oembed?format=json&url=" +
    encodeURIComponent("https://www.youtube.com/shorts/" + videoId);
  fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      let handle = null;
      if (data && data.author_url) {
        const m = data.author_url.match(/\/@([^/?]+)/);
        if (m) handle = normalizeHandle(decodeURIComponent(m[1]));
      }
      HANDLE_CACHE.set(videoId, handle);
      dbg("oembed verdict:", videoId, "->", handle);
    })
    .catch(() => {
      HANDLE_CACHE.set(videoId, null);
      dbg("oembed FAILED for", videoId);
    })
    .finally(() => HANDLE_PENDING.delete(videoId));
}

function extractChannelHandle(card) {
  const link = card.querySelector('a[href^="/@"]');
  if (link) {
    const match = link.getAttribute("href").match(/^\/@([^/?]+)/);
    if (match) return match[1];
  }
  const channelNameEl = card.querySelector(
    "ytd-channel-name #text, .ytd-channel-name, #channel-name a, #text.ytd-channel-name"
  );
  if (channelNameEl) {
    const a = channelNameEl.closest("a") || channelNameEl.querySelector("a");
    if (a && a.getAttribute("href", "")?.startsWith("/@")) {
      const match = a.getAttribute("href").match(/^\/@([^/?]+)/);
      if (match) return match[1];
    }
  }
  return null;
}

function extractChannelDisplayName(card) {
  const channelNameEl = card.querySelector(
    "ytd-channel-name #text, .ytd-channel-name, #channel-name a, #text.ytd-channel-name"
  );
  if (channelNameEl && channelNameEl.textContent.trim()) {
    return channelNameEl.textContent.trim();
  }
  const link = card.querySelector('a[href^="/@"]');
  if (link && link.textContent.trim()) return link.textContent.trim();
  return null;
}

function ensureBlockOverlay(card, displayName) {
  let overlay = card.querySelector(":scope > .ocf-block-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "ocf-block-overlay";
    const badge = document.createElement("div");
    badge.className = "ocf-block-badge";
    overlay.appendChild(badge);
    card.appendChild(overlay);
  }
  overlay.querySelector(".ocf-block-badge").textContent =
    "BLOCKED" + (displayName ? " — " + displayName : "");
}

function removeBlockOverlay(card) {
  const overlay = card.querySelector(":scope > .ocf-block-overlay");
  if (overlay) overlay.remove();
}

// ---- Session block statistics (popup's "top blocked channels") ----
let statsCountedHref = "";
function recordBlockEvent(handle) {
  if (statsCountedHref === lastHref) return; // one count per navigation
  statsCountedHref = lastHref;
  dbg("block event:", handle);
  chrome.storage.session.get(["blockStats"], (data) => {
    if (chrome.runtime.lastError) {
      dbg("stats get FAILED:", chrome.runtime.lastError.message);
      return;
    }
    const stats = (data && data.blockStats) || {};
    stats[handle] = (stats[handle] || 0) + 1;
    chrome.storage.session.set({ blockStats: stats }, () => {
      if (chrome.runtime.lastError) {
        dbg("stats set FAILED:", chrome.runtime.lastError.message);
      }
    });
  });
}

// ---- Auto-skip blocked Shorts ----
// Click YouTube's own "next video" arrow so the blocked Short is never
// watched. Rate-limited and capped: if the button can't be found (DOM
// change), the regular pause + overlay block still applies.
let skipState = { id: null, attempts: 0, lastAttempt: 0 };
function attemptAutoSkip(videoId) {
  if (skipState.id !== videoId) {
    skipState = { id: videoId, attempts: 0, lastAttempt: 0 };
  }
  const now = performance.now();
  if (skipState.attempts >= 5 || now - skipState.lastAttempt < 500) return;
  skipState.attempts += 1;
  skipState.lastAttempt = now;

  const nextBtn = document.querySelector(
    "#navigation-button-down button, #navigation-button-down yt-button-shape button"
  );
  if (nextBtn) {
    dbg("AUTO-SKIP", videoId, "attempt", skipState.attempts);
    nextBtn.click();
  } else {
    dbg("AUTO-SKIP: next button not found (attempt", skipState.attempts + ")");
  }
}

// ---- Yellow badge + classify buttons for unlisted channels ----
function addHandleToList(key, handle) {
  // Update local state immediately so the very next tick reacts,
  // then persist (storage.onChanged keeps other tabs in sync).
  STATE[key].add(handle);
  chrome.storage.sync.get([key], (data) => {
    const list = data[key] || [];
    if (!list.includes(handle)) {
      list.push(handle);
      chrome.storage.sync.set({ [key]: list });
    }
  });
}

function ensureUnlistedBadge(card, handle) {
  card.classList.add("ocf-unlisted-host");
  let badge = card.querySelector(":scope > .ocf-unlisted-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.className = "ocf-unlisted-badge";

    const logo = document.createElement("img");
    logo.className = "ocf-badge-logo";
    logo.src = chrome.runtime.getURL("icon128.png");
    logo.alt = "";

    const label = document.createElement("span");
    label.className = "ocf-unlisted-handle";

    const whiteBtn = document.createElement("button");
    whiteBtn.className = "ocf-btn-white";
    whiteBtn.textContent = "✓";
    whiteBtn.title = "Add channel to whitelist";

    const blackBtn = document.createElement("button");
    blackBtn.className = "ocf-btn-black";
    blackBtn.textContent = "✕";
    blackBtn.title = "Add channel to blacklist";

    const stop = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    [whiteBtn, blackBtn].forEach((btn) => {
      btn.addEventListener("pointerdown", stop);
      btn.addEventListener("pointerup", stop);
    });
    whiteBtn.addEventListener("click", (e) => {
      stop(e);
      addHandleToList("whitelist", badge.dataset.ocfHandle);
    });
    blackBtn.addEventListener("click", (e) => {
      stop(e);
      addHandleToList("blacklist", badge.dataset.ocfHandle);
    });

    badge.appendChild(logo);
    badge.appendChild(label);
    badge.appendChild(whiteBtn);
    badge.appendChild(blackBtn);
    card.appendChild(badge);
  }
  // Card gets recycled for other Shorts: keep handle/text current.
  if (badge.dataset.ocfHandle !== handle) {
    badge.dataset.ocfHandle = handle;
    badge.querySelector(".ocf-unlisted-handle").textContent = "@" + handle;
  }
}

function removeUnlistedBadge(card) {
  const badge = card.querySelector(":scope > .ocf-unlisted-badge");
  if (badge) badge.remove();
  card.classList.remove("ocf-unlisted-host");
}

// ---- DOM-based handle detection (fallback path) ----
// Confirmation gate: require the SAME handle on two consecutive ticks
// (~200ms) before acting on it, to filter one-tick glitches while
// YouTube swaps card content. Returns the handle to display and whether
// it is fresh enough to justify pausing playback.
function domConfirmedHandle(card) {
  const rawHandle = normalizeHandle(extractChannelHandle(card));

  if (card.dataset.ocfLastRaw !== String(rawHandle)) {
    dbg(cardId(card), "raw read:", card.dataset.ocfLastRaw, "->", rawHandle);
    card.dataset.ocfLastRaw = String(rawHandle);
  }

  if (!rawHandle) return { handle: null, enforceable: false };

  if (card.dataset.ocfPendingHandle === rawHandle) {
    const seen = parseInt(card.dataset.ocfPendingCount || "0", 10) + 1;
    card.dataset.ocfPendingCount = String(seen);
  } else {
    card.dataset.ocfPendingHandle = rawHandle;
    card.dataset.ocfPendingCount = "1";
  }

  const confirmed = parseInt(card.dataset.ocfPendingCount, 10) >= 2;

  if (confirmed) {
    if (card.dataset.ocfHandle !== rawHandle) {
      dbg(cardId(card), "CONFIRMED handle:", card.dataset.ocfHandle, "->", rawHandle);
    }
    card.dataset.ocfHandle = rawHandle; // last confirmed handle for this card
  }

  // Use the last CONFIRMED handle (if any) to decide badges/whitelist.
  // If nothing has been confirmed yet for this card, fall back to the
  // raw read so a brand-new card doesn't sit unlabeled forever.
  const handle = card.dataset.ocfHandle || (confirmed ? rawHandle : null);
  // Only fresh, just-confirmed reads may pause playback: a handle
  // inherited from a recycled card must never stop the wrong video.
  return { handle: handle, enforceable: confirmed && handle === rawHandle };
}

function recoverVideo(video, ctx) {
  delete video.dataset.ocfBlocked;
  video.muted = video.dataset.ocfPrevMuted === "1";
  delete video.dataset.ocfPrevMuted;
  delete video.dataset.ocfBlockedSrc;
  dbg("RECOVERY play() [" + ctx + "] src:...", (video.currentSrc || "").slice(-25));
  try {
    const p = video.play();
    if (p && p.catch) p.catch((err) => dbg("RECOVERY play() rejected:", err && err.name));
  } catch (e) {
    dbg("RECOVERY play() threw:", e && e.name);
  }
}

// ---- Fully recompute state for ONE card, from scratch, every tick ----
function tickCard(card) {
  let handle = null;
  let enforceable = false;

  const activeId = getActiveShortId();
  const isActiveShortCard =
    activeId &&
    card.tagName === "YTD-REEL-VIDEO-RENDERER" &&
    !!card.querySelector("video");

  if (isActiveShortCard) {
    requestHandleLookup(activeId);
    if (!HANDLE_CACHE.has(activeId)) {
      // Verdict not ready (~100-300ms): change nothing this tick. In
      // particular, do NOT act on the stale DOM metadata of the
      // previous video.
      return;
    }
    handle = HANDLE_CACHE.get(activeId);
    enforceable = true; // authoritative: id comes from the URL, not the DOM

    if (handle && isBlocked(handle)) {
      recordBlockEvent(handle);
      if (AUTO_SKIP) attemptAutoSkip(activeId);
    }

    // Kickstart: if this Short is clean but its video sits paused at the
    // very start, YouTube inherited a paused state (we paused the
    // previous, blocked Short) and will never autoplay it. Keep nudging
    // play() for up to 3s after the navigation: a single attempt can be
    // silently aborted by YouTube's own load requests mid-transition
    // (e.g. right after blocking a channel via the badge button). Stop as
    // soon as the video actually plays; a manual pause always happens
    // with currentTime > 0.05, so it is never overridden.
    if (handle && !isBlocked(handle) && kickstartDeadline) {
      const v = card.querySelector("video");
      if (v && (!v.paused || v.currentTime > 0.05)) {
        kickstartDeadline = 0; // playing (or user is past the start): done
      } else if (performance.now() >= kickstartDeadline) {
        kickstartDeadline = 0; // give up, stop nudging
      } else if (v) {
        dbg("KICKSTART play() for", activeId);
        try {
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        } catch (e) {
          /* ignore */
        }
      }
    }
  }

  if (!handle) {
    const dom = domConfirmedHandle(card);
    handle = dom.handle;
    enforceable = dom.enforceable;
    if (!handle) return;
  }

  const isBlacklisted = isBlocked(handle);
  const isWhitelisted = isOfficial(handle);

  // Blacklist badge + overlay
  if (isBlacklisted) {
    if (!card.classList.contains("ocf-has-overlay")) {
      card.classList.add("ocf-has-overlay");
      dbg(cardId(card), "OVERLAY ON (handle:", handle + ")");
    }
    ensureBlockOverlay(card, extractChannelDisplayName(card));
  } else {
    if (card.classList.contains("ocf-has-overlay")) {
      card.classList.remove("ocf-has-overlay");
      removeBlockOverlay(card);
      dbg(cardId(card), "OVERLAY OFF (handle:", handle + ")");
    }
  }

  // Whitelist badge (mutually exclusive with blacklist)
  if (isWhitelisted && !isBlacklisted) {
    if (!card.classList.contains("ocf-original")) {
      card.classList.add("ocf-original");
    }
  } else {
    if (card.classList.contains("ocf-original")) {
      card.classList.remove("ocf-original");
    }
  }

  // Unlisted channel: yellow badge + classify buttons, active Short only
  if (isActiveShortCard && !isBlacklisted && !isWhitelisted) {
    ensureUnlistedBadge(card, handle);
  } else {
    removeUnlistedBadge(card);
  }

  // Playback enforcement: stop every <video> inside a blacklisted card,
  // every single tick.
  if (isBlacklisted && enforceable) {
    card.querySelectorAll("video").forEach((video) => {
      if (video.dataset.ocfBlocked !== "1") {
        video.dataset.ocfBlocked = "1";
        video.dataset.ocfPrevMuted = video.muted ? "1" : "0";
        video.dataset.ocfBlockedSrc = video.currentSrc || "";
      }
      if (!video.paused || video.currentTime > 0.05) {
        dbg(cardId(card), "PAUSE (handle:", handle + ")", "src:...", (video.currentSrc || "").slice(-25), "t:", video.currentTime.toFixed(2));
        try {
          video.pause();
          video.muted = true;
          video.currentTime = 0;
        } catch (e) {
          /* ignore */
        }
      }
    });
  } else if (!isBlacklisted) {
    // Recovery: YouTube calls play() only once per Short, so if WE paused
    // this video and the verdict turns out clean (false positive during a
    // card swap), we must resume it ourselves or it stays frozen forever.
    card.querySelectorAll('video[data-ocf-blocked="1"]').forEach((video) => {
      recoverVideo(video, "card clean, handle: " + handle);
    });
  }
}

// Filters disabled: strip every trace of our UI and free any video we
// paused, so YouTube behaves as if the extension weren't there.
function cleanupAll() {
  document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
    removeBlockOverlay(card);
    removeUnlistedBadge(card);
    card.classList.remove("ocf-has-overlay", "ocf-original");
  });
  document.querySelectorAll('video[data-ocf-blocked="1"]').forEach((video) => {
    recoverVideo(video, "filters disabled");
  });
}

let lastHref = "";
let kickstartDeadline = 0;
function tickAll() {
  if (!STATE.enabled) {
    cleanupAll();
    return;
  }
  if (location.href !== lastHref) {
    lastHref = location.href;
    kickstartDeadline = performance.now() + 3000;
    dbg("URL:", location.href);
  }
  if (DEBUG) {
    document.querySelectorAll("video").forEach((v) => {
      const c = v.closest(CARD_SELECTOR);
      const key = c ? cardId(c) : "OUTSIDE-ANY-CARD";
      const state = key + "|paused:" + v.paused;
      if (v.dataset.ocfVidState !== state) {
        v.dataset.ocfVidState = state;
        dbg("video in:", key, "paused:", v.paused, "muted:", v.muted, "src:...", (v.currentSrc || "").slice(-25));
      }
    });
  }
  document.querySelectorAll(CARD_SELECTOR).forEach(tickCard);

  // Orphan recovery: a video we paused can be moved OUTSIDE every card by
  // YouTube, where per-card recovery can't reach it. Resume it if it now
  // shows a different video (src changed), or if the Short the user is
  // actually on is clean - the pause could have hit the wrong video in
  // the src-swaps-before-URL race during fast back-and-forth scrolling.
  document.querySelectorAll('video[data-ocf-blocked="1"]').forEach((video) => {
    if (video.closest(CARD_SELECTOR)) return;
    const activeId = getActiveShortId();
    const activeClean =
      !activeId ||
      (HANDLE_CACHE.has(activeId) && !isBlocked(HANDLE_CACHE.get(activeId)));
    if ((video.currentSrc || "") !== video.dataset.ocfBlockedSrc || activeClean) {
      recoverVideo(video, "orphan");
    }
  });
}

// Tight loop: fresh, brute-force re-check. 100ms is frequent enough to
// feel instant while staying cheap for the handful of cards YouTube
// keeps mounted at once.
function startTicking() {
  setInterval(tickAll, 100);
}

(async function init() {
  await loadSettings();
  tickAll();
  startTicking();
})();
