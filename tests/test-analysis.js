// Tests d'analyse Go + variantes d'échecs (Node)
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const goSrc = fs.readFileSync(path.join(root, "js", "go.js"), "utf8");
const sandbox = { window: {}, console };
vm.runInNewContext(goSrc, sandbox);
const GoGame = sandbox.window.GoGame;

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("OK  :", msg);
  }
}

// Plateau vide : pas de territoire, komi au Blanc
{
  const g = new GoGame(9);
  g.komi = 6.5;
  const a = g.analyze();
  assert(a.terr[1] === 0 && a.terr[2] === 0, "vide : aucun territoire");
  assert(a.jp[1] === 0, "vide : Noir 0");
  assert(a.jp[2] === 6.5, "vide : Blanc 6.5 (komi)");
  assert(a.dame === 81, "vide : tout est dame");
}

// Territoire de coin noir (2x2)
{
  const g = new GoGame(9);
  g.komi = 6.5;
  [[2, 0], [2, 1], [2, 2], [0, 2], [1, 2]].forEach(([x, y]) => g.set(x, y, 1));
  const a = g.analyze();
  assert(a.terr[1] === 4, "coin noir : 4 points de territoire (got " + a.terr[1] + ")");
  assert(a.jp[1] === 4, "coin noir : score JP Noir 4 (got " + a.jp[1] + ")");
  assert(a.jp[2] === 6.5, "coin noir : Blanc n'a que le komi");
}

// Pierre blanche en atari serré : morte
{
  const g = new GoGame(9);
  g.set(1, 1, 2);
  g.set(1, 0, 1);
  g.set(0, 1, 1);
  g.set(2, 1, 1);
  g.set(1, 2, 1);
  const a = g.analyze();
  assert(a.dead[2] === 1, "blanc en atari marqué mort (got " + a.dead[2] + ")");
}

// Capture : le compteur Noir augmente
{
  const g = new GoGame(9);
  g.set(1, 0, 1);
  g.set(0, 1, 1);
  g.set(2, 1, 1);
  g.set(1, 1, 2);
  g.turn = 1;
  const ok = g.play(1, 2);
  assert(ok, "capture légale");
  assert(g.captures[1] === 1, "Noir a 1 prisonnier (got " + g.captures[1] + ")");
  assert(g.at(1, 1) === 0, "pierre blanche retirée");
}

// Suicide interdit
{
  const g = new GoGame(9);
  g.set(1, 0, 2);
  g.set(0, 1, 2);
  g.set(2, 1, 2);
  g.set(1, 2, 2);
  g.turn = 1;
  assert(g.whyIllegal(1, 1) === "Suicide interdit", "suicide détecté");
  assert(g.at(1, 1) === 0, "suicide n'altère pas le plateau");
  assert(g.captures[2] === 0, "suicide n'ajoute pas de captures");
}

// wouldBeSuicide restaure
{
  const g = new GoGame(9);
  g.set(1, 0, 2);
  g.set(0, 1, 2);
  g.set(2, 1, 2);
  g.set(1, 2, 2);
  assert(g.wouldBeSuicide(1, 1, 1) === true, "wouldBeSuicide vrai");
  assert(g.at(1, 1) === 0 && g.captures[1] === 0 && g.captures[2] === 0, "wouldBeSuicide restaure l'état");
}

// Deux couleurs : le grand espace ouvert n'est pas tout offert au Noir
{
  const g = new GoGame(9);
  g.komi = 6.5;
  [[2, 0], [2, 1], [2, 2], [0, 2], [1, 2]].forEach(([x, y]) => g.set(x, y, 1));
  g.set(8, 8, 2);
  const a = g.analyze();
  assert(a.terr[1] === 4, "avec un Blanc : coin noir toujours 4 (got " + a.terr[1] + ")");
  assert(a.terr[2] === 0, "un pion blanc isolé n'invente pas de territoire");
}

// Score chinois ≠ pierres seules
{
  const g = new GoGame(9);
  g.komi = 6.5;
  [[2, 0], [2, 1], [2, 2], [0, 2], [1, 2]].forEach(([x, y]) => g.set(x, y, 1));
  const a = g.analyze();
  assert(a.ch[1] === a.alive[1] + a.terr[1], "chinois Noir = vivantes + territoire");
  assert(a.ch[1] > a.alive[1], "chinois compte le territoire, pas seulement les pierres");
}

// Variantes échecs
const chessSrc = fs.readFileSync(path.join(root, "vendor", "chess.min.js"), "utf8")
  .replace("export{", "module.exports={");
const chessMod = { exports: {} };
vm.runInNewContext(
  chessSrc.replace("export{BLACK,WHITE,EMPTY,PAWN,KNIGHT,BISHOP,ROOK,QUEEN,KING,SQUARES,FLAGS,Chess};", "module.exports = { Chess };"),
  { module: chessMod, exports: chessMod.exports }
);
const Chess = chessMod.exports.Chess;
{
  const c = new Chess();
  c.move("e4");
  c.move("e5");
  c.move("Qh5");
  c.move("Nc6");
  c.move("Bc4");
  c.move("Nf6");
  c.move("Qxf7");
  assert(c.in_checkmate() === true, "mat du berger détecté");
}

if (failed) {
  console.error("\n" + failed + " test(s) en échec");
  process.exit(1);
}
console.log("\nTous les tests sont passés.");
