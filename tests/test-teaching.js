const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = { window: {}, console, Math };
sandbox.global = sandbox;
["go/js/engine.js", "js/review-tree.js", "js/teaching-marks.js", "js/teaching-lessons.js", "js/teaching-session.js"].forEach((f) => {
  vm.runInNewContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox);
});
const GoGame = sandbox.window.GoGame;
const TeachingSession = sandbox.window.TeachingSession;
const TeachingMarks = sandbox.window.TeachingMarks;
const TeachingLessons = sandbox.window.TeachingLessons;

let failed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.error("FAIL:", msg); }
  else console.log("OK  :", msg);
}

const g = new GoGame(9);
g.play(2, 2);
const t = new TeachingSession({ size: 9 });
t.enable(g, true);
assert(t.myRole === "teacher", "hôte = teacher");
assert(t.mode === "play", "démarre en play");
assert(t.canPlayMove(2) === true, "prof joue Blanc");
assert(t.canPlayMove(1) === false, "prof ne joue pas Noir");

t.takeControl();
assert(t.mode === "control" && t.canEdit(), "Take Control → édition");
t.setTool("triangle");
const r = t.handleClick(4, 4, t.displayGame(g));
assert(r.kind === "mark" && t.marks[4][4].type === "triangle", "marque triangle");

t.setTool("move");
const g2 = t.displayGame(g);
const r2 = t.handleClick(6, 6, g2);
assert(r2.kind === "variation", "variation en control");

const built = t.resumePlay(g);
assert(built && t.mode === "play", "Resume Play revient en partie");
assert(built.at(2, 2) === 1, "position reprise conserve le coup");

t.takeControl();
t.startQuiz({ answers: [{ x: 1, y: 1 }, { x: 2, y: 2 }], goal: "test" });
assert(t.quiz && t.controller === "student", "quiz démarre pour l'élève");
const wrong = t.tryQuizAnswer(0, 0);
assert(wrong.kind === "quiz-wrong", "mauvaise réponse");
const ok = t.tryQuizAnswer(1, 1);
assert(ok.kind === "quiz-correct" && t.quiz.solved, "bonne réponse");

// Marques pédagogiques enrichies
t.stopQuiz();
t.takeControl();
t.setMarkColor("blue");
t.setTool("star");
assert(t.handleClick(3, 3, t.displayGame(g)).kind === "mark" && t.marks[3][3].type === "star", "étoile");
assert(t.marks[3][3].color === "blue", "couleur bleue");
t.setTool("capture");
t.handleClick(5, 5, t.displayGame(g));
assert(t.marks[5][5].type === "capture", "marque capture");
t.setTool("good");
t.handleClick(7, 7, t.displayGame(g));
assert(t.marks[7][7].type === "good" && t.marks[7][7].color === "green", "pastille bon coup");
t.setTool("arrow");
t.setArrowStyle("force");
assert(t.handleClick(1, 7, t.displayGame(g)).kind === "arrow-from", "flèche départ");
assert(t.handleClick(7, 1, t.displayGame(g)).kind === "arrow", "flèche arrivée");
assert(t.arrows.length === 1 && t.arrows[0].style === "force", "style force");
assert(TeachingMarks && TeachingMarks.colorHex("orange") === "#fb8c00", "TeachingMarks couleurs");

const gDead = new GoGame(9);
gDead.play(2, 2); gDead.play(0, 0); gDead.play(2, 3); gDead.play(8, 8);
t2 = new TeachingSession({ size: 9 });
t2.enable(gDead, true);
t2.takeControl();
t2.setTool("dead");
assert(t2.markDeadGroup(2, 2, gDead), "groupe mort");
assert(t2.marks[2][2] && t2.marks[3][2] && t2.marks[2][2].type === "dead", "2 pierres marquées mortes");

// Guess-the-move + NAG + delete branch + parcours
const g3 = new GoGame(9);
g3.play(2, 2); g3.play(6, 6); g3.play(2, 3); g3.play(6, 5); g3.play(2, 4);
const t3 = new TeachingSession({ size: 9 });
t3.enable(g3, true);
t3.takeControl();
const conc = t3.startConceal(2);
assert(conc && conc.remaining.length >= 2, "conceal démarre");
const step = t3.tryConcealAnswer(conc.remaining[0].x, conc.remaining[0].y);
assert(step.kind === "conceal-step" || step.kind === "conceal-done", "conceal bon coup");
t3.stopConceal();
t3.takeControl();
t3.setTool("move");
const gv = t3.displayGame(g3);
t3.handleClick(4, 4, gv);
t3.setNag("!");
assert(t3.tree.cursor.nag === "!", "NAG !");
t3.setVariationLabel("tesuji");
assert(t3.tree.cursor.label === "tesuji", "label variation");
assert(t3.deleteCurrentBranch(), "suppression branche");
assert(TeachingLessons.getPlan("debutant-1").chapters.length >= 4, "parcours chapitres");
t3.startQuiz({ answers: [{ x: 1, y: 1 }], hint: "test", sequence: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
assert(t3.showHint() === "test", "indice quiz");
const st = t3.tryQuizAnswer(1, 1);
assert(st.kind === "quiz-step", "practice multi-coups");

if (failed) process.exit(1);
console.log("\nteaching OK");
