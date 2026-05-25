const stage = document.querySelector("#stage");
const nowPlaying = document.querySelector("#nowPlaying");
const slideProgressBar = document.querySelector("#slideProgressBar");

let state = { assets: [], playlist: [], settings: {} };
let index = 0;
let timer;
let cleanupTimer;
let progressFrame;
let playbackToken = 0;
let currentItem = null;
let currentMedia = null;
let progressStartedAt = 0;
let progressDurationMs = 0;
let progressVideoMode = false;

async function fetchState() {
  const res = await fetch("/api/state", { cache: "no-store" });
  return res.json();
}

function applySettings() {
  document.body.style.background = state.settings.background || "#0f172a";
  stage.dataset.effect = state.settings.transitionEffect || "fade";
  stage.style.setProperty("--transition-duration", `${transitionMs()}ms`);
  nowPlaying.hidden = state.settings.showFileName === false;
  updateNowPlaying();
}

async function loadState() {
  state = await fetchState();
  applySettings();
}

function enabledItems() {
  const assets = new Map(state.assets.map(asset => [asset.id, asset]));
  return state.playlist
    .filter(item => item.enabled && assets.has(item.assetId))
    .map(item => ({ ...item, asset: assets.get(item.assetId) }));
}

function findCurrentItem() {
  if (!currentItem) return null;
  return enabledItems().find(item => item.id === currentItem.id || item.assetId === currentItem.assetId) || null;
}

function showEmpty() {
  stage.innerHTML = "";
  currentItem = null;
  currentMedia = null;
  nowPlaying.textContent = "";
  nowPlaying.hidden = true;
  stopProgress();

  const idle = state.settings.idleScreen || { type: "none", value: "" };

  if (idle.type === "color") {
    const overlay = document.createElement("div");
    overlay.className = "idle-color";
    overlay.style.background = idle.value || "#0f172a";
    stage.appendChild(overlay);
    return;
  }

  if (idle.type === "image") {
    const ext = (idle.value || "").split("?")[0].toLowerCase();
    const isVideo = /\.(mp4|webm|mov)$/.test(ext);
    const layer = document.createElement("div");
    layer.className = "slide-layer";
    if (isVideo) {
      const vid = document.createElement("video");
      vid.src = idle.value;
      vid.autoplay = true;
      vid.muted = true;
      vid.loop = true;
      vid.playsInline = true;
      layer.appendChild(vid);
    } else {
      const img = document.createElement("img");
      img.src = idle.value;
      img.alt = "";
      layer.appendChild(img);
    }
    stage.appendChild(layer);
    return;
  }

  if (idle.type === "url") {
    const layer = document.createElement("div");
    layer.className = "slide-layer";
    const frame = document.createElement("iframe");
    frame.src = idle.value;
    frame.title = "Màn hình chờ";
    layer.appendChild(frame);
    stage.appendChild(layer);
    return;
  }

  if (idle.type === "text" && idle.value) {
    const empty = document.createElement("div");
    empty.className = "player-empty idle-text";
    empty.textContent = idle.value;
    stage.appendChild(empty);
    return;
  }

  // fallback: type === "none" hoặc chưa cấu hình
  const empty = document.createElement("div");
  empty.className = "player-empty";
  empty.textContent = "Playlist chưa có nội dung đang bật.";
  stage.appendChild(empty);
}

function transitionMs() {
  return Math.round(Math.max(0, Number(state.settings.transitionSeconds) || 0) * 1000);
}

function itemDurationMs(item) {
  return Math.max(1, Number(item?.duration) || 10) * 1000;
}

function shouldPlayFullVideo(item) {
  return item?.asset?.type === "video" && item.playFullVideo;
}

function createMedia(asset) {
  if (asset.type === "image") {
    const image = document.createElement("img");
    image.src = asset.url;
    image.alt = "";
    return image;
  }

  if (asset.type === "video") {
    const video = document.createElement("video");
    video.src = asset.url;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    return video;
  }

  const frame = document.createElement("iframe");
  frame.src = asset.url;
  frame.title = asset.name;
  return frame;
}

function createBlurBackground(asset) {
  if (!state.settings.backgroundBlur || (asset.type !== "image" && asset.type !== "video")) return null;

  const background = document.createElement("div");
  background.className = "slide-blur-bg";

  if (asset.type === "image") {
    const image = document.createElement("img");
    image.src = asset.url;
    image.alt = "";
    background.appendChild(image);
    return background;
  }

  const video = document.createElement("video");
  video.src = asset.url;
  video.autoplay = true;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  background.appendChild(video);
  return background;
}

function setProgress(ratio) {
  const clamped = Math.min(1, Math.max(0, ratio));
  slideProgressBar.style.transform = `scaleX(${clamped})`;
}

function stopProgress() {
  window.cancelAnimationFrame(progressFrame);
  progressFrame = undefined;
  progressStartedAt = 0;
  progressDurationMs = 0;
  progressVideoMode = false;
  setProgress(0);
}

function tickProgress() {
  if (!progressDurationMs) return;

  if (progressVideoMode && currentMedia && Number.isFinite(currentMedia.duration) && currentMedia.duration > 0) {
    setProgress(currentMedia.currentTime / currentMedia.duration);
  } else {
    setProgress((Date.now() - progressStartedAt) / progressDurationMs);
  }

  progressFrame = window.requestAnimationFrame(tickProgress);
}

function startProgress(durationMs, elapsedMs = 0, videoMode = false) {
  window.cancelAnimationFrame(progressFrame);
  progressDurationMs = Math.max(1, durationMs);
  progressStartedAt = Date.now() - Math.min(Math.max(0, elapsedMs), progressDurationMs);
  progressVideoMode = videoMode;
  tickProgress();
}

function scheduleNext(durationMs, token) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (token === playbackToken) next();
  }, Math.max(1, durationMs));
}

function updateNowPlaying() {
  if (!currentItem || state.settings.showFileName === false) {
    nowPlaying.textContent = "";
    nowPlaying.hidden = true;
    return;
  }

  const labelDuration = shouldPlayFullVideo(currentItem) ? "hết video" : `${currentItem.duration}s`;
  nowPlaying.textContent = `${currentItem.asset.name} · ${labelDuration}`;
  nowPlaying.hidden = false;
}

function scheduleCurrentItem(token, preserveElapsed = false) {
  if (!currentItem) return;

  const elapsedMs = preserveElapsed ? Math.max(0, Date.now() - progressStartedAt) : 0;

  if (!shouldPlayFullVideo(currentItem)) {
    const durationMs = itemDurationMs(currentItem);
    const remainingMs = Math.max(1, durationMs - elapsedMs);
    startProgress(durationMs, elapsedMs, false);
    scheduleNext(remainingMs, token);
    return;
  }

  if (currentMedia && Number.isFinite(currentMedia.duration) && currentMedia.duration > 0) {
    const durationMs = Math.max(1, currentMedia.duration * 1000);
    const mediaElapsedMs = Math.max(0, currentMedia.currentTime * 1000);
    const remainingMs = Math.max(1, durationMs - mediaElapsedMs);
    startProgress(durationMs, mediaElapsedMs, true);
    scheduleNext(remainingMs + 250, token);
    return;
  }

  const fallbackMs = itemDurationMs(currentItem);
  startProgress(fallbackMs, elapsedMs, false);
  scheduleNext(Math.max(1, fallbackMs - elapsedMs), token);
}

function renderItem(item, token) {
  const asset = item.asset;
  const oldLayers = Array.from(stage.querySelectorAll(".slide-layer"));
  const layer = document.createElement("div");
  const media = createMedia(asset);
  const blurBackground = createBlurBackground(asset);
  const transitionDuration = transitionMs();

  currentItem = item;
  currentMedia = media;
  stopProgress();

  stage.querySelector(".player-empty")?.remove();
  updateNowPlaying();
  layer.className = "slide-layer is-enter";
  if (blurBackground) layer.appendChild(blurBackground);
  layer.appendChild(media);
  stage.appendChild(layer);

  for (const oldLayer of oldLayers) {
    oldLayer.classList.remove("is-enter");
    oldLayer.classList.add("is-exit");
  }

  window.clearTimeout(cleanupTimer);
  cleanupTimer = window.setTimeout(() => {
    for (const oldLayer of oldLayers) oldLayer.remove();
    layer.classList.remove("is-enter");
  }, transitionDuration + 80);

  if (!shouldPlayFullVideo(item)) {
    scheduleCurrentItem(token, false);
    return;
  }

  const scheduleFromVideoDuration = () => {
    if (token !== playbackToken) return;
    scheduleCurrentItem(token, false);
  };

  media.addEventListener("loadedmetadata", scheduleFromVideoDuration, { once: true });
  media.addEventListener("durationchange", scheduleFromVideoDuration, { once: true });
  media.addEventListener("ended", () => {
    if (token !== playbackToken) return;
    setProgress(1);
    next();
  }, { once: true });
  media.addEventListener("error", () => {
    if (token !== playbackToken) return;
    currentItem = { ...currentItem, playFullVideo: false };
    scheduleCurrentItem(token, false);
  }, { once: true });

  if (media.readyState >= 1) scheduleFromVideoDuration();
  media.play?.().catch(() => {
    if (token !== playbackToken) return;
    currentItem = { ...currentItem, playFullVideo: false };
    scheduleCurrentItem(token, false);
  });
}

function next() {
  const items = enabledItems();
  window.clearTimeout(timer);
  stopProgress();

  if (!items.length) {
    showEmpty();
    return;
  }

  if (index >= items.length) index = 0;
  const item = items[index];
  index = (index + 1) % items.length;
  playbackToken += 1;
  renderItem(item, playbackToken);
}

async function refresh() {
  state = await fetchState();
  applySettings();

  const items = enabledItems();
  if (!items.length) {
    showEmpty();
    return;
  }

  const updatedCurrent = findCurrentItem();
  if (!updatedCurrent) {
    index = 0;
    next();
    return;
  }

  currentItem = updatedCurrent;
  const currentIndex = items.findIndex(item => item.id === updatedCurrent.id || item.assetId === updatedCurrent.assetId);
  if (currentIndex >= 0) index = (currentIndex + 1) % items.length;
  scheduleCurrentItem(playbackToken, true);
}

loadState().then(next);
window.setInterval(refresh, 3000);
