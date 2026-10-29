/**
 * Serveur Social Board — fichiers statiques + API salles + config publique.
 * Zéro dépendance npm : Node 18+ suffit.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8765);
const HOST = process.env.HOST || "0.0.0.0";
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8"
};

/** @type {Map<string, {peerId:string, token:string, game:string, created:number, expires:number}>} */
const rooms = new Map();

const DATA_DIR = path.join(ROOT, "data");
const RATINGS_FILE = path.join(DATA_DIR, "ratings.json");

/** @type {Map<string, {ticket:string, userId:string, game:string, size:number, ranked:boolean, elo:number, name:string, created:number}>} */
const automatchQueue = new Map();
/** @type {Map<string, object>} */
const automatchTickets = new Map();

function loadRatings() {
  try {
    if (!fs.existsSync(RATINGS_FILE)) return {};
    return JSON.parse(fs.readFileSync(RATINGS_FILE, "utf8")) || {};
  } catch (_) {
    return {};
  }
}

function saveRatings(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(RATINGS_FILE, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("saveRatings", err);
    return false;
  }
}

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq < 1) return;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  });
}

loadEnvFile();

function publicConfig() {
  return {
    version: "1.2.0",
    api: true,
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID || "",
      redirectUri: process.env.DISCORD_REDIRECT_URI || "",
      configured: !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET)
    },
    telegram: {
      botName: process.env.TELEGRAM_BOT_NAME || "",
      appName: process.env.TELEGRAM_APP_NAME || ""
    },
    facebook: {
      appId: process.env.FACEBOOK_APP_ID || ""
    },
    peerjs: {
      host: process.env.PEERJS_HOST || "0.peerjs.com",
      port: Number(process.env.PEERJS_PORT || 443),
      path: process.env.PEERJS_PATH || "/",
      secure: String(process.env.PEERJS_SECURE || "true") !== "false",
      debug: Number(process.env.PEERJS_DEBUG || 0)
    },
    iceServers: parseIceServers(),
    shareImage: "/images/share.png",
    katagoUrl: process.env.KATAGO_URL || "",
    turnHint: !String(process.env.ICE_SERVERS_JSON || "").includes("turn:")
      ? "Ajoutez un TURN dans ICE_SERVERS_JSON pour les NAT difficiles"
      : null
  };
}

function parseIceServers() {
  const raw = process.env.ICE_SERVERS_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (_) { /* ignore */ }
  }
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
  ];
}

function purgeRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.expires < now) rooms.delete(code);
  }
}

function makeRoomCode() {
  for (let i = 0; i < 8; i++) {
    const code = crypto.randomBytes(3).toString("hex");
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(4).toString("hex");
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 16 * 1024) {
        reject(new Error("Payload trop grand"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(root, cleaned);
  if (!full.startsWith(root)) return null;
  return full;
}

function serveStatic(req, res, urlPath) {
  let filePath = safeJoin(ROOT, urlPath === "/" ? "/index.html" : urlPath);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const noCache = ext === ".html" || ext === ".js" || ext === ".css" || ext === ".mjs";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": noCache ? "no-cache" : "public, max-age=3600"
  });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, pathname) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return true;
  }

  if (pathname === "/api/health" && req.method === "GET") {
    purgeRooms();
    sendJson(res, 200, {
      ok: true,
      rooms: rooms.size,
      uptime: process.uptime()
    });
    return true;
  }

  if (pathname === "/api/config" && req.method === "GET") {
    sendJson(res, 200, publicConfig());
    return true;
  }

  if (pathname === "/api/discord/token" && req.method === "POST") {
    const clientId = process.env.DISCORD_CLIENT_ID || "";
    const clientSecret = process.env.DISCORD_CLIENT_SECRET || "";
    let body;
    try {
      body = JSON.parse(await readBody(req) || "{}");
    } catch (_) {
      sendJson(res, 400, { error: "JSON invalide" });
      return true;
    }

    // Mode test local (simulateur /discord/test.html)
    const allowMock = String(process.env.ALLOW_DISCORD_MOCK || "true") !== "false";
    if (body.mock && allowMock) {
      const user = body.user && typeof body.user === "object"
        ? body.user
        : {
            id: "111111111111111111",
            username: "HoteTest",
            global_name: "Hôte Test"
          };
      sendJson(res, 200, {
        access_token: "mock_token_" + crypto.randomBytes(8).toString("hex"),
        expires_in: 3600,
        scope: "identify guilds",
        user: user,
        mock: true
      });
      return true;
    }

    if (!clientId || !clientSecret) {
      sendJson(res, 503, {
        error: "Discord non configuré (DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET). Pour un test local : /discord/test.html"
      });
      return true;
    }
    const code = String(body.code || "");
    if (!code || code.length > 200) {
      sendJson(res, 400, { error: "code OAuth manquant" });
      return true;
    }
    try {
      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: code
      });
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) {
        sendJson(res, 400, {
          error: "Échange token Discord refusé",
          detail: tokenJson
        });
        return true;
      }

      let user = null;
      try {
        const meRes = await fetch("https://discord.com/api/users/@me", {
          headers: { Authorization: "Bearer " + tokenJson.access_token }
        });
        if (meRes.ok) user = await meRes.json();
      } catch (_) { /* ignore */ }

      sendJson(res, 200, {
        access_token: tokenJson.access_token,
        expires_in: tokenJson.expires_in,
        scope: tokenJson.scope,
        user: user
      });
    } catch (err) {
      sendJson(res, 502, { error: "Discord API injoignable", detail: String(err.message || err) });
    }
    return true;
  }

  if (pathname === "/api/rooms" && req.method === "POST") {
    purgeRooms();
    let body;
    try {
      body = JSON.parse(await readBody(req) || "{}");
    } catch (err) {
      sendJson(res, 400, { error: "JSON invalide" });
      return true;
    }
    const peerId = String(body.peerId || "");
    const token = String(body.token || "");
    const game = body.game === "go" ? "go" : "chess";
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(peerId)) {
      sendJson(res, 400, { error: "peerId invalide" });
      return true;
    }
    if (!/^[a-f0-9]{32}$/.test(token)) {
      sendJson(res, 400, { error: "token invalide" });
      return true;
    }
    let code = String(body.code || "").toLowerCase();
    if (code) {
      if (!/^[a-f0-9]{6,16}$/.test(code)) {
        sendJson(res, 400, { error: "code salle invalide" });
        return true;
      }
    } else {
      code = makeRoomCode();
    }
    const now = Date.now();
    rooms.set(code, {
      peerId,
      token,
      game,
      created: now,
      expires: now + ROOM_TTL_MS,
      source: body.source || "web"
    });
    sendJson(res, 201, {
      code,
      expiresAt: now + ROOM_TTL_MS,
      joinPath: `/?room=${code}&g=${game}`
    });
    return true;
  }

  const roomMatch = pathname.match(/^\/api\/rooms\/([a-f0-9]{6,16})$/i);
  if (roomMatch && req.method === "GET") {
    purgeRooms();
    const room = rooms.get(roomMatch[1].toLowerCase());
    if (!room) {
      sendJson(res, 404, { error: "Salle introuvable ou expirée" });
      return true;
    }
    sendJson(res, 200, {
      peerId: room.peerId,
      token: room.token,
      game: room.game,
      expiresAt: room.expires
    });
    return true;
  }

  // --- Ratings serveur (Elo / kyu-dan) ---
  if (pathname === "/api/ratings" && req.method === "GET") {
    const all = loadRatings();
    const id = String(new URL(req.url || "/", "http://x").searchParams.get("id") || "");
    if (id) {
      sendJson(res, 200, { id: id, profile: all[id] || null });
    } else {
      const list = Object.keys(all).slice(0, 200).map((k) => Object.assign({ id: k }, all[k]));
      sendJson(res, 200, { ratings: list });
    }
    return true;
  }

  if (pathname === "/api/ratings" && req.method === "POST") {
    let body;
    try {
      body = JSON.parse(await readBody(req) || "{}");
    } catch (_) {
      sendJson(res, 400, { error: "JSON invalide" });
      return true;
    }
    const id = String(body.id || "").slice(0, 64);
    if (!id || !/^[a-zA-Z0-9_.\-:@]+$/.test(id)) {
      sendJson(res, 400, { error: "id invalide" });
      return true;
    }
    const all = loadRatings();
    const prev = all[id] || {};
    all[id] = {
      goElo: Math.round(Number(body.goElo) || prev.goElo || 1000),
      chessElo: Math.round(Number(body.chessElo) || prev.chessElo || 1200),
      goGames: Number(body.goGames) || prev.goGames || 0,
      chessGames: Number(body.chessGames) || prev.chessGames || 0,
      goWins: Number(body.goWins) || prev.goWins || 0,
      chessWins: Number(body.chessWins) || prev.chessWins || 0,
      updated: Date.now()
    };
    if (!saveRatings(all)) {
      sendJson(res, 500, { error: "écriture impossible" });
      return true;
    }
    sendJson(res, 200, { ok: true, profile: all[id] });
    return true;
  }

  // --- Automatch ---
  if (pathname === "/api/automatch" && req.method === "POST") {
    let body;
    try {
      body = JSON.parse(await readBody(req) || "{}");
    } catch (_) {
      sendJson(res, 400, { error: "JSON invalide" });
      return true;
    }
    const ticket = crypto.randomBytes(8).toString("hex");
    const entry = {
      ticket,
      userId: String(body.userId || "guest").slice(0, 64),
      game: body.game === "chess" ? "chess" : "go",
      size: [9, 13, 19].includes(Number(body.size)) ? Number(body.size) : 19,
      ranked: body.ranked !== false,
      elo: Math.round(Number(body.elo) || 1000),
      name: String(body.name || "joueur").slice(0, 32),
      created: Date.now()
    };
    // Chercher un adversaire compatible
    let foe = null;
    for (const [, q] of automatchQueue) {
      if (q.userId === entry.userId) continue;
      if (q.game !== entry.game) continue;
      if (q.size !== entry.size) continue;
      if (q.ranked !== entry.ranked) continue;
      if (Math.abs(q.elo - entry.elo) > 400) continue;
      foe = q;
      break;
    }
    if (foe) {
      automatchQueue.delete(foe.ticket);
      const roomCode = makeRoomCode();
      const token = crypto.randomBytes(16).toString("hex");
      const hostIsA = entry.elo >= foe.elo;
      const match = {
        room: roomCode,
        token,
        game: entry.game,
        size: entry.size,
        ranked: entry.ranked,
        host: hostIsA
          ? { ticket: entry.ticket, userId: entry.userId, name: entry.name, elo: entry.elo }
          : { ticket: foe.ticket, userId: foe.userId, name: foe.name, elo: foe.elo },
        guest: hostIsA
          ? { ticket: foe.ticket, userId: foe.userId, name: foe.name, elo: foe.elo }
          : { ticket: entry.ticket, userId: entry.userId, name: entry.name, elo: entry.elo }
      };
      // Enregistrer salle pour PeerJS join
      const now = Date.now();
      rooms.set(roomCode, {
        peerId: "pending_" + roomCode,
        token,
        game: entry.game,
        created: now,
        expires: now + ROOM_TTL_MS,
        source: "automatch",
        pendingHost: true
      });
      automatchTickets.set(entry.ticket, { status: "matched", match, youAreHost: hostIsA });
      automatchTickets.set(foe.ticket, { status: "matched", match, youAreHost: !hostIsA });
      sendJson(res, 200, { ticket, status: "matched", match, youAreHost: hostIsA });
      return true;
    }
    automatchQueue.set(ticket, entry);
    automatchTickets.set(ticket, { status: "waiting" });
    sendJson(res, 200, { ticket, status: "waiting", waiting: automatchQueue.size });
    return true;
  }

  const amMatch = pathname.match(/^\/api\/automatch\/([a-f0-9]{8,32})$/i);
  if (amMatch && req.method === "GET") {
    const t = amMatch[1].toLowerCase();
    const info = automatchTickets.get(t);
    if (!info) {
      sendJson(res, 404, { error: "ticket inconnu" });
      return true;
    }
    if (info.status === "waiting") {
      let pos = 1;
      for (const [k] of automatchQueue) {
        if (k === t) break;
        pos++;
      }
      sendJson(res, 200, { status: "waiting", position: pos, waiting: automatchQueue.size });
      return true;
    }
    sendJson(res, 200, info);
    return true;
  }

  if (amMatch && req.method === "DELETE") {
    const t = amMatch[1].toLowerCase();
    automatchQueue.delete(t);
    automatchTickets.delete(t);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (pathname === "/api/ratings/result" && req.method === "POST") {
    let body;
    try {
      body = JSON.parse(await readBody(req) || "{}");
    } catch (_) {
      sendJson(res, 400, { error: "JSON invalide" });
      return true;
    }
    // Le client calcule Elo ; le serveur stocke les deux profils
    const players = Array.isArray(body.players) ? body.players : [];
    const all = loadRatings();
    players.forEach((p) => {
      if (!p || !p.id) return;
      const id = String(p.id).slice(0, 64);
      all[id] = {
        goElo: Math.round(Number(p.goElo) || 1000),
        chessElo: Math.round(Number(p.chessElo) || 1200),
        goGames: Number(p.goGames) || 0,
        chessGames: Number(p.chessGames) || 0,
        goWins: Number(p.goWins) || 0,
        chessWins: Number(p.chessWins) || 0,
        updated: Date.now()
      };
    });
    saveRatings(all);
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    if (pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, pathname);
      if (handled) return;
      sendJson(res, 404, { error: "API inconnue" });
      return;
    }

    serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Erreur serveur");
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("========================================");
  console.log("  Social Board");
  console.log("========================================");
  console.log(`  Local :  http://localhost:${PORT}`);
  console.log(`  Go :     http://localhost:${PORT}/go/`);
  console.log(`  Échecs : http://localhost:${PORT}/chess/`);
  console.log(`  Discord: http://localhost:${PORT}/discord/`);
  console.log(`  Test :   http://localhost:${PORT}/discord/test.html`);
  console.log(`  API :    http://localhost:${PORT}/api/health`);
  const discordOk = !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
  console.log(`  Discord OAuth : ${discordOk ? "configuré" : "manquant (.env) — utilisez /discord/test.html"}`);
  console.log("========================================");
  console.log("");
});
