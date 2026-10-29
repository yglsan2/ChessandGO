// Protocole partie : coups, horloge, scoring bilatéral, setup, chat, sync
(function (global) {
  function goPayload(game, x, y, clock) {
    return {
      type: "go",
      x: x,
      y: y,
      moveIndex: game.moves.length,
      hash: game.getBoardHash(),
      turn: game.turn,
      captures: game.captures.slice(),
      clock: clock && clock.getSnapshot ? clock.getSnapshot() : null
    };
  }

  function passPayload(game, clock) {
    return {
      type: "pass",
      moveIndex: game.moves.length,
      hash: game.getBoardHash(),
      over: !!game.over,
      turn: game.turn,
      clock: clock && clock.getSnapshot ? clock.getSnapshot() : null
    };
  }

  function resignPayload(game, clock) {
    return {
      type: "resign",
      color: game.resigned || game.turn,
      hash: game.getBoardHash ? game.getBoardHash() : null,
      clock: clock && clock.getSnapshot ? clock.getSnapshot() : null
    };
  }

  function stateSyncPayload(game, clock, extra) {
    return Object.assign({
      type: "state-sync",
      state: game.serializeState(),
      clock: clock && clock.getSnapshot ? clock.getSnapshot() : null,
      ts: Date.now()
    }, extra || {});
  }

  function scoringMarkPayload(deadMap, analysis) {
    return {
      type: "scoring-mark",
      deadMap: deadMap,
      jp: analysis ? analysis.jp : null,
      hash: analysis ? analysis.hash : null
    };
  }

  function scoringDonePayload(ready, analysis) {
    return {
      type: "scoring-done",
      ready: !!ready,
      jp: analysis ? { b: analysis.jp[1], w: analysis.jp[2], winner: analysis.winnerJp } : null
    };
  }

  function undoPassPayload() {
    return { type: "undo-pass", ts: Date.now() };
  }

  function setupPayload(opts) {
    return {
      type: "game-setup",
      size: opts.size || 19,
      komi: opts.komi,
      handicap: opts.handicap || 0,
      rules: opts.rules || "japanese",
      ranked: opts.ranked !== false,
      nigiri: !!opts.nigiri,
      hostColor: opts.hostColor || "auto", // auto | black | white
      clock: opts.clock || null
    };
  }

  function chatPayload(text, user) {
    return {
      type: "game-chat",
      text: String(text || "").slice(0, 400),
      user: user ? { id: user.id, name: user.username || user.global_name || user.name } : null,
      ts: Date.now()
    };
  }

  function applyClock(clock, snap, opts) {
    if (clock && snap) clock.applySnapshot(snap, opts);
  }

  /** Vérifie qu'un coup Go distant est cohérent avant application. */
  function acceptRemoteGo(game, data) {
    if (!game || !data) return { ok: false, reason: "données manquantes" };
    if (game.over) return { ok: false, reason: "partie terminée" };
    if (typeof data.moveIndex === "number" && data.moveIndex !== game.moves.length + 1) {
      // moveIndex côté émetteur = après le coup → attendu = length+1
      if (data.moveIndex !== game.moves.length + 1) {
        return { ok: false, reason: "index désync", needSync: true };
      }
    }
    const x = data.x | 0;
    const y = data.y | 0;
    if (!game.inBounds(x, y)) return { ok: false, reason: "hors plateau" };
    const illegal = game.whyIllegal(x, y);
    if (illegal) return { ok: false, reason: illegal };
    return { ok: true };
  }

  function inviteAcceptPayload(invitation, user) {
    return {
      type: "invite-accepted",
      invitationId: invitation && invitation.id,
      user: user ? { id: user.id, username: user.username } : null,
      ts: Date.now()
    };
  }

  function clockSyncPayload(clock) {
    return { type: "clock-sync", clock: clock.getSnapshot() };
  }

  function chessStateSyncPayload(chessSnap, clock, extra) {
    return Object.assign({
      type: "state-sync",
      game: "chess",
      chess: chessSnap,
      clock: clock && clock.getSnapshot ? clock.getSnapshot() : null,
      ts: Date.now()
    }, extra || {});
  }

  function chessColorAssignPayload(hostColor, guestColor) {
    return {
      type: "chess-color-assign",
      hostColor: hostColor === "b" ? "b" : "w",
      guestColor: guestColor === "b" ? "b" : "w",
      ts: Date.now()
    };
  }

  global.MatchProtocol = {
    goPayload: goPayload,
    passPayload: passPayload,
    resignPayload: resignPayload,
    stateSyncPayload: stateSyncPayload,
    chessStateSyncPayload: chessStateSyncPayload,
    chessColorAssignPayload: chessColorAssignPayload,
    scoringMarkPayload: scoringMarkPayload,
    scoringDonePayload: scoringDonePayload,
    undoPassPayload: undoPassPayload,
    setupPayload: setupPayload,
    chatPayload: chatPayload,
    applyClock: applyClock,
    acceptRemoteGo: acceptRemoteGo,
    inviteAcceptPayload: inviteAcceptPayload,
    clockSyncPayload: clockSyncPayload
  };
})(window);
