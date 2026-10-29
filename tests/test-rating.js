// Tests Elo ↔ kyu/dan + mise à jour
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "js", "rating.js"), "utf8");
const store = {};
const sandbox = {
  window: {},
  globalThis: {},
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  }
};
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox);
const R = sandbox.window.RatingSystem || sandbox.globalThis.RatingSystem;

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("OK  :", msg);
  }
}

assert(R.goGradeToElo(-20) === 100, "20k → 100 Elo");
assert(R.goGradeToElo(-1) === 2000, "1k → 2000 Elo");
assert(R.goGradeToElo(1) === 2100, "1d → 2100 Elo");
assert(R.goGradeToElo(9) === 2900, "9d → 2900 Elo");

assert(R.formatGoRank(100) === "20k", "format 20k");
assert(R.formatGoRank(2000) === "1k", "format 1k");
assert(R.formatGoRank(2100) === "1d", "format 1d");
assert(R.suggestedHandicap(2100, 1700) === 4, "handicap 1d vs 4k ≈ 4");

const a = R.recordResult({
  game: "go",
  playerId: "alice",
  opponentId: "bob",
  result: 1,
  playerColor: "b",
  boardSize: 19
});
assert(a.ranked === true, "partie 19×19 classée");
assert(a.player.goElo > R.GO_DEFAULT_ELO, "gagnant gagne des points");
assert(a.opponent.goElo < R.GO_DEFAULT_ELO, "perdant perd des points");

const skip = R.recordResult({
  game: "go",
  playerId: "alice",
  opponentId: "bob",
  result: 1,
  playerColor: "b",
  boardSize: 9
});
assert(skip.ranked === false, "9×9 non classé");

if (failed) {
  console.error("\n" + failed + " échec(s)");
  process.exit(1);
}
console.log("\nTous les tests rating OK");
