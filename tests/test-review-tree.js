const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const goSrc = fs.readFileSync(path.join(root, "go", "js", "engine.js"), "utf8");
const revSrc = fs.readFileSync(path.join(root, "js", "review-tree.js"), "utf8");
const sandbox = { window: {}, console, Math };
sandbox.global = sandbox;
vm.runInNewContext(goSrc + "\n" + revSrc, sandbox);
const GoGame = sandbox.window.GoGame;
const ReviewTree = sandbox.window.ReviewTree;

let failed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.error("FAIL:", msg); }
  else console.log("OK  :", msg);
}

const g = new GoGame(9);
g.play(2, 2);
g.play(6, 6);
g.play(2, 6);
const tree = new ReviewTree(g);
assert(tree.depth() === 3, "profondeur ligne principale = 3");
tree.back();
assert(tree.depth() === 2, "back → profondeur 2");
tree.playVariation({ x: 6, y: 2, pass: false, color: 1 });
assert(!tree.isOnMainLine(), "variation hors ligne principale");
const built = tree.buildGameAtCursor(9, 6.5, 0, "japanese");
assert(built.at(6, 2) === 1, "branche reconstruite");
const sgf = tree.exportSgf({ size: 9, komi: 6.5 });
assert(sgf.indexOf("(;") === 0 && /B\[[a-z]{2}\]/.test(sgf), "SGF variations non vide");

if (failed) process.exit(1);
console.log("\nreview-tree OK");
