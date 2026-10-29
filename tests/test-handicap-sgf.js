const fs = require("fs");
const path = require("path");
const vm = require("vm");

const goSrc = fs.readFileSync(path.join(__dirname, "..", "go", "js", "engine.js"), "utf8");
const sandbox = { window: {}, console };
vm.runInNewContext(goSrc, sandbox);
const GoGame = sandbox.window.GoGame;

let failed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.error("FAIL:", msg); }
  else console.log("OK  :", msg);
}

{
  const g = new GoGame(19);
  const pts = g.placeHandicap(4);
  assert(pts.length === 4, "H4 pose 4 pierres");
  assert(g.turn === 2, "après handicap, trait au Blanc");
  assert(g.at(pts[0].x, pts[0].y) === 1, "pierre handicap noire");
}

{
  const g = new GoGame(19);
  g.play(3, 3);
  g.pass();
  g.pass();
  assert(g.over === true, "double pass termine");
  const n = g.undoPasses();
  assert(n === 2 && g.over === false, "undoPasses restaure le jeu");
}

{
  const g = new GoGame(9);
  g.play(2, 2);
  g.play(6, 6);
  const sgf = g.exportSgf({ pb: "A", pw: "B" });
  const g2 = GoGame.fromSgf(sgf);
  assert(g2.moves.length === 2, "import SGF rejoue 2 coups");
  assert(g2.at(2, 2) === 1 && g2.at(6, 6) === 2, "positions SGF OK");
}

{
  const g = new GoGame(9);
  const snap = g.serializeState();
  g.play(1, 1);
  assert(g.at(1, 1) === 1, "coup joué");
  g.loadState(snap);
  assert(g.at(1, 1) === 0, "loadState restaure vide");
}

if (failed) process.exit(1);
console.log("\nhandicap/sgf OK");
