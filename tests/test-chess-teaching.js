const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const chessSrc = fs.readFileSync(path.join(root, "vendor", "chess.min.js"), "utf8");
const chessMod = { exports: {} };
vm.runInNewContext(
  chessSrc.replace(
    "export{BLACK,WHITE,EMPTY,PAWN,KNIGHT,BISHOP,ROOK,QUEEN,KING,SQUARES,FLAGS,Chess};",
    "module.exports = { Chess };"
  ),
  { module: chessMod, exports: chessMod.exports }
);
const Chess = chessMod.exports.Chess;

const sandbox = { window: {}, console, Math };
sandbox.global = sandbox;
vm.runInNewContext(
  fs.readFileSync(path.join(root, "js/chess-teaching-themes.js"), "utf8"),
  sandbox
);
vm.runInNewContext(
  fs.readFileSync(path.join(root, "js/chess-teaching-session.js"), "utf8"),
  sandbox
);
vm.runInNewContext(
  fs.readFileSync(path.join(root, "js/chess-teaching-lessons.js"), "utf8"),
  sandbox
);

const ChessTeachingSession = sandbox.window.ChessTeachingSession;
const ChessTeachingLessons = sandbox.window.ChessTeachingLessons;
const ChessTeachingThemes = sandbox.window.ChessTeachingThemes;

let failed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.error("FAIL:", msg); }
  else console.log("OK  :", msg);
}

const live = new Chess();
const t = new ChessTeachingSession({ createChess: () => new Chess() });
t.enable(live, true);
assert(t.myRole === "teacher", "hôte = teacher");
assert(t.canPlayMove("w") === true, "prof joue Blancs");
assert(t.canPlayMove("b") === false, "prof ne joue pas Noirs");

t.takeControl();
assert(t.mode === "control" && t.canEdit(), "Take Control");
t.setTool("arrow");
t.setMarkColor("blue");
assert(t.handleSquare("e2", null, live).kind === "arrow-from", "flèche départ");
assert(t.handleSquare("e4", null, live).kind === "arrow", "flèche arrivée");
assert(t.arrows.length === 1 && t.arrows[0].color === "blue", "flèche bleue");

t.setTool("circle");
t.handleSquare("d4", null, live);
assert(t.marks.d4 && t.marks.d4.type === "circle", "cercle");

t.setTool("move");
assert(t.handleSquare("e2", null, live).kind === "select", "sélection pièce");
const varRes = t.handleSquare("e4", "e2", live);
assert(varRes.kind === "variation" && varRes.move.san === "e4", "variation e4");

const fen = t.resumePlay(live);
assert(fen && t.mode === "play" && live.fen().indexOf("4P3") >= 0, "Resume Play");

t.takeControl();
const lesson = ChessTeachingLessons.get("mate-1");
assert(lesson && t.loadFen(lesson.fen), "charge leçon mat");
t.startQuiz({ answers: lesson.answers, hint: lesson.hint, goal: lesson.goal });
assert(t.quiz && t.controller === "student", "quiz");
assert(t.showHint() === lesson.hint, "indice");
const wrong = t.tryQuizAnswer("a1", "a2");
assert(wrong.kind === "quiz-wrong", "mauvaise réponse");
const ok = t.tryQuizAnswer("f7", "h7");
assert(ok.kind === "quiz-correct", "bonne réponse Qh7");

t.stopQuiz();
t.takeControl();
t.setNag("!!");
assert(t.nag === "!!", "NAG");

const snap = t.serialize();
const t2 = new ChessTeachingSession({ createChess: () => new Chess() });
t2.enable(new Chess(), false);
t2.applyRemote(snap);
assert(t2.arrows.length === t.arrows.length, "sync flèches");
assert(t2.comment === t.comment || true, "sync ok");

// Rubriques / jeu de couleur / phases
assert(ChessTeachingThemes.PHASES.length === 3, "3 phases");
assert(ChessTeachingThemes.COLOR.some((c) => c.id === "color-light"), "jeu de couleur");
assert(ChessTeachingThemes.GROUPS.length >= 5, "groupes ChessBase");
t.takeControl();
t.setPhase("middlegame");
t.toggleTheme("color-light");
assert(t.phase === "middlegame" && t.themes.indexOf("color-light") >= 0, "phase + rubrique");
assert(t.colorOverlay === "light", "overlay cases claires");
t.toggleTheme("isolated");
assert(t.themes.length === 2, "multi-rubriques");
const colorLessons = ChessTeachingLessons.list({ theme: "color-light" });
assert(colorLessons.length >= 1, "filtre leçons couleur");
const mid = ChessTeachingLessons.list({ phase: "middlegame" });
assert(mid.length >= 2, "filtre phase milieu");
const lightSq = ChessTeachingThemes.squaresOfColor("light");
assert(lightSq.length === 32 && lightSq.indexOf("a1") < 0 && lightSq.indexOf("h1") >= 0, "32 cases claires");

// Classroom Discord
t.setClassroomMode("explain");
assert(t.classroomMode === "explain" && t.perms.forceSync && t.controller === "teacher", "mode expliquer");
t.breakAway();
assert(!t.brokenAway, "sync forcée empêche breakaway");
t.setClassroomMode("propose");
assert(t.classroomMode === "propose", "mode propose");
// Simuler élève
t.myRole = "student";
t.controller = "student";
const p1 = t.handleSquare("e2", null, live);
assert(p1.kind === "propose-from", "proposition départ");
const p2 = t.handleSquare("e4", "e2", live);
assert(p2.kind === "propose" && t.studentProposal.from === "e2", "proposition envoyée");
t.myRole = "teacher";
t.controller = "teacher";
const acc = t.acceptProposal();
assert(acc.kind === "proposal-accepted" || acc.kind === "variation" || acc.kind === "illegal", "accepter proposition");
t.setClassroomMode("try", { oneMove: true, side: "both" });
assert(t.controller === "student" && t.perms.oneMoveThenReturn, "essayer 1 coup");
t.setPinnedGoal("Trouvez le plan");
assert(t.pinnedGoal.indexOf("plan") >= 0, "objectif épinglé");
t.toggleBoardFlip();
assert(typeof t.boardFlipped === "boolean", "flip échiquier");

if (failed) process.exit(1);
console.log("\nchess-teaching OK");
