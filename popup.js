function normalize(raw) {
  return raw.trim().toLowerCase().replace(/^@/, "");
}

const els = {
  viewHome: document.getElementById("viewHome"),
  viewList: document.getElementById("viewList"),
  topBlocked: document.getElementById("topBlocked"),
  showBlackBtn: document.getElementById("showBlackBtn"),
  showWhiteBtn: document.getElementById("showWhiteBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
  backBtn: document.getElementById("backBtn"),
  listTitle: document.getElementById("listTitle"),
  listInput: document.getElementById("listInput"),
  listAddBtn: document.getElementById("listAddBtn"),
  listItems: document.getElementById("listItems"),
  enabledToggle: document.getElementById("enabledToggle"),
  communityToggle: document.getElementById("communityToggle"),
  communityInfo: document.getElementById("communityInfo"),
  communityUpdateBtn: document.getElementById("communityUpdateBtn"),
};

let currentKey = null; // "whitelist" | "blacklist" while the list view is open

// ---- Global on/off toggle (icon dot is updated by background.js) ----
function applyEnabledUI(enabled) {
  els.enabledToggle.checked = enabled;
  document.getElementById("toggleLabel").textContent = enabled ? "ON" : "OFF";
  document.body.classList.toggle("off", !enabled);
}

chrome.storage.sync.get(["enabled"], (data) => {
  applyEnabledUI(data.enabled !== false);
});
els.enabledToggle.addEventListener("change", () => {
  const enabled = els.enabledToggle.checked;
  chrome.storage.sync.set({ enabled: enabled });
  applyEnabledUI(enabled);
});

// ---- Community list: toggle, status line, update button ----
function renderCommunity() {
  chrome.storage.local.get(["communityList", "communityUpdateAvailable"], (data) => {
    const list = data.communityList;
    if (list) {
      const parts = [list.blacklist.length + " blocked"];
      if (list.whitelist.length > 0) parts.push(list.whitelist.length + " official");
      els.communityInfo.textContent =
        parts.join(", ") + " channels (rev " + list.revision + ")";
    } else {
      els.communityInfo.textContent = "Not installed yet.";
    }
    els.communityUpdateBtn.hidden = !data.communityUpdateAvailable;
  });
}

chrome.storage.sync.get(["communityEnabled"], (data) => {
  const on = data.communityEnabled !== false;
  els.communityToggle.checked = on;
  document.body.classList.toggle("community-off", !on);
});
els.communityToggle.addEventListener("change", () => {
  const on = els.communityToggle.checked;
  chrome.storage.sync.set({ communityEnabled: on });
  document.body.classList.toggle("community-off", !on);
});

els.communityUpdateBtn.addEventListener("click", () => {
  els.communityUpdateBtn.disabled = true;
  els.communityUpdateBtn.textContent = "Updating...";
  chrome.runtime.sendMessage({ type: "community-apply-update" }, (res) => {
    els.communityUpdateBtn.disabled = false;
    els.communityUpdateBtn.textContent = "Update community list";
    if (!res || !res.ok) {
      els.communityInfo.textContent = "Update failed. Check your connection and retry.";
      return;
    }
    renderCommunity();
  });
});

// Opening the popup also triggers a (throttled) check for a newer list.
chrome.runtime.sendMessage({ type: "community-check" }, (res) => {
  if (res && res.updateAvailable) renderCommunity();
});

// ---- Live updates while the popup stays open ----
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.blockStats && !els.viewHome.hidden) {
    renderHome();
  }
  if (area === "sync" && (changes.whitelist || changes.blacklist)) {
    if (!els.viewHome.hidden) {
      renderHome();
    } else if (currentKey) {
      renderListItems();
    }
  }
  if (area === "sync" && changes.enabled) {
    applyEnabledUI(changes.enabled.newValue !== false);
  }
  if (area === "local" && (changes.communityList || changes.communityUpdateAvailable)) {
    renderCommunity();
  }
});

// ---- Home view: top 3 blocked channels this session + list buttons ----
function renderHome() {
  chrome.storage.sync.get(["whitelist", "blacklist"], (lists) => {
    chrome.storage.session.get(["blockStats"], (data) => {
      const stats = (data && data.blockStats) || {};
      const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]);

      els.topBlocked.innerHTML = "";
      if (entries.length === 0) {
        const li = document.createElement("li");
        li.className = "empty";
        li.textContent = "No blocks this session yet.";
        els.topBlocked.appendChild(li);
      } else {
        entries.slice(0, 3).forEach(([handle, count], i) => {
          const li = document.createElement("li");
          const rank = document.createElement("span");
          rank.className = "rank";
          rank.textContent = i + 1 + ".";
          const name = document.createElement("span");
          name.className = "handle";
          name.textContent = "@" + handle;
          const cnt = document.createElement("span");
          cnt.className = "count";
          cnt.textContent = count + (count === 1 ? " block" : " blocks");
          li.append(rank, name, cnt);
          els.topBlocked.appendChild(li);
        });
      }

      els.showBlackBtn.textContent = "Blacklist (" + (lists.blacklist || []).length + ")";
      els.showWhiteBtn.textContent = "Whitelist (" + (lists.whitelist || []).length + ")";
    });
  });
}

// ---- List view: full whitelist/blacklist with add/remove ----
function renderListItems() {
  chrome.storage.sync.get([currentKey], (data) => {
    const items = data[currentKey] || [];
    const tagClass = currentKey === "blacklist" ? "tag-black" : "tag-white";
    els.listItems.innerHTML = "";
    items.forEach((handle) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.className = tagClass;
      span.textContent = "@" + handle;
      const btn = document.createElement("button");
      btn.textContent = "x";
      btn.className = "remove";
      btn.addEventListener("click", () => removeFromList(currentKey, handle));
      li.appendChild(span);
      li.appendChild(btn);
      els.listItems.appendChild(li);
    });
  });
}

function openList(key) {
  currentKey = key;
  els.listTitle.textContent =
    key === "blacklist" ? "Blacklist — blocked clippers" : "Whitelist — official creators";
  els.listAddBtn.className = key === "blacklist" ? "add-black" : "add-white";
  els.listInput.value = "";
  els.viewHome.hidden = true;
  els.viewList.hidden = false;
  renderListItems();
}

function closeList() {
  currentKey = null;
  els.viewList.hidden = true;
  els.viewHome.hidden = false;
  renderHome();
}

function addToList(key, value) {
  const clean = normalize(value);
  if (!clean) return;
  chrome.storage.sync.get([key], (data) => {
    const list = data[key] || [];
    if (!list.includes(clean)) {
      list.push(clean);
      chrome.storage.sync.set({ [key]: list }, renderListItems);
    }
  });
}

function removeFromList(key, value) {
  chrome.storage.sync.get([key], (data) => {
    const list = (data[key] || []).filter((h) => h !== value);
    chrome.storage.sync.set({ [key]: list }, renderListItems);
  });
}

els.showBlackBtn.addEventListener("click", () => openList("blacklist"));
els.showWhiteBtn.addEventListener("click", () => openList("whitelist"));
els.backBtn.addEventListener("click", closeList);

els.listAddBtn.addEventListener("click", () => {
  addToList(currentKey, els.listInput.value);
  els.listInput.value = "";
});
els.listInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.listAddBtn.click();
});

// ---- Export both lists into a single downloadable JSON file ----
els.exportBtn.addEventListener("click", () => {
  chrome.storage.sync.get(["whitelist", "blacklist"], (data) => {
    const payload = {
      type: "original-creators-only-lists",
      version: 1,
      whitelist: data.whitelist || [],
      blacklist: data.blacklist || [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "anti-clipper-my-lists.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});

// ---- Import lists from a JSON file (merges with existing ones) ----
els.importBtn.addEventListener("click", () => {
  els.importFile.click();
});

els.importFile.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const importedWhite = (parsed.whitelist || []).map(normalize).filter(Boolean);
      const importedBlack = (parsed.blacklist || []).map(normalize).filter(Boolean);

      chrome.storage.sync.get(["whitelist", "blacklist"], (data) => {
        const mergedWhite = Array.from(new Set([...(data.whitelist || []), ...importedWhite]));
        const mergedBlack = Array.from(new Set([...(data.blacklist || []), ...importedBlack]));
        chrome.storage.sync.set({ whitelist: mergedWhite, blacklist: mergedBlack }, () => {
          renderHome();
          alert("Lists imported and merged successfully!");
        });
      });
    } catch (err) {
      alert("Invalid file. Make sure it was exported from this extension.");
    }
    els.importFile.value = "";
  };
  reader.readAsText(file);
});

renderHome();
renderCommunity();
