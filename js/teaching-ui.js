/**
 * UI Teaching Go — panneau prof/élève + outils marques.
 */
(function (global) {
  function wireTeaching(ctx) {
    const state = ctx.state;
    let session = null;
    let syncTimer = null;

    function getUser() {
      return ctx.getUser ? ctx.getUser() : { id: "me", username: "moi" };
    }

    function isHost() {
      return !ctx.net || ctx.net.role === "host" || !ctx.net.connected();
    }

    function ensure() {
      if (!session) {
        session = new global.TeachingSession({
          size: state.go ? state.go.size : 19,
          teacherIsWhite: true
        });
        session.onChange = () => {
          refreshUi();
          scheduleSync();
          if (ctx.paintGo) ctx.paintGo();
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
            type: "teaching-hand",
            handRaised: !!session.handRaised,
            studentQuestion: session.studentQuestion || ""
          });
        }
      }, 80);
    }

    function startTeaching() {
      if (!state.go) return;
      const s = ensure();
      const asTeacher = isHost(); // hôte = prof (Blanc)
      s.enable(state.go, asTeacher);
      if (asTeacher) {
        state.goColor = s.teacherIsWhite ? 2 : 1;
        state.matchMeta.ranked = false;
      } else {
        state.goColor = s.teacherIsWhite ? 1 : 2;
      }
      state.teaching = true;
      state._teachingSession = s;
      showPanel(true);
      refreshUi();
      if (ctx.setStatus) {
        ctx.setStatus(
          asTeacher
            ? "Teaching démarré — vous êtes le PROF (Blanc). Take Control pour expliquer."
            : "Teaching — vous êtes l'ÉLÈVE (Noir).",
          "ok"
        );
      }
      if (ctx.net && ctx.net.connected()) {
        ctx.net.send({
          type: "teaching-start",
          teacherIsWhite: s.teacherIsWhite,
          asTeacher: asTeacher
        });
        scheduleSync();
      }
      // Banner Discord
      if (window.DiscordActivity && DiscordActivity.setActivityStatus) {
        DiscordActivity.setActivityStatus(asTeacher ? "Teaching Go (prof)" : "Teaching Go (élève)");
      }
    }

    function stopTeaching() {
      if (session) session.disable();
      state.teaching = false;
      state._teachingSession = null;
      state.reviewActive = false;
      state.reviewGame = null;
      showPanel(false);
      if (ctx.renderGo) ctx.renderGo();
      if (ctx.setStatus) ctx.setStatus("Teaching terminé", "ok");
      if (ctx.net && ctx.net.connected()) {
        ctx.net.send({ type: "teaching-stop" });
      }
    }

    function showPanel(on) {
      const panel = document.getElementById("teachingPanel");
      if (panel) panel.style.display = on ? "block" : "none";
      const banner = document.getElementById("teachingBanner");
      if (banner) {
        banner.style.display = on ? "flex" : "none";
        if (on && session) banner.textContent = session.statusBanner();
      }
    }

    function refreshUi() {
      if (!session || !session.enabled) return;
      const banner = document.getElementById("teachingBanner");
      if (banner) banner.textContent = session.statusBanner();

      const modeEl = document.getElementById("teachingModeLabel");
      if (modeEl) {
        modeEl.textContent = session.mode === "control" ? "CONTRÔLE" : "PARTIE";
      }

      const roleEl = document.getElementById("teachingRoleLabel");
      if (roleEl) {
        const who =
          session.myRole === "teacher" ? "Prof" :
          session.myRole === "student" ? "Élève" : "Obs";
        roleEl.textContent = session.mode === "control"
          ? who + " · " + (session.controller === "teacher" ? "Prof joue" : "Élève joue")
          : who;
      }

      const st = document.getElementById("teachingTreeStatus");
      if (st && session.tree) st.textContent = session.tree.statusText();

      const cmt = document.getElementById("teachingComment");
      if (cmt && session.tree && document.activeElement !== cmt) {
        cmt.value = session.tree.cursor.comment || "";
      }

      // Outils
      document.querySelectorAll("[data-teach-tool]").forEach((btn) => {
        const t = btn.getAttribute("data-teach-tool");
        btn.classList.toggle("on", session.tool === t);
        btn.disabled = session.mode === "play" || !session.canEdit();
      });

      // Couleurs
      document.querySelectorAll("[data-teach-color]").forEach((btn) => {
        btn.classList.toggle("on", session.markColor === btn.getAttribute("data-teach-color"));
        btn.disabled = session.mode === "play" || !session.canEdit();
      });

      // Styles de flèche
      document.querySelectorAll("[data-arrow-style]").forEach((btn) => {
        btn.classList.toggle("on", session.arrowStyle === btn.getAttribute("data-arrow-style"));
        btn.disabled = session.mode === "play" || !session.canEdit();
      });

      const btnTake = document.getElementById("btnTeachTake");
      const btnGive = document.getElementById("btnTeachGive");
      const btnResume = document.getElementById("btnTeachResume");
      const btnBackCtrl = document.getElementById("btnTeachTakeBack");
      if (btnTake) {
        btnTake.style.display = session.myRole === "teacher" && session.mode === "play" ? "" : "none";
      }
      if (btnGive) {
        btnGive.style.display = session.myRole === "teacher" && session.mode === "control" ? "" : "none";
        btnGive.disabled = session.controller === "student";
      }
      if (btnBackCtrl) {
        btnBackCtrl.style.display = session.myRole === "teacher" && session.mode === "control" && session.controller === "student" ? "" : "none";
      }
      if (btnResume) {
        btnResume.style.display = session.myRole === "teacher" && session.mode === "control" ? "" : "none";
      }

      // Navigation
      document.querySelectorAll("[data-teach-nav]").forEach((btn) => {
        btn.disabled = !session.canEdit();
      });

      // Horloge pause
      if (session.pausedClock && ctx.clock && ctx.clock.running) {
        ctx.clock.stop();
      }

      // Affichage goban review
      if (session.mode === "control" && session.tree) {
        state.reviewActive = true;
        state.reviewGame = session.displayGame(state.go);
      } else {
        state.reviewActive = false;
        state.reviewGame = null;
      }
    }

    function onBoardClick(x, y, ev) {
      if (!session || !session.enabled) return false;

      // Shift + outil mort : marquer tout le groupe
      if (
        ev && ev.shiftKey &&
        session.canEdit() &&
        (session.tool === "dead" || session.tool === "cross")
      ) {
        const display = session.displayGame(state.go);
        if (session.markDeadGroup(x, y, display)) {
          if (ctx.setStatus) ctx.setStatus("Groupe marqué mort", "ok");
          if (ctx.paintGo) ctx.paintGo();
          refreshUi();
          scheduleSync();
        }
        return true;
      }

      const display = session.displayGame(state.go);
      const result = session.handleClick(x, y, display);

      if (result.kind === "blocked") {
        if (ctx.sounds) ctx.sounds.refuse();
        if (ctx.setStatus) ctx.setStatus("Pas votre contrôle — attendez le prof", "err");
        return true;
      }
      if (result.kind === "illegal") {
        if (ctx.sounds) ctx.sounds.refuse();
        return true;
      }
      if (result.kind === "play-move") {
        // Laisser le flux normal de jeu, mais vérifier la couleur
        if (!session.canPlayMove(state.go.turn)) {
          if (ctx.sounds) ctx.sounds.refuse();
          if (ctx.setStatus) ctx.setStatus("Ce n'est pas votre trait (teaching)", "err");
          return true;
        }
        return false; // go-module continue
      }
      if (result.kind === "quiz-correct" || result.kind === "conceal-done") {
        if (ctx.sounds) ctx.sounds.win();
        if (ctx.setStatus) ctx.setStatus("✓ Réussi ! (" + result.attempts + " essai(s))", "ok");
        if (ctx.paintGo) ctx.paintGo();
        refreshUi();
        scheduleSync();
        return true;
      }
      if (result.kind === "quiz-step" || result.kind === "conceal-step") {
        if (ctx.sounds) ctx.sounds.place && ctx.sounds.place();
        if (ctx.setStatus) {
          ctx.setStatus("✓ Suite " + result.step + "/" + result.total, "ok");
        }
        state.reviewGame = session.displayGame(state.go);
        if (ctx.paintGo) ctx.paintGo();
        refreshUi();
        scheduleSync();
        return true;
      }
      if (result.kind === "quiz-wrong" || result.kind === "conceal-wrong") {
        if (ctx.sounds) ctx.sounds.refuse();
        if (ctx.setStatus) {
          const remain = result.remain != null ? " — encore " + result.remain + " essai(s)" : "";
          ctx.setStatus("✗ Pas celui-là" + remain, "err");
        }
        if (ctx.paintGo) ctx.paintGo();
        refreshUi();
        scheduleSync();
        return true;
      }
      if (result.kind === "arrow-from") {
        if (ctx.setStatus) ctx.setStatus("Flèche : cliquez la destination", "ok");
        if (ctx.paintGo) ctx.paintGo();
        return true;
      }
      if (result.kind === "arrow-cancel") {
        if (ctx.setStatus) ctx.setStatus("Flèche annulée", "ok");
        if (ctx.paintGo) ctx.paintGo();
        return true;
      }
      if (
        result.kind === "variation" ||
        result.kind === "edit-stone" ||
        result.kind === "mark" ||
        result.kind === "arrow"
      ) {
        state.reviewGame = session.displayGame(state.go);
        state.reviewActive = session.mode === "control";
        if (ctx.paintGo) ctx.paintGo();
        refreshUi();
        return true;
      }
      return true;
    }

    function handleNet(data) {
      if (!data) return false;
      if (data.type === "teaching-start") {
        const s = ensure();
        if (!s.enabled) {
          s.enable(state.go, false);
          s.teacherIsWhite = data.teacherIsWhite !== false;
          state.goColor = s.teacherIsWhite ? 1 : 2;
          state.teaching = true;
          state._teachingSession = s;
          state.matchMeta.ranked = false;
          showPanel(true);
        }
        refreshUi();
        if (ctx.setStatus) ctx.setStatus("Teaching démarré par le prof — vous êtes l'élève", "ok");
        return true;
      }
      if (data.type === "teaching-stop") {
        stopTeaching();
        return true;
      }
      if (data.type === "teaching-state") {
        const s = ensure();
        if (!s.enabled) {
          s.enable(state.go, false);
          state.teaching = true;
          state._teachingSession = s;
          showPanel(true);
        }
        // Ne pas écraser si on est contrôleur
        if (s.canEdit()) return true;
        s.applyRemote(data, state.go);
        state.reviewGame = s.displayGame(state.go);
        state.reviewActive = s.mode === "control";
        refreshUi();
        if (ctx.paintGo) ctx.paintGo();
        return true;
      }
      if (data.type === "teaching-hand") {
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
    const btnStart = document.getElementById("btnTeaching");
    if (btnStart) {
      btnStart.addEventListener("click", () => {
        if (session && session.enabled) stopTeaching();
        else startTeaching();
        btnStart.textContent = (session && session.enabled) ? "Quitter Teaching" : "Teaching";
        btnStart.classList.toggle("on", !!(session && session.enabled));
      });
    }

    document.querySelectorAll("[data-go-classroom]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-go-classroom");
        const s = ensure();
        if (!s.enabled) startTeaching();
        document.querySelectorAll("[data-go-classroom]").forEach((b) => b.classList.toggle("on", b === btn));
        if (mode === "explain") {
          s.takeControl();
          if (ctx.setStatus) ctx.setStatus("📢 Expliquer — Take Control (prof)", "ok");
        } else if (mode === "try") {
          s.takeControl();
          s.giveControlToStudent();
          if (ctx.setStatus) ctx.setStatus("🎯 Essayer — contrôle élève", "ok");
        } else if (mode === "play-from") {
          if (state.go) {
            const rebuilt = s.resumePlay(state.go);
            if (rebuilt && ctx.applyGoFromTeaching) ctx.applyGoFromTeaching(rebuilt);
            else if (rebuilt && state.go.loadSnapshot && rebuilt.getSnapshot) {
              state.go.loadSnapshot(rebuilt.getSnapshot());
            }
          }
          if (ctx.setStatus) ctx.setStatus("⚫ Jouer depuis ici (Resume Play)", "ok");
        }
        refreshUi();
        scheduleSync();
        if (ctx.paintGo) ctx.paintGo();
        if (window.Broadcast) Broadcast.markTeaching("go-classroom", { mode: mode });
      });
    });

    document.getElementById("btnTeachTake")?.addEventListener("click", () => {
      ensure().takeControl();
      if (ctx.clock) ctx.clock.stop();
      refreshUi();
      if (ctx.paintGo) ctx.paintGo();
      if (ctx.setStatus) ctx.setStatus("Take Control — explorez, marquez, expliquez", "ok");
    });

    document.getElementById("btnTeachGive")?.addEventListener("click", () => {
      ensure().giveControlToStudent();
      if (ctx.setStatus) ctx.setStatus("Contrôle donné à l'élève", "ok");
    });

    document.getElementById("btnTeachTakeBack")?.addEventListener("click", () => {
      ensure().takeControlBack();
      if (ctx.setStatus) ctx.setStatus("Contrôle repris", "ok");
    });

    document.getElementById("btnTeachResume")?.addEventListener("click", () => {
      const s = ensure();
      const built = s.resumePlay(state.go);
      if (built) {
        // Remplacer l'état live
        state.go.loadState(built.serializeState());
        state.reviewActive = false;
        state.reviewGame = null;
        if (ctx.renderGo) ctx.renderGo();
        if (ctx.updateGoStatus) ctx.updateGoStatus();
        if (ctx.net && ctx.net.connected() && window.MatchProtocol) {
          ctx.net.send(MatchProtocol.stateSyncPayload(state.go, ctx.clock));
        }
        if (ctx.setStatus) ctx.setStatus("Resume Play — la partie continue depuis cette position", "ok");
      }
      refreshUi();
    });

    document.querySelectorAll("[data-teach-tool]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ensure().setTool(btn.getAttribute("data-teach-tool"));
        refreshUi();
      });
    });

    document.querySelectorAll("[data-teach-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ensure().navigate(btn.getAttribute("data-teach-nav"));
        state.reviewGame = session.displayGame(state.go);
        if (ctx.paintGo) ctx.paintGo();
        refreshUi();
      });
    });

    document.getElementById("btnTeachClearMarks")?.addEventListener("click", () => {
      ensure().clearMarks();
      if (ctx.paintGo) ctx.paintGo();
    });

    document.getElementById("btnTeachClearArrows")?.addEventListener("click", () => {
      ensure().clearArrows();
      if (ctx.paintGo) ctx.paintGo();
      scheduleSync();
    });

    // Palette de couleurs
    (function buildColorBar() {
      const bar = document.getElementById("teachColorBar");
      if (!bar || !global.TeachingMarks) return;
      bar.innerHTML = "";
      TeachingMarks.COLORS.forEach((c) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "teach-color-swatch";
        btn.style.background = c.hex;
        btn.title = c.label;
        btn.setAttribute("data-teach-color", c.id);
        btn.addEventListener("click", () => {
          ensure().setMarkColor(c.id);
          refreshUi();
        });
        bar.appendChild(btn);
      });
    })();

    document.querySelectorAll("[data-arrow-style]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ensure().setArrowStyle(btn.getAttribute("data-arrow-style"));
        refreshUi();
      });
    });

    document.getElementById("teachingComment")?.addEventListener("change", (e) => {
      ensure().setComment(e.target.value);
    });

    document.getElementById("btnTeachExport")?.addEventListener("click", () => {
      const s = ensure();
      if (!s.tree) return;
      const sgf = s.tree.exportSgf({
        size: state.go.size,
        komi: state.go.komi,
        pb: "Élève",
        pw: "Prof"
      });
      if (global.GoFeatures && GoFeatures.downloadText) {
        GoFeatures.downloadText("teaching-" + Date.now() + ".sgf", sgf);
      }
    });

    // --- Leçons / quiz / sync / kifu ---
    const lessonSel = document.getElementById("teachLessonSelect");
    if (lessonSel && global.TeachingLessons) {
      TeachingLessons.list().forEach((l) => {
        const opt = document.createElement("option");
        opt.value = l.id;
        opt.textContent = l.level + " · " + l.title;
        lessonSel.appendChild(opt);
      });
    }

    const planSel = document.getElementById("teachPlanSelect");
    if (planSel && global.TeachingLessons && TeachingLessons.listPlans) {
      TeachingLessons.listPlans().forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.title + " (" + p.count + ")";
        planSel.appendChild(opt);
      });
    }

    function loadLessonObj(lesson) {
      if (!lesson || !state.go) return false;
      const s = ensure();
      if (!s.enabled) startTeaching();
      s.takeControl();
      const g = TeachingLessons.apply(state.go, lesson);
      state.go.loadState(g.serializeState());
      s.size = state.go.size;
      s.tree = new global.ReviewTree(state.go);
      s.tree.teaching = true;
      s.lessonId = lesson.id;
      s.clearMarks();
      if (lesson.comment) s.setComment(lesson.comment);
      state.reviewGame = s.displayGame(state.go);
      state.reviewActive = true;
      const hintBox = document.getElementById("teachHintBox");
      if (hintBox) {
        hintBox.style.display = "none";
        hintBox.textContent = "";
      }
      if (ctx.renderGo) ctx.renderGo();
      if (ctx.setStatus) ctx.setStatus("Leçon : " + lesson.title + " — " + lesson.goal, "ok");
      refreshUi();
      scheduleSync();
      return true;
    }

    document.getElementById("btnTeachLoadLesson")?.addEventListener("click", () => {
      const id = lessonSel ? lessonSel.value : "";
      loadLessonObj(global.TeachingLessons && TeachingLessons.get(id));
    });

    document.getElementById("btnTeachLoadPlan")?.addEventListener("click", () => {
      const id = planSel ? planSel.value : "";
      const plan = global.TeachingLessons && TeachingLessons.getPlan(id);
      if (!plan || !plan.chapters.length) return;
      const s = ensure();
      if (!s.enabled) startTeaching();
      s.setLessonPlan(plan.chapters, 0);
      loadLessonObj(plan.chapters[0]);
      if (ctx.setStatus) ctx.setStatus("Parcours : " + plan.title, "ok");
    });

    document.getElementById("btnTeachNextChapter")?.addEventListener("click", () => {
      const s = ensure();
      const next = s.nextLessonInPlan();
      if (next) loadLessonObj(next);
      else if (ctx.setStatus) ctx.setStatus("Dernier chapitre du parcours", "ok");
    });

    document.getElementById("btnTeachPrevChapter")?.addEventListener("click", () => {
      const s = ensure();
      const prev = s.prevLessonInPlan();
      if (prev) loadLessonObj(prev);
      else if (ctx.setStatus) ctx.setStatus("Premier chapitre", "ok");
    });

    document.getElementById("btnTeachStartQuiz")?.addEventListener("click", () => {
      const s = ensure();
      if (!s.enabled) startTeaching();
      const lesson = s.lessonId && global.TeachingLessons
        ? TeachingLessons.get(s.lessonId)
        : null;
      const answers = (lesson && lesson.answers && lesson.answers.length)
        ? lesson.answers
        : (s.ghostMove ? [{ x: s.ghostMove.x, y: s.ghostMove.y }] : []);
      if (!answers.length) {
        if (ctx.setStatus) {
          ctx.setStatus("Placez d'abord une suggestion (outil Coup + Alt+clic) ou chargez une leçon", "err");
        }
        return;
      }
      s.startQuiz({
        answers: answers,
        sequence: (lesson && lesson.sequence) || [],
        hint: (lesson && lesson.hint) || "",
        goal: (lesson && lesson.goal) || "Trouvez le prochain coup"
      });
      if (ctx.setStatus) ctx.setStatus("Quiz lancé — l'élève cherche le coup", "ok");
      refreshUi();
      scheduleSync();
    });

    document.getElementById("btnTeachHint")?.addEventListener("click", () => {
      const s = ensure();
      const hint = s.showHint();
      const box = document.getElementById("teachHintBox");
      if (box && hint) {
        box.style.display = "block";
        box.textContent = "💡 " + hint;
      }
      if (ctx.setStatus) ctx.setStatus("Indice affiché", "ok");
      refreshUi();
      scheduleSync();
    });

    document.getElementById("btnTeachStopQuiz")?.addEventListener("click", () => {
      ensure().stopQuiz();
      refreshUi();
      scheduleSync();
    });

    document.getElementById("btnTeachReveal")?.addEventListener("click", () => {
      const s = ensure();
      s.revealQuizAnswer();
      if (s.quiz && s.quiz.answers[0]) {
        const a = s.quiz.answers[0];
        s.marks[a.y][a.x] = { type: "star", color: "green" };
        s.ghostMove = { x: a.x, y: a.y, color: 1 };
      }
      if (ctx.paintGo) ctx.paintGo();
      refreshUi();
      scheduleSync();
    });

    document.getElementById("btnTeachConceal")?.addEventListener("click", () => {
      const s = ensure();
      if (!s.enabled) startTeaching();
      s.takeControl();
      // Cache ~40% des derniers coups de la ligne principale
      const depth = s.tree ? Math.max(0, s.tree.depth() - Math.max(3, Math.floor(s.tree.depth() * 0.4))) : 0;
      const c = s.startConceal(depth);
      if (!c) {
        if (ctx.setStatus) ctx.setStatus("Pas assez de coups sur la ligne principale", "err");
        return;
      }
      state.reviewGame = s.displayGame(state.go);
      if (ctx.setStatus) ctx.setStatus("Guess-the-move : trouvez la suite (" + c.remaining.length + " coups)", "ok");
      if (ctx.paintGo) ctx.paintGo();
      refreshUi();
      scheduleSync();
    });

    document.getElementById("btnTeachStopConceal")?.addEventListener("click", () => {
      ensure().stopConceal();
      refreshUi();
      scheduleSync();
    });

    document.querySelectorAll("[data-teach-nag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ensure().setNag(btn.getAttribute("data-teach-nag") || "");
        refreshUi();
        scheduleSync();
      });
    });

    document.getElementById("btnTeachVarLabel")?.addEventListener("click", () => {
      const inp = document.getElementById("teachVarLabel");
      ensure().setVariationLabel(inp ? inp.value : "");
      refreshUi();
      scheduleSync();
    });

    document.getElementById("btnTeachDeleteBranch")?.addEventListener("click", () => {
      if (ensure().deleteCurrentBranch()) {
        state.reviewGame = session.displayGame(state.go);
        if (ctx.paintGo) ctx.paintGo();
        if (ctx.setStatus) ctx.setStatus("Branche supprimée", "ok");
        refreshUi();
        scheduleSync();
      }
    });

    document.getElementById("btnTeachImportSgf")?.addEventListener("click", () => {
      document.getElementById("teachSgfFile")?.click();
    });

    document.getElementById("teachSgfFile")?.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const s = ensure();
        if (!s.enabled) startTeaching();
        if (s.importSgf(String(reader.result || ""), state.go)) {
          state.reviewGame = s.displayGame(state.go);
          state.reviewActive = true;
          if (ctx.renderGo) ctx.renderGo();
          if (ctx.setStatus) ctx.setStatus("SGF importé — mode démo", "ok");
          refreshUi();
          scheduleSync();
        } else if (ctx.setStatus) {
          ctx.setStatus("Import SGF échoué", "err");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    document.getElementById("btnTeachRaiseHand")?.addEventListener("click", () => {
      const q = window.prompt("Question pour le prof (optionnel) :", "") || "";
      ensure().raiseHand(q);
      if (ctx.setStatus) ctx.setStatus("Main levée — le prof est notifié", "ok");
      scheduleSync();
      refreshUi();
    });

    document.getElementById("btnTeachLowerHand")?.addEventListener("click", () => {
      ensure().lowerHand();
      scheduleSync();
      refreshUi();
    });

    // Laser prof : suivi souris sur le goban
    (function bindLaser() {
      const canvas = () => document.querySelector("canvas.go-board");
      let lastSend = 0;
      document.addEventListener("mousemove", (e) => {
        const s = session;
        if (!s || !s.enabled || s.myRole !== "teacher") return;
        const chk = document.getElementById("chkTeachLaser");
        if (!chk || !chk.checked) return;
        const c = canvas();
        if (!c) return;
        const rect = c.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
          return;
        }
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        s.setLaser(nx, ny);
        if (ctx.paintGo) ctx.paintGo();
        const now = Date.now();
        if (now - lastSend > 80) {
          lastSend = now;
          scheduleSync();
        }
      });
    })();

    document.getElementById("btnTeachSync")?.addEventListener("click", () => {
      ensure().syncToTeacher();
      if (ctx.setStatus) ctx.setStatus("Sync — vous suivez à nouveau le prof", "ok");
      // Demander un resync
      if (ctx.net && ctx.net.connected()) ctx.net.send({ type: "request-sync" });
      refreshUi();
    });

    document.getElementById("btnTeachBreak")?.addEventListener("click", () => {
      ensure().breakAway();
      ensure().takeControl && null;
      const s = ensure();
      s.mode = "control";
      s.controller = "student";
      if (ctx.setStatus) ctx.setStatus("Exploration libre — Sync pour revenir", "ok");
      refreshUi();
    });

    document.getElementById("chkTeachNumbers")?.addEventListener("change", (e) => {
      ensure().setShowMoveNumbers(e.target.checked);
      if (ctx.paintGo) ctx.paintGo();
    });

    document.getElementById("chkTeachTerritory")?.addEventListener("change", (e) => {
      ensure().setShowTerritory(e.target.checked);
      if (ctx.paintGo) ctx.paintGo();
    });

    document.getElementById("btnTeachClearDraw")?.addEventListener("click", () => {
      ensure().clearStrokes();
      if (ctx.paintGo) ctx.paintGo();
    });

    // Raccourcis clavier teaching
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
        state.reviewGame = session.displayGame(state.go);
        if (ctx.paintGo) ctx.paintGo();
        refreshUi();
        ev.preventDefault();
      } else if (ev.key === "ArrowRight") {
        session.navigate("fwd");
        state.reviewGame = session.displayGame(state.go);
        if (ctx.paintGo) ctx.paintGo();
        refreshUi();
        ev.preventDefault();
      } else if (ev.key === "Home") {
        session.navigate("root");
        state.reviewGame = session.displayGame(state.go);
        if (ctx.paintGo) ctx.paintGo();
        refreshUi();
      } else if (ev.key === "End") {
        session.navigate("end");
        state.reviewGame = session.displayGame(state.go);
        if (ctx.paintGo) ctx.paintGo();
        refreshUi();
      } else if (ev.key === "t" && !ev.ctrlKey && session.myRole === "teacher" && session.mode === "play") {
        session.takeControl();
        refreshUi();
        if (ctx.paintGo) ctx.paintGo();
      } else if (ev.key === "r" && !ev.ctrlKey && session.myRole === "teacher" && session.mode === "control") {
        document.getElementById("btnTeachResume")?.click();
      }
    });

    // Dessin libre (outil draw) : drag sur le canvas
    function bindDraw() {
      const canvas = document.querySelector("canvas.go-board");
      if (!canvas || canvas._teachDrawBound) return;
      canvas._teachDrawBound = true;
      let drawing = false;
      let pts = [];
      const toNorm = (e) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height
        };
      };
      canvas.addEventListener("mousedown", (e) => {
        if (!session || !session.enabled || session.tool !== "draw" || !session.canEdit()) return;
        drawing = true;
        pts = [toNorm(e)];
        e.preventDefault();
      });
      canvas.addEventListener("mousemove", (e) => {
        if (!drawing) return;
        pts.push(toNorm(e));
        if (ctx.paintGo) ctx.paintGo();
        // preview last stroke
        session._drawPreview = pts;
      });
      canvas.addEventListener("mouseup", () => {
        if (!drawing) return;
        drawing = false;
        session._drawPreview = null;
        session.addStroke(pts);
        pts = [];
        if (ctx.paintGo) ctx.paintGo();
      });
      canvas.addEventListener("mouseleave", () => {
        if (drawing) {
          drawing = false;
          session._drawPreview = null;
          if (pts.length > 1) session.addStroke(pts);
          pts = [];
        }
      });
    }
    setTimeout(bindDraw, 500);
    document.addEventListener("sb-go-rendered", bindDraw);

    // Hook après coup live
    state._onTeachingLiveMove = (move) => {
      if (session && session.enabled) session.onLiveMove(move);
    };

    state._onTeachingClick = function (x, y, ev) {
      const s = ensure();
      if (s.enabled && s.myRole === "teacher" && ev && ev.altKey) {
        s.setGhostMove(x, y, state.go ? state.go.turn : 1);
        if (ctx.setStatus) ctx.setStatus("Suggestion placée (Alt+clic)", "ok");
        if (ctx.paintGo) ctx.paintGo();
        scheduleSync();
        return true;
      }
      return onBoardClick(x, y, ev);
    };

    return {
      start: startTeaching,
      stop: stopTeaching,
      handleNet: handleNet,
      getSession: () => session,
      refreshUi: refreshUi,
      onBoardClick: onBoardClick
    };
  }

  global.TeachingUI = { wire: wireTeaching };
})(window);
