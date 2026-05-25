const state = {
  assets: [],
  playlist: [],
  settings: {},
  dragIndex: null,
  selectedAssetIds: new Set(),
  selectedPlaylistIndexes: new Set()
};

const els = {
  assetCount: document.querySelector("#assetCount"),
  selectedAssetCount: document.querySelector("#selectedAssetCount"),
  assets: document.querySelector("#assets"),
  playlist: document.querySelector("#playlist"),
  uploadForm: document.querySelector("#uploadForm"),
  fileInput: document.querySelector("#fileInput"),
  folderInput: document.querySelector("#folderInput"),
  urlForm: document.querySelector("#urlForm"),
  urlInput: document.querySelector("#urlInput"),
  nameInput: document.querySelector("#nameInput"),
  defaultDuration: document.querySelector("#defaultDuration"),
  background: document.querySelector("#background"),
  transitionEffect: document.querySelector("#transitionEffect"),
  transitionSeconds: document.querySelector("#transitionSeconds"),
  showFileName: document.querySelector("#showFileName"),
  backgroundBlur: document.querySelector("#backgroundBlur"),
  bulkDuration: document.querySelector("#bulkDuration"),
  applyBulkDuration: document.querySelector("#applyBulkDuration"),
  applyBulkDurationEnabled: document.querySelector("#applyBulkDurationEnabled"),
  selectAllAssets: document.querySelector("#selectAllAssets"),
  clearAssetSelection: document.querySelector("#clearAssetSelection"),
  addSelectedAssets: document.querySelector("#addSelectedAssets"),
  deleteSelectedAssets: document.querySelector("#deleteSelectedAssets"),
  playlistSelectedCount: document.querySelector("#playlistSelectedCount"),
  selectAllPlaylist: document.querySelector("#selectAllPlaylist"),
  clearPlaylistSelection: document.querySelector("#clearPlaylistSelection"),
  deleteSelectedPlaylist: document.querySelector("#deleteSelectedPlaylist"),
  clearPlaylist: document.querySelector("#clearPlaylist"),
  savePlaylist: document.querySelector("#savePlaylist"),
  saveSettings: document.querySelector("#saveSettings"),
  idleScreenType: document.querySelector("#idleScreenType"),
  idleColorField: document.querySelector("#idleColorField"),
  idleColorValue: document.querySelector("#idleColorValue"),
  idleImageField: document.querySelector("#idleImageField"),
  idleImageValue: document.querySelector("#idleImageValue"),
  idleUrlField: document.querySelector("#idleUrlField"),
  idleUrlValue: document.querySelector("#idleUrlValue"),
  idleTextField: document.querySelector("#idleTextField"),
  idleTextValue: document.querySelector("#idleTextValue"),
  toast: document.querySelector("#toast")
};

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.add("hidden"), 1800);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

async function api(path, options = {}) {
  const res = await fetch(path, options);
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "Request failed");
  Object.assign(state, payload);
  render();
  return payload;
}

function assetById(id) {
  return state.assets.find(asset => asset.id === id);
}

function selectedAssetIds() {
  return state.assets
    .map(asset => asset.id)
    .filter(id => state.selectedAssetIds.has(id));
}

function pruneAssetSelection() {
  const knownIds = new Set(state.assets.map(asset => asset.id));
  for (const id of state.selectedAssetIds) {
    if (!knownIds.has(id)) state.selectedAssetIds.delete(id);
  }
}

function updateAssetSelectionControls() {
  const count = selectedAssetIds().length;
  if (!els.selectedAssetCount) return;
  els.selectedAssetCount.textContent = `${count} \u0111\u00e3 ch\u1ecdn`;
  els.addSelectedAssets.disabled = count === 0;
  els.deleteSelectedAssets.disabled = count === 0;
  els.clearAssetSelection.disabled = count === 0;
  els.selectAllAssets.disabled = state.assets.length === 0;
  els.selectAllAssets.textContent = count === state.assets.length && state.assets.length
    ? "B\u1ecf ch\u1ecdn t\u1ea5t c\u1ea3"
    : "Ch\u1ecdn t\u1ea5t c\u1ea3";
}

function prunePlaylistSelection() {
  for (const index of state.selectedPlaylistIndexes) {
    if (index >= state.playlist.length) state.selectedPlaylistIndexes.delete(index);
  }
}

function updatePlaylistSelectionControls() {
  const count = state.selectedPlaylistIndexes.size;
  if (!els.playlistSelectedCount) return;
  els.playlistSelectedCount.textContent = `${count} \u0111\u00e3 ch\u1ecdn`;
  els.deleteSelectedPlaylist.disabled = count === 0;
  els.clearPlaylistSelection.disabled = count === 0;
  els.clearPlaylist.disabled = state.playlist.length === 0;
  els.selectAllPlaylist.disabled = state.playlist.length === 0;
  els.selectAllPlaylist.textContent = count === state.playlist.length && state.playlist.length
    ? "B\u1ecf ch\u1ecdn t\u1ea5t c\u1ea3"
    : "Ch\u1ecdn t\u1ea5t c\u1ea3";
}

function assetPreview(asset) {
  const url = escapeHtml(asset.url);
  if (asset.type === "image") return `<img src="${url}" alt="">`;
  if (asset.type === "video") return `<video src="${url}" muted></video>`;
  return `<span>WEB</span>`;
}

function renderAssets() {
  pruneAssetSelection();
  els.assetCount.textContent = `${state.assets.length} assets`;
  els.assets.innerHTML = state.assets.map(asset => `
    <article class="asset-card bg-white ${state.selectedAssetIds.has(asset.id) ? "is-selected" : ""}">
      <label class="asset-select">
        <input class="h-4 w-4 rounded border-slate-300 text-blue-700" type="checkbox" data-select-asset="${asset.id}" ${state.selectedAssetIds.has(asset.id) ? "checked" : ""}>
        <span>Ch&#7885;n</span>
      </label>
      <div class="thumb">${assetPreview(asset)}</div>
      <div class="grid gap-2 p-3">
        <div class="item-title" title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</div>
        <div class="item-meta mb-3">${escapeHtml(asset.type)} · ${escapeHtml(asset.source)}</div>
        <div class="flex gap-2">
          <button class="min-h-9 flex-1 rounded-lg border border-blue-200 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50" type="button" data-add="${asset.id}">
            Thêm
          </button>
          <button class="min-h-9 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50" type="button" data-delete="${asset.id}" aria-label="Xóa">
            Xóa
          </button>
        </div>
      </div>
    </article>
  `).join("");
  updateAssetSelectionControls();
}

function renderPlaylist() {
  prunePlaylistSelection();
  if (!state.playlist.length) {
    els.playlist.className = "playlist-list empty-state";
    els.playlist.textContent = "Ch\u01b0a c\u00f3 n\u1ed9i dung.";
    updatePlaylistSelectionControls();
    return;
  }

  els.playlist.className = "playlist-list";
  els.playlist.innerHTML = state.playlist.map((item, index) => {
    const asset = assetById(item.assetId);
    const selected = state.selectedPlaylistIndexes.has(index);
    return `
      <div class="playlist-item ${selected ? "is-selected" : ""}" data-index="${index}">
        <label class="flex items-center justify-center">
          <input class="h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-700" type="checkbox" data-select-playlist="${index}" ${selected ? "checked" : ""}>
        </label>
        <div class="handle" draggable="true" title="K\u00e9o \u0111\u1ec3 s\u1eafp x\u1ebfp">⋮⋮</div>
        <div>
          <div class="flex items-center gap-2">
            <span class="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold text-slate-500">${index + 1}</span>
            <div class="item-title">${escapeHtml(asset?.name || "Asset \u0111\u00e3 x\u00f3a")}</div>
          </div>
          <div class="item-meta">${escapeHtml(asset?.url || item.assetId)}</div>
        </div>
        <div class="duration-field">
          <label class="mb-1 block text-xs font-semibold text-slate-500" for="duration-${index}">Gi\u00e2y</label>
          <input id="duration-${index}" class="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" type="number" min="1" value="${item.duration}" data-duration="${index}">
        </div>
        <div class="full-video-field">
          ${asset?.type === "video" ? `
            <label class="mb-1 block text-xs font-semibold text-slate-500" for="full-video-${index}">Video</label>
            <label class="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input id="full-video-${index}" class="h-4 w-4 rounded border-slate-300 text-emerald-700" type="checkbox" ${item.playFullVideo ? "checked" : ""} data-full-video="${index}">
              Ph\u00e1t h\u1ebft
            </label>
          ` : `
            <label class="mb-1 block text-xs font-semibold text-slate-500">Video</label>
            <div class="text-xs text-slate-500">Kh\u00f4ng \u00e1p d\u1ee5ng</div>
          `}
        </div>
        <div class="enabled-field">
          <label class="mb-1 block text-xs font-semibold text-slate-500" for="enabled-${index}">B\u1eadt</label>
          <input id="enabled-${index}" class="h-4 w-4 rounded border-slate-300 text-emerald-700" type="checkbox" ${item.enabled ? "checked" : ""} data-enabled="${index}">
        </div>
        <div class="playlist-actions flex overflow-hidden rounded-lg border border-slate-300" role="group" aria-label="S\u1eafp x\u1ebfp playlist">
          <button class="min-h-9 flex-1 px-2 text-sm font-semibold text-slate-600 hover:bg-slate-50" type="button" data-up="${index}" aria-label="L\u00ean">\u2191</button>
          <button class="min-h-9 flex-1 border-l border-slate-300 px-2 text-sm font-semibold text-slate-600 hover:bg-slate-50" type="button" data-down="${index}" aria-label="Xu\u1ed1ng">\u2193</button>
          <button class="min-h-9 flex-1 border-l border-slate-300 px-2 text-sm font-semibold text-red-700 hover:bg-red-50" type="button" data-remove="${index}" aria-label="B\u1ecf">\u00d7</button>
        </div>
      </div>
    `;
  }).join("");
  updatePlaylistSelectionControls();
}

function updateIdleScreenFields() {
  const type = els.idleScreenType.value;
  els.idleColorField.classList.toggle("hidden", type !== "color");
  els.idleImageField.classList.toggle("hidden", type !== "image");
  els.idleUrlField.classList.toggle("hidden", type !== "url");
  els.idleTextField.classList.toggle("hidden", type !== "text");
}

function renderSettings() {
  els.defaultDuration.value = state.settings.defaultDuration || 10;
  els.background.value = state.settings.background || "#0f172a";
  els.transitionEffect.value = state.settings.transitionEffect || "fade";
  els.transitionSeconds.value = state.settings.transitionSeconds ?? 0.7;
  els.showFileName.checked = state.settings.showFileName !== false;
  els.backgroundBlur.checked = state.settings.backgroundBlur === true;

  const idle = state.settings.idleScreen || { type: "none", value: "" };
  els.idleScreenType.value = idle.type || "none";
  els.idleColorValue.value = idle.type === "color" ? (idle.value || "#0f172a") : "#0f172a";
  els.idleImageValue.value = idle.type === "image" ? idle.value : "";
  els.idleUrlValue.value = idle.type === "url" ? idle.value : "";
  els.idleTextValue.value = idle.type === "text" ? idle.value : "";
  updateIdleScreenFields();
}

function render() {
  renderAssets();
  renderPlaylist();
  renderSettings();
}

function syncPlaylistFromInputs() {
  document.querySelectorAll("[data-duration]").forEach(input => {
    state.playlist[Number(input.dataset.duration)].duration = Math.max(1, Number(input.value) || 1);
  });
  document.querySelectorAll("[data-enabled]").forEach(input => {
    state.playlist[Number(input.dataset.enabled)].enabled = input.checked;
  });
  document.querySelectorAll("[data-full-video]").forEach(input => {
    state.playlist[Number(input.dataset.fullVideo)].playFullVideo = input.checked;
  });
}

function movePlaylistItem(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
  if (fromIndex >= state.playlist.length || toIndex >= state.playlist.length) return;

  const [item] = state.playlist.splice(fromIndex, 1);
  state.playlist.splice(toIndex, 0, item);
}

function clearDragState() {
  state.dragIndex = null;
  els.playlist.querySelectorAll(".playlist-item").forEach(item => {
    item.classList.remove("dragging", "drag-over-before", "drag-over-after");
  });
}

function applyBulkDuration(enabledOnly) {
  const duration = Math.max(1, Number(els.bulkDuration.value) || 0);
  if (!duration) {
    toast("Nhập thời gian hợp lệ trước.");
    return;
  }

  syncPlaylistFromInputs();
  let changed = 0;
  state.playlist.forEach(item => {
    if (enabledOnly && item.enabled === false) return;
    item.duration = duration;
    changed += 1;
  });

  renderPlaylist();
  toast(`Đã cập nhật ${changed} item.`);
}

function addAssetsToPlaylist(assetIds) {
  const ids = assetIds.filter(id => assetById(id));
  ids.forEach(id => {
    const asset = assetById(id);
    state.playlist.push({
      assetId: id,
      duration: state.settings.defaultDuration || 10,
      playFullVideo: asset?.type === "video",
      enabled: true
    });
  });
  return ids.length;
}

els.uploadForm.addEventListener("submit", async event => {
  event.preventDefault();
  const files = [...els.fileInput.files, ...els.folderInput.files];
  if (!files.length) return toast("Chọn file hoặc folder trước khi upload.");

  const body = new FormData();
  for (const file of files) {
    body.append("files", file, file.webkitRelativePath || file.name);
  }

  await api("/api/assets/upload", { method: "POST", body });
  els.fileInput.value = "";
  els.folderInput.value = "";
  toast(`Đã upload ${files.length} file.`);
});

els.urlForm.addEventListener("submit", async event => {
  event.preventDefault();
  await api("/api/assets/url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: els.urlInput.value, name: els.nameInput.value })
  });
  els.urlInput.value = "";
  els.nameInput.value = "";
  toast("Đã thêm URL.");
});

els.assets.addEventListener("click", async event => {
  const addId = event.target.closest("[data-add]")?.dataset.add;
  const deleteId = event.target.closest("[data-delete]")?.dataset.delete;
  if (addId) {
    addAssetsToPlaylist([addId]);
    renderPlaylist();
  }
  if (deleteId && confirm("Xóa asset này khỏi thư viện và playlist?")) {
    await api(`/api/assets/${deleteId}`, { method: "DELETE" });
    toast("Đã xóa asset.");
  }
});

els.assets.addEventListener("change", event => {
  const checkbox = event.target.closest("[data-select-asset]");
  if (!checkbox) return;

  if (checkbox.checked) {
    state.selectedAssetIds.add(checkbox.dataset.selectAsset);
  } else {
    state.selectedAssetIds.delete(checkbox.dataset.selectAsset);
  }
  renderAssets();
});

els.selectAllAssets.addEventListener("click", () => {
  const selectedCount = selectedAssetIds().length;
  if (selectedCount === state.assets.length) {
    state.selectedAssetIds.clear();
  } else {
    state.assets.forEach(asset => state.selectedAssetIds.add(asset.id));
  }
  renderAssets();
});

els.clearAssetSelection.addEventListener("click", () => {
  state.selectedAssetIds.clear();
  renderAssets();
});

els.addSelectedAssets.addEventListener("click", () => {
  const added = addAssetsToPlaylist(selectedAssetIds());
  renderPlaylist();
  toast(`\u0110\u00e3 th\u00eam ${added} asset v\u00e0o playlist.`);
});

els.deleteSelectedAssets.addEventListener("click", async () => {
  const ids = selectedAssetIds();
  if (!ids.length) return;
  if (!confirm(`X\u00f3a ${ids.length} asset kh\u1ecfi th\u01b0 vi\u1ec7n v\u00e0 playlist?`)) return;

  syncPlaylistFromInputs();
  await api("/api/assets", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids })
  });
  state.selectedAssetIds.clear();
  toast(`\u0110\u00e3 x\u00f3a ${ids.length} asset.`);
});

els.playlist.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;

  const up = button.dataset.up;
  const down = button.dataset.down;
  const remove = button.dataset.remove;
  syncPlaylistFromInputs();

  if (up !== undefined) {
    const index = Number(up);
    if (index > 0) [state.playlist[index - 1], state.playlist[index]] = [state.playlist[index], state.playlist[index - 1]];
  }
  if (down !== undefined) {
    const index = Number(down);
    if (index < state.playlist.length - 1) [state.playlist[index + 1], state.playlist[index]] = [state.playlist[index], state.playlist[index + 1]];
  }
  if (remove !== undefined) {
    state.playlist.splice(Number(remove), 1);
  }
  state.selectedPlaylistIndexes.clear();
  renderPlaylist();
});

els.playlist.addEventListener("dragstart", event => {
  const handle = event.target.closest(".handle");
  if (!handle) {
    event.preventDefault();
    return;
  }

  const item = handle.closest(".playlist-item");
  if (!item) {
    event.preventDefault();
    return;
  }

  syncPlaylistFromInputs();
  state.dragIndex = Number(item.dataset.index);
  item.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", item.dataset.index);
});

els.playlist.addEventListener("dragover", event => {
  const item = event.target.closest(".playlist-item");
  if (!item || state.dragIndex === null) return;

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";

  const rect = item.getBoundingClientRect();
  const isAfter = event.clientY > rect.top + rect.height / 2;
  els.playlist.querySelectorAll(".playlist-item").forEach(row => {
    if (row !== item) row.classList.remove("drag-over-before", "drag-over-after");
  });
  item.classList.toggle("drag-over-before", !isAfter);
  item.classList.toggle("drag-over-after", isAfter);
});

els.playlist.addEventListener("dragleave", event => {
  const item = event.target.closest(".playlist-item");
  if (!item || item.contains(event.relatedTarget)) return;
  item.classList.remove("drag-over-before", "drag-over-after");
});

els.playlist.addEventListener("drop", event => {
  const item = event.target.closest(".playlist-item");
  if (!item || state.dragIndex === null) return;

  event.preventDefault();
  const targetIndex = Number(item.dataset.index);
  const rect = item.getBoundingClientRect();
  const dropAfter = event.clientY > rect.top + rect.height / 2;
  let nextIndex = targetIndex + (dropAfter ? 1 : 0);

  if (state.dragIndex < nextIndex) nextIndex -= 1;
  nextIndex = Math.max(0, Math.min(state.playlist.length - 1, nextIndex));
  movePlaylistItem(state.dragIndex, nextIndex);
  clearDragState();
  state.selectedPlaylistIndexes.clear();
  renderPlaylist();
});

els.playlist.addEventListener("dragend", clearDragState);

els.playlist.addEventListener("change", event => {
  const checkbox = event.target.closest("[data-select-playlist]");
  if (!checkbox) return;
  const index = Number(checkbox.dataset.selectPlaylist);
  if (checkbox.checked) {
    state.selectedPlaylistIndexes.add(index);
  } else {
    state.selectedPlaylistIndexes.delete(index);
  }
  const item = checkbox.closest(".playlist-item");
  if (item) item.classList.toggle("is-selected", checkbox.checked);
  updatePlaylistSelectionControls();
});

els.selectAllPlaylist.addEventListener("click", () => {
  if (state.selectedPlaylistIndexes.size === state.playlist.length && state.playlist.length) {
    state.selectedPlaylistIndexes.clear();
  } else {
    state.playlist.forEach((_, i) => state.selectedPlaylistIndexes.add(i));
  }
  renderPlaylist();
});

els.clearPlaylistSelection.addEventListener("click", () => {
  state.selectedPlaylistIndexes.clear();
  renderPlaylist();
});

els.deleteSelectedPlaylist.addEventListener("click", () => {
  const indexes = [...state.selectedPlaylistIndexes].sort((a, b) => b - a);
  if (!indexes.length) return;
  if (!confirm(`X\u00f3a ${indexes.length} item kh\u1ecfi playlist?`)) return;
  syncPlaylistFromInputs();
  indexes.forEach(i => state.playlist.splice(i, 1));
  state.selectedPlaylistIndexes.clear();
  renderPlaylist();
});

els.clearPlaylist.addEventListener("click", () => {
  if (!state.playlist.length) return;
  if (!confirm("X\u00f3a to\u00e0n b\u1ed9 playlist?")) return;
  state.playlist = [];
  state.selectedPlaylistIndexes.clear();
  renderPlaylist();
});

els.applyBulkDuration.addEventListener("click", () => applyBulkDuration(false));

els.applyBulkDurationEnabled.addEventListener("click", () => applyBulkDuration(true));

els.savePlaylist.addEventListener("click", async () => {
  syncPlaylistFromInputs();
  await api("/api/playlist", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playlist: state.playlist })
  });
  toast("Đã lưu playlist.");
});

els.idleScreenType.addEventListener("change", updateIdleScreenFields);

els.saveSettings.addEventListener("click", async () => {
  const idleType = els.idleScreenType.value;
  const idleValueMap = {
    color: els.idleColorValue.value,
    image: els.idleImageValue.value,
    url: els.idleUrlValue.value,
    text: els.idleTextValue.value
  };
  await api("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      defaultDuration: els.defaultDuration.value,
      background: els.background.value,
      transitionEffect: els.transitionEffect.value,
      transitionSeconds: els.transitionSeconds.value,
      showFileName: els.showFileName.checked,
      backgroundBlur: els.backgroundBlur.checked,
      idleScreen: { type: idleType, value: idleValueMap[idleType] || "" }
    })
  });
  toast("\u0110\u00e3 l\u01b0u c\u00e0i \u0111\u1eb7t.");
});

api("/api/state").catch(error => toast(error.message));
