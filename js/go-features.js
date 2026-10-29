/**
 * Fonctionnalités Go : setup (nigiri/handicap/ranked/règles),
 * scoring bilatéral, undo pass, SGF, chat partie, observateurs.
 */
(function (global) {
  function deadMapToSparse(deadMap) {
    if (!deadMap) return [];
    const out = [];
    for (let y = 0; y < deadMap.length; y++) {
      for (let x = 0; x < (deadMap[y] || []).length; x++) {
        if (deadMap[y][x]) out.push([x, y]);
      }
    }
    return out;
  }

  function sparseToDeadMap(sparse, size) {
    const dead = [];
    for (let y = 0; y < size; y++) {
      dead[y] = [];
      for (let x = 0; x < size; x++) dead[y][x] = false;
    }
    (sparse || []).forEach((p) => {
      const x = p[0] | 0;
      const y = p[1] | 0;
      if (y >= 0 && y < size && x >= 0 && x < size) dead[y][x] = true;
    });
    return dead;
  }

  function resolveNigiri(hostColor) {
    if (hostColor === "black" || hostColor === "b") return { hostIsBlack: true };
    if (hostColor === "white" || hostColor === "w") return { hostIsBlack: false };
    return { hostIsBlack: Math.random() < 0.5 };
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/x-go-sgf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function appendChat(line) {
    const box = document.getElementById("gameChatLog");
    if (!box) return;
    const div = document.createElement("div");
    div.className = "game-chat-line";
    div.textContent = line;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  /**
   * @param {object} ctx — { state, net, clock, sounds, analysis, setStatus, renderGo, paintGo, updateGoStatus, updateClockDisplay, recordGameResult, mods, getUser }
   */
  function wire(ctx) {
    const state = ctx.state;
    state.matchMeta = state.matchMeta || {
      ranked: true,
      rules: "japanese",
      handicap: 0,
      hostIsBlack: true,
      scoringDone: { me: false, foe: false },
      observe: false
    };

    // --- Contrôles setup ---
    const selHandicap = document.getElementById("goHandicap");
    const selRules = document.getElementById("goRules");
    const chkRanked = document.getElementById("goRanked");
    const selColor = document.getElementById("goColorChoice");
    const btnUndoPass = document.getElementById("btnUndoPass");
    const btnScoreDone = document.getElementById("btnScoreDone");
    const btnSgfExport = document.getElementById("btnSgfExport");
    const btnSgfImport = document.getElementById("btnSgfImport");
    const sgfFile = document.getElementById("sgfFileInput");
    const btnKataGo = document.getElementById("btnKataGo");
    const chatInput = document.getElementById("gameChatInput");
    const chatSend = document.getElementById("gameChatSend");

    function isHost() {
      return ctx.net.role === "host" || !ctx.net.connected();
    }

    function isObserver() {
      return ctx.net.role === "observer" || state.matchMeta.observe;
    }

    function currentDeadMap() {
      if (ctx.mods.go && ctx.mods.go.getManualDead) return ctx.mods.go.getManualDead();
      return state.goAnalysis && state.goAnalysis.deadMap;
    }

    function applySetupLocal(setup) {
      const size = setup.size || 19;
      const g = new window.GoGame(size);
      g.rules = setup.rules || "japanese";
      g.komi = Number.isFinite(Number(setup.komi)) ? Number(setup.komi) : 6.5;
      const h = setup.handicap | 0;
      if (h >= 2) g.placeHandicap(h);
      state.go = g;
      state.goAnalysis = null;
      state.scoringMode = false;
      state.matchMeta.ranked = setup.ranked !== false;
      state.matchMeta.rules = g.rules;
      state.matchMeta.handicap = g.handicap;
      if (setup.hostIsBlack != null) {
        state.matchMeta.hostIsBlack = !!setup.hostIsBlack;
        if (isHost()) state.goColor = setup.hostIsBlack ? 1 : 2;
        else state.goColor = setup.hostIsBlack ? 2 : 1;
      }
      if (ctx.mods.go && ctx.mods.go.exitScoringMode) ctx.mods.go.exitScoringMode();
      if (ctx.mods.go) {
        // force re-render canvas
        if (typeof ctx.renderGo === "function") ctx.renderGo();
      }
      ctx.setStatus(
        "Setup : " + size + "×" + size +
          (g.handicap >= 2 ? " H" + g.handicap : "") +
          " · " + g.rules +
          (state.matchMeta.ranked ? " · classée" : " · libre") +
          " · vous = " + (state.goColor === 1 ? "Noir" : "Blanc"),
        "ok"
      );
    }

    function broadcastSetup() {
      if (!isHost() || !window.MatchProtocol) return;
      const nigiri = selColor && selColor.value === "nigiri";
      const hostColor = selColor ? selColor.value : "nigiri";
      const resolved = resolveNigiri(hostColor === "nigiri" ? "auto" : hostColor);
      const handicap = selHandicap ? parseInt(selHandicap.value, 10) || 0 : 0;
      const rules = selRules ? selRules.value : "japanese";
      const ranked = chkRanked ? !!chkRanked.checked : true;
      const size = document.getElementById("goSize")
        ? parseInt(document.getElementById("goSize").value, 10) || 19
        : 19;
      let komi = document.getElementById("komi")
        ? parseFloat(document.getElementById("komi").value)
        : 6.5;
      if (handicap >= 2 && rules === "japanese") komi = 0.5;
      const payload = MatchProtocol.setupPayload({
        size: size,
        komi: komi,
        handicap: handicap,
        rules: rules,
        ranked: ranked,
        nigiri: nigiri,
        hostColor: resolved.hostIsBlack ? "black" : "white",
        clock: ctx.clock.type !== "none" ? ctx.clock.getSnapshot() : null
      });
      payload.hostIsBlack = resolved.hostIsBlack;
      applySetupLocal(payload);
      if (ctx.net.connected()) ctx.net.send(payload);
    }

    function markWired(node) {
      if (node) {
        try { node.dataset.sbWired = "1"; } catch (_) { /* ignore */ }
      }
    }

    const btnApplySetup = document.getElementById("btnApplyGoSetup");
    if (btnApplySetup) {
      btnApplySetup.addEventListener("click", () => {
        if (isObserver()) return;
        broadcastSetup();
      });
      markWired(btnApplySetup);
    }

    if (btnUndoPass) {
      btnUndoPass.addEventListener("click", () => {
        if (!state.go || isObserver()) return;
        const n = state.go.undoPasses();
        if (!n) {
          ctx.setStatus("Rien à annuler (pas de double-pass)", "err");
          return;
        }
        state.scoringMode = false;
        state.goAnalysis = null;
        state.matchMeta.scoringDone = { me: false, foe: false };
        if (ctx.mods.go && ctx.mods.go.exitScoringMode) ctx.mods.go.exitScoringMode();
        ctx.renderGo();
        ctx.updateGoStatus();
        ctx.setStatus("Undo : retour avant les passes (" + n + ")", "ok");
        if (ctx.net.connected() && MatchProtocol) {
          ctx.net.send(MatchProtocol.undoPassPayload());
          ctx.net.send(MatchProtocol.stateSyncPayload(state.go, ctx.clock));
        }
      });
      markWired(btnUndoPass);
    }

    if (btnScoreDone) {
      btnScoreDone.addEventListener("click", () => {
        if (!state.go || !state.scoringMode) {
          ctx.setStatus("Entrez d'abord en mode Compter", "err");
          return;
        }
        state.matchMeta.scoringDone.me = true;
        const dead = currentDeadMap();
        const analysis = state.go.analyze({ deadMap: dead });
        if (ctx.net.connected() && MatchProtocol) {
          ctx.net.send(MatchProtocol.scoringDonePayload(true, analysis));
        }
        maybeFinalizeScore(analysis);
      });
      markWired(btnScoreDone);
    }

    function maybeFinalizeScore(analysis) {
      const both = state.matchMeta.scoringDone.me && (
        !ctx.net.connected() || state.matchMeta.scoringDone.foe
      );
      if (!both) {
        ctx.setStatus(
          state.matchMeta.scoringDone.me
            ? "En attente de l'accord adversaire (Done)…"
            : "Marquez les morts puis Done",
          "ok"
        );
        return;
      }
      const a = analysis || state.go.analyze({ deadMap: currentDeadMap() });
      const goAnalysis = ctx.analysis.analyzeGo(state.go, { deadMap: a.deadMap });
      state.goAnalysis = goAnalysis.raw;
      if (ctx.showAnalysisPanel) {
        ctx.showAnalysisPanel("Score final (accord)", goAnalysis.details);
      }
      ctx.setStatus(
        "Score accordé — N " + a.jp[1].toFixed(1) + " / B " + a.jp[2].toFixed(1),
        "ok"
      );
      if (state.matchMeta.ranked && ctx.recordGameResult) {
        ctx.recordGameResult(a.winnerJp);
      }
      state.matchMeta.scoringDone = { me: false, foe: false };
    }

    if (btnSgfExport) {
      btnSgfExport.addEventListener("click", () => {
        if (!state.go) return;
        const sgf = state.go.exportSgf({
          pb: "Noir",
          pw: "Blanc",
          dt: new Date().toISOString().slice(0, 10)
        });
        downloadText("partie-" + Date.now() + ".sgf", sgf);
        ctx.setStatus("SGF téléchargé", "ok");
      });
      markWired(btnSgfExport);
    }

    if (btnSgfImport && sgfFile) {
      btnSgfImport.addEventListener("click", () => sgfFile.click());
      markWired(btnSgfImport);
      sgfFile.addEventListener("change", () => {
        const file = sgfFile.files && sgfFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const g = window.GoGame.fromSgf(String(reader.result || ""));
            state.go = g;
            state.goAnalysis = null;
            state.scoringMode = false;
            ctx.renderGo();
            ctx.updateGoStatus();
            ctx.setStatus("SGF importé (" + g.moves.length + " coups)", "ok");
            if (isHost() && ctx.net.connected() && MatchProtocol) {
              ctx.net.send(MatchProtocol.stateSyncPayload(g, ctx.clock));
            }
          } catch (err) {
            ctx.setStatus("Import SGF échoué : " + err.message, "err");
          }
        };
        reader.readAsText(file);
        sgfFile.value = "";
      });
    }

    if (btnKataGo) {
      btnKataGo.addEventListener("click", async () => {
        if (!state.go || !global.KataGoClient) return;
        ctx.setStatus("Analyse…", "");
        const res = await KataGoClient.analyzePosition(state.go, { analysis: ctx.analysis });
        const title = res.local ? "Analyse locale" : "KataGo";
        const body = res.message || (res.data ? JSON.stringify(res.data, null, 2) : "");
        if (ctx.showAnalysisPanel) ctx.showAnalysisPanel(title, body);
        ctx.setStatus(res.ok ? (res.local ? "Heuristique locale + SGF" : "KataGo OK") : (res.message || "Échec"), res.ok ? "ok" : "err");
      });
      markWired(btnKataGo);
    }

    if (chatSend && chatInput) {
      const sendChat = () => {
        const text = chatInput.value.trim();
        if (!text) return;
        const user = ctx.getUser ? ctx.getUser() : { username: "moi" };
        appendChat((user.username || user.name || "moi") + " : " + text);
        chatInput.value = "";
        if (ctx.net.connected() && MatchProtocol) {
          ctx.net.send(MatchProtocol.chatPayload(text, user));
        }
      };
      chatSend.addEventListener("click", sendChat);
      chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendChat();
      });
    }

    // Hook marquage morts → sync
    state._onDeadMarked = function (deadMap) {
      if (!ctx.net.connected() || !MatchProtocol || isObserver()) return;
      const analysis = state.go.analyze({ deadMap: deadMap });
      ctx.net.send({
        type: "scoring-mark",
        dead: deadMapToSparse(deadMap),
        jp: { b: analysis.jp[1], w: analysis.jp[2] }
      });
    };

    function handleNet(data) {
      if (!data || !data.type) return false;

      if (data.type === "game-setup") {
        applySetupLocal({
          size: data.size,
          komi: data.komi,
          handicap: data.handicap,
          rules: data.rules,
          ranked: data.ranked,
          hostIsBlack: data.hostIsBlack != null
            ? data.hostIsBlack
            : (data.hostColor !== "white" && data.hostColor !== "w")
        });
        if (data.clock) MatchProtocol.applyClock(ctx.clock, data.clock);
        return true;
      }

      if (data.type === "state-sync" && data.state && state.go) {
        state.go.loadState(data.state);
        state.goAnalysis = null;
        state.scoringMode = !!data.state.over;
        if (data.clock) MatchProtocol.applyClock(ctx.clock, data.clock);
        ctx.renderGo();
        ctx.updateGoStatus();
        ctx.setStatus("État resynchronisé", "ok");
        return true;
      }

      if (data.type === "clock-sync" && data.clock) {
        MatchProtocol.applyClock(ctx.clock, data.clock);
        if (ctx.updateClockDisplay) ctx.updateClockDisplay();
        return true;
      }

      if (data.type === "scoring-mark" && state.go) {
        const dead = sparseToDeadMap(data.dead, state.go.size);
        if (ctx.mods.go && ctx.mods.go.setManualDead) {
          ctx.mods.go.setManualDead(dead);
        }
        state.scoringMode = true;
        const scored = state.go.analyze({ deadMap: dead });
        state.goAnalysis = scored;
        ctx.paintGo();
        ctx.setStatus(
          "Morts adversaire — N " + scored.jp[1].toFixed(1) + " / B " + scored.jp[2].toFixed(1),
          "ok"
        );
        return true;
      }

      if (data.type === "scoring-done") {
        state.matchMeta.scoringDone.foe = !!data.ready;
        if (data.ready) {
          const analysis = state.go.analyze({ deadMap: currentDeadMap() });
          maybeFinalizeScore(analysis);
        }
        return true;
      }

      if (data.type === "undo-pass" && state.go) {
        state.go.undoPasses();
        state.scoringMode = false;
        state.goAnalysis = null;
        state.matchMeta.scoringDone = { me: false, foe: false };
        if (ctx.mods.go && ctx.mods.go.exitScoringMode) ctx.mods.go.exitScoringMode();
        ctx.renderGo();
        ctx.updateGoStatus();
        ctx.setStatus("Adversaire : undo des passes", "ok");
        return true;
      }

      if (data.type === "game-chat") {
        const name = (data.user && (data.user.name || data.user.username)) || "Adversaire";
        appendChat(name + " : " + data.text);
        return true;
      }

      if (data.type === "request-sync" && isHost() && MatchProtocol) {
        if (data.game === "chess") return false; // géré par app.js (échecs)
        if (state.go) {
          ctx.net.send(MatchProtocol.stateSyncPayload(state.go, ctx.clock));
          return true;
        }
      }

      return false;
    }

    return {
      handleNet: handleNet,
      broadcastSetup: broadcastSetup,
      isObserver: isObserver,
      appendChat: appendChat,
      deadMapToSparse: deadMapToSparse,
      sparseToDeadMap: sparseToDeadMap
    };
  }

  global.GoFeatures = {
    wire: wire,
    resolveNigiri: resolveNigiri,
    downloadText: downloadText,
    deadMapToSparse: deadMapToSparse,
    sparseToDeadMap: sparseToDeadMap
  };
})(window);
