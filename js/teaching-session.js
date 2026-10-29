/**
 * Session Teaching Go — démonstration, variations, reprise de partie.
 *
 * Modes :
 *   play     — partie normale (élève Noir, prof Blanc par défaut)
 *   control  — démo / édition (variations, marques, setup pierres)
 *
 * Rôles :
 *   teacher  — peut Take Control, Resume, donner le contrôle
 *   student  — joue en mode play ; édite seulement si contrôle délégué
 *   observer — suit le curseur du contrôleur (pas d'édition)
 */
(function (global) {
  const TOOLS = [
    "move", "black", "white",
    "triangle", "square", "circle", "star", "cross",
    "dead", "capture", "good", "bad", "hot",
    "arrow", "letter", "number", "draw", "erase"
  ];

  const HOTKEYS = {
    "1": "move",
    "2": "black",
    "3": "white",
    "4": "triangle",
    "5": "square",
    "6": "circle",
    "7": "star",
    "8": "dead",
    "9": "arrow",
    "0": "erase",
    "g": "good",
    "b": "bad",
    "c": "capture",
    "x": "cross",
    "h": "hot"
  };

  function emptyMarks(size) {
    const m = [];
    for (let y = 0; y < size; y++) {
      m[y] = [];
      for (let x = 0; x < size; x++) m[y][x] = null;
    }
    return m;
  }

  function cloneMarks(marks) {
    if (!marks) return null;
    return marks.map((row) => row.map((c) => (c ? Object.assign({}, c) : null)));
  }

  class TeachingSession {
    constructor(opts) {
      opts = opts || {};
      this.size = opts.size || 19;
      this.enabled = false;
      this.mode = "play"; // play | control
      this.myRole = opts.myRole || "teacher"; // teacher | student | observer
      this.controller = "teacher"; // qui a le contrôle d'édition : teacher | student
      this.teacherIsWhite = opts.teacherIsWhite !== false;
      this.tool = "move";
      this.markColor = "red";
      this.arrowStyle = "move"; // move | force | weak
      this.arrowFrom = null; // {x,y} premier clic flèche
      this.arrows = []; // [{x1,y1,x2,y2,color,style}]
      this.letterSeq = 0;
      this.numberSeq = 0;
      this.tree = null;
      this.marks = emptyMarks(this.size); // overlay global pendant la démo
      this.nodeMarks = {}; // marks par nodeId
      this.pausedClock = false;
      this.version = 0;
      this.onChange = null;
      // Pédagogie avancée
      this.showMoveNumbers = false;
      this.showTerritory = false;
      this.strokes = []; // [{points:[{x,y},...]}] coords plateau 0..1
      this.followTeacher = true; // élève suit le curseur (OGS sync)
      this.brokenAway = false;
      this.ghostMove = null; // {x,y,color} suggestion prof
      this.quiz = null; // { answers:[{x,y}], goal, attempts, solved, showAnswer, hint, hintShown, sequence, seqIndex }
      this.lastQuizResult = null; // correct | wrong | null
      this.lessonId = null;
      this.lessonPlan = null; // [{id,title,...}] chapitres
      this.lessonPlanIndex = 0;
      // Guess-the-move (Lichess conceal)
      this.conceal = null; // { remaining:[{x,y,color}], revealed:n, attempts, solved }
      // Pointeur laser prof (Fox / OGS presence)
      this.laser = null; // {x,y} coords plateau 0..1 normalisées ou intersection
      this.laserNorm = null; // {x,y} 0..1
      // Élève lève la main
      this.handRaised = false;
      this.studentQuestion = "";
    }

    enable(goGame, asTeacher) {
      this.enabled = true;
      this.size = goGame.size;
      this.myRole = asTeacher ? "teacher" : "student";
      this.controller = "teacher";
      this.mode = "play";
      this.tool = "move";
      this.markColor = "red";
      this.arrowStyle = "move";
      this.arrowFrom = null;
      this.arrows = [];
      this.marks = emptyMarks(this.size);
      this.nodeMarks = {};
      this.letterSeq = 0;
      this.numberSeq = 0;
      this.strokes = [];
      this.followTeacher = true;
      this.brokenAway = false;
      this.ghostMove = null;
      this.quiz = null;
      this.lastQuizResult = null;
      this.lessonId = null;
      this.lessonPlan = null;
      this.lessonPlanIndex = 0;
      this.conceal = null;
      this.laser = null;
      this.laserNorm = null;
      this.handRaised = false;
      this.studentQuestion = "";
      this.showMoveNumbers = false;
      this.showTerritory = false;
      if (global.ReviewTree) {
        this.tree = new global.ReviewTree(goGame);
        this.tree.teaching = true;
        this.tree.goEndMain();
      }
      this._bump();
    }

    disable() {
      this.enabled = false;
      this.mode = "play";
      this.tree = null;
      this.quiz = null;
      this.strokes = [];
      this.ghostMove = null;
      this._bump();
    }

    iAmController() {
      if (!this.enabled) return false;
      if (this.mode !== "control") return false;
      return this.myRole === this.controller;
    }

    canEdit() {
      return this.enabled && this.mode === "control" && this.myRole === this.controller;
    }

    canTakeControl() {
      return this.enabled && this.myRole === "teacher";
    }

    canPlayMove(goColor) {
      if (!this.enabled) return true;
      if (this.mode === "control") {
        return this.canEdit() && this.tool === "move";
      }
      // play : élève = noir (1) si teacherIsWhite, sinon inversé
      const studentColor = this.teacherIsWhite ? 1 : 2;
      const teacherColor = this.teacherIsWhite ? 2 : 1;
      if (this.myRole === "teacher") return goColor === teacherColor;
      if (this.myRole === "student") return goColor === studentColor;
      return false;
    }

    takeControl() {
      if (!this.canTakeControl()) return false;
      this.mode = "control";
      this.controller = "teacher";
      this.tool = "move";
      this.pausedClock = true;
      if (this.tree && this.tree.goEndMain) this.tree.goEndMain();
      this._bump();
      return true;
    }

    giveControlToStudent() {
      if (this.myRole !== "teacher" || this.mode !== "control") return false;
      this.controller = "student";
      this._bump();
      return true;
    }

    takeControlBack() {
      if (this.myRole !== "teacher") return false;
      this.controller = "teacher";
      this.mode = "control";
      this._bump();
      return true;
    }

    /**
     * Resume Play : la position courante du curseur devient
     * la nouvelle ligne principale / état de jeu.
     */
    resumePlay(goGame) {
      if (this.myRole !== "teacher" || !this.tree || !goGame) return null;
      const built = this.tree.buildGameAtCursor(
        goGame.size,
        goGame.komi,
        goGame.handicap,
        goGame.rules
      );
      // Reconstruire l'arbre comme ligne principale unique
      this.tree = new global.ReviewTree(built);
      this.tree.teaching = true;
      this.tree.goEndMain();
      this.mode = "play";
      this.controller = "teacher";
      this.tool = "move";
      this.pausedClock = false;
      this.marks = emptyMarks(this.size);
      this._bump();
      return built;
    }

    setTool(tool) {
      if (TOOLS.indexOf(tool) < 0) return;
      if (!this.canEdit() && tool !== "move") return;
      this.tool = tool;
      this.arrowFrom = null;
      this._bump();
    }

    setMarkColor(colorId) {
      this.markColor = colorId || "red";
      this._bump(true);
    }

    setArrowStyle(style) {
      this.arrowStyle = style === "force" || style === "weak" ? style : "move";
      this._bump(true);
    }

    navigate(action, arg) {
      if (!this.tree || !this.canEdit()) return false;
      if (action === "back") this.tree.back();
      else if (action === "fwd") this.tree.forward(arg | 0);
      else if (action === "root") this.tree.goRoot();
      else if (action === "end") this.tree.goEndMain();
      this._loadNodeMarks();
      this._bump();
      return true;
    }

    _loadNodeMarks() {
      if (!this.tree) return;
      const id = this.tree.cursor.id;
      if (this.nodeMarks[id]) {
        this.marks = cloneMarks(this.nodeMarks[id]);
      }
    }

    _saveNodeMarks() {
      if (!this.tree) return;
      this.nodeMarks[this.tree.cursor.id] = cloneMarks(this.marks);
    }

    setShowMoveNumbers(on) {
      this.showMoveNumbers = !!on;
      this._bump();
    }

    setShowTerritory(on) {
      this.showTerritory = !!on;
      this._bump();
    }

    setGhostMove(x, y, color) {
      if (!this.canEdit() && this.myRole !== "teacher") return;
      if (x < 0) {
        this.ghostMove = null;
      } else {
        this.ghostMove = { x: x, y: y, color: color || 1 };
      }
      this._bump();
    }

    /** Quiz : l'élève doit trouver une case parmi answers. */
    startQuiz(opts) {
      opts = opts || {};
      const sequence = (opts.sequence || []).map((a) => ({
        x: a.x | 0,
        y: a.y | 0,
        color: a.color || 0
      }));
      this.quiz = {
        answers: (opts.answers || []).map((a) => ({ x: a.x | 0, y: a.y | 0 })),
        goal: opts.goal || "Trouvez le prochain coup",
        hint: opts.hint || "",
        hintShown: false,
        attempts: 0,
        solved: false,
        showAnswer: false,
        maxAttempts: opts.maxAttempts || 5,
        // Practice line (Lichess) : enchaîner plusieurs coups
        sequence: sequence,
        seqIndex: 0
      };
      if (sequence.length && !this.quiz.answers.length) {
        this.quiz.answers = [{ x: sequence[0].x, y: sequence[0].y }];
      }
      this.conceal = null;
      this.lastQuizResult = null;
      this.mode = "control";
      this.controller = "student";
      this.tool = "move";
      this._bump();
      return this.quiz;
    }

    stopQuiz() {
      this.quiz = null;
      this.conceal = null;
      this.lastQuizResult = null;
      if (this.myRole === "teacher") {
        this.controller = "teacher";
      }
      this._bump();
    }

    revealQuizAnswer() {
      if (!this.quiz || this.myRole !== "teacher") return;
      this.quiz.showAnswer = true;
      this._bump();
    }

    showHint() {
      if (!this.quiz) return null;
      // Élève ou prof peut afficher l'indice
      if (this.myRole !== "teacher" && this.myRole !== "student") return null;
      this.quiz.hintShown = true;
      this._bump();
      return this.quiz.hint || "Regardez les libertés et les ataris.";
    }

    tryQuizAnswer(x, y) {
      if (!this.quiz || this.quiz.solved) return { kind: "ignore" };
      this.quiz.attempts++;
      const ok = this.quiz.answers.some((a) => a.x === x && a.y === y);
      if (ok) {
        this.marks[y][x] = { type: "good", color: "green" };
        // Practice : avancer dans la séquence
        if (this.quiz.sequence && this.quiz.sequence.length > 1) {
          this.quiz.seqIndex++;
          if (this.quiz.seqIndex < this.quiz.sequence.length) {
            const next = this.quiz.sequence[this.quiz.seqIndex];
            this.quiz.answers = [{ x: next.x, y: next.y }];
            this.quiz.goal = "Suite " + (this.quiz.seqIndex + 1) + "/" + this.quiz.sequence.length;
            this.lastQuizResult = "correct";
            this._bump();
            return {
              kind: "quiz-step",
              attempts: this.quiz.attempts,
              step: this.quiz.seqIndex,
              total: this.quiz.sequence.length
            };
          }
        }
        this.quiz.solved = true;
        this.lastQuizResult = "correct";
        this._bump();
        return { kind: "quiz-correct", attempts: this.quiz.attempts };
      }
      this.lastQuizResult = "wrong";
      this.marks[y][x] = { type: "cross", color: "red" };
      this._bump();
      return {
        kind: "quiz-wrong",
        attempts: this.quiz.attempts,
        remain: Math.max(0, this.quiz.maxAttempts - this.quiz.attempts)
      };
    }

    /**
     * Guess-the-move (Lichess conceal) : cache la suite de la ligne principale
     * et demande à l'élève de la retrouver coup par coup.
     */
    startConceal(fromDepth) {
      if (!this.tree || this.myRole !== "teacher") return null;
      this.tree.goEndMain();
      const path = this.tree.pathFromRoot().filter((n) => n.move && !n.move.edit && !n.move.pass);
      const start = Math.max(0, fromDepth | 0);
      const remaining = path.slice(start).map((n) => ({
        x: n.move.x,
        y: n.move.y,
        color: n.move.color
      }));
      if (!remaining.length) return null;
      // Revenir juste avant le premier coup caché
      this.tree.goRoot();
      for (let i = 0; i < start; i++) this.tree.forward(0);
      this.conceal = {
        remaining: remaining,
        index: 0,
        attempts: 0,
        solved: false
      };
      this.quiz = null;
      this.mode = "control";
      this.controller = "student";
      this.tool = "move";
      this._bump();
      return this.conceal;
    }

    stopConceal() {
      this.conceal = null;
      if (this.myRole === "teacher") this.controller = "teacher";
      this._bump();
    }

    tryConcealAnswer(x, y) {
      if (!this.conceal || this.conceal.solved) return { kind: "ignore" };
      const expect = this.conceal.remaining[this.conceal.index];
      if (!expect) return { kind: "ignore" };
      this.conceal.attempts++;
      if (expect.x === x && expect.y === y) {
        if (this.tree) this.tree.forward(0);
        this.conceal.index++;
        this.marks[y][x] = { type: "good", color: "green" };
        if (this.conceal.index >= this.conceal.remaining.length) {
          this.conceal.solved = true;
          this._bump();
          return { kind: "conceal-done", attempts: this.conceal.attempts };
        }
        this._bump();
        return {
          kind: "conceal-step",
          step: this.conceal.index,
          total: this.conceal.remaining.length
        };
      }
      this.marks[y][x] = { type: "cross", color: "red" };
      this._bump();
      return { kind: "conceal-wrong", attempts: this.conceal.attempts };
    }

    setLaser(normX, normY) {
      if (this.myRole !== "teacher" && !this.canEdit()) return;
      if (normX < 0) {
        this.laserNorm = null;
        this.laser = null;
      } else {
        this.laserNorm = { x: normX, y: normY };
      }
      this._bump(true);
    }

    raiseHand(question) {
      if (this.myRole !== "student") return false;
      this.handRaised = true;
      this.studentQuestion = String(question || "").slice(0, 200);
      this._handDirty = true;
      this._bump();
      return true;
    }

    lowerHand() {
      this.handRaised = false;
      this.studentQuestion = "";
      this._handDirty = true;
      this._bump();
    }

    setNag(nag) {
      if (!this.canEdit() || !this.tree) return;
      this.tree.setNag(nag);
      this._bump();
    }

    setVariationLabel(label) {
      if (!this.canEdit() || !this.tree) return;
      this.tree.setLabel(label);
      this._bump();
    }

    deleteCurrentBranch() {
      if (!this.canEdit() || !this.tree) return false;
      const ok = this.tree.deleteBranch();
      if (ok) this._bump();
      return ok;
    }

    setLessonPlan(lessons, index) {
      this.lessonPlan = (lessons || []).slice();
      this.lessonPlanIndex = Math.max(0, index | 0);
      this._bump(true);
    }

    nextLessonInPlan() {
      if (!this.lessonPlan || !this.lessonPlan.length) return null;
      if (this.lessonPlanIndex >= this.lessonPlan.length - 1) return null;
      this.lessonPlanIndex++;
      return this.lessonPlan[this.lessonPlanIndex];
    }

    prevLessonInPlan() {
      if (!this.lessonPlan || !this.lessonPlan.length) return null;
      if (this.lessonPlanIndex <= 0) return null;
      this.lessonPlanIndex--;
      return this.lessonPlan[this.lessonPlanIndex];
    }

    /** Import SGF → arbre teaching (OGS demo from game). */
    importSgf(sgfText, goGame) {
      if (!global.GoGame || !global.ReviewTree || !sgfText) return false;
      try {
        const g = global.GoGame.fromSgf(sgfText);
        this.size = g.size;
        this.tree = new global.ReviewTree(g);
        this.tree.teaching = true;
        this.tree.goEndMain();
        this.marks = emptyMarks(this.size);
        this.arrows = [];
        this.mode = "control";
        this.controller = this.myRole === "teacher" ? "teacher" : this.controller;
        if (goGame && goGame.loadState) {
          goGame.loadState(g.serializeState());
        }
        this._bump();
        return true;
      } catch (e) {
        console.warn("importSgf", e);
        return false;
      }
    }

    breakAway() {
      if (this.myRole !== "student") return;
      this.followTeacher = false;
      this.brokenAway = true;
      this._bump(true);
    }

    syncToTeacher() {
      this.followTeacher = true;
      this.brokenAway = false;
      this._bump(true);
    }

    addStroke(points) {
      if (!this.canEdit() || !points || points.length < 2) return;
      this.strokes.push({ points: points.slice() });
      if (this.strokes.length > 40) this.strokes.shift();
      this._bump();
    }

    clearStrokes() {
      if (!this.canEdit() && this.myRole !== "teacher") return;
      this.strokes = [];
      this._bump();
    }

    toolFromHotkey(key) {
      return HOTKEYS[String(key)] || null;
    }

    /** Clic goban selon l'outil. Retourne { kind, ... } pour l'UI. */
    handleClick(x, y, displayGame) {
      if (!this.enabled) return { kind: "ignore" };

      // Conceal / guess-the-move
      if (this.conceal && !this.conceal.solved) {
        if (this.myRole === "student" || this.canEdit()) {
          return this.tryConcealAnswer(x, y);
        }
        return { kind: "blocked" };
      }

      // Mode quiz : l'élève (ou contrôleur) propose une case
      if (this.quiz && !this.quiz.solved) {
        if (this.myRole === "student" || this.canEdit()) {
          return this.tryQuizAnswer(x, y);
        }
        return { kind: "blocked" };
      }

      if (this.mode === "play") {
        return { kind: "play-move", x: x, y: y };
      }
      if (!this.canEdit()) return { kind: "blocked" };

      const g = displayGame;
      if (!g || !g.inBounds(x, y)) return { kind: "ignore" };

      if (this.tool === "move") {
        if (g.over) return { kind: "blocked" };
        const color = g.turn;
        const ok = g.play(x, y);
        if (!ok) return { kind: "illegal" };
        const last = g.moves[g.moves.length - 1];
        this.tree.playVariation(last);
        this._saveNodeMarks();
        this._bump();
        return { kind: "variation", move: last, game: g };
      }

      if (this.tool === "black" || this.tool === "white") {
        const color = this.tool === "black" ? 1 : 2;
        const cur = g.at(x, y);
        if (cur === color) g.set(x, y, 0);
        else g.set(x, y, color);
        // Edit libre : nœud setup sans coup
        this.tree.playVariation({
          x: x,
          y: y,
          color: color,
          pass: false,
          edit: true,
          remove: cur === color
        });
        this._bump();
        return { kind: "edit-stone", game: g };
      }

      if (this.tool === "erase") {
        this.marks[y][x] = null;
        // supprimer flèches touchant cette case
        this.arrows = this.arrows.filter((a) =>
          !(a.x1 === x && a.y1 === y) && !(a.x2 === x && a.y2 === y)
        );
        this.arrowFrom = null;
        this._saveNodeMarks();
        this._bump();
        return { kind: "mark" };
      }

      if (this.tool === "arrow") {
        if (!this.arrowFrom) {
          this.arrowFrom = { x: x, y: y };
          this._bump(true);
          return { kind: "arrow-from", x: x, y: y };
        }
        if (this.arrowFrom.x === x && this.arrowFrom.y === y) {
          this.arrowFrom = null;
          this._bump(true);
          return { kind: "arrow-cancel" };
        }
        // remplacer flèche identique
        this.arrows = this.arrows.filter((a) =>
          !(a.x1 === this.arrowFrom.x && a.y1 === this.arrowFrom.y && a.x2 === x && a.y2 === y)
        );
        this.arrows.push({
          x1: this.arrowFrom.x,
          y1: this.arrowFrom.y,
          x2: x,
          y2: y,
          color: this.markColor,
          style: this.arrowStyle
        });
        if (this.arrows.length > 40) this.arrows.shift();
        this.arrowFrom = null;
        this._bump();
        return { kind: "arrow" };
      }

      const shapeTools = [
        "triangle", "square", "circle", "star", "cross",
        "dead", "capture", "good", "bad", "hot"
      ];
      if (shapeTools.indexOf(this.tool) !== -1) {
        const t = this.tool;
        const forced =
          t === "good" ? "green" :
          t === "bad" ? "red" :
          t === "hot" ? "orange" :
          t === "dead" ? (this.markColor || "red") :
          this.markColor;
        const same = this.marks[y][x] &&
          this.marks[y][x].type === t &&
          (this.marks[y][x].color || "red") === forced;
        if (same) this.marks[y][x] = null;
        else this.marks[y][x] = { type: t, color: forced };
        this._saveNodeMarks();
        this._bump();
        return { kind: "mark" };
      }

      if (this.tool === "letter") {
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const ch = letters[this.letterSeq % 26];
        this.letterSeq++;
        this.marks[y][x] = { type: "letter", text: ch, color: this.markColor };
        this._saveNodeMarks();
        this._bump();
        return { kind: "mark" };
      }

      if (this.tool === "number") {
        this.numberSeq++;
        this.marks[y][x] = { type: "number", text: String(this.numberSeq), color: this.markColor };
        this._saveNodeMarks();
        this._bump();
        return { kind: "mark" };
      }

      return { kind: "ignore" };
    }

    setComment(text) {
      if (!this.tree || !this.canEdit()) return;
      this.tree.setComment(text);
      this._bump();
    }

    clearMarks() {
      if (!this.canEdit() && this.myRole !== "teacher") return;
      this.marks = emptyMarks(this.size);
      this.arrows = [];
      this.arrowFrom = null;
      this._saveNodeMarks();
      this._bump();
    }

    clearArrows() {
      if (!this.canEdit() && this.myRole !== "teacher") return;
      this.arrows = [];
      this.arrowFrom = null;
      this._bump();
    }

    /** Marque un groupe entier comme mort (croix). */
    markDeadGroup(x, y, displayGame) {
      if (!this.canEdit() || !displayGame) return false;
      const color = displayGame.at(x, y);
      if (!color) return false;
      const group = displayGame.getGroup(x, y);
      group.forEach((s) => {
        this.marks[s.y][s.x] = { type: "dead", color: this.markColor };
      });
      this._saveNodeMarks();
      this._bump();
      return true;
    }

    statusBanner() {
      if (!this.enabled) return "";
      if (this.handRaised && this.myRole === "teacher") {
        return "✋ Élève lève la main" + (this.studentQuestion ? " : " + this.studentQuestion : "");
      }
      if (this.conceal) {
        if (this.conceal.solved) return "Guess-the-move · TERMINÉ ✓";
        return "Guess-the-move · coup " + (this.conceal.index + 1) +
          "/" + this.conceal.remaining.length + " · essais " + this.conceal.attempts;
      }
      if (this.quiz) {
        if (this.quiz.solved) return "Quiz · RÉUSSI en " + this.quiz.attempts + " essai(s) ✓";
        const hint = this.quiz.hintShown ? " · indice" : "";
        return "Quiz · " + this.quiz.goal + " · essais " + this.quiz.attempts + hint;
      }
      if (this.mode === "play") {
        return "Teaching · partie · " + this.myRole +
          (this.brokenAway ? " · exploration locale" : "") +
          (this.handRaised ? " · ✋" : "");
      }
      const who = this.controller === "teacher" ? "Prof" : "Élève";
      const plan = this.lessonPlan
        ? " · leçon " + (this.lessonPlanIndex + 1) + "/" + this.lessonPlan.length
        : "";
      return "Teaching · CONTRÔLE (" + who + ") · " + this.tool + plan +
        (this.brokenAway ? " · hors sync" : "");
    }

    serialize() {
      return {
        type: "teaching-state",
        version: this.version,
        enabled: this.enabled,
        mode: this.mode,
        controller: this.controller,
        teacherIsWhite: this.teacherIsWhite,
        tool: this.tool,
        letterSeq: this.letterSeq,
        numberSeq: this.numberSeq,
        marks: this.marks,
        arrows: this.arrows,
        markColor: this.markColor,
        arrowStyle: this.arrowStyle,
        strokes: this.strokes,
        cursorPath: this.tree ? this._cursorPathIds() : [],
        treeSgf: this.tree ? this.tree.exportSgf({ size: this.size }) : null,
        comment: this.tree && this.tree.cursor ? this.tree.cursor.comment : "",
        pausedClock: this.pausedClock,
        showMoveNumbers: this.showMoveNumbers,
        showTerritory: this.showTerritory,
        ghostMove: this.ghostMove,
        quiz: this.quiz,
        conceal: this.conceal,
        lessonId: this.lessonId,
        lessonPlan: this.lessonPlan,
        lessonPlanIndex: this.lessonPlanIndex,
        laserNorm: this.laserNorm,
        handRaised: this.handRaised,
        studentQuestion: this.studentQuestion,
        cursorNag: this.tree && this.tree.cursor ? this.tree.cursor.nag : "",
        cursorLabel: this.tree && this.tree.cursor ? this.tree.cursor.label : ""
      };
    }

    _cursorPathIds() {
      if (!this.tree) return [];
      return this.tree.pathFromRoot().map((n) => n.id);
    }

    /**
     * Applique un snapshot distant (élève / observateur).
     * Pour la sync arbre on reconstruit depuis SGF + profondeur.
     */
    applyRemote(snap, goGame) {
      if (!snap || snap.type !== "teaching-state") return false;
      this.enabled = !!snap.enabled;
      this.mode = snap.mode === "control" ? "control" : "play";
      this.controller = snap.controller === "student" ? "student" : "teacher";
      this.teacherIsWhite = snap.teacherIsWhite !== false;
      this.tool = snap.tool || "move";
      this.letterSeq = snap.letterSeq | 0;
      this.numberSeq = snap.numberSeq | 0;
      this.pausedClock = !!snap.pausedClock;
      this.version = snap.version | 0;
      if (snap.marks) this.marks = snap.marks;
      if (Array.isArray(snap.arrows)) this.arrows = snap.arrows;
      if (snap.markColor) this.markColor = snap.markColor;
      if (snap.arrowStyle) this.arrowStyle = snap.arrowStyle;
      if (Array.isArray(snap.strokes)) this.strokes = snap.strokes;
      this.showMoveNumbers = !!snap.showMoveNumbers;
      this.showTerritory = !!snap.showTerritory;
      this.ghostMove = snap.ghostMove || null;
      this.quiz = snap.quiz || null;
      this.conceal = snap.conceal || null;
      this.lessonId = snap.lessonId || null;
      this.lessonPlan = snap.lessonPlan || null;
      this.lessonPlanIndex = snap.lessonPlanIndex | 0;
      this.laserNorm = snap.laserNorm || null;
      this.handRaised = !!snap.handRaised;
      this.studentQuestion = snap.studentQuestion || "";
      // Élève en breakaway : ne pas écraser son curseur local
      if (this.myRole === "student" && this.brokenAway && !this.followTeacher) {
        this._bump(true);
        return true;
      }
      if (snap.treeSgf && global.GoGame && global.ReviewTree) {
        try {
          const g = global.GoGame.fromSgf(snap.treeSgf);
          this.tree = new global.ReviewTree(g);
          this.tree.teaching = true;
          const depth = (snap.cursorPath && snap.cursorPath.length) ? snap.cursorPath.length - 1 : g.moves.length;
          this.tree.goRoot();
          for (let i = 0; i < depth; i++) this.tree.forward(0);
          if (snap.comment && this.tree.cursor) this.tree.cursor.comment = snap.comment;
          if (this.tree.cursor) {
            if (snap.cursorNag) this.tree.cursor.nag = snap.cursorNag;
            if (snap.cursorLabel) this.tree.cursor.label = snap.cursorLabel;
          }
        } catch (e) {
          console.warn("teaching applyRemote tree", e);
        }
      }
      this._bump(true);
      return true;
    }

    displayGame(liveGame) {
      if (!this.enabled || !this.tree) return liveGame;
      if (this.mode === "play" && this.tree.isOnMainLine()) {
        // En play sur ligne principale : goban live
        return liveGame;
      }
      return this.tree.buildGameAtCursor(
        liveGame.size,
        liveGame.komi,
        liveGame.handicap,
        liveGame.rules
      );
    }

    /** Après un coup live en mode play, synchroniser l'arbre. */
    onLiveMove(move) {
      if (!this.enabled || !this.tree || this.mode !== "play") return;
      this.tree.goEndMain();
      // Si le dernier nœud n'est pas ce coup, append
      const tip = this.tree.cursor;
      if (tip && tip.move && tip.move.x === move.x && tip.move.y === move.y) return;
      this.tree.appendMain(move);
      this.tree.goEndMain();
      this._bump();
    }

    _bump(silent) {
      this.version++;
      if (!silent && this.onChange) this.onChange(this);
    }
  }

  TeachingSession.TOOLS = TOOLS;
  TeachingSession.HOTKEYS = HOTKEYS;
  global.TeachingSession = TeachingSession;
})(window);
