/**
 * UI Teaching Échecs — panneau prof/élève + flèches Lichess-like.
 */
(function (global) {
  function wireChessTeaching(ctx) {
    const state = ctx.state;
    let session = null;
    let syncTimer = null;
    let selectedTeachSq = null;

    function isHost() {
      return !ctx.net || ctx.net.role === "host" || !ctx.net.connected();
    }

    function ensure() {
      if (!session) {
        session = new global.ChessTeachingSession({
          createChess: ctx.createChess,
          teacherIsWhite: true
        });
        session.onChange = () => {
          refreshUi();
          scheduleSync();
          if (ctx.renderChess) ctx.renderChess();
        };
      }
      return session;
    }

    function scheduleSync() {
      if (!ctx.net || !ctx.net.connected() || !session) return;
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        if (session.canEdit() || session.myRole === "teacher") {
          ctx.net.send(session.serialize());
        } else if (session.myRole === "student" && session._handDirty) {
          session._handDirty = false;
          ctx.net.send({
            type: "chess-teaching-hand",
            handRaised: !!session.handRaised,
            studentQuestion: session.studentQuestion || ""
          });
        }
      }, 80);
    }

    function startTeaching() {
      if (!state.chess) return;
      const s = ensure();
      const asTeacher = isHost();
      s.enable(state.chess, asTeacher);
      if (asTeacher) {
        state.color = s.teacherIsWhite ? "w" : "b";
        if (state.matchMeta) state.matchMeta.ranked = false;
      } else {
        state.color = s.teacherIsWhite ? "b" : "w";
      }
      state.chessTeaching = true;
      state._chessTeachingSession = s;
      showPanel(true);
      refreshUi();
      if (ctx.setStatus) {
        ctx.setStatus(
          asTeacher
            ? "Teaching Échecs — vous êtes le PROF (Blancs). Take Control pour expliquer."
            : "Teaching Échecs — vous êtes l'ÉLÈVE (Noirs).",
          "ok"
        );
      }
      if (ctx.net && ctx.net.connected()) {
        ctx.net.send({
          type: "chess-teaching-start",
          teacherIsWhite: s.teacherIsWhite
        });
        scheduleSync();
      }
      if (window.DiscordActivity && DiscordActivity.setActivityStatus) {
        DiscordActivity.setActivityStatus(asTeacher ? "Teaching Chess (prof)" : "Teaching Chess (élève)");
      }
      if (ctx.renderChess) ctx.renderChess();
    }

    function stopTeaching() {
      if (session) session.disable();
      state.chessTeaching = false;
      state._chessTeachingSession = null;
      selectedTeachSq = null;
      showPanel(false);
      if (ctx.renderChess) ctx.renderChess();
      if (ctx.setStatus) ctx.setStatus("Teaching Échecs terminé", "ok");
      if (ctx.net && ctx.net.connected()) {
        ctx.net.send({ type: "chess-teaching-stop" });
      }
    }

    function showPanel(on) {
      const panel = document.getElementById("chessTeachingPanel");
      if (panel) panel.style.display = on ? "block" : "none";
      const banner = document.getElementById("chessTeachingBanner");
      if (banner) {
        banner.style.display = on ? "flex" : "none";
        if (on && session) banner.textContent = session.statusBanner();
      }
    }

    function refreshUi() {
      if (!session || !session.enabled) return;
      const banner = document.getElementById("chessTeachingBanner");
      if (banner) banner.textContent = session.statusBanner();

      const modeEl = document.getElementById("chessTeachModeLabel");
      if (modeEl) {
        modeEl.textContent = session.mode === "control" ? "Mode : CONTRÔLE / DÉMO" : "Mode : PARTIE";
      }
      const roleEl = document.getElementById("chessTeachRoleLabel");
      if (roleEl) {
        roleEl.textContent = "Rôle : " + (
          session.myRole === "teacher" ? "Professeur" :
          session.myRole === "student" ? "Élève" : "Observateur"
        );
      }
      const st = document.getElementById("chessTeachTreeStatus");
      if (st) st.textContent = session.statusText();

      const cmt = document.getElementById("chessTeachingComment");
      if (cmt && document.activeElement !== cmt) cmt.value = session.comment || "";

      document.querySelectorAll("[data-chess-teach-tool]").forEach((btn) => {
        const t = btn.getAttribute("data-chess-teach-tool");
        btn.classList.toggle("on", session.tool === t);
        btn.disabled = session.mode === "play" || !session.canEdit();
      });
      document.querySelectorAll("[data-chess-teach-color]").forEach((btn) => {
        btn.classList.toggle("on", session.markColor === btn.getAttribute("data-chess-teach-color"));
        btn.disabled = session.mode === "play" || !session.canEdit();
      });
      document.querySelectorAll("[data-chess-arrow-style]").forEach((btn) => {
        btn.classList.toggle("on", session.arrowStyle === btn.getAttribute("data-chess-arrow-style"));
        btn.disabled = session.mode === "play" || !session.canEdit();
      });

      const btnTake = document.getElementById("btnChessTeachTake");
      const btnGive = document.getElementById("btnChessTeachGive");
      const btnBack = document.getElementById("btnChessTeachTakeBack");
      const btnResume = document.getElementById("btnChessTeachResume");
      if (btnTake) btnTake.style.display = session.myRole === "teacher" && session.mode === "play" ? "" : "none";
      if (btnGive) {
        btnGive.style.display = session.myRole === "teacher" && session.mode === "control" ? "" : "none";
        btnGive.disabled = session.controller === "student";
      }
      if (btnBack) {
        btnBack.style.display = session.myRole === "teacher" && session.mode === "control" && session.controller === "student" ? "" : "none";
      }
      if (btnResume) btnResume.style.display = session.myRole === "teacher" && session.mode === "control" ? "" : "none";

      // Classroom Discord presets
      document.querySelectorAll("[data-chess-classroom]").forEach((btn) => {
        const m = btn.getAttribute("data-chess-classroom");
        let on = false;
        if (m === "try-free") {
          on = session.classroomMode === "try" && !session.perms.oneMoveThenReturn;
        } else if (m === "try") {
          on = session.classroomMode === "try" && !!session.perms.oneMoveThenReturn;
        } else {
          on = session.classroomMode === m;
        }
        btn.classList.toggle("on", on);
        btn.disabled = session.myRole !== "teacher";
      });
      const chkSync = document.getElementById("chkChessForceSync");
      const chkEval = document.getElementById("chkChessHideEval");
      const chkDraw = document.getElementById("chkChessStudentDraw");
      const selMoves = document.getElementById("chessStudentMoves");
      if (chkSync && document.activeElement !== chkSync) chkSync.checked = !!session.perms.forceSync;
      if (chkEval && document.activeElement !== chkEval) chkEval.checked = !!session.perms.hideEval;
      if (chkDraw && document.activeElement !== chkDraw) chkDraw.checked = !!session.perms.studentDraw;
      if (selMoves && document.activeElement !== selMoves) selMoves.value = session.perms.studentMoves || "none";
      const btnAccept = document.getElementById("btnChessAcceptProposal");
      if (btnAccept) {
        btnAccept.style.display = session.myRole === "teacher" && session.studentProposal ? "" : "none";
      }
      const goalInp = document.getElementById("chessTeachGoalInput");
      if (goalInp && document.activeElement !== goalInp) goalInp.value = session.pinnedGoal || "";
      const goalPin = document.getElementById("chessTeachPinnedGoal");
      if (goalPin) {
        if (session.pinnedGoal) {
          goalPin.style.display = "block";
          goalPin.textContent = "🎯 " + session.pinnedGoal;
        } else goalPin.style.display = "none";
      }

      document.querySelectorAll("[data-chess-teach-nav]").forEach((btn) => {
        btn.disabled = !session.canEdit();
      });

      // Phases
      document.querySelectorAll("[data-chess-phase]").forEach((btn) => {
        const p = btn.getAttribute("data-chess-phase") || "";
        btn.classList.toggle("on", (session.phase || "") === p);
      });

      // Overlay couleur
      document.querySelectorAll("[data-chess-color-overlay]").forEach((btn) => {
        const m = btn.getAttribute("data-chess-color-overlay") || "";
        btn.classList.toggle("on", (session.colorOverlay || "") === m);
      });

      // Rubriques actives
      document.querySelectorAll("[data-chess-theme]").forEach((btn) => {
        const id = btn.getAttribute("data-chess-theme");
        btn.classList.toggle("on", session.themes.indexOf(id) >= 0);
      });

      const activeBox = document.getElementById("chessTeachActiveThemes");
      if (activeBox && global.ChessTeachingThemes) {
        if (!session.themes.length) {
          activeBox.textContent = "Aucune rubrique sélectionnée";
        } else {
          activeBox.innerHTML = session.themes.map((id) => {
            const th = ChessTeachingThemes.getTheme(id);
            return '<span class="theme-chip">' + (th ? th.label : id) + "</span>";
          }).join(" ");
        }
      }

      if (session.pausedClock && ctx.clock && ctx.clock.running) ctx.clock.stop();
    }

    function applyDisplayPosition() {
      if (!session || !session.enabled || !state.chess) return;
      if (session.mode === "control") {
        const fen = session.displayFen(state.chess);
        try {
          const clone = ctx.createChess();
          if (clone.load(fen)) {
            state._chessTeachDisplayFen = fen;
          }
        } catch (_) {}
      } else {
        state._chessTeachDisplayFen = null;
      }
    }

    function onSquareClick(sq) {
      if (!session || !session.enabled) return false;

      if (session.myRole === "teacher" && arguments[1] && arguments[1].altKey) {
        // Alt+clic : suggestion (ghost) — besoin from/to → 2e clic
        if (!session._ghostFrom) {
          session._ghostFrom = sq;
          if (ctx.setStatus) ctx.setStatus("Suggestion : cliquez la case d'arrivée (Alt)", "ok");
          return true;
        }
        session.setGhostMove(session._ghostFrom, sq);
        session._ghostFrom = null;
        if (ctx.setStatus) ctx.setStatus("Suggestion placée", "ok");
        if (ctx.renderChess) ctx.renderChess();
        scheduleSync();
        return true;
      }

      const result = session.handleSquare(sq, selectedTeachSq, state.chess);

      if (result.kind === "blocked") {
        if (ctx.sounds) ctx.sounds.refuse();
        if (ctx.setStatus) ctx.setStatus("Pas votre contrôle — attendez le prof", "err");
        return true;
      }
      if (result.kind === "play-move") {
        if (!session.canPlayMove(state.chess.turn())) {
          if (ctx.sounds) ctx.sounds.refuse();
          if (ctx.setStatus) ctx.setStatus("Ce n'est pas votre trait (teaching)", "err");
          return true;
        }
        return false;
      }
      if (result.kind === "select") {
        selectedTeachSq = result.square;
        state.selected = result.square;
        if (ctx.renderChess) ctx.renderChess();
        return true;
      }
      if (result.kind === "deselect") {
        selectedTeachSq = null;
        state.selected = null;
        if (ctx.renderChess) ctx.renderChess();
        return true;
      }
      if (result.kind === "illegal") {
        if (ctx.sounds) ctx.sounds.refuse();
        selectedTeachSq = null;
        state.selected = null;
        if (ctx.renderChess) ctx.renderChess();
        return true;
      }
      if (result.kind === "quiz-correct" || result.kind === "drill-done") {
        if (ctx.sounds) ctx.sounds.win();
        if (ctx.setStatus) {
          ctx.setStatus(result.kind === "drill-done" ? "✓ Drill réussi !" : "✓ Bonne réponse !", "ok");
        }
        selectedTeachSq = null;
        applyDisplayPosition();
        if (ctx.renderChess) ctx.renderChess();
        refreshUi();
        scheduleSync();
        return true;
      }
      if (result.kind === "drill-mark" || result.kind === "drill-unmark" || result.kind === "drill-wrong") {
        if (result.kind === "drill-wrong" && ctx.sounds) ctx.sounds.refuse();
        if (ctx.renderChess) ctx.renderChess();
        refreshUi();
        scheduleSync();
        return true;
      }
      if (result.kind === "quiz-wrong") {
        if (ctx.sounds) ctx.sounds.refuse();
        if (ctx.setStatus) ctx.setStatus("✗ Pas celui-là — encore " + result.remain + " essai(s)", "err");
        selectedTeachSq = null;
        if (ctx.renderChess) ctx.renderChess();
        refreshUi();
        scheduleSync();
        return true;
      }
      if (result.kind === "arrow-from" || result.kind === "propose-from") {
        selectedTeachSq = result.square || sq;
        state.selected = selectedTeachSq;
        if (ctx.setStatus) {
          ctx.setStatus(
            result.kind === "propose-from"
              ? "Proposition : cliquez la case d'arrivée"
              : "Flèche : cliquez la destination",
            "ok"
          );
        }
        if (ctx.renderChess) ctx.renderChess();
        return true;
      }
      if (result.kind === "propose") {
        selectedTeachSq = null;
        state.selected = null;
        if (ctx.setStatus) {
          ctx.setStatus(
            session.myRole === "teacher"
              ? "Proposition reçue : " + result.from + "→" + result.to
              : "Proposition envoyée au prof : " + result.from + "→" + result.to,
            "ok"
          );
        }
        if (ctx.renderChess) ctx.renderChess();
        refreshUi();
        scheduleSync();
        return true;
      }
      if (result.kind === "arrow-cancel") {
        if (ctx.renderChess) ctx.renderChess();
        return true;
      }
      if (result.kind === "variation" || result.kind === "mark" || result.kind === "arrow" || result.kind === "proposal-accepted") {
        selectedTeachSq = null;
        state.selected = null;
        applyDisplayPosition();
        if (ctx.renderChess) ctx.renderChess();
        refreshUi();
        scheduleSync();
        return true;
      }
      return true;
    }

    function handleNet(data) {
      if (!data) return false;
      if (data.type === "chess-teaching-start") {
        const s = ensure();
        if (!s.enabled) {
          s.enable(state.chess, false);
          s.teacherIsWhite = data.teacherIsWhite !== false;
          state.color = s.teacherIsWhite ? "b" : "w";
          state.chessTeaching = true;
          state._chessTeachingSession = s;
          if (state.matchMeta) state.matchMeta.ranked = false;
          showPanel(true);
        }
        refreshUi();
        if (ctx.setStatus) ctx.setStatus("Teaching Échecs démarré — vous êtes l'élève", "ok");
        return true;
      }
      if (data.type === "chess-teaching-stop") {
        stopTeaching();
        return true;
      }
      if (data.type === "chess-teaching-state") {
        const s = ensure();
        if (!s.enabled) {
          s.enable(state.chess, false);
          state.chessTeaching = true;
          state._chessTeachingSession = s;
          showPanel(true);
        }
        if (s.canEdit()) return true;
        s.applyRemote(data);
        applyDisplayPosition();
        refreshUi();
        if (ctx.renderChess) ctx.renderChess();
        return true;
      }
      if (data.type === "chess-teaching-hand") {
        const s = ensure();
        if (s.myRole === "teacher") {
          s.handRaised = !!data.handRaised;
          s.studentQuestion = data.studentQuestion || "";
          refreshUi();
          if (ctx.setStatus && s.handRaised) {
            ctx.setStatus("✋ Élève : " + (s.studentQuestion || "demande la parole"), "ok");
          }
        }
        return true;
      }
      return false;
    }

    // --- Boutons ---
    document.getElementById("btnChessTeaching")?.addEventListener("click", () => {
      if (session && session.enabled) stopTeaching();
      else startTeaching();
      const btn = document.getElementById("btnChessTeaching");
      if (btn) {
        btn.textContent = (session && session.enabled) ? "Quitter Teaching" : "Teaching";
        btn.classList.toggle("on", !!(session && session.enabled));
      }
    });

    document.getElementById("btnChessTeachTake")?.addEventListener("click", () => {
      const s = ensure();
      s.takeControl();
      s.setClassroomMode("explain");
      if (ctx.clock) ctx.clock.stop();
      applyDisplayPosition();
      refreshUi();
      if (ctx.renderChess) ctx.renderChess();
      if (ctx.setStatus) ctx.setStatus("📢 Mode Expliquer — sync forcée, flèches pour Discord", "ok");
      scheduleSync();
    });

    document.querySelectorAll("[data-chess-classroom]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = ensure();
        if (!s.enabled) startTeaching();
        if (s.myRole !== "teacher") return;
        const raw = btn.getAttribute("data-chess-classroom");
        if (raw === "play-from") {
          s.setClassroomMode("play-from");
          const fen = s.resumePlay(state.chess);
          state._chessTeachDisplayFen = null;
          if (fen && ctx.renderChess) ctx.renderChess();
          if (ctx.setStatus) ctx.setStatus("♟️ Jouer depuis ici — partie live depuis la position", "ok");
        } else if (raw === "try-free") {
          s.setClassroomMode("try", { oneMove: false, side: "both" });
          applyDisplayPosition();
          if (ctx.setStatus) ctx.setStatus("🎯 Essayer libre — l'élève explore", "ok");
        } else if (raw === "try") {
          s.setClassroomMode("try", { oneMove: true, side: "both" });
          applyDisplayPosition();
          if (ctx.setStatus) ctx.setStatus("🎯 Essayer 1 coup — puis retour au prof", "ok");
        } else if (raw === "propose") {
          s.setClassroomMode("propose");
          applyDisplayPosition();
          if (ctx.setStatus) ctx.setStatus("❓ L'élève propose un coup (sans bouger les pièces)", "ok");
        } else {
          s.setClassroomMode("explain");
          applyDisplayPosition();
          if (ctx.setStatus) ctx.setStatus("📢 Expliquer — plateau verrouillé pour l'élève", "ok");
        }
        if (ctx.renderChess) ctx.renderChess();
        refreshUi();
        scheduleSync();
      });
    });

    document.getElementById("chkChessForceSync")?.addEventListener("change", (e) => {
      ensure().setPerm("forceSync", e.target.checked);
      scheduleSync();
      refreshUi();
    });
    document.getElementById("chkChessHideEval")?.addEventListener("change", (e) => {
      ensure().setPerm("hideEval", e.target.checked);
      scheduleSync();
    });
    document.getElementById("chkChessStudentDraw")?.addEventListener("change", (e) => {
      ensure().setPerm("studentDraw", e.target.checked);
      scheduleSync();
      refreshUi();
    });
    document.getElementById("chessStudentMoves")?.addEventListener("change", (e) => {
      ensure().setPerm("studentMoves", e.target.value);
      scheduleSync();
      refreshUi();
    });
    document.getElementById("btnChessFlipBoard")?.addEventListener("click", () => {
      ensure().toggleBoardFlip();
      if (ctx.renderChess) ctx.renderChess();
      scheduleSync();
    });
    document.getElementById("btnChessAcceptProposal")?.addEventListener("click", () => {
      const r = ensure().acceptProposal();
      if (r.kind === "proposal-accepted" || r.kind === "variation") {
        applyDisplayPosition();
        if (ctx.setStatus) ctx.setStatus("Proposition jouée sur le plateau", "ok");
      } else if (ctx.setStatus) {
        ctx.setStatus("Impossible d'accepter cette proposition", "err");
      }
      if (ctx.renderChess) ctx.renderChess();
      refreshUi();
      scheduleSync();
    });
    document.getElementById("chessTeachGoalInput")?.addEventListener("change", (e) => {
      ensure().setPinnedGoal(e.target.value);
      if (ctx.renderChess) ctx.renderChess();
      scheduleSync();
      refreshUi();
    });

    document.getElementById("btnChessTeachGive")?.addEventListener("click", () => {
      ensure().giveControlToStudent();
      if (ctx.setStatus) ctx.setStatus("Contrôle donné à l'élève", "ok");
    });

    document.getElementById("btnChessTeachTakeBack")?.addEventListener("click", () => {
      ensure().takeControlBack();
      if (ctx.setStatus) ctx.setStatus("Contrôle repris", "ok");
    });

    document.getElementById("btnChessTeachResume")?.addEventListener("click", () => {
      const fen = ensure().resumePlay(state.chess);
      state._chessTeachDisplayFen = null;
      if (fen && ctx.renderChess) ctx.renderChess();
      if (ctx.setStatus) ctx.setStatus("Resume Play — la partie continue depuis cette position", "ok");
      refreshUi();
      scheduleSync();
    });

    document.querySelectorAll("[data-chess-teach-tool]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ensure().setTool(btn.getAttribute("data-chess-teach-tool"));
        selectedTeachSq = null;
        refreshUi();
      });
    });

    document.querySelectorAll("[data-chess-teach-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ensure().navigate(btn.getAttribute("data-chess-teach-nav"));
        applyDisplayPosition();
        if (ctx.renderChess) ctx.renderChess();
        refreshUi();
      });
    });

    document.getElementById("btnChessTeachClearMarks")?.addEventListener("click", () => {
      ensure().clearMarks();
      if (ctx.renderChess) ctx.renderChess();
    });

    document.getElementById("btnChessTeachClearArrows")?.addEventListener("click", () => {
      ensure().clearArrows();
      if (ctx.renderChess) ctx.renderChess();
      scheduleSync();
    });

    (function buildColorBar() {
      const bar = document.getElementById("chessTeachColorBar");
      if (!bar) return;
      const colors = (global.TeachingMarks && TeachingMarks.COLORS) || [
        { id: "green", hex: "#43a047", label: "Vert" },
        { id: "red", hex: "#e53935", label: "Rouge" },
        { id: "blue", hex: "#1e88e5", label: "Bleu" },
        { id: "yellow", hex: "#fdd835", label: "Jaune" },
        { id: "orange", hex: "#fb8c00", label: "Orange" },
        { id: "purple", hex: "#8e24aa", label: "Violet" }
      ];
      bar.innerHTML = "";
      colors.forEach((c) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "teach-color-swatch";
        b.style.background = c.hex;
        b.title = c.label;
        b.setAttribute("data-chess-teach-color", c.id);
        b.addEventListener("click", () => {
          ensure().setMarkColor(c.id);
          refreshUi();
        });
        bar.appendChild(b);
      });
    })();

    document.querySelectorAll("[data-chess-arrow-style]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ensure().setArrowStyle(btn.getAttribute("data-chess-arrow-style"));
        refreshUi();
      });
    });

    document.getElementById("chessTeachingComment")?.addEventListener("change", (e) => {
      ensure().setComment(e.target.value);
    });

    document.querySelectorAll("[data-chess-teach-nag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ensure().setNag(btn.getAttribute("data-chess-teach-nag") || "");
        refreshUi();
        scheduleSync();
      });
    });

    const lessonSel = document.getElementById("chessTeachLessonSelect");
    const filterPhase = document.getElementById("chessTeachFilterPhase");

    function refillLessons() {
      if (!lessonSel || !global.ChessTeachingLessons) return;
      const phase = filterPhase ? filterPhase.value : "";
      const cur = lessonSel.value;
      lessonSel.innerHTML = '<option value="">— choisir —</option>';
      ChessTeachingLessons.list(phase ? { phase: phase } : {}).forEach((l) => {
        const opt = document.createElement("option");
        opt.value = l.id;
        const ph = l.phase ? "[" + l.phase[0].toUpperCase() + "] " : "";
        opt.textContent = ph + l.level + " · " + l.title;
        lessonSel.appendChild(opt);
      });
      if (cur) lessonSel.value = cur;
    }
    refillLessons();
    filterPhase?.addEventListener("change", refillLessons);

    // Rubriques UI
    let rubricGroup = "structure";
    function renderRubricList() {
      const box = document.getElementById("chessTeachRubricList");
      if (!box || !global.ChessTeachingThemes) return;
      const group = ChessTeachingThemes.GROUPS.find((g) => g.id === rubricGroup);
      if (!group) return;
      box.innerHTML = "";
      group.items.forEach((it) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "rubric-btn";
        b.setAttribute("data-chess-theme", it.id);
        b.title = it.desc || it.label;
        b.textContent = it.label;
        b.addEventListener("click", () => {
          const s = ensure();
          if (!s.enabled) startTeaching();
          if (s.mode !== "control") s.takeControl();
          s.toggleTheme(it.id);
          refreshUi();
          if (ctx.renderChess) ctx.renderChess();
          scheduleSync();
        });
        box.appendChild(b);
      });
      refreshUi();
    }
    renderRubricList();

    document.querySelectorAll("[data-chess-rubric-group]").forEach((btn) => {
      btn.addEventListener("click", () => {
        rubricGroup = btn.getAttribute("data-chess-rubric-group");
        document.querySelectorAll("[data-chess-rubric-group]").forEach((b) => {
          b.classList.toggle("on", b === btn);
        });
        renderRubricList();
      });
    });

    document.querySelectorAll("[data-chess-phase]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = ensure();
        if (!s.enabled) startTeaching();
        if (s.mode !== "control" && s.myRole === "teacher") s.takeControl();
        s.setPhase(btn.getAttribute("data-chess-phase") || null);
        refreshUi();
        scheduleSync();
      });
    });

    document.querySelectorAll("[data-chess-color-overlay]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = ensure();
        if (!s.enabled) startTeaching();
        if (s.mode !== "control" && s.myRole === "teacher") s.takeControl();
        s.setColorOverlay(btn.getAttribute("data-chess-color-overlay") || null);
        refreshUi();
        if (ctx.renderChess) ctx.renderChess();
        scheduleSync();
      });
    });

    document.getElementById("btnChessTeachClearThemes")?.addEventListener("click", () => {
      ensure().clearThemes();
      refreshUi();
      if (ctx.renderChess) ctx.renderChess();
      scheduleSync();
    });

    document.querySelectorAll("[data-chess-drill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const raw = btn.getAttribute("data-chess-drill");
        const s = ensure();
        if (!s.enabled) startTeaching();
        s.takeControl();
        let type = raw;
        let color = null;
        if (raw === "color-light") { type = "color"; color = "light"; }
        if (raw === "color-dark") { type = "color"; color = "dark"; }
        const drill = s.startDrill({ type: type, color: color });
        if (!drill || !drill.targets.length) {
          if (ctx.setStatus) ctx.setStatus("Aucune cible pour ce drill sur cette position", "err");
          return;
        }
        if (ctx.setStatus) {
          ctx.setStatus("Drill : marquez les cases (" + drill.targets.length + ") — l'élève clique", "ok");
        }
        applyDisplayPosition();
        if (ctx.renderChess) ctx.renderChess();
        refreshUi();
        scheduleSync();
      });
    });

    document.getElementById("btnChessTeachStopDrill")?.addEventListener("click", () => {
      ensure().stopDrill();
      refreshUi();
      scheduleSync();
    });

    document.getElementById("btnChessTeachLoadLesson")?.addEventListener("click", () => {
      const id = lessonSel ? lessonSel.value : "";
      const lesson = global.ChessTeachingLessons && ChessTeachingLessons.get(id);
      if (!lesson) return;
      const s = ensure();
      if (!s.enabled) startTeaching();
      s.takeControl();
      s.loadFen(lesson.fen);
      s.lessonId = lesson.id;
      if (lesson.comment) s.setComment(lesson.comment);
      if (lesson.phase) s.setPhase(lesson.phase);
      if (lesson.themes && lesson.themes.length) s.setThemes(lesson.themes.slice());
      if (lesson.colorOverlay) s.setColorOverlay(lesson.colorOverlay);
      applyDisplayPosition();
      if (ctx.renderChess) ctx.renderChess();
      if (ctx.setStatus) {
        const rub = (lesson.themes || []).slice(0, 3).join(", ");
        ctx.setStatus(
          "Leçon : " + lesson.title + (rub ? " · " + rub : "") + " — " + lesson.goal,
          "ok"
        );
      }
      refreshUi();
      scheduleSync();
    });

    document.getElementById("btnChessTeachStartQuiz")?.addEventListener("click", () => {
      const s = ensure();
      if (!s.enabled) startTeaching();
      const lesson = s.lessonId && global.ChessTeachingLessons
        ? ChessTeachingLessons.get(s.lessonId)
        : null;
      const answers = (lesson && lesson.answers && lesson.answers.length)
        ? lesson.answers
        : (s.ghostMove ? [{ from: s.ghostMove.from, to: s.ghostMove.to }] : []);
      if (!answers.length) {
        if (ctx.setStatus) ctx.setStatus("Chargez une leçon ou Alt+clic suggestion (départ puis arrivée)", "err");
        return;
      }
      s.startQuiz({
        answers: answers,
        hint: (lesson && lesson.hint) || "",
        goal: (lesson && lesson.goal) || "Trouvez le prochain coup"
      });
      if (ctx.setStatus) ctx.setStatus("Quiz lancé", "ok");
      refreshUi();
      scheduleSync();
    });

    document.getElementById("btnChessTeachHint")?.addEventListener("click", () => {
      const hint = ensure().showHint();
      const box = document.getElementById("chessTeachHintBox");
      if (box && hint) {
        box.style.display = "block";
        box.textContent = "💡 " + hint;
      }
      scheduleSync();
    });

    document.getElementById("btnChessTeachReveal")?.addEventListener("click", () => {
      ensure().revealQuizAnswer();
      if (ctx.renderChess) ctx.renderChess();
      refreshUi();
      scheduleSync();
    });

    document.getElementById("btnChessTeachStopQuiz")?.addEventListener("click", () => {
      ensure().stopQuiz();
      refreshUi();
      scheduleSync();
    });

    document.getElementById("btnChessTeachImportPgn")?.addEventListener("click", () => {
      document.getElementById("chessTeachPgnFile")?.click();
    });

    document.getElementById("btnChessTeachExportPgn")?.addEventListener("click", () => {
      const s = ensure();
      let pgn = "";
      try {
        if (typeof s.exportPgn === "function") pgn = s.exportPgn();
        else if (state.chess && state.chess.pgn) pgn = state.chess.pgn();
      } catch (_) {
        pgn = state.chess ? state.chess.fen() : "";
      }
      if (s.comment) pgn = '{ ' + String(s.comment).replace(/\n/g, " ") + ' }\n' + pgn;
      const blob = new Blob([pgn || ""], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "lesson-" + Date.now() + ".pgn";
      a.click();
      URL.revokeObjectURL(a.href);
      if (ctx.setStatus) ctx.setStatus("PGN leçon exporté", "ok");
      if (window.Broadcast && Broadcast.timeline.recording) {
        Broadcast.markTeaching("export-pgn", { len: (pgn || "").length });
      }
    });

    document.getElementById("chessTeachPgnFile")?.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const s = ensure();
        if (!s.enabled) startTeaching();
        if (s.importPgn(String(reader.result || ""))) {
          applyDisplayPosition();
          if (ctx.renderChess) ctx.renderChess();
          if (ctx.setStatus) ctx.setStatus("PGN importé — mode démo", "ok");
          refreshUi();
          scheduleSync();
        } else if (ctx.setStatus) ctx.setStatus("Import PGN échoué", "err");
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    document.getElementById("btnChessTeachRaiseHand")?.addEventListener("click", () => {
      const q = window.prompt("Question pour le prof (optionnel) :", "") || "";
      ensure().raiseHand(q);
      scheduleSync();
      refreshUi();
    });

    document.getElementById("btnChessTeachLowerHand")?.addEventListener("click", () => {
      ensure().lowerHand();
      scheduleSync();
      refreshUi();
    });

    document.getElementById("btnChessTeachSync")?.addEventListener("click", () => {
      ensure().syncToTeacher();
      if (ctx.net && ctx.net.connected()) ctx.net.send({ type: "request-sync" });
      if (ctx.setStatus) ctx.setStatus("Sync — vous suivez le prof", "ok");
      refreshUi();
    });

    document.getElementById("btnChessTeachBreak")?.addEventListener("click", () => {
      ensure().breakAway();
      if (ctx.setStatus) ctx.setStatus("Exploration libre — Sync pour revenir", "ok");
      refreshUi();
    });

    // Laser
    document.addEventListener("mousemove", (e) => {
      const s = session;
      if (!s || !s.enabled || s.myRole !== "teacher") return;
      const chk = document.getElementById("chkChessTeachLaser");
      if (!chk || !chk.checked) return;
      const board = document.querySelector(".chess-board");
      if (!board) return;
      const rect = board.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
      s.setLaser((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
      paintOverlaysOnly();
      scheduleSync();
    });

    function paintOverlaysOnly() {
      if (ctx.paintChessTeachingOverlays) ctx.paintChessTeachingOverlays();
    }

    document.addEventListener("keydown", (ev) => {
      if (!session || !session.enabled) return;
      if (ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
      const tool = session.toolFromHotkey(ev.key);
      if (tool && session.canEdit()) {
        session.setTool(tool);
        refreshUi();
        ev.preventDefault();
        return;
      }
      if (ev.key === "ArrowLeft") {
        session.navigate("back");
        applyDisplayPosition();
        if (ctx.renderChess) ctx.renderChess();
        refreshUi();
        ev.preventDefault();
      } else if (ev.key === "ArrowRight") {
        session.navigate("fwd");
        applyDisplayPosition();
        if (ctx.renderChess) ctx.renderChess();
        refreshUi();
        ev.preventDefault();
      } else if (ev.key === "t" && session.myRole === "teacher" && session.mode === "play") {
        session.takeControl();
        applyDisplayPosition();
        refreshUi();
        if (ctx.renderChess) ctx.renderChess();
      } else if (ev.key === "r" && session.myRole === "teacher" && session.mode === "control") {
        document.getElementById("btnChessTeachResume")?.click();
      }
    });

    state._onChessTeachingClick = function (sq, ev) {
      return onSquareClick(sq, ev);
    };

    state._onChessTeachingLiveMove = function (move) {
      if (session && session.enabled) {
        session.syncMainlineFromLive(state.chess);
        session.onLiveMove(move);
      }
    };

    return {
      start: startTeaching,
      stop: stopTeaching,
      handleNet: handleNet,
      getSession: () => session,
      refreshUi: refreshUi,
      onSquareClick: onSquareClick,
      applyDisplayPosition: applyDisplayPosition
    };
  }

  global.ChessTeachingUI = { wire: wireChessTeaching };
})(window);
