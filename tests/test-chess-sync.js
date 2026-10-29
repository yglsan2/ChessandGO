/**
 * Smoke tests : protocoles sync / couleurs échecs (MatchProtocol).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const matchSrc = fs.readFileSync(path.join(__dirname, "..", "js", "match.js"), "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(matchSrc, sandbox);

const MP = sandbox.window.MatchProtocol;
if (!MP) {
  console.error("FAIL: MatchProtocol absent");
  process.exit(1);
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("ok:", msg);
  }
}

const clock = {
  getSnapshot() {
    return { type: "simple", white: 60, black: 60 };
  }
};

const sync = MP.chessStateSyncPayload(
  { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", variant: "standard" },
  clock,
  { hostColor: "w", yourColor: "b" }
);
assert(sync.type === "state-sync", "state-sync type");
assert(sync.game === "chess", "state-sync game=chess");
assert(sync.chess && sync.chess.fen, "state-sync chess.fen");
assert(sync.yourColor === "b", "state-sync yourColor for guest");
assert(sync.hostColor === "w", "state-sync hostColor");
assert(sync.clock && sync.clock.white === 60, "state-sync clock");

const colors = MP.chessColorAssignPayload("w", "b");
assert(colors.type === "chess-color-assign", "color-assign type");
assert(colors.hostColor === "w" && colors.guestColor === "b", "host=w guest=b");

const flipped = MP.chessColorAssignPayload("b", "w");
assert(flipped.hostColor === "b" && flipped.guestColor === "w", "host=b guest=w");

if (failed) {
  console.error(failed + " échec(s)");
  process.exit(1);
}
console.log("Tous les tests chess-sync OK");
