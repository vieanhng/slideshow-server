const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const SESSION_SECRET = process.env.SESSION_SECRET || `${ADMIN_USER}:${ADMIN_PASSWORD}:slideshow-session`;
const SESSION_COOKIE = "slideshow_session";
const DEFAULT_SETTINGS = {
  defaultDuration: 10,
  background: "#0f172a",
  transitionEffect: "fade",
  transitionSeconds: 0.7,
  showFileName: true,
  backgroundBlur: false,
  idleScreen: { type: "none", value: "" }
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime"
};
const MEDIA_EXTENSIONS = new Set([".mp4", ".webm", ".mov"]);
const MAX_MEDIA_RANGE_CHUNK = 8 * 1024 * 1024;
const FILE_STREAM_HIGH_WATER_MARK = 1024 * 1024;

const sseClients = new Set();

function broadcast() {
  const data = "event: state-changed\ndata: {}\n\n";
  for (const res of sseClients) {
    try { res.write(data); } catch { sseClients.delete(res); }
  }
}

function loadEnvFile() {
  const envFile = path.join(__dirname, ".env");
  if (!fs.existsSync(envFile)) return;

  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    writeDb({
      settings: DEFAULT_SETTINGS,
      assets: [],
      playlist: []
    });
  }
}

function readDb() {
  ensureStorage();
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}) };
  db.assets = Array.isArray(db.assets) ? db.assets : [];
  db.playlist = Array.isArray(db.playlist) ? db.playlist : [];
  const assets = new Map(db.assets.map(asset => [asset.id, asset]));
  db.playlist = db.playlist.map(item => ({
    ...item,
    playFullVideo: Object.prototype.hasOwnProperty.call(item, "playFullVideo")
      ? item.playFullVideo === true
      : assets.get(item.assetId)?.type === "video"
  }));
  return db;
}

function writeDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  broadcast();
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

function streamFile(req, res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";
  const isMedia = MEDIA_EXTENSIONS.has(ext);
  const totalSize = stat.size;
  const range = req.headers.range;
  const headers = {
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=86400",
    "content-type": contentType
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" });
    res.end();
    return;
  }

  const pipeFile = options => {
    const stream = fs.createReadStream(filePath, {
      highWaterMark: FILE_STREAM_HIGH_WATER_MARK,
      ...options
    });
    stream.on("error", () => {
      if (res.headersSent) {
        res.destroy();
      } else {
        sendText(res, 500, "Could not read file");
      }
    });
    stream.pipe(res);
  };

  if (totalSize === 0) {
    res.writeHead(200, { ...headers, "content-length": 0 });
    res.end();
    return;
  }

  if (!range) {
    res.writeHead(200, { ...headers, "content-length": totalSize });
    if (req.method === "HEAD") {
      res.end();
    } else {
      pipeFile();
    }
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.writeHead(416, { ...headers, "content-range": `bytes */${totalSize}` });
    res.end();
    return;
  }

  let start = match[1] === "" ? undefined : Number(match[1]);
  let end = match[2] === "" ? undefined : Number(match[2]);
  const hasExplicitEnd = match[2] !== "";

  if (start === undefined) {
    const suffixLength = end;
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      res.writeHead(416, { ...headers, "content-range": `bytes */${totalSize}` });
      res.end();
      return;
    }
    start = Math.max(totalSize - suffixLength, 0);
    end = totalSize - 1;
  } else {
    end = end === undefined ? totalSize - 1 : end;
  }

  if (isMedia && !hasExplicitEnd) {
    end = Math.min(end, start + MAX_MEDIA_RANGE_CHUNK - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= totalSize || start > end) {
    res.writeHead(416, { ...headers, "content-range": `bytes */${totalSize}` });
    res.end();
    return;
  }

  res.writeHead(206, {
    ...headers,
    "content-length": end - start + 1,
    "content-range": `bytes ${start}-${end}/${totalSize}`
  });
  if (req.method === "HEAD") {
    res.end();
  } else {
    pipeFile({ start, end });
  }
}

function sendUnauthorized(res, message = "Authentication required") {
  sendJson(res, 401, { error: message });
}

function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseCookies(req) {
  const cookies = {};
  for (const item of String(req.headers.cookie || "").split(";")) {
    const separator = item.indexOf("=");
    if (separator === -1) continue;
    cookies[item.slice(0, separator).trim()] = decodeURIComponent(item.slice(separator + 1).trim());
  }
  return cookies;
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function createSessionToken() {
  const payload = Buffer.from(JSON.stringify({
    user: ADMIN_USER,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    nonce: crypto.randomBytes(12).toString("hex")
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.user === ADMIN_USER && Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

function setSessionCookie(res) {
  const token = createSessionToken();
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function isAuthenticated(req) {
  return verifySessionToken(parseCookies(req)[SESSION_COOKIE]);
}

function isAdminPath(pathname) {
  return pathname === "/" || pathname === "/admin" || pathname === "/admin.js";
}

function readBody(req, limit = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function safeJoin(base, requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0]);
  const target = path.normalize(path.join(base, decoded));
  return target.startsWith(base) ? target : null;
}

function inferType(urlOrName, contentType = "") {
  const lower = `${contentType} ${urlOrName}`.toLowerCase();
  if (lower.includes("video/") || /\.(mp4|webm|mov)(\?|$)/.test(lower)) return "video";
  if (lower.includes("image/") || /\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(lower)) return "image";
  return "web";
}

function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!match) throw new Error("Missing multipart boundary");
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const parts = [];
  let cursor = buffer.indexOf(boundary);

  while (cursor !== -1) {
    cursor += boundary.length;
    if (buffer[cursor] === 45 && buffer[cursor + 1] === 45) break;
    if (buffer[cursor] === 13 && buffer[cursor + 1] === 10) cursor += 2;

    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), cursor);
    if (headerEnd === -1) break;

    const headerText = buffer.slice(cursor, headerEnd).toString("utf8");
    const nextBoundary = buffer.indexOf(boundary, headerEnd + 4);
    if (nextBoundary === -1) break;

    let dataEnd = nextBoundary;
    if (buffer[dataEnd - 2] === 13 && buffer[dataEnd - 1] === 10) dataEnd -= 2;
    const data = buffer.slice(headerEnd + 4, dataEnd);

    const name = /name="([^"]+)"/i.exec(headerText)?.[1] || "";
    const filename = /filename="([^"]*)"/i.exec(headerText)?.[1] || "";
    const type = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1] || "";
    parts.push({ name, filename, type, data });
    cursor = nextBoundary;
  }

  return parts;
}

function assetFromUrl(input) {
  const url = String(input.url || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("URL must start with http:// or https://");
  return {
    id: crypto.randomUUID(),
    name: String(input.name || new URL(url).hostname).trim(),
    type: input.type || inferType(url),
    source: "url",
    url,
    createdAt: new Date().toISOString()
  };
}

function addToPlaylist(db, asset, duration) {
  db.playlist.push({
    id: crypto.randomUUID(),
    assetId: asset.id,
    duration: Number(duration) || db.settings.defaultDuration,
    playFullVideo: asset.type === "video",
    enabled: true
  });
}

function displayUploadName(filename) {
  const normalized = String(filename || "").replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).join(" / ") || "Upload";
}

function removeAssets(db, ids) {
  const idSet = new Set(ids.map(String).filter(Boolean));
  const removedAssets = db.assets.filter(item => idSet.has(item.id));

  db.assets = db.assets.filter(item => !idSet.has(item.id));
  db.playlist = db.playlist.filter(item => !idSet.has(item.assetId));

  for (const asset of removedAssets) {
    if (asset.source !== "upload") continue;
    const filePath = safeJoin(ROOT, asset.url);
    if (filePath?.startsWith(UPLOAD_DIR) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  return removedAssets.length;
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === "POST" && pathname === "/api/login") {
      const input = JSON.parse((await readBody(req, 1024 * 1024)).toString("utf8") || "{}");
      if (!safeEqual(input.username || "", ADMIN_USER) || !safeEqual(input.password || "", ADMIN_PASSWORD)) {
        return sendUnauthorized(res, "Invalid username or password");
      }
      setSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method !== "GET" && !isAuthenticated(req)) {
      return sendUnauthorized(res);
    }

    if (req.method === "GET" && pathname === "/api/state") {
      return sendJson(res, 200, readDb());
    }

    if (req.method === "GET" && pathname === "/api/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "connection": "keep-alive",
        "x-accel-buffering": "no"
      });
      res.write(": connected\n\n");
      sseClients.add(res);
      const heartbeat = setInterval(() => { res.write(": heartbeat\n\n"); }, 25000);
      req.on("close", () => {
        clearInterval(heartbeat);
        sseClients.delete(res);
      });
      return;
    }

    if (req.method === "PUT" && pathname === "/api/settings") {
      const input = JSON.parse((await readBody(req, 1024 * 1024)).toString("utf8") || "{}");
      const db = readDb();
      const transitionSeconds = Number(input.transitionSeconds);
      db.settings = {
        ...db.settings,
        defaultDuration: Math.max(1, Number(input.defaultDuration) || db.settings.defaultDuration),
        background: String(input.background || db.settings.background),
        transitionEffect: ["fade", "slide", "zoom", "none"].includes(input.transitionEffect)
          ? input.transitionEffect
          : db.settings.transitionEffect,
        transitionSeconds: Number.isFinite(transitionSeconds)
          ? Math.min(3, Math.max(0, transitionSeconds))
          : db.settings.transitionSeconds,
        showFileName: input.showFileName !== false,
        backgroundBlur: input.backgroundBlur === true,
        idleScreen: {
          type: ["none", "color", "image", "url", "text"].includes(input.idleScreen?.type)
            ? input.idleScreen.type
            : (db.settings.idleScreen?.type || "none"),
          value: String(input.idleScreen?.value ?? db.settings.idleScreen?.value ?? "").trim()
        }
      };
      writeDb(db);
      return sendJson(res, 200, db);
    }

    if (req.method === "POST" && pathname === "/api/assets/url") {
      const input = JSON.parse((await readBody(req, 1024 * 1024)).toString("utf8") || "{}");
      const db = readDb();
      const asset = assetFromUrl(input);
      db.assets.unshift(asset);
      addToPlaylist(db, asset, input.duration);
      writeDb(db);
      return sendJson(res, 201, db);
    }

    if (req.method === "POST" && pathname === "/api/assets/upload") {
      const body = await readBody(req, Infinity);
      const files = parseMultipart(body, req.headers["content-type"])
        .filter(part => (part.name === "file" || part.name === "files") && part.filename && part.data.length);
      if (!files.length) throw new Error("No file uploaded");

      const db = readDb();
      const createdAssets = [];

      for (const file of files) {
        const ext = path.extname(file.filename).toLowerCase();
        const storedName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
        fs.writeFileSync(path.join(UPLOAD_DIR, storedName), file.data);

        const asset = {
          id: crypto.randomUUID(),
          name: displayUploadName(file.filename),
          type: inferType(file.filename, file.type),
          source: "upload",
          url: `/uploads/${storedName}`,
          createdAt: new Date().toISOString()
        };
        createdAssets.push(asset);
        addToPlaylist(db, asset);
      }

      db.assets.unshift(...createdAssets);
      writeDb(db);
      return sendJson(res, 201, db);
    }

    if (req.method === "DELETE" && pathname === "/api/assets") {
      const input = JSON.parse((await readBody(req, 1024 * 1024)).toString("utf8") || "{}");
      const db = readDb();
      removeAssets(db, Array.isArray(input.ids) ? input.ids : []);
      writeDb(db);
      return sendJson(res, 200, db);
    }

    if (req.method === "DELETE" && pathname.startsWith("/api/assets/")) {
      const id = pathname.split("/").pop();
      const db = readDb();
      removeAssets(db, [id]);
      writeDb(db);
      return sendJson(res, 200, db);
    }

    if (req.method === "PUT" && pathname === "/api/playlist") {
      const input = JSON.parse((await readBody(req, 1024 * 1024)).toString("utf8") || "{}");
      const db = readDb();
      const knownAssets = new Set(db.assets.map(asset => asset.id));
      db.playlist = Array.isArray(input.playlist)
        ? input.playlist
          .filter(item => knownAssets.has(item.assetId))
          .map(item => ({
            id: item.id || crypto.randomUUID(),
            assetId: item.assetId,
            duration: Math.max(1, Number(item.duration) || db.settings.defaultDuration),
            playFullVideo: item.playFullVideo === true,
            enabled: item.enabled !== false
          }))
        : db.playlist;
      writeDb(db);
      return sendJson(res, 200, db);
    }

    sendJson(res, 404, { error: "API route not found" });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

function serveStatic(req, res, pathname) {
  let filePath;
  if (pathname === "/" || pathname === "/admin") {
    filePath = path.join(PUBLIC_DIR, "index.html");
  } else if (pathname === "/login") {
    filePath = path.join(PUBLIC_DIR, "login.html");
  } else if (pathname === "/player") {
    filePath = path.join(PUBLIC_DIR, "player.html");
  } else if (pathname.startsWith("/uploads/")) {
    filePath = safeJoin(ROOT, pathname);
  } else {
    filePath = safeJoin(PUBLIC_DIR, pathname);
  }

  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendText(res, 404, "Not found");
  }

  streamFile(req, res, filePath, fs.statSync(filePath));
}

ensureStorage();

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  if (pathname === "/logout") {
    clearSessionCookie(res);
    redirect(res, "/login?loggedOut=1");
    return;
  }

  if (pathname === "/login" && isAuthenticated(req)) {
    redirect(res, "/");
    return;
  }

  if (isAdminPath(pathname) && !isAuthenticated(req)) {
    redirect(res, `/login?next=${encodeURIComponent(pathname)}`);
    return;
  }

  if (pathname.startsWith("/api/")) {
    handleApi(req, res, pathname);
    return;
  }
  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Slideshow server running at http://localhost:${PORT}`);
  console.log(`Player: http://localhost:${PORT}/player`);
});
