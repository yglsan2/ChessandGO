/**
 * Session Teaching Échecs — étude, variations, reprise.
 * Take Control, flèches colorées, cercles, quiz, sync, Resume Play.
 */
(function (global) {
  const TOOLS = [
    "move", "arrow", "circle", "square", "cross",
    "good", "bad", "hot", "letter", "number", "erase"
  ];

  const HOTKEYS = {
    "1": "move",
    "2": "arrow",
    "3": "circle",
    "4": "square",
    "5": "good",
    "6": "bad",
    "7": "hot",
    "8": "cross",
    "9": "letter",
    "0": "erase",
    "g": "good",
    "b": "bad",
    "a": "arrow",
    "c": "circle"
  };

  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  class ChessTeachingSession {
    constructor(opts) {
      opts = opts || {};
      this.createChess = opts.createChess || null;
      this.enabled = false;
      this.mode = "play";
      this.myRole = opts.myRole || "teacher";
      this.controller = "teacher";
      this.teacherIsWhite = opts.teacherIsWhite !== false;
      this.tool = "move";
      this.markColor = "green";
      this.arrowStyle = "move";
      this.arrowFrom = null;
      this.arrows = [];
      this.marks = {};
      this.letterSeq = 0;
      this.numberSeq = 0;
      this.comment = "";
      this.nag = "";
      this.baseFen = START_FEN;
      this.mainline = [];
      this.explore = null;
      this.version = 0;
      this.onChange = null;
      this.pausedClock = false;
      this.followTeacher = true;
      this.brokenAway = false;
      this.ghostMove = null;
      this.quiz = null;
      this.lessonId = null;
      this.laserNorm = null;
      this.handRaised = false;
      this.studentQuestion = "";
      this._handDirty = false;
      // Rubriques pédagogiques (ChessBase)
      this.phase = null; // opening | middlegame | endgame
      this.themes = []; // ids de rubriques actives
      this.colorOverlay = null; // light | dark | complex | weak | null
      this.drill = null; // { type, targets[], selected{}, done }
      // Salle de classe Discord (Chess.com Classroom / Share Board / Lichess Sync)
      this.classroomMode = "explain"; // explain | try | play-from | propose
      this.perms = {
        studentMoves: "none", // none | w | b | both
        studentDraw: false,
        forceSync: true,
        hideEval: true,
        legalOnly: true,
        oneMoveThenReturn: false
      };
      this.boardFlipped = false;
      this.pinnedGoal = "";
      this.studentProposal = null; // { from, to }
      this._proposalFrom = null;
    }

    _chess() {
      if (!this.createChess) throw new Error("createChess manquant");
      return this.createChess();
    }

    enable(liveChess, asTeacher) {
      this.enabled = true;
      this.myRole = asTeacher ? "teacher" : "student";
      this.controller = "teacher";
      this.mode = "play";
      this.tool = "move";
      this.markColor = "green";
      this.arrows = [];
      this.marks = {};
      this.arrowFrom = null;
      this.letterSeq = 0;
      this.numberSeq = 0;
      this.comment = "";
      this.nag = "";
      this.quiz = null;
      this.ghostMove = null;
      this.explore = null;
      this.followTeacher = true;
      this.brokenAway = false;
      this.handRaised = false;
      this.laserNorm = null;
      this.phase = null;
      this.themes = [];
      this.colorOverlay = null;
      this.drill = null;
      this.classroomMode = "explain";
      this.perms = {
        studentMoves: "none",
        studentDraw: false,
        forceSync: true,
        hideEval: true,
        legalOnly: true,
        oneMoveThenReturn: false
      };
      this.boardFlipped = !asTeacher && this.teacherIsWhite; // élève voit depuis les Noirs
      this.pinnedGoal = "";
      this.studentProposal = null;
      this._proposalFrom = null;
      this.baseFen = liveChess ? liveChess.fen() : START_FEN;
      this.mainline = liveChess
        ? liveChess.history({ verbose: true }).map((m) => ({
          from: m.from,
          to: m.to,
          san: m.san,
          color: m.color,
          promotion: m.promotion
        }))
        : [];
      this._bump();
    }

    disable() {
      this.enabled = false;
      this.mode = "play";
      this.explore = null;
      this.quiz = null;
      this._bump();
    }

    canEdit() {
      if (!this.enabled || this.mode !== "control") return false;
      if (this.myRole === this.controller) return true;
      // Élève avec droit de dessin seulement
      return false;
    }

    canDraw() {
      if (!this.enabled || this.mode !== "control") return false;
      if (this.myRole === this.controller) return true;
      if (this.myRole === "student" && this.perms.studentDraw) return true;
      return false;
    }

    canTakeControl() {
      return this.enabled && this.myRole === "teacher";
    }

    studentMayMoveColor(color) {
      const p = this.perms.studentMoves;
      if (p === "both") return true;
      if (p === "w") return color === "w";
      if (p === "b") return color === "b";
      return false;
    }

    canPlayMove(turnColor) {
      if (!this.enabled) return true;
      if (this.mode === "control") {
        if (this.classroomMode === "propose") return false;
        if (this.myRole === "teacher" && this.controller === "teacher") {
          return this.tool === "move";
        }
        if (this.myRole === "student") {
          return this.controller === "student" &&
            this.tool === "move" &&
            this.studentMayMoveColor(turnColor);
        }
        return false;
      }
      const studentColor = this.teacherIsWhite ? "b" : "w";
      const teacherColor = this.teacherIsWhite ? "w" : "b";
      if (this.myRole === "teacher") return turnColor === teacherColor;
      if (this.myRole === "student") return turnColor === studentColor;
      return false;
    }

    /**
     * Presets Discord Classroom (Chess.com / ChessCore).
     * explain = prof explique, plateau verrouillé
     * try = élève essaie (1 coup ou libre)
     * play-from = reprendre une mini-partie depuis la position
     * propose = « quel coup joueriez-vous ? » sans bouger
     */
    setClassroomMode(mode, opts) {
      if (this.myRole !== "teacher") return false;
      opts = opts || {};
      this.classroomMode = mode;
      if (mode === "explain") {
        this.mode = "control";
        this.controller = "teacher";
        this.perms.studentMoves = "none";
        this.perms.studentDraw = !!opts.studentDraw;
        this.perms.forceSync = true;
        this.perms.hideEval = true;
        this.perms.oneMoveThenReturn = false;
        this.followTeacher = true;
        this.brokenAway = false;
        this.tool = "arrow";
        if (!this.explore) {
          this.explore = {
            fen: this.baseFen,
            history: this.mainline.slice(),
            cursor: this.mainline.length
          };
          this._rebuildExploreFen();
        }
      } else if (mode === "try") {
        this.mode = "control";
        this.controller = "student";
        this.perms.studentMoves = opts.side || "both";
        this.perms.studentDraw = false;
        this.perms.forceSync = false;
        this.perms.hideEval = true;
        this.perms.oneMoveThenReturn = opts.oneMove !== false;
        this.tool = "move";
        this.studentProposal = null;
        if (!this.explore) {
          this.explore = {
            fen: this.baseFen,
            history: this.mainline.slice(),
            cursor: this.mainline.length
          };
          this._rebuildExploreFen();
        }
      } else if (mode === "play-from") {
        this.perms.studentMoves = this.teacherIsWhite ? "b" : "w";
        this.perms.forceSync = true;
        this.perms.hideEval = false;
        this.perms.oneMoveThenReturn = false;
        this.controller = "teacher";
        // La position courante devient la partie live (appelant doit resumePlay)
      } else if (mode === "propose") {
        this.mode = "control";
        this.controller = "student";
        this.perms.studentMoves = "none";
        this.perms.forceSync = true;
        this.perms.hideEval = true;
        this.perms.oneMoveThenReturn = false;
        this.tool = "move";
        this.studentProposal = null;
        this._proposalFrom = null;
      }
      this.pausedClock = mode !== "play-from";
      this._bump();
      return true;
    }

    setPerm(key, value) {
      if (this.myRole !== "teacher") return;
      if (!this.perms || !(key in this.perms)) return;
      this.perms[key] = value;
      if (key === "forceSync" && value) {
        this.followTeacher = true;
        this.brokenAway = false;
      }
      this._bump();
    }

    setPinnedGoal(text) {
      if (this.myRole !== "teacher" && !this.canEdit()) return;
      this.pinnedGoal = String(text || "").slice(0, 200);
      this._bump();
    }

    setBoardFlipped(on) {
      this.boardFlipped = !!on;
      this._bump(true);
    }

    toggleBoardFlip() {
      this.boardFlipped = !this.boardFlipped;
      this._bump();
    }

    clearStudentProposal() {
      this.studentProposal = null;
      this._proposalFrom = null;
      this._bump();
    }

    /** Élève propose un coup sans le jouer (Classroom quiz / « Find the plan »). */
    proposeMove(from, to) {
      if (this.classroomMode !== "propose") return { kind: "ignore" };
      if (this.myRole !== "student" && this.controller !== "student") {
        return { kind: "blocked" };
      }
      if (!from) {
        this._proposalFrom = to; // premier clic stocké comme from via handleSquare
        return { kind: "propose-from", square: to };
      }
      this.studentProposal = { from: from, to: to };
      this._proposalFrom = null;
      this.ghostMove = { from: from, to: to };
      this.arrows = this.arrows.filter((a) => a._proposal);
      this.arrows.push({
        from: from,
        to: to,
        color: "orange",
        style: "force",
        _proposal: true
      });
      this._bump();
      return { kind: "propose", from: from, to: to };
    }

    acceptProposal() {
      if (this.myRole !== "teacher" || !this.studentProposal) return { kind: "ignore" };
      const p = this.studentProposal;
      this.classroomMode = "try";
      this.controller = "teacher";
      this.tool = "move";
      const result = this._playExploreMove(p.from, p.to);
      this.studentProposal = null;
      this.arrows = this.arrows.filter((a) => !a._proposal);
      this._bump();
      return result.kind === "variation"
        ? { kind: "proposal-accepted", move: result.move, fen: result.fen }
        : result;
    }

    takeControl() {
      if (!this.canTakeControl()) return false;
      this.mode = "control";
      this.controller = "teacher";
      this.tool = "move";
      this.pausedClock = true;
      this.explore = {
        fen: this.baseFen,
        history: this.mainline.slice(),
        cursor: this.mainline.length
      };
      this._rebuildExploreFen();
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

    /** Position affichée (FEN). */
    displayFen(liveChess) {
      if (!this.enabled) return liveChess ? liveChess.fen() : START_FEN;
      if (this.mode === "control" && this.explore) return this.explore.fen;
      return liveChess ? liveChess.fen() : this.baseFen;
    }

    _rebuildExploreFen() {
      if (!this.explore) return;
      const c = this._chess();
      c.load(this.baseFen);
      const upto = this.explore.cursor;
      for (let i = 0; i < upto && i < this.explore.history.length; i++) {
        const m = this.explore.history[i];
        c.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
      }
      this.explore.fen = c.fen();
    }

    resumePlay(liveChess) {
      if (this.myRole !== "teacher" || !liveChess) return null;
      const fen = this.displayFen(liveChess);
      if (!liveChess.load(fen)) return null;
      this.baseFen = fen;
      this.mainline = [];
      this.explore = null;
      this.mode = "play";
      this.controller = "teacher";
      this.tool = "move";
      this.pausedClock = false;
      this.arrows = [];
      this.marks = {};
      this._bump();
      return fen;
    }

    setTool(tool) {
      if (TOOLS.indexOf(tool) < 0) return;
      if (!this.canEdit() && tool !== "move") return;
      this.tool = tool;
      this.arrowFrom = null;
      this._bump();
    }

    setMarkColor(colorId) {
      this.markColor = colorId || "green";
      this._bump(true);
    }

    setArrowStyle(style) {
      this.arrowStyle = style === "force" || style === "weak" ? style : "move";
      this._bump(true);
    }

    setComment(text) {
      if (!this.canEdit()) return;
      this.comment = String(text || "").slice(0, 500);
      this._bump();
    }

    setNag(nag) {
      if (!this.canEdit()) return;
      this.nag = String(nag || "").slice(0, 4);
      this._bump();
    }

    setPhase(phaseId) {
      if (!this.canEdit() && this.myRole !== "teacher") return;
      this.phase = phaseId || null;
      this._bump();
    }

    toggleTheme(themeId) {
      if (!this.canEdit() && this.myRole !== "teacher") return;
      if (!themeId) return;
      const i = this.themes.indexOf(themeId);
      if (i >= 0) this.themes.splice(i, 1);
      else {
        this.themes.push(themeId);
        if (this.themes.length > 12) this.themes.shift();
      }
      // Auto overlay jeu de couleur
      const Themes = global.ChessTeachingThemes;
      const th = Themes && Themes.getTheme(themeId);
      if (th && th.overlay && i < 0) {
        this.colorOverlay = th.overlay;
      }
      this._bump();
    }

    setThemes(ids) {
      if (!this.canEdit() && this.myRole !== "teacher") return;
      this.themes = (ids || []).slice(0, 12);
      this._bump();
    }

    setColorOverlay(mode) {
      if (!this.canEdit() && this.myRole !== "teacher") return;
      this.colorOverlay = mode || null;
      this._bump();
    }

    clearThemes() {
      if (!this.canEdit() && this.myRole !== "teacher") return;
      this.themes = [];
      this.colorOverlay = null;
      this._bump();
    }

    /**
     * Lance un exercice ChessBase Attack / Check / Defence / Color.
     * opts: { type, color?: light|dark }
     */
    startDrill(opts) {
      opts = opts || {};
      if (this.myRole !== "teacher" && !this.canEdit()) return null;
      const type = opts.type || "attack";
      const fen = this.displayFen(null);
      let targets = [];
      const Themes = global.ChessTeachingThemes;
      if (Themes && this.createChess) {
        if (type === "color") {
          const col = opts.color === "dark" ? "dark" : "light";
          targets = Themes.squaresOfColor(col);
          this.colorOverlay = col;
        } else {
          targets = Themes.computeDrillTargets(type, fen, this.createChess);
        }
      }
      this.drill = {
        type: type,
        targets: targets,
        selected: {},
        done: false,
        color: opts.color || null
      };
      this.mode = "control";
      this.controller = "student";
      this.tool = "move";
      this._bump();
      return this.drill;
    }

    stopDrill() {
      this.drill = null;
      if (this.myRole === "teacher") this.controller = "teacher";
      this._bump();
    }

    tryDrillSquare(sq) {
      if (!this.drill || this.drill.done) return { kind: "ignore" };
      if (this.myRole !== "student" && !this.canEdit()) return { kind: "blocked" };
      const isTarget = this.drill.targets.indexOf(sq) >= 0;
      if (this.drill.selected[sq]) {
        delete this.drill.selected[sq];
        this._bump();
        return { kind: "drill-unmark", square: sq };
      }
      this.drill.selected[sq] = true;
      if (!isTarget) {
        this.marks[sq] = { type: "cross", color: "red" };
        this._bump();
        return { kind: "drill-wrong", square: sq };
      }
      this.marks[sq] = { type: "good", color: "green" };
      const allOk = this.drill.targets.every((t) => this.drill.selected[t]);
      if (allOk) {
        this.drill.done = true;
        this._bump();
        return { kind: "drill-done" };
      }
      this._bump();
      return { kind: "drill-mark", square: sq };
    }

    clearMarks() {
      if (!this.canEdit() && this.myRole !== "teacher") return;
      this.marks = {};
      this.arrows = [];
      this.arrowFrom = null;
      this._bump();
    }

    clearArrows() {
      if (!this.canEdit() && this.myRole !== "teacher") return;
      this.arrows = [];
      this.arrowFrom = null;
      this._bump();
    }

    navigate(action) {
      if (!this.canEdit() || !this.explore) return false;
      if (action === "back") {
        if (this.explore.cursor > 0) this.explore.cursor--;
      } else if (action === "fwd") {
        if (this.explore.cursor < this.explore.history.length) this.explore.cursor++;
      } else if (action === "root") {
        this.explore.cursor = 0;
      } else if (action === "end") {
        this.explore.cursor = this.explore.history.length;
      }
      // Couper les variations futures si on rejoue autrement ensuite
      this._rebuildExploreFen();
      this._bump();
      return true;
    }

    setGhostMove(from, to) {
      if (!this.canEdit() && this.myRole !== "teacher") return;
      if (!from) this.ghostMove = null;
      else this.ghostMove = { from: from, to: to };
      this._bump();
    }

    startQuiz(opts) {
      opts = opts || {};
      this.quiz = {
        answers: (opts.answers || []).map((a) => ({
          from: a.from || null,
          to: a.to,
          san: a.san || null
        })),
        goal: opts.goal || "Trouvez le prochain coup",
        hint: opts.hint || "",
        hintShown: false,
        attempts: 0,
        solved: false,
        showAnswer: false,
        maxAttempts: opts.maxAttempts || 5
      };
      this.mode = "control";
      this.controller = "student";
      this.tool = "move";
      this._bump();
      return this.quiz;
    }

    stopQuiz() {
      this.quiz = null;
      if (this.myRole === "teacher") this.controller = "teacher";
      this._bump();
    }

    showHint() {
      if (!this.quiz) return null;
      this.quiz.hintShown = true;
      this._bump();
      return this.quiz.hint || "Cherchez les coups forcés (échec, capture, menace).";
    }

    revealQuizAnswer() {
      if (!this.quiz || this.myRole !== "teacher") return;
      this.quiz.showAnswer = true;
      const a = this.quiz.answers[0];
      if (a) {
        if (a.from && a.to) {
          this.arrows = this.arrows.filter((x) => !(x.from === a.from && x.to === a.to));
          this.arrows.push({ from: a.from, to: a.to, color: "green", style: "force" });
          this.ghostMove = { from: a.from, to: a.to };
        } else if (a.to) {
          this.marks[a.to] = { type: "good", color: "green" };
        }
      }
      this._bump();
    }

    tryQuizAnswer(from, to) {
      if (!this.quiz || this.quiz.solved) return { kind: "ignore" };
      this.quiz.attempts++;
      const ok = this.quiz.answers.some((a) => {
        if (a.from && a.to) return a.from === from && a.to === to;
        if (a.to && !a.from) return a.to === to;
        return false;
      });
      if (ok) {
        this.quiz.solved = true;
        this.marks[to] = { type: "good", color: "green" };
        if (from) {
          this.arrows.push({ from: from, to: to, color: "green", style: "move" });
        }
        this._bump();
        return { kind: "quiz-correct", attempts: this.quiz.attempts };
      }
      this.marks[to] = { type: "cross", color: "red" };
      this._bump();
      return {
        kind: "quiz-wrong",
        attempts: this.quiz.attempts,
        remain: Math.max(0, this.quiz.maxAttempts - this.quiz.attempts)
      };
    }

    setLaser(nx, ny) {
      if (this.myRole !== "teacher" && !this.canEdit()) return;
      this.laserNorm = nx < 0 ? null : { x: nx, y: ny };
      this._bump(true);
    }

    raiseHand(q) {
      if (this.myRole !== "student") return false;
      this.handRaised = true;
      this.studentQuestion = String(q || "").slice(0, 200);
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

    breakAway() {
      if (this.myRole !== "student") return;
      if (this.perms && this.perms.forceSync) return; // Classroom verrouillé
      this.followTeacher = false;
      this.brokenAway = true;
      this._bump(true);
    }

    syncToTeacher() {
      this.followTeacher = true;
      this.brokenAway = false;
      this._bump(true);
    }

    toolFromHotkey(key) {
      return HOTKEYS[String(key)] || null;
    }

    statusBanner() {
      if (!this.enabled) return "";
      if (this.handRaised && this.myRole === "teacher") {
        return "✋ Élève" + (this.studentQuestion ? " : " + this.studentQuestion : " lève la main");
      }
      if (this.drill) {
        if (this.drill.done) return "Drill · RÉUSSI ✓";
        const n = Object.keys(this.drill.selected).length;
        return "Drill · " + this.drill.type + " · " + n + "/" + this.drill.targets.length;
      }
      if (this.quiz) {
        if (this.quiz.solved) return "Quiz · RÉUSSI ✓";
        return "Quiz · " + this.quiz.goal + " · essais " + this.quiz.attempts;
      }
      if (this.studentProposal) {
        return "Proposition élève : " + this.studentProposal.from + "→" + this.studentProposal.to;
      }
      if (this.mode === "play") {
        return "Classroom · partie · " + this.myRole + (this.handRaised ? " · ✋" : "");
      }
      const modeLabels = {
        explain: "📢 Expliquer",
        try: "🎯 Essayer",
        "play-from": "♟️ Jouer",
        propose: "❓ Proposition"
      };
      const cm = modeLabels[this.classroomMode] || this.classroomMode;
      const who = this.controller === "teacher" ? "Prof" : "Élève";
      const Themes = global.ChessTeachingThemes;
      const ph = this.phase && Themes
        ? " · " + ((Themes.getPhase(this.phase) || {}).short || "")
        : "";
      const sync = (this.perms && this.perms.forceSync) ? " · sync🔒" : "";
      return "Classroom · " + cm + " · " + who + sync + ph;
    }

    statusText() {
      if (!this.explore) return "—";
      const i = this.explore.cursor;
      const m = this.explore.history[i - 1];
      const san = m ? m.san : "départ";
      return "#" + i + " " + san + (this.nag ? " " + this.nag : "");
    }

    /**
     * Clic case (algèbre a1–h8).
     * selectedSq = case déjà sélectionnée (outil move / flèche).
     */
    handleSquare(sq, selectedSq, liveChess) {
      if (!this.enabled) return { kind: "ignore" };

      // Drill ChessBase : un clic par case à marquer
      if (this.drill && !this.drill.done) {
        return this.tryDrillSquare(sq);
      }

      if (this.quiz && !this.quiz.solved) {
        if (this.myRole === "student" || this.canEdit()) {
          if (!selectedSq) return { kind: "select", square: sq };
          return this.tryQuizAnswer(selectedSq, sq);
        }
        return { kind: "blocked" };
      }

      // Mode « Proposez un coup » (Classroom / Chessable quiz)
      if (this.classroomMode === "propose" && this.mode === "control") {
        if (this.myRole === "student" || this.controller === "student") {
          if (!this._proposalFrom && !selectedSq) {
            this._proposalFrom = sq;
            this._bump(true);
            return { kind: "propose-from", square: sq };
          }
          const from = selectedSq || this._proposalFrom;
          return this.proposeMove(from, sq);
        }
        return { kind: "blocked" };
      }

      if (this.mode === "play") {
        return { kind: "play-move" };
      }

      // Dessin autorisé pour l'élève si perms.studentDraw
      const drawTools = ["arrow", "circle", "square", "cross", "good", "bad", "hot", "letter", "number", "erase"];
      if (!this.canEdit()) {
        if (this.canDraw() && drawTools.indexOf(this.tool) >= 0) {
          // autoriser la suite du handler pour outils de dessin
        } else {
          return { kind: "blocked" };
        }
      }

      if (this.tool === "arrow") {
        if (!this.canDraw()) return { kind: "blocked" };
        if (!this.arrowFrom) {
          this.arrowFrom = sq;
          this._bump(true);
          return { kind: "arrow-from", square: sq };
        }
        if (this.arrowFrom === sq) {
          this.arrowFrom = null;
          this._bump(true);
          return { kind: "arrow-cancel" };
        }
        this.arrows = this.arrows.filter((a) => !(a.from === this.arrowFrom && a.to === sq));
        this.arrows.push({
          from: this.arrowFrom,
          to: sq,
          color: this.markColor,
          style: this.arrowStyle
        });
        if (this.arrows.length > 40) this.arrows.shift();
        this.arrowFrom = null;
        this._bump();
        return { kind: "arrow" };
      }

      const shapeTools = ["circle", "square", "cross", "good", "bad", "hot"];
      if (shapeTools.indexOf(this.tool) !== -1) {
        const forced =
          this.tool === "good" ? "green" :
          this.tool === "bad" ? "red" :
          this.tool === "hot" ? "orange" :
          this.markColor;
        const same = this.marks[sq] &&
          this.marks[sq].type === this.tool &&
          (this.marks[sq].color || "green") === forced;
        if (same) delete this.marks[sq];
        else this.marks[sq] = { type: this.tool, color: forced };
        this._bump();
        return { kind: "mark" };
      }

      if (this.tool === "letter") {
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const ch = letters[this.letterSeq % 26];
        this.letterSeq++;
        this.marks[sq] = { type: "letter", text: ch, color: this.markColor };
        this._bump();
        return { kind: "mark" };
      }

      if (this.tool === "number") {
        this.numberSeq++;
        this.marks[sq] = { type: "number", text: String(this.numberSeq), color: this.markColor };
        this._bump();
        return { kind: "mark" };
      }

      if (this.tool === "erase") {
        delete this.marks[sq];
        this.arrows = this.arrows.filter((a) => a.from !== sq && a.to !== sq);
        this.arrowFrom = null;
        this._bump();
        return { kind: "mark" };
      }

      // move : variation
      if (this.tool === "move") {
        if (!selectedSq) {
          const fen = this.displayFen(liveChess);
          const c = this._chess();
          c.load(fen);
          const piece = c.get(sq);
          if (!piece) return { kind: "ignore" };
          return { kind: "select", square: sq };
        }
        if (selectedSq === sq) return { kind: "deselect" };
        return this._playExploreMove(selectedSq, sq);
      }

      return { kind: "ignore" };
    }

    _playExploreMove(from, to) {
      if (!this.explore) {
        this.explore = { fen: this.baseFen, history: this.mainline.slice(), cursor: this.mainline.length };
        this._rebuildExploreFen();
      }
      // Truncate after cursor
      this.explore.history = this.explore.history.slice(0, this.explore.cursor);
      const c = this._chess();
      c.load(this.explore.fen);
      const move = c.move({ from: from, to: to, promotion: "q" });
      if (!move) return { kind: "illegal" };
      this.explore.history.push({
        from: move.from,
        to: move.to,
        san: move.san,
        color: move.color,
        promotion: move.promotion
      });
      this.explore.cursor = this.explore.history.length;
      this.explore.fen = c.fen();
      // Essayer 1 coup : rendre le contrôle au prof
      if (
        this.perms.oneMoveThenReturn &&
        this.classroomMode === "try" &&
        this.myRole === "student"
      ) {
        this.controller = "teacher";
        this.classroomMode = "explain";
        this.perms.studentMoves = "none";
        this.tool = "arrow";
      }
      this._bump();
      return { kind: "variation", move: move, fen: c.fen() };
    }

    onLiveMove(move) {
      if (!this.enabled || this.mode !== "play" || !move) return;
      this.mainline.push({
        from: move.from,
        to: move.to,
        san: move.san,
        color: move.color,
        promotion: move.promotion
      });
      this.baseFen = this.createChess
        ? (function (self) {
          try {
            const c = self._chess();
            // rebuild from start of game is hard; trust live fen via caller
            return self.baseFen;
          } catch (_) {
            return self.baseFen;
          }
        })(this)
        : this.baseFen;
      this._bump(true);
    }

    syncMainlineFromLive(liveChess) {
      if (!liveChess || this.mode !== "play") return;
      this.baseFen = liveChess.fen();
      this.mainline = liveChess.history({ verbose: true }).map((m) => ({
        from: m.from,
        to: m.to,
        san: m.san,
        color: m.color,
        promotion: m.promotion
      }));
    }

    exportPgn() {
      const lines = ['[Event "Social Board Lesson"]', '[Site "Discord Classroom"]', ""];
      const hist = (this.explore && this.explore.history && this.explore.history.length)
        ? this.explore.history
        : (this.mainline || []);
      const sans = [];
      for (let i = 0; i < hist.length; i++) {
        const san = hist[i].san || (hist[i].from + hist[i].to);
        if (i % 2 === 0) sans.push(Math.floor(i / 2) + 1 + ". " + san);
        else sans.push(san);
      }
      let body = sans.join(" ");
      if (this.comment) body = "{ " + String(this.comment).replace(/\n/g, " ") + " } " + body;
      if (this.pinnedGoal) body = "{ Goal: " + String(this.pinnedGoal).replace(/\n/g, " ") + " } " + body;
      lines.push(body || "*");
      return lines.join("\n");
    }

    importPgn(pgnText) {
      if (!pgnText || !this.createChess) return false;
      try {
        const c = this._chess();
        if (!c.load_pgn(pgnText)) return false;
        this.baseFen = START_FEN;
        this.mainline = c.history({ verbose: true }).map((m) => ({
          from: m.from,
          to: m.to,
          san: m.san,
          color: m.color,
          promotion: m.promotion
        }));
        this.explore = {
          fen: c.fen(),
          history: this.mainline.slice(),
          cursor: this.mainline.length
        };
        this.mode = "control";
        this.controller = this.myRole === "teacher" ? "teacher" : this.controller;
        this.arrows = [];
        this.marks = {};
        this._bump();
        return true;
      } catch (e) {
        console.warn("importPgn", e);
        return false;
      }
    }

    loadFen(fen) {
      if (!fen || !this.createChess) return false;
      try {
        const c = this._chess();
        if (!c.load(fen)) return false;
        this.baseFen = fen;
        this.mainline = [];
        this.explore = { fen: fen, history: [], cursor: 0 };
        this.mode = "control";
        this.arrows = [];
        this.marks = {};
        this._bump();
        return true;
      } catch (e) {
        return false;
      }
    }

    serialize() {
      return {
        type: "chess-teaching-state",
        version: this.version,
        enabled: this.enabled,
        mode: this.mode,
        controller: this.controller,
        teacherIsWhite: this.teacherIsWhite,
        tool: this.tool,
        markColor: this.markColor,
        arrowStyle: this.arrowStyle,
        arrows: this.arrows,
        marks: this.marks,
        comment: this.comment,
        nag: this.nag,
        baseFen: this.baseFen,
        mainline: this.mainline,
        explore: this.explore,
        ghostMove: this.ghostMove,
        quiz: this.quiz,
        lessonId: this.lessonId,
        laserNorm: this.laserNorm,
        handRaised: this.handRaised,
        studentQuestion: this.studentQuestion,
        letterSeq: this.letterSeq,
        numberSeq: this.numberSeq,
        phase: this.phase,
        themes: this.themes,
        colorOverlay: this.colorOverlay,
        drill: this.drill,
        classroomMode: this.classroomMode,
        perms: this.perms,
        boardFlipped: this.boardFlipped,
        pinnedGoal: this.pinnedGoal,
        studentProposal: this.studentProposal
      };
    }

    applyRemote(snap) {
      if (!snap || snap.type !== "chess-teaching-state") return false;
      this.enabled = !!snap.enabled;
      this.mode = snap.mode === "control" ? "control" : "play";
      this.controller = snap.controller === "student" ? "student" : "teacher";
      this.teacherIsWhite = snap.teacherIsWhite !== false;
      this.tool = snap.tool || "move";
      this.markColor = snap.markColor || "green";
      this.arrowStyle = snap.arrowStyle || "move";
      this.arrows = Array.isArray(snap.arrows) ? snap.arrows : [];
      this.marks = snap.marks || {};
      this.comment = snap.comment || "";
      this.nag = snap.nag || "";
      this.baseFen = snap.baseFen || START_FEN;
      this.mainline = Array.isArray(snap.mainline) ? snap.mainline : [];
      this.explore = snap.explore || null;
      this.ghostMove = snap.ghostMove || null;
      this.quiz = snap.quiz || null;
      this.lessonId = snap.lessonId || null;
      this.laserNorm = snap.laserNorm || null;
      this.handRaised = !!snap.handRaised;
      this.studentQuestion = snap.studentQuestion || "";
      this.letterSeq = snap.letterSeq | 0;
      this.numberSeq = snap.numberSeq | 0;
      this.phase = snap.phase || null;
      this.themes = Array.isArray(snap.themes) ? snap.themes : [];
      this.colorOverlay = snap.colorOverlay || null;
      this.drill = snap.drill || null;
      this.classroomMode = snap.classroomMode || "explain";
      if (snap.perms) this.perms = Object.assign({}, this.perms, snap.perms);
      this.boardFlipped = !!snap.boardFlipped;
      this.pinnedGoal = snap.pinnedGoal || "";
      this.studentProposal = snap.studentProposal || null;
      this.version = snap.version | 0;
      // Sync forcée Classroom : l'élève ne peut pas rester hors sync
      if (this.perms && this.perms.forceSync) {
        this.followTeacher = true;
        this.brokenAway = false;
      }
      if (this.myRole === "student" && this.brokenAway && !this.followTeacher) {
        this._bump(true);
        return true;
      }
      this._bump(true);
      return true;
    }

    _bump(silent) {
      this.version++;
      if (!silent && this.onChange) this.onChange(this);
    }
  }

  ChessTeachingSession.TOOLS = TOOLS;
  ChessTeachingSession.HOTKEYS = HOTKEYS;
  ChessTeachingSession.START_FEN = START_FEN;
  global.ChessTeachingSession = ChessTeachingSession;
})(window);
