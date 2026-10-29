/**
 * Tests smoke Broadcast / timeline leçon.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "js", "broadcast.js"), "utf8");

const localStore = {};
const sandbox = {
  window: {},
  document: {
    readyState: "complete",
    body: { classList: { add() {}, remove() {}, toggle() {} } },
    getElementById() { return null; },
    addEventListener() {},
    querySelectorAll() { return []; }
  },
  location: { href: "http://localhost/chess/?g=chess", search: "" },
  localStorage: {
    setItem(k, v) { localStore[k] = String(v); },
    getItem(k) { return localStore[k] || null; }
  },
  navigator: { clipboard: { writeText: () => Promise.resolve() }, mediaDevices: null },
  URL,
  URLSearchParams,
  BroadcastChannel: class {
    constructor() {}
    postMessage() {}
    close() {}
  },
  CustomEvent: class {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  },
  console,
  Date,
  Math,
  setInterval() { return 1; },
  clearInterval() {},
  setTimeout() { return 1; },
  clearTimeout() {}
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.window.dispatchEvent = function () {};
sandbox.dispatchEvent = sandbox.window.dispatchEvent;

vm.createContext(sandbox);
vm.runInContext(src, sandbox);

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else console.log("ok:", msg);
}

assert(sandbox.Broadcast, "Broadcast global");
assert(sandbox.LessonTimeline, "LessonTimeline");

const tl = new sandbox.LessonTimeline();
tl.start();
tl.push("move", { san: "e4" });
tl.push("move", { san: "e5" });
tl.stop();
const json = JSON.parse(tl.exportJson());
assert(json.version === 1, "timeline version");
assert(json.events.length >= 3, "timeline events");
assert(json.events.some((e) => e.kind === "move" && e.data.san === "e4"), "move e4 recorded");

sandbox.Broadcast.enter({ obs: true, transparent: true });
assert(sandbox.Broadcast.active, "broadcast active");
assert(sandbox.Broadcast.obsMode, "obs mode");
const key = sandbox.Broadcast.startLocalStream("chess");
assert(!!key, "stream key");
sandbox.Broadcast.applyGameState({
  game: "chess",
  clockWhite: "5:00",
  clockBlack: "5:00",
  lastMoveSan: "Nf3",
  moves: ["1. e4 e5", "2. Nf3"]
});
assert(localStore["sb-broadcast-" + key], "state published to localStorage");

sandbox.Broadcast.exit();
assert(!sandbox.Broadcast.active, "broadcast exited");

if (failed) {
  console.error(failed + " échec(s)");
  process.exit(1);
}
console.log("Tous les tests broadcast OK");
