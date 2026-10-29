const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const required = [
  "index.html",
  "go/index.html",
  "chess/index.html",
  "privacy.html",
  "js/app.js",
  "js/config.js",
  "js/net.js",
  "js/rooms.js",
  "js/login-ui.js",
  "js/auth.js",
  "js/discord-activity.js",
  "js/discord-match.js",
  "js/broadcast.js",
  "js/stream-overlay.js",
  "js/ux-chrome.js",
  "js/discord-test-sim.js",
  "js/discord-launcher.js",
  "js/move-broadcast-toolbar.js",
  "css/hub.css",
  "discord/index.html",
  "docs/DISCORD.md",
  "docs/guide.html",
  "vendor/discord-embedded-app-sdk.js",
  "shared/js/bridge.js",
  "go/js/go-module.js",
  "go/js/engine.js",
  "js/review-tree.js",
  "js/review-ui.js",
  "js/teaching-session.js",
  "js/teaching-ui.js",
  "js/teaching-lessons.js",
  "js/chess-teaching-session.js",
  "js/chess-teaching-ui.js",
  "js/chess-teaching-lessons.js",
  "js/chess-teaching-themes.js",
  "js/teaching-marks.js",
  "js/rengo-net.js",
  "js/automatch.js",
  "js/go-features.js",
  "js/katago.js",
  "chess/js/chess-module.js",
  "server/index.js",
  "package.json",
  "images/share.png",
  "sounds/go/stone/stone1.wav",
  "sounds/go/stone/stone3.wav",
  "sounds/go/pass.mp3",
  "js/sounds.js",
  "vendor/peerjs.min.js",
  "vendor/chess.min.js",
  "vendor/stockfish.js"
];

let failed = 0;
for (const rel of required) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    console.error("MANQUANT:", rel);
    failed += 1;
  }
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const needle of ["chess/", "go/", "discord/", "css/hub.css", "Social Board"]) {
  if (!html.includes(needle)) {
    console.error("index.html hub sans", needle);
    failed += 1;
  }
}

const chessHtml = fs.readFileSync(path.join(root, "chess/index.html"), "utf8");
if (!chessHtml.includes("js/ux-chrome.js")) {
  console.error("chess/index.html sans ux-chrome.js");
  failed += 1;
}
if (!chessHtml.includes("action-tabs")) {
  console.error("chess/index.html sans action-tabs");
  failed += 1;
}

if (failed) {
  console.error(`Échec smoke: ${failed} problème(s)`);
  process.exit(1);
}
console.log("OK smoke-publish:", required.length, "fichiers présents");
