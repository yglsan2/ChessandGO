
(async function() {
  // Images SVG des pièces d'échecs
  const PIECES = {
    wp: "wP", wn: "wN", wb: "wB", wr: "wR", wq: "wQ", wk: "wK",
    bp: "bP", bn: "bN", bb: "bB", br: "bR", bq: "bQ", bk: "bK"
  };

  const FILES = "abcdefgh";
  const HILL_SQUARES = ["d4", "d5", "e4", "e5"];
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const PIECE_HINTS = [
    { type: "p", label: "Pion" },
    { type: "n", label: "Cavalier" },
    { type: "b", label: "Fou" },
    { type: "r", label: "Tour" },
    { type: "q", label: "Dame" },
    { type: "k", label: "Roi" }
  ];
  const GO_HINTS = [
    { type: "coin", label: "Coin" },
    { type: "centre", label: "Centre" },
    { type: "bord", label: "Bord" },
    { type: "reponse", label: "Réponse" }
  ];
  
  // Anti-misclick
  const ANTI_SLIP_DELAY = 300; // millisecondes
  let chessLastMouseMove = Date.now();
  
  // État du jeu
  const state = {
    game: "chess",
    chess: null,
    go: null,
    selected: null,
    lastMove: null,
    lastGoMove: null,
    draggedPiece: null,
    pendingPromotion: null,
    pendingGoMove: null, // Pour l'antimisclic Go
    pendingChessMove: null, // Pour l'antimisclic Échecs
    mode: "local",
    color: "w",
    goColor: 1,
    chessVariant: "standard",
    checksGiven: { w: 0, b: 0 },
    variantWinner: null,
    antiMisclickChess: true,
    antiMisclickGo: false,
    goPlaceMode: "direct", // direct | slip | confirm
    renchess: false,
    rengo: false,
    pairSeat: { w: 0, b: 0 },
    pairNames: {
      w: ["Blanc A", "Blanc B"],
      b: ["Noir A", "Noir B"]
    },
    handBrain: false,
    pieceHint: { w: null, b: null },
    goHint: { w: null, b: null },
    analysisMove: null,
    goAnalysis: null,
    scoringMode: false,
    matchMeta: {
      ranked: true,
      rules: "japanese",
      handicap: 0,
      hostIsBlack: true,
      scoringDone: { me: false, foe: false },
      observe: false,
      opponentId: "opponent"
    }
  };

  let goFeaturesApi = null;

  // Objets globaux
  const sounds = new window.BoardSounds();
  const net = new window.Net();
  const platforms = new window.Platforms();
  const analysis = new window.GameAnalysis();
  const clock = new window.GameClock();
  const auth = window.authInstance || new window.AuthSystem();
  window.authInstance = auth;
  const invitationSystem = new window.InvitationSystem(auth, net);
  const rooms = window.RoomService
    ? new window.RoomService()
    : { create: async () => null, resolve: async () => null, ping: async () => false };
  let shortRoomCode = null;
  Object.defineProperty(window, "__sbShortRoomCode", {
    get: () => shortRoomCode,
    configurable: true
  });

  const mods = { chess: null, go: null };
  const api = {};
  let requestedGame = null;
  let remoteProjects = [];

  function renderChess() { if (mods.chess) return mods.chess.renderChess(); }
  function updateChessStatus() { if (mods.chess) return mods.chess.updateChessStatus(); }
  function updateVariantHud() { if (mods.chess) mods.chess.updateVariantHud(); }
  function isChessVariantOver() { return mods.chess ? mods.chess.isChessVariantOver() : false; }
  function applyChessVariantFromNet(data) { if (mods.chess) mods.chess.applyChessVariantFromNet(data); }
  function applyRemoteChessFen(fen, opts) { return mods.chess ? mods.chess.applyRemoteChessFen(fen, opts) : { ok: false }; }
  function applyVariantAfterMove(move) { if (mods.chess) mods.chess.applyVariantAfterMove(move); }
  function applyChecksFromNet(checks) { if (mods.chess) mods.chess.applyChecksFromNet(checks); }
  function startNewChess(opts) { if (mods.chess) mods.chess.startNewChess(opts); }
  function serializeChessState() { return mods.chess ? mods.chess.serializeChessState() : null; }
  function loadChessState(snap) { return mods.chess ? mods.chess.loadChessState(snap) : false; }

  /** Hôte = Blancs par défaut (Discord / online). */
  function assignChessColors(asHost) {
    state.hostColor = "w";
    state.color = asHost ? "w" : "b";
    if (state.chessBoardFlipped == null) {
      state.chessBoardFlipped = state.color === "b";
    }
  }

  function sendChessStateSync() {
    if (!net.connected() || !mods.chess || !window.MatchProtocol) return;
    const hostC = state.hostColor || "w";
    const guestC = hostC === "b" ? "w" : "b";
    // yourColor = couleur du destinataire (l'autre peer)
    const peerColor = net.role === "host" ? guestC : hostC;
    net.send(MatchProtocol.chessStateSyncPayload(serializeChessState(), clock, {
      hostColor: hostC,
      yourColor: peerColor
    }));
  }

  /** Après auth peer : couleurs + sync plateau (hôte) ou demande (invité). */
  function onPeerAuthenticated() {
    configureClockAuthority();
    if (net.role === "observer") {
      document.body.classList.add("spectator-mode");
      setStatus("Mode spectateur — lecture seule", "ok");
      if (state.game === "chess") net.send({ type: "request-sync", game: "chess" });
      else net.send({ type: "request-sync" });
      return;
    }
    if (net.role === "host") {
      assignChessColors(true);
      if (state.game === "go") state.goColor = 1; // hôte = Noir
      if (state.game === "chess" && mods.chess) {
        if (window.MatchProtocol) {
          net.send(MatchProtocol.chessColorAssignPayload("w", "b"));
        }
        sendChessStateSync();
      } else if (state.go && window.MatchProtocol) {
        net.send(MatchProtocol.stateSyncPayload(state.go, clock));
      }
    } else if (state.game === "chess") {
      assignChessColors(false);
      net.send({ type: "request-sync", game: "chess" });
    } else if (state.game === "go") {
      state.goColor = 2; // invité = Blanc
      net.send({ type: "request-sync" });
    }
    if (net.role === "host" && state._teachingSession && state._teachingSession.enabled && net.connected()) {
      net.send({
        type: "teaching-start",
        teacherIsWhite: state._teachingSession.teacherIsWhite,
        asTeacher: true
      });
      net.send(state._teachingSession.serialize());
    }
    if (net.role === "host" && state._chessTeachingSession && state._chessTeachingSession.enabled && net.connected()) {
      net.send({
        type: "chess-teaching-start",
        teacherIsWhite: state._chessTeachingSession.teacherIsWhite
      });
      net.send(state._chessTeachingSession.serialize());
    }
  }

  function wireNetHandlers() {
    net.onStatus = (msg, type) => {
      setStatus(msg, type);
      if (type === "ok" && /authentifié|Connecté|connecté/i.test(String(msg || ""))) {
        onPeerAuthenticated();
      }
    };
    net.onObserver = (info) => {
      const elCount = document.getElementById("spectatorCount");
      if (elCount) elCount.textContent = (info.count || 0) + " 👁️";
    };
    net.onMessage = onNetMessage;
  }
  function pieceHintLabel(type) { return mods.chess ? mods.chess.pieceHintLabel(type) : ""; }
  function choosePieceHint(type) { if (mods.chess) mods.chess.choosePieceHint(type); }
  function uciToSquares(uci) { return mods.chess ? mods.chess.uciToSquares(uci) : null; }
  function pvToSan(fen, uciMoves) { return mods.chess ? mods.chess.pvToSan(fen, uciMoves) : ""; }
  function normalizeFen(fen) {
    return mods.chess ? mods.chess.normalizeFen(fen) : String(fen || "").split(" ").slice(0, 4).join(" ");
  }
  function renderGo() { if (mods.go) return mods.go.renderGo(); }
  function paintGo() { if (mods.go) mods.go.paintGo(); }
  function updateGoStatus() { if (mods.go) mods.go.updateGoStatus(); }
  function updateCaptureCounters() { if (mods.go) mods.go.updateCaptureCounters(); }
  function startNewGo() { if (mods.go) mods.go.startNewGo(); }
  function goToMoveSide() { return mods.go ? mods.go.goToMoveSide() : "b"; }
  function goPlayedSide() { return mods.go ? mods.go.goPlayedSide() : "w"; }
  function goHintLabel(type) { return mods.go ? mods.go.goHintLabel(type) : ""; }
  function chooseGoHint(type) { if (mods.go) mods.go.chooseGoHint(type); }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Script introuvable : " + url));
      document.head.appendChild(script);
    });
  }

  function enabledModules() {
    if (Array.isArray(window.SB_MODULES) && window.SB_MODULES.length) return window.SB_MODULES.slice();
    return ["chess", "go"];
  }

  function wireApi() {
    api.setStatus = setStatus;
    api.resetPairSeats = resetPairSeats;
    api.advancePairSeat = advancePairSeat;
    api.updateClockDisplay = updateClockDisplay;
    api.updatePairsUI = updatePairsUI;
    api.pairName = pairName;
    api.currentPairName = currentPairName;
    api.isHandBrainActive = isHandBrainActive;
    api.isPairsMode = isPairsMode;
    api.showAnalysisPanel = showAnalysisPanel;
    api.recordGameResult = recordGameResult;
    api.refreshRatingBadge = refreshRatingBadge;
  }

  function collectSession() {
    return {
      from: (window.SocialBoard && SocialBoard.projectId) || window.SB_PROJECT || "shell",
      game: state.game,
      pairNames: state.pairNames,
      handBrain: state.handBrain,
      renchess: state.renchess,
      rengo: state.rengo,
      pairSeat: state.pairSeat,
      invite: el.inviteUrl ? el.inviteUrl.value : "",
      clock: {
        type: clock.type,
        mainTime: clock.mainTime.slice(),
        increment: clock.increment,
        byoyomiTime: clock.byoyomiTime,
        byoyomiPeriods: clock.byoyomiPeriods.slice(),
        canadianStones: clock.canadianStones
      }
    };
  }

  function applyHandoff(session) {
    if (!session || typeof session !== "object") return;
    if (session.pairNames && session.pairNames.w && session.pairNames.b) {
      state.pairNames = {
        w: session.pairNames.w.slice(0, 2),
        b: session.pairNames.b.slice(0, 2)
      };
      const ids = ["pairWA", "pairWB", "pairBA", "pairBB"];
      const vals = state.pairNames.w.concat(state.pairNames.b);
      ids.forEach((id, i) => {
        const node = document.getElementById(id);
        if (node && vals[i]) node.value = vals[i];
      });
    }
    if (typeof session.handBrain === "boolean") state.handBrain = session.handBrain;
    if (typeof session.renchess === "boolean") state.renchess = session.renchess;
    if (typeof session.rengo === "boolean") state.rengo = session.rengo;
    const rengoBox = document.getElementById("rengoCheck");
    const renchessBox = document.getElementById("renchessCheck");
    const hbBox = document.getElementById("handBrainCheck");
    if (rengoBox) rengoBox.checked = !!state.rengo;
    if (renchessBox) renchessBox.checked = !!state.renchess;
    if (hbBox) hbBox.checked = !!state.handBrain;
    const from = session.from === "chess" ? "les échecs" : session.from === "go" ? "le go" : "l'autre jeu";
    setStatus("Session partagée depuis " + from + ".", "ok");
    updatePairsUI();
  }

  function updateModuleBadge(enabled) {
    const badge = document.getElementById("moduleBadge");
    if (!badge) return;
    const names = enabled.map((id) => (id === "chess" ? "Échecs" : "Go"));
    const local = names.join(" + ") || "Aucun module";
    badge.textContent = remoteProjects.length ? local + " · relié" : local;
  }

  function hideModuleDock() {
    const dock = document.getElementById("moduleDock");
    if (dock) dock.hidden = true;
    if (el.board) el.board.hidden = false;
  }

  function showModuleDock(game) {
    const dock = document.getElementById("moduleDock");
    if (!dock || !el.board) return;
    const session = collectSession();
    session.target = game;
    try { sessionStorage.setItem("sb-handoff", JSON.stringify(session)); } catch (err) { /* stockage plein */ }
    if (window.SocialBoard) SocialBoard.emit("session:handoff", session, game);
    let frame = document.getElementById("moduleFrame");
    if (!frame) {
      frame = document.createElement("iframe");
      frame.id = "moduleFrame";
      frame.title = game === "go" ? "Projet Go" : "Projet Échecs";
      dock.appendChild(frame);
    }
    const page = game === "go" ? "go/index.html" : "chess/index.html";
    const from = (window.SocialBoard && SocialBoard.projectId) || "shell";
    const next = page + "?embed=1&from=" + encodeURIComponent(from);
    if (frame.dataset.src !== next) {
      frame.dataset.src = next;
      frame.src = next;
    }
    dock.hidden = false;
    el.board.hidden = true;
    if (el.btnChess) el.btnChess.classList.toggle("on", game === "chess");
    if (el.btnGo) el.btnGo.classList.toggle("on", game === "go");
    setStatus(game === "go"
      ? "Le projet Go est emboîté ici. La session (noms, cadence, binôme) est partagée."
      : "Le projet Échecs est emboîté ici. La session (noms, cadence, binôme) est partagée.", "ok");
  }

  function activate(game) {
    const loaded = (game === "chess" && mods.chess) || (game === "go" && mods.go);
    if (loaded) {
      hideModuleDock();
      switchGame(game);
      if (window.SocialBoard) {
        SocialBoard.emit("game:active", collectSession(), game === "chess" ? "go" : "chess");
      }
      return;
    }
    if (document.body.classList.contains("embedded") && window.SocialBoard) {
      SocialBoard.emit("dock:close", { game: game });
      setStatus("Retour vers le projet qui contient celui-ci.", "ok");
      return;
    }
    showModuleDock(game);
  }

  function handleBridgeMessage(msg) {
    if (!msg) return;
    if (msg.type === "presence" && msg.payload) {
      if (window.SocialBoard && msg.from === SocialBoard.projectId) return;
      const id = msg.payload.project;
      if (id && remoteProjects.indexOf(id) === -1) remoteProjects.push(id);
      updateModuleBadge(window.SB_ENABLED || enabledModules());
      return;
    }
    if (msg.type === "dock:close") {
      hideModuleDock();
      const game = msg.payload && msg.payload.game;
      if ((game === "chess" && mods.chess) || (game === "go" && mods.go)) switchGame(game);
      return;
    }
    if (msg.type === "session:handoff" || msg.type === "game:propose") {
      if (window.SocialBoard && msg.from === SocialBoard.projectId) return;
      applyHandoff(msg.payload);
    }
  }

  async function bootModules() {
    wireApi();
    const enabled = enabledModules();
    window.SB_ENABLED = enabled;
    if (enabled.indexOf("go") !== -1) {
      await loadScript(new URL("../go/js/engine.js", import.meta.url).href);
      const goMod = await import("../go/js/go-module.js");
      mods.go = goMod.createGoModule({ state: state, el: el, net: net, sounds: sounds, clock: clock, analysis: analysis, api: api });
      mods.go.init();
      if (window.SocialBoard) SocialBoard.register({ id: "go", label: "Go" });
    }
    if (enabled.indexOf("chess") !== -1) {
      const chessMod = await import("../chess/js/chess-module.js");
      mods.chess = chessMod.createChessModule({ state: state, el: el, net: net, sounds: sounds, clock: clock, analysis: analysis, api: api });
      mods.chess.init();
      analysis.initStockfish();
      if (window.SocialBoard) SocialBoard.register({ id: "chess", label: "Échecs" });
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("embed") === "1") document.body.classList.add("embedded");
    if (params.get("embed") === "1") {
      try {
        const raw = sessionStorage.getItem("sb-handoff");
        if (raw) applyHandoff(JSON.parse(raw));
      } catch (err) { /* session illisible */ }
    }
    if (window.SocialBoard) {
      SocialBoard.projectId = window.SB_PROJECT || (enabled.length > 1 ? "shell" : enabled[0] || "shell");
      SocialBoard.on(handleBridgeMessage);
      SocialBoard.emit("presence", { project: SocialBoard.projectId, games: enabled });
    }
    updateModuleBadge(enabled);
    const want = requestedGame || params.get("g");
    if (want === "go") activate("go");
    else if (want === "chess") activate("chess");
    else if (mods.chess) switchGame("chess");
    else if (mods.go) switchGame("go");

    if (mods.go && window.GoFeatures) {
      goFeaturesApi = GoFeatures.wire({
        state: state,
        net: net,
        clock: clock,
        sounds: sounds,
        analysis: analysis,
        mods: mods,
        setStatus: setStatus,
        renderGo: renderGo,
        paintGo: paintGo,
        updateGoStatus: updateGoStatus,
        updateClockDisplay: updateClockDisplay,
        recordGameResult: recordGameResult,
        showAnalysisPanel: showAnalysisPanel,
        getUser: () => {
          if (window.DiscordActivity && DiscordActivity.user) return DiscordActivity.user;
          if (auth && auth.currentUser) return auth.currentUser;
          return { id: currentUserId(), username: currentUserId() };
        }
      });
    }

    // Review post-partie
    let reviewApi = null;
    if (mods.go && window.ReviewUI) {
      reviewApi = ReviewUI.wire({
        state: state,
        setStatus: setStatus,
        renderGo: renderGo,
        paintReview: () => paintGo()
      });
      state._onReviewClick = (x, y) => reviewApi && reviewApi.onBoardClick(x, y);
    }

    // Teaching (Take Control / marques / Resume)
    let teachingApi = null;
    if (mods.go && window.TeachingUI) {
      teachingApi = TeachingUI.wire({
        state: state,
        net: net,
        clock: clock,
        sounds: sounds,
        setStatus: setStatus,
        renderGo: renderGo,
        paintGo: paintGo,
        updateGoStatus: updateGoStatus,
        getUser: () => {
          if (window.DiscordActivity && DiscordActivity.user) return DiscordActivity.user;
          if (auth && auth.currentUser) return auth.currentUser;
          return { id: currentUserId(), username: currentUserId() };
        }
      });
      window.__sbTeaching = teachingApi;
    }

    // Teaching Échecs (Lichess-like arrows / Take Control)
    let chessTeachingApi = null;
    if (mods.chess && window.ChessTeachingUI) {
      chessTeachingApi = ChessTeachingUI.wire({
        state: state,
        net: net,
        clock: clock,
        sounds: sounds,
        setStatus: setStatus,
        renderChess: renderChess,
        paintChessTeachingOverlays: () => {
          if (mods.chess && mods.chess.paintChessTeachingOverlays) {
            mods.chess.paintChessTeachingOverlays();
          }
        },
        createChess: () => {
          const C = mods.chess.Chess;
          return new C();
        }
      });
      window.__sbChessTeaching = chessTeachingApi;
    }

    // Rengo 4 joueurs réseau
    let rengoRoom = null;
    if (mods.go && window.RengoNet) {
      rengoRoom = RengoNet.createRengoRoom({ net: net, setStatus: setStatus });
      rengoRoom.wireUi(() => {
        if (window.DiscordActivity && DiscordActivity.user) return DiscordActivity.user;
        if (auth && auth.currentUser) return auth.currentUser;
        return { id: currentUserId(), username: currentUserId() };
      });
      state._rengoCanPlay = (turn, pairSeat) => {
        if (!state.rengo || !rengoRoom.state.enabled) return true;
        return rengoRoom.canPlay(turn, pairSeat);
      };
      const rengoCheckEl = document.getElementById("rengoCheck");
      if (rengoCheckEl) {
        rengoCheckEl.addEventListener("change", () => {
          rengoRoom.enable(!!rengoCheckEl.checked && !!state.rengo);
        });
      }
      window.__sbRengoRoom = rengoRoom;
    }

    // Automatch
    if (mods.go && window.AutomatchClient) {
      const am = new AutomatchClient();
      window.__sbAutomatch = am;
      const btnAm = document.getElementById("btnAutomatch");
      if (btnAm) {
        btnAm.addEventListener("click", async () => {
          if (am.ticket) {
            await am.cancel();
            setStatus("Automatch annulé", "ok");
            btnAm.textContent = "Automatch";
            return;
          }
          am.onStatus = setStatus;
          am.onMatch = async (match) => {
            btnAm.textContent = "Automatch";
            setStatus("Match trouvé ! Salle " + match.room, "ok");
            state.matchMeta.ranked = !!match.ranked;
            state.matchMeta.opponentId = (match.host && match.guest)
              ? (match.host.userId === currentUserId() ? match.guest.userId : match.host.userId)
              : "opponent";
            const youHost = match.host && match.host.userId === currentUserId();
            // Fallback : ticket info
            const asHost = youHost || (window.__sbLastAmHost === true);
            state.mode = "online";
            net.onMessage = onNetMessage;
            activate("go");
            if (asHost) {
              pendingDiscordRoom = { code: match.room, game: match.game || "go" };
              net.init({ asHost: true });
              // forcer token de la salle automatch
              net.roomToken = match.token;
            } else {
              net.roomToken = match.token;
              // Attendre que l'hôte publie peerId
              setStatus("Connexion à l'adversaire…", "ok");
              const tryJoin = async () => {
                for (let i = 0; i < 20; i++) {
                  const info = await rooms.resolve(match.room);
                  if (info && info.peerId && String(info.peerId).indexOf("pending_") !== 0) {
                    net.join(info.peerId, match.token || info.token);
                    return;
                  }
                  await new Promise((r) => setTimeout(r, 500));
                }
                setStatus("Hôte automatch introuvable", "err");
              };
              tryJoin();
            }
          };
          try {
            btnAm.textContent = "Annuler file…";
            const profile = window.RatingSystem
              ? RatingSystem.getProfile(currentUserId())
              : { goElo: 1000 };
            const res = await am.enqueue({
              userId: currentUserId(),
              name: currentUserId(),
              game: "go",
              size: state.go ? state.go.size : 19,
              ranked: !(state.matchMeta && state.matchMeta.ranked === false),
              elo: profile.goElo
            });
            window.__sbLastAmHost = !!res.youAreHost;
            if (res.match) am.onMatch(res.match);
          } catch (err) {
            btnAm.textContent = "Automatch";
            setStatus("Automatch : " + (err.message || err), "err");
          }
        });
      }
    }

    if (params.get("observe") === "1") state.matchMeta.observe = true;
    const chatBox = document.getElementById("gameChat");
    if (chatBox && mods.go) chatBox.style.display = "";
  }

  
  // Éléments DOM
  const el = {
    board: document.getElementById("board"),
    status: document.getElementById("status"),
    btnChess: document.getElementById("btnChess"),
    btnGo: document.getElementById("btnGo"),
    btnNew: document.getElementById("btnNew"),
    btnPass: document.getElementById("btnPass"),
    btnResign: document.getElementById("btnResign"),
    btnScore: document.getElementById("btnScore"),
    btnAnalyze: document.getElementById("btnAnalyze"),
    btnHost: document.getElementById("btnHost"),
    btnCopy: document.getElementById("btnCopy"),
    inviteUrl: document.getElementById("inviteUrl"),
    soundOn: document.getElementById("soundOn"),
    goControls: document.getElementById("goControls"),
    goSize: document.getElementById("goSize"),
    komi: document.getElementById("komi"),
    captureCounters: document.getElementById("captureCounters"),
    promotionModal: document.getElementById("promotionModal"),
    showCoords: document.getElementById("showCoords"),
    antiMisclickChess: document.getElementById("antiMisclickChess"),
    antiMisclickChessCheck: document.getElementById("antiMisclickChessCheck"),
    antiMisclickGo: document.getElementById("antiMisclickGo"),
    antiMisclickGoCheck: document.getElementById("antiMisclickGoCheck"),
    btnClock: document.getElementById("btnClock"),
    clockDisplay: document.getElementById("clockDisplay"),
    clockWhite: document.getElementById("clockWhite"),
    clockBlack: document.getElementById("clockBlack"),
    clockModal: document.getElementById("clockModal"),
    clockType: document.getElementById("clockType"),
    btnClockOk: document.getElementById("btnClockOk"),
    btnClockCancel: document.getElementById("btnClockCancel")
  };

  function currentUserId() {
    if (window.DiscordActivity && DiscordActivity.user && DiscordActivity.user.id) {
      return String(DiscordActivity.user.id);
    }
    if (auth && auth.currentUser && auth.currentUser.id) return String(auth.currentUser.id);
    if (auth && auth.currentUser && auth.currentUser.username) return String(auth.currentUser.username);
    return "guest";
  }

  function refreshRatingBadge() {
    const badge = document.getElementById("userRating");
    if (!badge || !window.RatingSystem) return;
    const info = RatingSystem.displayFor(currentUserId(), state.game === "chess" ? "chess" : "go");
    badge.textContent = state.game === "chess"
      ? "Elo " + info.label
      : info.label + " (" + Math.round(info.elo) + ")";
    badge.title = state.game === "go"
      ? "Classement Go (échelle kyu/dan, Elo interne EGF)"
      : "Classement échecs Elo";
  }

  function recordGameResult(winnerColor) {
    // winnerColor: 1/'b' Noir, 2/'w' Blanc, 0/null nulle
    if (!window.RatingSystem) return;
    if (state.game === "go" && state.matchMeta && state.matchMeta.ranked === false) {
      setStatus("Partie libre — classement non modifié", "ok");
      return;
    }
    const playerColor = state.game === "go"
      ? (state.goColor === 1 ? "b" : "w")
      : (state.color === "b" ? "b" : "w");
    let result = 0.5;
    const w = winnerColor === 1 || winnerColor === "b" ? "b"
      : (winnerColor === 2 || winnerColor === "w" ? "w" : null);
    if (w) result = w === playerColor ? 1 : 0;
    const out = RatingSystem.recordResult({
      game: state.game === "chess" ? "chess" : "go",
      playerId: currentUserId(),
      opponentId: (state.matchMeta && state.matchMeta.opponentId) || "opponent",
      result: result,
      playerColor: playerColor,
      boardSize: state.go ? state.go.size : 19,
      handicap: (state.go && state.go.handicap) || (state.matchMeta && state.matchMeta.handicap) || 0,
      ranked: !(state.matchMeta && state.matchMeta.ranked === false)
    });
    refreshRatingBadge();
    if (out && out.ranked) {
      setStatus(
        "Classement " + out.playerRank +
          (out.delta ? " (" + (out.delta > 0 ? "+" : "") + out.delta + ")" : ""),
        "ok"
      );
    }
  }

  // Configuration des sons
  const soundToggles = [
    el.soundOn,
    document.getElementById("soundOnPlay")
  ].filter(Boolean);
  const soundVols = [
    document.getElementById("soundVolume"),
    document.getElementById("soundVolumePlay")
  ].filter(Boolean);

  function syncSoundToggles(on) {
    soundToggles.forEach((box) => { box.checked = on; });
  }
  function syncSoundVolumes(v) {
    soundVols.forEach((r) => { r.value = String(v); });
  }

  soundToggles.forEach((box) => {
    box.addEventListener("change", (e) => {
      const on = !!e.target.checked;
      sounds.setEnabled(on);
      syncSoundToggles(on);
      if (on) {
        if (state.game === "chess" && sounds.piece) sounds.piece();
        else if (sounds.stone) sounds.stone();
        else sounds.move();
      }
    });
  });
  soundVols.forEach((r) => {
    sounds.setVolume(parseFloat(r.value) || 0.62);
    r.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value) || 0.62;
      sounds.setVolume(v);
      syncSoundVolumes(v);
      if (sounds.enabled) sounds.select();
    });
  });
  sounds.init();

  (function initSoundStyle() {
    const labels = {
      varied: "Timbre Nuances — pierres vivantes",
      fixed: "Timbre Franc — même clic + misclic"
    };
    function applyStyle(v, announce) {
      const style = v === "fixed" ? "fixed" : "varied";
      sounds.setStyle(style);
      try { localStorage.setItem("sb-sound-style", style); } catch (_) { /* ignore */ }
      document.querySelectorAll("[data-sound-style]").forEach((btn) => {
        btn.classList.toggle("on", btn.getAttribute("data-sound-style") === style);
      });
      if (announce) {
        setStatus(labels[style], "ok");
        if (sounds.enabled) {
          if (style === "fixed") sounds.stone();
          else { sounds.stone(); setTimeout(() => sounds.stone(), 120); }
        }
      }
    }
    let saved = null;
    try { saved = localStorage.getItem("sb-sound-style"); } catch (_) { /* ignore */ }
    applyStyle(saved === "fixed" ? "fixed" : "varied", false);
    document.querySelectorAll("[data-sound-style]").forEach((btn) => {
      btn.addEventListener("click", () => applyStyle(btn.getAttribute("data-sound-style"), true));
    });
  })();

  // Autoplay : débloquer l’audio au premier geste
  const unlockAudio = () => { sounds.unlock(); };
  document.addEventListener("pointerdown", unlockAudio, { passive: true });
  document.addEventListener("keydown", unlockAudio, { passive: true });
  refreshRatingBadge();
  if (window.RatingSystem && RatingSystem.pullFromServer) {
    RatingSystem.pullFromServer(currentUserId()).then(() => refreshRatingBadge());
  }

  // Initialiser les plateformes (après config distante si dispo)
  if (window.CONFIG && window.CONFIG.ready) {
    try { await window.CONFIG.ready; } catch (_) { /* offline */ }
  }
  platforms.init();
  
  // Afficher le status de la plateforme (debug)
  setTimeout(() => {
    const status = platforms.getStatus();
    console.log('📊 Status de la plateforme:', status);
    
    if (status.errors.length > 0) {
      console.warn('⚠️ Erreurs détectées:', status.errors);
    }
    
    // Afficher dans le status
    if (status.platform !== 'web') {
      setStatus(`📱 Plateforme: ${status.label}`, 'ok');
    }
  }, 1000);
  
  // Configurer les callbacks de l'horloge
  clock.onUpdate = updateClockDisplay;
  clock.onTimeOut = (player) => {
    sounds.refuse();
    const playerName = player === 0 ? "Blanc" : "Noir";
    setStatus(`⏰ Temps écoulé ! ${playerName} perd au temps`, "err");
    clock.stop();
  };

  // ========== ÉCHECS ==========
  


  // Changer la taille du plateau
  if (el.goSize) {
    el.goSize.addEventListener("change", () => {
      if (confirm("Commencer une nouvelle partie avec cette taille ?")) {
        startNewGo();
      }
    });
  }
  
  // Afficher/masquer les coordonnées
  if (el.showCoords) {
    el.showCoords.addEventListener("change", () => {
      if (state.game === "go") {
        paintGo();
      }
    });
  }
  
  // Activer/désactiver anti-misclick échecs
  if (el.antiMisclickChessCheck) {
    el.antiMisclickChessCheck.addEventListener("change", (e) => {
      state.antiMisclickChess = e.target.checked;
      setStatus(e.target.checked ? "✓ Anti-misclick échecs activé" : "⚠️ Anti-misclick échecs désactivé", e.target.checked ? "ok" : "err");
    });
  }

  if (el.antiMisclickGoCheck) {
    el.antiMisclickGoCheck.addEventListener("change", (e) => {
      // Legacy : anti-misclic = anti-glisse (1 clic), PAS le double-clic
      const mode = e.target.checked ? "slip" : "direct";
      state.goPlaceMode = mode;
      state.antiMisclickGo = e.target.checked;
      const sel = document.getElementById("goPlaceMode");
      if (sel) sel.value = mode;
      document.querySelectorAll("[data-place-mode]").forEach((btn) => {
        btn.classList.toggle("on", btn.getAttribute("data-place-mode") === mode);
      });
      try { localStorage.setItem("sb-go-place-mode", mode); } catch (_) { /* ignore */ }
      setStatus(e.target.checked ? "Pose : 1 clic + anti-glisse" : "Pose : 1 clic", "ok");
    });
  }

  (function initGoPlaceMode() {
    const labels = {
      direct: "Pose : 1 clic",
      slip: "Pose : 1 clic + anti-glisse (refus si glissement)",
      confirm: "Pose : double confirmation"
    };
    function applyPlaceMode(v, announce) {
      const mode = v === "slip" || v === "kgs" || v === "confirm"
        ? (v === "kgs" ? "slip" : v)
        : "direct";
      state.goPlaceMode = mode;
      state.antiMisclickGo = mode === "slip";
      try { localStorage.setItem("sb-go-place-mode", mode); } catch (_) { /* ignore */ }
      const sel = document.getElementById("goPlaceMode");
      if (sel) sel.value = mode;
      if (el.antiMisclickGoCheck) el.antiMisclickGoCheck.checked = state.antiMisclickGo;
      document.querySelectorAll("[data-place-mode]").forEach((btn) => {
        btn.classList.toggle("on", btn.getAttribute("data-place-mode") === mode);
      });
      if (announce) setStatus(labels[mode] || labels.direct, "ok");
    }
    let saved = null;
    try { saved = localStorage.getItem("sb-go-place-mode"); } catch (_) { /* ignore */ }
    applyPlaceMode(
      saved === "direct" || saved === "slip" || saved === "kgs" || saved === "confirm" ? saved : "direct",
      false
    );
    const sel = document.getElementById("goPlaceMode");
    if (sel) {
      sel.addEventListener("change", () => applyPlaceMode(sel.value, true));
    }
    document.querySelectorAll("[data-place-mode]").forEach((btn) => {
      btn.addEventListener("click", () => applyPlaceMode(btn.getAttribute("data-place-mode"), true));
    });
  })();

  const renchessCheck = document.getElementById("renchessCheck");
  const rengoCheck = document.getElementById("rengoCheck");
  if (renchessCheck) {
    renchessCheck.addEventListener("change", (e) => {
      state.renchess = e.target.checked;
      if (!state.renchess) {
        state.handBrain = false;
        const hb = document.getElementById("handBrainCheck");
        if (hb) hb.checked = false;
        state.pieceHint = { w: null, b: null };
      }
      resetPairSeats();
      updateChessStatus();
      setStatus(e.target.checked ? "👥 Renchess activé (2 vs 2, alternance obligatoire)" : "Renchess désactivé", "ok");
    });
  }
  const handBrainCheck = document.getElementById("handBrainCheck");
  if (handBrainCheck) {
    handBrainCheck.addEventListener("change", (e) => {
      const pairsOn = state.game === "go" ? state.rengo : state.renchess;
      if (!pairsOn) {
        e.target.checked = false;
        setStatus(state.game === "go" ? "Activez d'abord le Rengo" : "Activez d'abord le Renchess", "err");
        return;
      }
      state.handBrain = e.target.checked;
      state.pieceHint = { w: null, b: null };
      state.goHint = { w: null, b: null };
      resetPairSeats();
      if (state.game === "chess") {
        updateChessStatus();
        renderChess();
        setStatus(e.target.checked
          ? "🧠 Mode main-tête : la Tête choisit une pièce, la Main joue"
          : "Mode main-tête désactivé", "ok");
      } else {
        updateGoStatus();
        renderGo();
        setStatus(e.target.checked
          ? "🧠 Main-tête Go : la Tête nomme Coin, Centre, Bord ou Réponse. La Main peut suivre ou non."
          : "Mode main-tête désactivé", "ok");
      }
    });
  }
  if (rengoCheck) {
    rengoCheck.addEventListener("change", (e) => {
      state.rengo = e.target.checked;
      if (window.__sbRengoRoom) window.__sbRengoRoom.enable(!!state.rengo);
      if (!state.rengo) {
        state.handBrain = false;
        const hb = document.getElementById("handBrainCheck");
        if (hb) hb.checked = false;
        state.goHint = { w: null, b: null };
      }
      const handBrainWrap = document.getElementById("handBrainWrap");
      if (handBrainWrap) {
        handBrainWrap.style.display = isHandBrainToggleVisible() ? "" : "none";
      }
      resetPairSeats();
      updateGoStatus();
      setStatus(e.target.checked ? "👥 Rengo activé — choisissez un siège (4 joueurs)" : "Rengo désactivé", "ok");
    });
  }
  ["pairWA", "pairWB", "pairBA", "pairBB"].forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.addEventListener("input", updatePairsUI);
  });

  const chessVariantSel = document.getElementById("chessVariant");
  if (chessVariantSel) {
    chessVariantSel.addEventListener("change", () => {
      const next = chessVariantSel.value;
      if (next === state.chessVariant) return;
      if ((state.chess && state.chess.history().length > 0) || state.variantWinner) {
        if (!confirm("Changer de variante relance une nouvelle partie. Continuer ?")) {
          chessVariantSel.value = state.chessVariant;
          return;
        }
      }
      state.chessVariant = next;
      startNewChess();
    });
  }

  // ========== CONTRÔLES ==========

  /** Bind sûr : ne plante pas si l'élément est absent. */
  function onEl(id, event, handler) {
    const node = typeof id === "string" ? document.getElementById(id) : id;
    if (!node) return false;
    node.addEventListener(event, handler);
    try { node.dataset.sbWired = "1"; } catch (_) { /* ignore */ }
    return true;
  }

  function switchGame(game) {
    state.game = game;
    state.selected = null;
    
    if (el.btnChess) el.btnChess.classList.toggle("on", game === "chess");
    if (el.btnGo) el.btnGo.classList.toggle("on", game === "go");
    if (el.btnPass) el.btnPass.style.display = game === "go" ? "" : "none";
    if (el.goControls) el.goControls.style.display = game === "go" ? "flex" : "none";
    if (el.captureCounters) el.captureCounters.style.display = game === "go" ? "flex" : "none";
    if (el.btnScore) el.btnScore.style.display = game === "go" ? "" : "none";
    const goBoardActions = document.getElementById("goBoardActions");
    if (goBoardActions) goBoardActions.style.display = game === "go" ? "flex" : "none";
    if (el.btnAnalyze && goBoardActions) {
      /* Analyser reste visible aussi aux échecs (Stockfish) — hors barre Go */
    }
    
    // Afficher/masquer les contrôles anti-misclick selon le jeu
    if (el.antiMisclickChess) el.antiMisclickChess.style.display = game === "chess" ? "" : "none";
    if (el.antiMisclickGo) el.antiMisclickGo.style.display = game === "go" ? "" : "none";
    const chessVariantSel = document.getElementById("chessVariant");
    if (chessVariantSel && !document.body.classList.contains("app-shell")) {
      chessVariantSel.style.display = game === "chess" ? "" : "none";
    }
    const renchessWrap = document.getElementById("renchessWrap");
    if (renchessWrap && game === "chess") renchessWrap.style.display = "";
    ["btnChessDraw", "btnChessRematch", "btnChessExportPgn", "btnChessTeaching"].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn && game === "chess") btn.style.display = "";
    });
    const handBrainWrap = document.getElementById("handBrainWrap");
    if (handBrainWrap) {
      handBrainWrap.style.display = isHandBrainToggleVisible() ? "" : "none";
    }
    const identity = document.querySelector(".game-identity h1");
    if (identity && identity.getAttribute("data-locked") !== "1") {
      identity.textContent = game === "go" ? "Go" : "Échecs";
    }
    updatePairsUI();
    render();
    updateVariantHud();
    refreshRatingBadge();
  }

  function isPairsMode() {
    return (state.game === "chess" && state.renchess) || (state.game === "go" && state.rengo);
  }

  function isHandBrainToggleVisible() {
    return (state.game === "chess" && state.renchess) || (state.game === "go" && state.rengo);
  }

  function isHandBrainActive() {
    return state.handBrain && isHandBrainToggleVisible();
  }


  function resetPairSeats() {
    state.pairSeat = { w: 0, b: 0 };
    updatePairsUI();
  }

  function currentPairName(side) {
    const seat = state.pairSeat[side] || 0;
    const name = state.pairNames[side] && state.pairNames[side][seat];
    return name || (side === "w" ? "Joueur clair" : "Joueur sombre");
  }

  function advancePairSeat(side) {
    if (!isPairsMode()) return;
    if (state.handBrain) return;
    if (side !== "w" && side !== "b") return;
    state.pairSeat[side] = state.pairSeat[side] === 0 ? 1 : 0;
    updatePairsUI();
  }

  function pairName(side, seat) {
    readPairNamesFromInputs();
    return (state.pairNames[side] && state.pairNames[side][seat]) || (seat === 0 ? "Tête" : "Main");
  }


  function readPairNamesFromInputs() {
    const SM = window.SecurityManager;
    const clean = (id, fallback) => {
      const node = document.getElementById(id);
      const raw = node ? node.value : fallback;
      return SM ? SM.sanitizeInput(String(raw || fallback).trim(), 20) || fallback : String(raw || fallback).slice(0, 20);
    };
    state.pairNames.w = [clean("pairWA", "Blanc A"), clean("pairWB", "Blanc B")];
    state.pairNames.b = [clean("pairBA", "Noir A"), clean("pairBB", "Noir B")];
  }

  function updatePairsUI() {
    const panel = document.getElementById("pairsPanel");
    const now = document.getElementById("pairsNow");
    const title = document.getElementById("pairsTitle");
    const active = isPairsMode();
    if (panel) panel.style.display = active ? "flex" : "none";
    if (!active) return;
    readPairNamesFromInputs();
    if (title) {
      title.textContent = state.game === "go"
        ? (state.handBrain ? "Rengo — Main-tête" : "Rengo — 2 vs 2")
        : (state.handBrain ? "Renchess — Main-tête" : "Renchess — 2 vs 2");
    }
    const hint = document.getElementById("pairsHint");
    if (hint) {
      hint.textContent = state.game === "go" && state.handBrain
        ? "Main-tête Go : la Tête clique Coin, Centre, Bord ou Réponse. La Main reçoit le mot et peut suivre ou jouer ailleurs."
        : state.handBrain
          ? "Main-tête : la Tête (joueur A) clique le nom d’une pièce, la Main (joueur B) joue. La Main peut suivre ou choisir une autre pièce."
          : "Règle : les deux partenaires d’une couleur jouent à tour de rôle. On ne joue pas deux fois de suite pour son équipe.";
    }
    const toMove = state.game === "chess"
      ? (state.chess ? state.chess.turn() : "w")
      : goToMoveSide();
    document.querySelectorAll(".pairs-seat").forEach((seatEl) => {
      const side = seatEl.dataset.side;
      const seat = Number(seatEl.dataset.seat);
      if (isHandBrainActive()) {
        const currentHint = state.game === "go" ? state.goHint[toMove] : state.pieceHint[toMove];
        const waitingHint = !currentHint;
        const isTete = seat === 0 && side === toMove && waitingHint;
        const isMain = seat === 1 && side === toMove && !waitingHint;
        seatEl.classList.toggle("active", isTete || isMain);
      } else {
        seatEl.classList.toggle("active", side === toMove && state.pairSeat[side] === seat);
      }
    });
    if (now) {
      const color = toMove === "w" ? "Blancs" : "Noirs";
      if (isHandBrainActive()) {
        const suggested = state.game === "go" ? state.goHint[toMove] : state.pieceHint[toMove];
        const label = state.game === "go" ? goHintLabel(suggested) : pieceHintLabel(suggested);
        const waiting = state.game === "go" ? "indiquez une zone pour les " : "indiquez une pièce pour les ";
        now.textContent = suggested
          ? "✋ Main (" + pairName(toMove, 1) + ") : jouez — suggestion « " + label + " »"
          : "🧠 Tête (" + pairName(toMove, 0) + ") : " + waiting + color;
      } else {
        now.textContent = "À jouer : " + currentPairName(toMove) + " (" + color + ")";
      }
    }
    updateHandBrainUI();
  }

  function ensureHandBrainButtons() {
    const wrap = document.getElementById("hbPieceButtons");
    if (!wrap) return;
    const mode = state.game === "go" ? "go" : "chess";
    if (wrap.dataset.mode === mode && wrap.childElementCount) return;
    wrap.dataset.mode = mode;
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    const hints = mode === "go" ? GO_HINTS : PIECE_HINTS;
    hints.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hb-piece-btn";
      btn.dataset.piece = p.type;
      btn.textContent = p.label;
      btn.addEventListener("click", () => {
        if (state.game === "go") chooseGoHint(p.type);
        else choosePieceHint(p.type);
      });
      wrap.appendChild(btn);
    });
  }

  function updateHandBrainUI() {
    const wrap = document.getElementById("handBrainWrap");
    const panel = document.getElementById("handBrainPanel");
    const showToggle = isHandBrainToggleVisible();
    if (wrap) wrap.style.display = showToggle ? "" : "none";
    const showPanel = showToggle && state.handBrain;
    if (panel) panel.style.display = showPanel ? "flex" : "none";
    if (!showPanel) return;
    ensureHandBrainButtons();
    const side = state.game === "go" ? goToMoveSide() : (state.chess ? state.chess.turn() : "w");
    const tete = document.getElementById("hbTeteName");
    const main = document.getElementById("hbMainName");
    if (tete) tete.textContent = pairName(side, 0);
    if (main) main.textContent = pairName(side, 1);
    const caption = document.getElementById("hbTeteCaption");
    if (caption) {
      caption.textContent = state.game === "go"
        ? "Choisissez une zone : Coin, Centre, Bord, ou Réponse."
        : "Choisissez le type de pièce à jouer :";
    }
    const hint = state.game === "go" ? state.goHint[side] : state.pieceHint[side];
    document.querySelectorAll(".hb-piece-btn").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.piece === hint);
    });
    const display = document.getElementById("hbHintDisplay");
    if (display) {
      display.classList.remove("followed", "deviated");
      if (hint) {
        const label = state.game === "go" ? goHintLabel(hint) : pieceHintLabel(hint);
        display.textContent = label + " (choisi par " + pairName(side, 0) + ")";
      } else {
        display.textContent = "En attente du choix de la tête…";
      }
    }
  }

  function render() {
    if (state.game === "chess") {
      renderChess();
    } else {
      renderGo();
    }
  }

  function emitMovePlay(detail) {
    window.dispatchEvent(new CustomEvent("movePlay", { detail: detail || {} }));
    publishGameState(true);
  }
  window.__sbEmitMovePlay = emitMovePlay;

  function setStatus(text, type = "") {
    el.status.textContent = text;
    el.status.className = "status " + type;
  }
  window.__sbSetStatus = setStatus;

  // Événements des boutons
  if (el.btnChess) {
    el.btnChess.addEventListener("click", () => {
      if (mods.chess) activate("chess");
      else location.href = new URL("chess/", document.baseURI || location.href).href;
    });
  }
  if (el.btnGo) {
    el.btnGo.addEventListener("click", () => {
      if (mods.go) activate("go");
      else location.href = new URL("go/", document.baseURI || location.href).href;
    });
  }
  
  el.btnNew.addEventListener("click", () => {
    if (confirm("Commencer une nouvelle partie ?")) {
      // Réinitialiser l'horloge si elle existe
      if (clock.type !== "none") {
        const currentType = clock.type;
        const currentConfig = {
          type: currentType,
          mainTime: [...clock.mainTime],
          increment: clock.increment,
          byoyomiTime: clock.byoyomiTime,
          byoyomiPeriods: [...clock.byoyomiPeriods],
          canadianStones: clock.canadianStones
        };
        
        clock.reset();
        
        // Reconfigurer avec les mêmes paramètres
        if (currentType === "simple") {
          clock.setupSimple(currentConfig.mainTime[0] / 60000);
        } else if (currentType === "fischer") {
          clock.setupFischer(currentConfig.mainTime[0] / 60000, currentConfig.increment / 1000);
        } else if (currentType === "byoyomi") {
          clock.setupByoyomi(
            currentConfig.mainTime[0] / 60000,
            currentConfig.byoyomiTime / 1000,
            currentConfig.byoyomiPeriods[0]
          );
        } else if (currentType === "canadian") {
          clock.setupCanadian(
            currentConfig.mainTime[0] / 60000,
            currentConfig.byoyomiTime / 60000,
            currentConfig.canadianStones
          );
        }
        
        clock.start(0);
        updateClockDisplay();
      }
      
      if (state.game === "chess") {
        startNewChess();
      } else {
        startNewGo();
      }
    }
  });

  function doGoPass() {
    if (!mods.go || !state.go) {
      setStatus("Partie Go non prête", "err");
      return false;
    }
    if (state.game !== "go") switchGame("go");
    if (state.go.over) {
      setStatus("Partie terminée — utilisez Compter ou Nouvelle partie", "err");
      return false;
    }
    if (state.scoringMode) {
      setStatus("Mode comptage actif — passez via Done / Compter", "err");
      return false;
    }
    if (state.matchMeta && state.matchMeta.observe) {
      setStatus("Spectateur : lecture seule", "err");
      return false;
    }

    const passSuccess = state.go.pass();
    if (!passSuccess) {
      setStatus("Impossible de passer", "err");
      return false;
    }

    const playedSide = goPlayedSide();
    state.goAnalysis = null;
    if (state.handBrain) state.goHint[playedSide] = null;
    if (sounds.pass) sounds.pass();
    else if (sounds.stone) sounds.stone();
    else sounds.move();
    advancePairSeat(playedSide);

    if (clock.type !== "none" && clock.isAuthority) {
      clock.switchPlayer();
      updateClockDisplay();
    }

    renderGo();
    updateCaptureCounters();

    if (state.go.over) {
      setStatus("🏁 Double-pass — Compter, marquez les morts, puis Done", "ok");
      if (mods.go.enterScoringMode) mods.go.enterScoringMode();
    } else {
      const next = state.go.turn === 1 ? "Noir" : "Blanc";
      setStatus("Pass (1/2) — trait à " + next + ". Un 2ᵉ pass termine la partie.", "ok");
    }

    if (net.connected()) {
      if (window.MatchProtocol) {
        net.send(MatchProtocol.passPayload(state.go, clock));
      } else {
        net.send({ type: "pass" });
      }
    }
    return true;
  }

  if (el.btnPass) {
    el.btnPass.addEventListener("click", (e) => {
      e.preventDefault();
      doGoPass();
    });
  }

  if (el.btnScore) {
    el.btnScore.addEventListener("click", () => {
      if (!state.go) {
        setStatus("Partie Go non prête", "err");
        return;
      }
      if (!state.go.over && state.go.passCount < 2) {
        setStatus("Passez deux fois (bouton Passer sous le plateau) pour compter.", "err");
        return;
      }
      if (!state.go.over) state.go.over = true;
      try {
        const raw = mods.go && mods.go.enterScoringMode
          ? mods.go.enterScoringMode()
          : state.go.analyze();
        const goAnalysis = analysis.analyzeGo(state.go, { deadMap: raw.deadMap });
        state.goAnalysis = goAnalysis.raw;
        paintGo();
        showAnalysisPanel("Score final — Go", goAnalysis.details);
        setStatus("Mode comptage : cliquez les groupes morts/vivants, puis Done", "ok");
      } catch (err) {
        setStatus("Comptage impossible : " + ((err && err.message) || err), "err");
      }
    });
  }

  el.btnResign.addEventListener("click", () => {
    if (confirm("Abandonner la partie ?")) {
      if (state.game === "chess") {
        if (mods.chess && mods.chess.resignChess) {
          mods.chess.resignChess(state.color || state.chess.turn());
        }
        setStatus("Partie abandonnée", "err");
        if (net.connected()) {
          net.send({
            type: "resign",
            game: "chess",
            color: state.color || "w",
            fen: state.chess ? state.chess.fen() : null
          });
        }
      } else {
        state.go.resign(state.go.turn);
        updateGoStatus();
        if (net.connected()) net.send({ type: "resign" });
      }
    }
  });

  document.getElementById("btnChessDraw")?.addEventListener("click", () => {
    if (state.game !== "chess" || !mods.chess) return;
    mods.chess.offerDraw();
  });

  document.getElementById("btnChessRematch")?.addEventListener("click", () => {
    if (state.game !== "chess") return;
    startNewChess();
    if (net.connected()) {
      net.send({ type: "chess-rematch" });
      sendChessStateSync();
    }
    setStatus("Nouvelle partie (rematch)", "ok");
  });

  document.getElementById("btnChessExportPgn")?.addEventListener("click", () => {
    if (!mods.chess || !mods.chess.exportPgn) return;
    const pgn = mods.chess.exportPgn();
    const blob = new Blob([pgn], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "social-board-" + Date.now() + ".pgn";
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("PGN exporté", "ok");
  });


  function showAnalysisPanel(title, text) {
    const panel = document.getElementById("analysisPanel");
    const titleEl = document.getElementById("analysisTitle");
    const body = document.getElementById("analysisBody");
    if (titleEl) titleEl.textContent = title;
    if (body) body.textContent = text;
    if (panel) panel.style.display = "block";
  }

  function doGoAnalyze() {
    if (!state.go) {
      setStatus("Partie Go non prête", "err");
      return;
    }
    if (state.game !== "go") switchGame("go");
    try {
      setStatus("⏳ Analyse en cours…", "");
      let body = "";
      let title = "Analyse Go";
      const goAnalysis = analysis.analyzeGo(
        state.go,
        state.goAnalysis && state.goAnalysis.deadMap
          ? { deadMap: state.goAnalysis.deadMap }
          : undefined
      );
      state.goAnalysis = goAnalysis.raw;
      body = goAnalysis.details;
      if (state.go.over || state.go.moves.length > 8) {
        const review = analysis.reviewGo(state.go);
        title = "Analyse de partie — Go";
        body += "\n\n" + review.details;
        if (review.sgf) body += "\n\nSGF :\n" + review.sgf;
        setStatus(
          "Analyse — " + goAnalysis.score.winner +
            " · " + (review.swings ? review.swings.length : 0) + " pivots",
          "ok"
        );
      } else {
        setStatus(
          "Analyse — N " + goAnalysis.score.black +
            " / B " + goAnalysis.score.white +
            " · " + goAnalysis.score.winner,
          "ok"
        );
      }
      paintGo();
      showAnalysisPanel(title, body);
      const panel = document.getElementById("analysisPanel");
      if (panel && panel.scrollIntoView) {
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      setStatus("Analyse impossible : " + msg, "err");
      showAnalysisPanel("Analyse Go", "Erreur : " + msg);
    }
  }

  if (el.btnAnalyze) {
    el.btnAnalyze.addEventListener("click", (e) => {
      e.preventDefault();
      if (state.game === "chess" && state.chess) {
        setStatus("⏳ Analyse Stockfish en cours…", "");
        const fen = state.chess.fen();
        analysis.analyzeChess(fen, 16, (result) => {
          if (result.error) {
            setStatus("❌ " + result.error, "err");
            showAnalysisPanel("Analyse échecs", result.error);
            return;
          }
          state.analysisMove = uciToSquares(result.bestMove);
          const bestSan = result.bestMove
            ? pvToSan(fen, [result.bestMove])
            : "?";
          state.lastEval = {
            score: result.evaluation || "?",
            best: bestSan,
            depth: result.depth || (result.lines && result.lines[0] && result.lines[0].depth) || "",
            barPct: evalToBarPct(result.evaluation)
          };
          publishGameState(true);
          let message = "Évaluation (point de vue blancs) : " + (result.evaluation || "?") +
            "\nMeilleur coup : " + bestSan;
          if (result.lines && result.lines.length) {
            message += "\n\nVariantes :";
            result.lines.forEach((line, i) => {
              message += "\n" + (i + 1) + ". " + pvToSan(fen, line.uci || line.moves.split(" ")) +
                "  (" + line.eval + (line.depth ? " · p" + line.depth : "") + ")";
            });
          }
          showAnalysisPanel("Analyse Stockfish", message);
          renderChess();
          setStatus("✅ Analyse terminée — " + (result.evaluation || "") + " · " + bestSan, "ok");
        }, { side: state.chess.turn(), variant: state.chessVariant });
      } else {
        doGoAnalyze();
      }
    });
  }

  const btnCloseAnalysis = document.getElementById("btnCloseAnalysis");
  if (btnCloseAnalysis) {
    btnCloseAnalysis.addEventListener("click", () => {
      const panel = document.getElementById("analysisPanel");
      if (panel) panel.style.display = "none";
      state.analysisMove = null;
      state.goAnalysis = null;
      render();
    });
  }

  // ========== RÉSEAU ==========

  if (el.btnHost) {
    el.btnHost.addEventListener("click", () => {
      wireNetHandlers();
      net.init();
    });
  }

  if (el.btnCopy) {
    el.btnCopy.addEventListener("click", () => {
      if (el.inviteUrl && el.inviteUrl.value) {
        el.inviteUrl.select();
        navigator.clipboard.writeText(el.inviteUrl.value).catch(() => {
          document.execCommand("copy");
        });
        setStatus("Lien copié !", "ok");
      }
    });
  }

  function configureClockAuthority() {
    const host = net.role === "host" || !net.connected();
    clock.setAuthority(host);
    if (host && clock.type !== "none") {
      clock.onNeedSync = (snap) => {
        if (net.connected() && window.MatchProtocol) {
          net.send(MatchProtocol.clockSyncPayload(clock));
        }
      };
      clock.startSyncBroadcast(1000);
    } else {
      clock.stopSyncBroadcast();
      clock.onNeedSync = null;
    }
  }

  function onNetMessage(data) {
    if (!data || typeof data !== 'object') return;
    try {
      if (window.__sbTeaching && window.__sbTeaching.handleNet(data)) return;
      if (window.__sbChessTeaching && window.__sbChessTeaching.handleNet(data)) return;
      if (goFeaturesApi && goFeaturesApi.handleNet(data)) return;
      if (window.__sbRengoRoom && window.__sbRengoRoom.applyRemote(data)) return;

      if (data.type === "chess" && state.game === "chess") {
        applyChessVariantFromNet(data);
        if (data.reset) {
          if (normalizeFen(data.fen) !== normalizeFen(START_FEN)) {
            sounds.refuse();
            setStatus("Coup réseau refusé (nouvelle partie invalide)", "err");
            return;
          }
          startNewChess({ fromNet: true });
          return;
        }
        if (data.checks) applyChecksFromNet(data.checks);
        let applied = applyRemoteChessFen(data.fen);
        if (!applied.ok && applied.needSync) {
          // Demander un resync complet
          if (net.role !== "host") net.send({ type: "request-sync", game: "chess" });
          sounds.refuse();
          setStatus("Désync — resynchronisation…", "err");
          return;
        }
        if (!applied.ok) {
          sounds.refuse();
          setStatus("Coup réseau refusé (position invalide)", "err");
          return;
        }
        if (applied.moved) {
          const mv = applied.move || data.move;
          if (state.handBrain && mv) state.pieceHint[mv.color] = null;
          if (mv) advancePairSeat(mv.color);
          if (mv && !applied.forced) applyVariantAfterMove(mv);
          else if (data.checks) applyChecksFromNet(data.checks);
          if (data.clock && window.MatchProtocol) MatchProtocol.applyClock(clock, data.clock);
          else if (clock.type !== "none") {
            clock.switchPlayer();
            updateClockDisplay();
          }
          if (sounds.piece) sounds.piece();
          else sounds.move();
          if (state.chess && state.chess.in_check()) sounds.check();
          if (isChessVariantOver()) {
            clock.stop();
            sounds.win();
            if (mods.chess && mods.chess.maybeRecordChessResult) mods.chess.maybeRecordChessResult();
          }
        }
        state.selected = null;
        state.pendingChessMove = null;
        renderChess();
        updateChessStatus();
        updateVariantHud();
      } else if (data.type === "chess-color-assign") {
        if (net.role === "host") {
          state.color = data.hostColor === "b" ? "b" : "w";
          state.hostColor = state.color;
        } else {
          state.color = data.guestColor === "b" ? "b" : "w";
          state.hostColor = data.hostColor === "b" ? "b" : "w";
        }
        state.chessBoardFlipped = state.color === "b";
        setStatus(state.color === "w" ? "Vous jouez les Blancs" : "Vous jouez les Noirs", "ok");
        renderChess();
        updateChessStatus();
      } else if (data.type === "chess-draw-offer") {
        if (confirm("L'adversaire propose la nulle. Accepter ?")) {
          if (mods.chess && mods.chess.acceptDraw) mods.chess.acceptDraw();
        }
      } else if (data.type === "chess-draw-accept") {
        state.chessDraw = true;
        clock.stop();
        setStatus("🤝 Nulle acceptée", "ok");
        if (mods.chess && mods.chess.maybeRecordChessResult) mods.chess.maybeRecordChessResult();
        updateChessStatus();
        renderChess();
      } else if (data.type === "chess-rematch") {
        startNewChess({ fromNet: true });
        setStatus("Rematch !", "ok");
      } else if (data.type === "request-sync") {
        if (net.role === "host" && net.connected()) {
          if ((data.game === "chess" || state.game === "chess") && mods.chess) {
            sendChessStateSync();
          } else if (state.go && window.MatchProtocol) {
            net.send(MatchProtocol.stateSyncPayload(state.go, clock));
          }
        }
      } else if (data.type === "state-sync") {
        if (data.game === "chess" || data.chess) {
          if (data.chess) loadChessState(data.chess);
          if (data.hostColor) state.hostColor = data.hostColor;
          if (data.yourColor === "w" || data.yourColor === "b") {
            state.color = data.yourColor;
            state.chessBoardFlipped = state.color === "b";
          } else if (net.role !== "host") {
            state.color = (state.hostColor === "b") ? "w" : "b";
            state.chessBoardFlipped = state.color === "b";
          }
          if (data.clock && window.MatchProtocol) MatchProtocol.applyClock(clock, data.clock);
          renderChess();
          updateChessStatus();
          updateVariantHud();
          setStatus("Plateau synchronisé", "ok");
        } else if (data.state && state.go && window.MatchProtocol) {
          // Go sync handled elsewhere (go-features) — fallback minimal
        }
      } else if (data.type === "go" && state.game === "go") {
        if (net.role === "observer") {
          // observateur : appliquer sans vérif stricte
        } else if (window.MatchProtocol && MatchProtocol.acceptRemoteGo) {
          const check = MatchProtocol.acceptRemoteGo(state.go, data);
          if (!check.ok) {
            sounds.refuse();
            setStatus("Coup Go refusé : " + (check.reason || "?"), "err");
            if (check.needSync) net.send({ type: "request-sync" });
            return;
          }
        }
        const played = state.go.play(data.x, data.y);
        if (!played) {
          sounds.refuse();
          setStatus("Coup Go réseau refusé — sync…", "err");
          if (net.role !== "host") net.send({ type: "request-sync" });
          return;
        }
        if (data.hash && state.go.getBoardHash() !== data.hash) {
          setStatus("Hash désync — demande d'état…", "err");
          if (net.role !== "host") net.send({ type: "request-sync" });
        }
        const playedSide = goPlayedSide();
        if (state.handBrain) state.goHint[playedSide] = null;
        advancePairSeat(playedSide);
        state.lastGoMove = {x: data.x, y: data.y};
        if (data.clock) MatchProtocol.applyClock(clock, data.clock);
        else if (clock.type !== "none" && clock.isAuthority) {
          clock.switchPlayer();
          updateClockDisplay();
        }
        if (sounds.stone) sounds.stone();
        else sounds.move();
        renderGo();
        updateGoStatus();
        updateCaptureCounters();
      } else if (data.type === "pass" && state.game === "go") {
        if (!state.go.pass()) return;
        const playedSide = goPlayedSide();
        if (state.handBrain) state.goHint[playedSide] = null;
        advancePairSeat(playedSide);
        if (data.clock) MatchProtocol.applyClock(clock, data.clock);
        else if (clock.type !== "none" && clock.isAuthority) {
          clock.switchPlayer();
          updateClockDisplay();
        }
        renderGo();
        updateGoStatus();
        if (state.go.over && mods.go && mods.go.enterScoringMode) {
          mods.go.enterScoringMode();
        }
      } else if (data.type === "piece-hint") {
        if (data.color === "w" || data.color === "b") {
          state.pieceHint[data.color] = data.piece;
          if (state.game === "chess") {
            updateChessStatus();
            renderChess();
          }
        }
      } else if (data.type === "go-hint") {
        if (data.color === "w" || data.color === "b") {
          state.goHint[data.color] = data.zone;
          if (state.game === "go") {
            updateGoStatus();
            paintGo();
          }
        }
      } else if (data.type === "resign") {
        setStatus("L'adversaire a abandonné !", "ok");
        if (state.game === "go") {
          state.go.resign(state.go.turn);
        } else if (state.game === "chess" && mods.chess && mods.chess.resignChess) {
          mods.chess.resignChess(data.color === "b" ? "b" : "w");
        }
      }
    } catch (error) {
      console.warn('Message réseau ignoré:', error);
    }
  }


  let lastCreatedInvitation = null;

  let pendingDiscordRoom = null;

  // Surveiller l'ID de connexion + enregistrer une salle courte si API dispo
  net.onReady = async function () {
    if (pendingDiscordRoom && net.id && net.roomToken) {
      const code = pendingDiscordRoom.code;
      if (window.__sbLocalNet && typeof net.attachRoom === "function") {
        net.attachRoom(code);
      }
      const peerId = window.__sbLocalNet ? ("local_" + code) : net.id;
      const created = await rooms.create({
        peerId: peerId,
        token: net.roomToken,
        game: pendingDiscordRoom.game,
        code: code,
        source: window.__sbLocalNet ? "discord-mock" : "discord"
      });
      if (created && created.code) {
        shortRoomCode = created.code;
        setStatus(window.__sbLocalNet
          ? "Salle locale prête — le joueur B peut rejoindre"
          : "Salle Discord prête — invitez un ami dans l'Activity", "ok");
        if (window.DiscordActivity) DiscordActivity.setActivityStatus("En attente d'adversaire");
      }
      pendingDiscordRoom = null;
    }
    if (lastCreatedInvitation && net.id && net.roomToken) {
      const created = await rooms.create({
        peerId: net.id,
        token: net.roomToken,
        game: lastCreatedInvitation.gameType === "go" ? "go" : "chess"
      });
      if (created && created.code) shortRoomCode = created.code;
    }
    if (el.inviteUrl && lastCreatedInvitation) {
      el.inviteUrl.value = generateInviteLink(lastCreatedInvitation);
    }
  };

  /**
   * Hook Discord Activity : hôte crée la PeerJS room avec code d'instance,
   * invité rejoint dès que la salle API existe.
   */
  window.__sbStartDiscordMatch = async function (opts) {
    const code = opts && opts.code;
    const game = opts && opts.game === "go" ? "go" : "chess";
    if (!code) return;

    state.mode = "online";
    wireNetHandlers();
    activate(game);

    const localMock = !!window.__sbLocalNet;

    if (opts.asHost) {
      pendingDiscordRoom = { code: code, game: game };
      net.init({ asHost: true });
      if (localMock && typeof net.attachRoom === "function") {
        net.attachRoom(code);
      }
      setStatus(localMock
        ? "Hôte local — en attente du joueur B…"
        : "Hôte Discord — partagez l'Activity dans le salon vocal", "ok");
      return;
    }

    // Invité : poll jusqu'à ce que l'hôte enregistre la salle
    setStatus("Recherche de la partie Discord…", "ok");
    let resolved = null;
    for (let i = 0; i < 40; i++) {
      resolved = await rooms.resolve(code);
      if (resolved) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!resolved) {
      pendingDiscordRoom = { code: code, game: game };
      net.init({ asHost: true });
      if (localMock && typeof net.attachRoom === "function") net.attachRoom(code);
      setStatus("Seul dans l'Activity — vous êtes hôte, invitez un adversaire", "ok");
      return;
    }
    if (localMock) {
      net.join("local_" + code, resolved.token);
    } else {
      net.join(resolved.peerId, resolved.token);
    }
    setStatus("Connexion à l'hôte…", "ok");
    if (window.DiscordActivity) DiscordActivity.setActivityStatus("Partie en cours");
  };

  // Expose pour debug / UI
  window.__sbGetNet = () => net;
  window.__sbNetConnected = () => net.connected();

  // Rejoindre une partie si host / room dans l'URL
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const gameParam = params.get("g") || params.get("game");
  if (gameParam === "go" || gameParam === "rengo") requestedGame = "go";
  if (gameParam === "chess" || gameParam === "renchess") requestedGame = "chess";

  async function joinFromUrl() {
    // En mock Discord automatch, discord-match.js gère hôte/invité (évite le double join)
    if (params.get("mock") === "1" && (params.get("automatch") === "1" || params.get("discord") === "1")) {
      return;
    }
    let hostId = params.get("host");
    let roomToken = params.get("t") || hashParams.get("t");
    const roomCode = params.get("room");
    if (roomCode && (!hostId || !roomToken)) {
      const resolved = await rooms.resolve(roomCode);
      if (resolved) {
        hostId = resolved.peerId;
        roomToken = resolved.token;
        if (resolved.game === "go") requestedGame = "go";
        if (resolved.game === "chess") requestedGame = "chess";
      } else {
        setStatus("Salle introuvable ou expirée", "err");
      }
    }
    const wantObserve = params.get("observe") === "1" || params.get("watch") === "1";
    if (wantObserve) {
      state.matchMeta = state.matchMeta || {};
      state.matchMeta.observe = true;
      document.body.classList.add("spectator-mode");
    }
    if (hostId) {
      state.mode = "online";
      wireNetHandlers();
      const joinOpts = wantObserve ? { observe: true } : {};
      if (window.__sbLocalNet && roomCode) {
        net.join("local_" + roomCode, roomToken, joinOpts);
      } else {
        net.join(hostId, roomToken, joinOpts);
      }
      if (wantObserve) setStatus("Mode spectateur — lecture seule", "ok");
    }
  }
  joinFromUrl();

  // ========== PLATEFORMES SOCIALES ==========

  function openSafe(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const btnFacebook = document.getElementById("btnFacebook");
  if (btnFacebook) {
    btnFacebook.addEventListener("click", () => {
      openSafe("https://www.facebook.com/gaming");
    });
  }

  const btnDiscord = document.getElementById("btnDiscord");
  if (btnDiscord) {
    btnDiscord.addEventListener("click", () => {
      openSafe("https://discord.com/developers/applications");
    });
  }

  const btnTelegram = document.getElementById("btnTelegram");
  if (btnTelegram) {
    btnTelegram.addEventListener("click", () => {
      openSafe("https://core.telegram.org/bots/webapps");
    });
  }

  const btnReddit = document.getElementById("btnReddit");
  if (btnReddit) {
    btnReddit.addEventListener("click", () => {
      if (el.inviteUrl && el.inviteUrl.value) {
        openSafe("https://reddit.com/submit?url=" + encodeURIComponent(el.inviteUrl.value));
      }
    });
  }

  // ========== HORLOGE ==========
  
  // Presets d'horloges
  const clockPresets = {
    // Échecs
    'bullet1': { type: 'simple', minutes: 1 },
    'bullet2': { type: 'fischer', minutes: 2, increment: 1 },
    'blitz3': { type: 'simple', minutes: 3 },
    'blitz5': { type: 'simple', minutes: 5 },
    'rapid10': { type: 'simple', minutes: 10 },
    'rapid15': { type: 'fischer', minutes: 15, increment: 10 },
    'classical30': { type: 'simple', minutes: 30 },
    'classical45': { type: 'fischer', minutes: 45, increment: 45 },
    // Go — cadences (bullet / blitz / rapide / classique)
    'go-none': { type: 'none' },
    'go-bullet1': { type: 'byoyomi', mainMinutes: 1, byoyomiSeconds: 10, periods: 5 },
    'go-bullet3': { type: 'byoyomi', mainMinutes: 3, byoyomiSeconds: 20, periods: 3 },
    'go-blitz5': { type: 'byoyomi', mainMinutes: 5, byoyomiSeconds: 20, periods: 3 },
    'go-blitz5abs': { type: 'simple', minutes: 5 },
    'go-rapid10': { type: 'byoyomi', mainMinutes: 10, byoyomiSeconds: 30, periods: 3 },
    'go-rapid15': { type: 'byoyomi', mainMinutes: 15, byoyomiSeconds: 30, periods: 5 },
    'go-classical20': { type: 'byoyomi', mainMinutes: 20, byoyomiSeconds: 30, periods: 5 },
    'go-classical30': { type: 'byoyomi', mainMinutes: 30, byoyomiSeconds: 30, periods: 5 },
    'go-classical45': { type: 'byoyomi', mainMinutes: 45, byoyomiSeconds: 60, periods: 5 },
    'go-abs20': { type: 'simple', minutes: 20 },
    'go-abs60': { type: 'simple', minutes: 60 },
    'go-canadian': { type: 'canadian', mainMinutes: 30, periodMinutes: 5, stones: 25 },
    // alias anciens ids
    'go-quick': { type: 'byoyomi', mainMinutes: 10, byoyomiSeconds: 30, periods: 3 },
    'go-std20': { type: 'byoyomi', mainMinutes: 20, byoyomiSeconds: 30, periods: 5 },
    'go-standard': { type: 'byoyomi', mainMinutes: 20, byoyomiSeconds: 30, periods: 5 },
    'go-std30': { type: 'byoyomi', mainMinutes: 30, byoyomiSeconds: 30, periods: 5 },
    'go-long': { type: 'byoyomi', mainMinutes: 45, byoyomiSeconds: 60, periods: 5 },
    'go-igs': { type: 'canadian', mainMinutes: 10, periodMinutes: 8, stones: 20 }
  };

  let lastByoyomiBeep = [0, 0];
  
  function updateClockDisplay() {
    if (!el.clockWhite || !el.clockBlack) return;
    const clockState = clock.getState();
    
    el.clockWhite.querySelector('.clock-time').textContent = clockState.times[0];
    el.clockBlack.querySelector('.clock-time').textContent = clockState.times[1];
    
    el.clockWhite.querySelector('.clock-extra').textContent = clockState.extras[0];
    el.clockBlack.querySelector('.clock-extra').textContent = clockState.extras[1];
    
    el.clockWhite.classList.toggle('active', clockState.currentPlayer === 0 && clockState.running);
    el.clockBlack.classList.toggle('active', clockState.currentPlayer === 1 && clockState.running);
    
    const whiteTime = clock.mainTime[0];
    const blackTime = clock.mainTime[1];
    el.clockWhite.classList.toggle('low-time', whiteTime < 20000 && whiteTime > 0);
    el.clockBlack.classList.toggle('low-time', blackTime < 20000 && blackTime > 0);

    // Tick byoyomi discret sous 10 s (sans stridence)
    if (clock.type === "byoyomi" && clock.running) {
      const p = clock.currentPlayer;
      if (clock.inByoyomi[p] && clock.mainTime[p] <= 10000) {
        const sec = Math.ceil(clock.mainTime[p] / 1000);
        if (sec !== lastByoyomiBeep[p] && sec > 0 && sec <= 10) {
          lastByoyomiBeep[p] = sec;
          if (sounds.byoyomiTick) sounds.byoyomiTick(sec <= 3);
        }
      }
    }
    publishGameState();
  }

  /** Snapshot pour overlays Broadcast / OBS / spectateurs locaux. */
  function collectBroadcastSnapshot() {
    const clockState = clock.getState ? clock.getState() : { times: ["--:--", "--:--"], currentPlayer: 0, running: false };
    const viewers = (net && typeof net.observerCount === "function") ? net.observerCount() : 0;
    const snap = {
      game: state.game,
      clockWhite: clockState.times[0],
      clockBlack: clockState.times[1],
      clockActive: clockState.running ? (clockState.currentPlayer === 0 ? "w" : "b") : null,
      viewers: viewers,
      whiteName: (state.pairNames && state.pairNames.w && state.pairNames.w[0]) || "Blanc",
      blackName: (state.pairNames && state.pairNames.b && state.pairNames.b[0]) || "Noir",
      whiteRating: "",
      blackRating: "",
      statusText: (el.status && el.status.textContent) || "",
      liveTitle: state.game === "go" ? "🔴 LIVE Go" : "🔴 LIVE Échecs"
    };
    if (window.RatingSystem) {
      try {
        const info = RatingSystem.displayFor(currentUserId(), state.game === "chess" ? "chess" : "go");
        if (state.color === "b") snap.blackRating = info.label;
        else snap.whiteRating = info.label;
      } catch (_) { /* ignore */ }
    }
    if (state.game === "chess" && state.chess) {
      snap.fen = state.chess.fen();
      const hist = state.chess.history ? state.chess.history() : [];
      const moves = [];
      for (let i = 0; i < hist.length; i += 2) {
        const n = Math.floor(i / 2) + 1;
        moves.push(n + ". " + hist[i] + (hist[i + 1] ? " " + hist[i + 1] : ""));
      }
      snap.moves = moves;
      snap.lastMoveSan = state.lastMove && state.lastMove.san ? state.lastMove.san : (hist[hist.length - 1] || "");
      if (state.lastEval) {
        snap.evalScore = state.lastEval.score;
        snap.evalBest = state.lastEval.best;
        snap.evalDepth = state.lastEval.depth;
        snap.evalBarPct = state.lastEval.barPct;
      }
    } else if (state.game === "go" && state.go) {
      snap.moves = [];
      if (state.go.moves && state.go.moves.length) {
        snap.moves = state.go.moves.slice(-30).map((m, i) => {
          if (!m || m.pass) return (i + 1) + ". pass";
          return (i + 1) + ". " + (m.x >= 0 ? String.fromCharCode(65 + m.x) + (state.go.size - m.y) : "pass");
        });
      }
      if (state.lastGoMove) {
        snap.lastMoveSan = state.lastGoMove.x != null
          ? String.fromCharCode(65 + state.lastGoMove.x) + (state.go.size - state.lastGoMove.y)
          : "pass";
      }
      snap.captured = {
        whiteText: " capt. " + ((state.go.captures && state.go.captures[2]) || 0),
        blackText: " capt. " + ((state.go.captures && state.go.captures[1]) || 0)
      };
    }
    return snap;
  }

  function evalToBarPct(evaluation) {
    if (evaluation == null) return 50;
    const s = String(evaluation);
    if (/mate/i.test(s)) return /-/i.test(s) ? 8 : 92;
    const n = parseFloat(s.replace(/^\+/, ""));
    if (!Number.isFinite(n)) return 50;
    // map ~[-5, +5] → [10, 90]
    const clamped = Math.max(-5, Math.min(5, n));
    return 50 + clamped * 8;
  }

  let _lastPublishAt = 0;
  let _lastPublishKey = "";
  function publishGameState(force) {
    const now = Date.now();
    if (!force && now - _lastPublishAt < 200) return;
    const snap = collectBroadcastSnapshot();
    const key = (snap.fen || "") + "|" + snap.lastMoveSan + "|" + snap.clockWhite + "|" + snap.clockBlack + "|" + snap.viewers;
    if (!force && key === _lastPublishKey) return;
    _lastPublishKey = key;
    _lastPublishAt = now;
    if (window.Broadcast) Broadcast.applyGameState(snap);
    else if (window.streamOverlay && streamOverlay.applyGameState) streamOverlay.applyGameState(snap);
    window.dispatchEvent(new CustomEvent("sb:game-state", { detail: snap }));
  }
  window.__sbPublishGameState = publishGameState;
  
  function applyClockConfig() {
    const type = el.clockType.value;
    
    clock.reset();
    lastByoyomiBeep = [0, 0];
    
    if (type === "none") {
      clock.type = "none";
      el.clockDisplay.style.display = "none";
      el.clockModal.style.display = "none";
      setStatus("⏱️ Horloge désactivée (correspondance / sans limite)", "ok");
      return;
    }
    if (type === "simple") {
      const minutes = parseFloat(document.getElementById("simpleMinutes").value);
      clock.setupSimple(minutes);
    } else if (type === "fischer") {
      const minutes = parseFloat(document.getElementById("fischerMinutes").value);
      const increment = parseInt(document.getElementById("fischerIncrement").value);
      clock.setupFischer(minutes, increment);
    } else if (type === "byoyomi") {
      const mainMinutes = parseInt(document.getElementById("byoyomiMain").value);
      const byoyomiSeconds = parseInt(document.getElementById("byoyomiTime").value);
      const periods = parseInt(document.getElementById("byoyomiPeriods").value);
      clock.setupByoyomi(mainMinutes, byoyomiSeconds, periods);
    } else if (type === "canadian") {
      const mainMinutes = parseInt(document.getElementById("canadianMain").value);
      const periodMinutes = parseInt(document.getElementById("canadianPeriod").value);
      const stones = parseInt(document.getElementById("canadianStones").value);
      clock.setupCanadian(mainMinutes, periodMinutes, stones);
    }
    
    el.clockDisplay.style.display = "flex";
    updateClockDisplay();
    
    const startPlayer = (state.game === "chess")
      ? (state.chess && state.chess.turn() === "w" ? 0 : 1)
      : (state.go && state.go.turn === 1 ? 1 : 0); // Go : Noir = index 1
    configureClockAuthority();
    clock.start(startPlayer);
    
    el.clockModal.style.display = "none";
    
    const typeNames = {
      'simple': 'Absolute',
      'fischer': 'Fischer',
      'byoyomi': 'Byoyomi',
      'canadian': 'Canadienne'
    };
    setStatus(`✓ Horloge ${typeNames[type] || type} activée`, "ok");
  }

  function filterClockPresets() {
    const isGo = state.game === "go";
    document.querySelectorAll(".preset-btn").forEach((btn) => {
      const id = btn.getAttribute("data-preset") || "";
      const goPreset = id.indexOf("go-") === 0;
      btn.style.display = (isGo ? goPreset : !goPreset) ? "" : "none";
    });
    if (el.clockType) {
      // Préférer byoyomi pour le Go
      if (isGo && el.clockType.value === "fischer") el.clockType.value = "byoyomi";
      el.clockType.dispatchEvent(new Event("change"));
    }
  }
  
  el.btnClock.addEventListener("click", () => {
    filterClockPresets();
    if (el.clockModal) {
      el.clockModal.classList.toggle("clock-for-go", state.game === "go");
      el.clockModal.classList.toggle("clock-for-chess", state.game !== "go");
      const title = el.clockModal.querySelector("h3");
      if (title) {
        title.textContent = state.game === "go"
          ? "⏱️ Horloge Go"
          : "⏱️ Configuration de l'horloge";
      }
      const hint = document.getElementById("goClockHint");
      if (hint) hint.style.display = state.game === "go" ? "" : "none";
      const customDiv = document.getElementById("clockCustomDivider");
      if (customDiv) customDiv.style.display = state.game === "go" ? "" : "none";
      const adv = document.getElementById("clockAdvancedWrap");
      if (adv) {
        if (adv.tagName === "DETAILS") adv.open = true;
        adv.style.display = "";
      }
    }
    el.clockModal.style.display = "flex";
  });
  
  el.btnClockCancel.addEventListener("click", () => {
    el.clockModal.style.display = "none";
  });
  
  // Bouton désactiver horloge
  onEl("btnDisableClock", "click", () => {
    clock.reset();
    clock.type = "none";
    if (el.clockDisplay) el.clockDisplay.style.display = "none";
    if (el.clockModal) el.clockModal.style.display = "none";
    setStatus("⏱️ Horloge désactivée", "ok");
  });
  
  // Gestion des presets
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const presetName = btn.dataset.preset;
      const preset = clockPresets[presetName];
      
      if (!preset) return;
      
      if (preset.type === "none") {
        el.clockType.value = "none";
        applyClockConfig();
        return;
      }
      el.clockType.value = preset.type;
      el.clockType.dispatchEvent(new Event('change'));
      
      if (preset.type === 'simple') {
        document.getElementById("simpleMinutes").value = preset.minutes;
      } else if (preset.type === 'fischer') {
        document.getElementById("fischerMinutes").value = preset.minutes;
        document.getElementById("fischerIncrement").value = preset.increment;
      } else if (preset.type === 'byoyomi') {
        document.getElementById("byoyomiMain").value = preset.mainMinutes;
        document.getElementById("byoyomiTime").value = preset.byoyomiSeconds;
        document.getElementById("byoyomiPeriods").value = preset.periods;
      } else if (preset.type === 'canadian') {
        document.getElementById("canadianMain").value = preset.mainMinutes;
        document.getElementById("canadianPeriod").value = preset.periodMinutes;
        document.getElementById("canadianStones").value = preset.stones;
      }
      
      applyClockConfig();
    });
  });
  
  el.clockType.addEventListener("change", (e) => {
    document.getElementById("clockConfigSimple").style.display = e.target.value === "simple" ? "block" : "none";
    document.getElementById("clockConfigFischer").style.display = e.target.value === "fischer" ? "block" : "none";
    document.getElementById("clockConfigByoyomi").style.display = e.target.value === "byoyomi" ? "block" : "none";
    document.getElementById("clockConfigCanadian").style.display = e.target.value === "canadian" ? "block" : "none";
  });
  
  if (el.btnClockOk) el.btnClockOk.addEventListener("click", applyClockConfig);

  // Modules Go/Échecs AVANT les invitations — sinon une erreur UI bloque SGF/Teaching/Rengo…
  try {
    await bootModules();
  } catch (err) {
    console.error("bootModules", err);
    setStatus("Erreur au chargement des modules : " + ((err && err.message) || err), "err");
  }

  // ========== INVITATIONS ==========
  
  let currentInvitation = null;
  let selectedCounterClock = null;
  
  // Afficher une notification
  function showNotification(text, type = 'info') {
    const notif = document.getElementById('inviteNotification');
    if (!notif) return;
    const content = notif.querySelector('.notification-content');
    const textEl = document.getElementById('notificationText');
    if (!content || !textEl) return;
    
    textEl.textContent = text;
    content.className = 'notification-content ' + type;
    notif.style.display = 'block';
    
    // Auto-masquer après 5 secondes
    setTimeout(() => {
      notif.style.display = 'none';
    }, 5000);
  }
  
  onEl('btnCloseNotif', 'click', () => {
    const n = document.getElementById('inviteNotification');
    if (n) n.style.display = 'none';
  });
  
  // Créer et envoyer une invitation
  onEl('btnInvite', 'click', () => {
    if (!auth.isLoggedIn()) {
      showNotification('Vous devez être connecté pour inviter quelqu\'un', 'error');
      document.getElementById('loginModal').style.display = 'flex';
      return;
    }
    
    // Obtenir la config actuelle de l'horloge
    const clockConfig = {
      type: clock.type || 'none',
      minutes: clock.mainTime[0] / 60000,
      increment: clock.increment / 1000,
      mainMinutes: clock.mainTime[0] / 60000,
      byoyomiSeconds: clock.byoyomiTime / 1000,
      periods: clock.byoyomiPeriods[0],
      periodMinutes: clock.byoyomiTime / 60000,
      stones: clock.canadianStones
    };
    
    const result = invitationSystem.createInvitation(state.game, clockConfig);
    
    if (result.success) {
      lastCreatedInvitation = result.invitation;
      wireNetHandlers();
      net.init({ asHost: true });
      const inviteLink = generateInviteLink(result.invitation);
      document.getElementById('inviteUrl').value = inviteLink;
      showNotification(`✓ Invitation créée ! Partagez le lien ci-dessous`, 'success');
    } else {
      showNotification(result.error, 'error');
    }
  });
  
  function generateInviteLink(invitation) {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('invite', String(invitation.id || '').slice(0, 80));
    url.searchParams.set('from', String(invitation.from?.username || 'joueur').slice(0, 20));
    const gameCode = invitation.gameType === 'go'
      ? (state.rengo ? 'rengo' : 'go')
      : (state.renchess ? 'renchess' : 'chess');
    url.searchParams.set('game', gameCode);
    url.searchParams.set('g', invitation.gameType === 'go' ? 'go' : 'chess');
    const clockSafe = window.SecurityManager
      ? SecurityManager.parseClockConfig(invitation.clockConfig)
      : { type: 'none' };
    url.searchParams.set('clock', JSON.stringify(clockSafe));
    if (shortRoomCode) {
      url.searchParams.set('room', shortRoomCode);
    } else {
      if (net.id) url.searchParams.set('host', net.id);
      if (net.roomToken) url.hash = 't=' + net.roomToken;
    }
    if (state.handBrain) url.searchParams.set('hb', '1');
    return url.toString();
  }
  
  // Copier le lien d'invitation
  onEl('btnCopy', 'click', () => {
    const inviteUrl = document.getElementById('inviteUrl');
    if (inviteUrl && inviteUrl.value) {
      inviteUrl.select();
      document.execCommand('copy');
      showNotification('✓ Lien copié dans le presse-papiers !', 'success');
    } else {
      showNotification('Créez d\'abord une invitation', 'warning');
    }
  });
  
  // Partage sur réseaux sociaux
  const shareButtons = {
    'btnShareFacebook': 'facebook',
    'btnShareTwitter': 'twitter',
    'btnShareTelegram': 'telegram',
    'btnShareReddit': 'reddit',
    'btnShareWhatsApp': 'whatsapp'
  };
  
  Object.entries(shareButtons).forEach(([btnId, platformName]) => {
    onEl(btnId, 'click', () => {
      const inviteUrlEl = document.getElementById('inviteUrl');
      const inviteUrl = inviteUrlEl ? inviteUrlEl.value : '';
      if (!inviteUrl) {
        showNotification('Créez d\'abord une invitation !', 'warning');
        return;
      }
      
      const gameName = state.game === 'chess' ? 'Échecs' : 'Go';
      const clockDesc = invitationSystem.formatClockDescription({
        type: clock.type,
        minutes: clock.mainTime[0] / 60000,
        increment: clock.increment / 1000,
        mainMinutes: clock.mainTime[0] / 60000,
        byoyomiSeconds: clock.byoyomiTime / 1000,
        periods: clock.byoyomiPeriods[0],
        periodMinutes: clock.byoyomiTime / 60000,
        stones: clock.canadianStones
      });
      
      const message = `Jouons au ${gameName} sur Social Board !\nCadence: ${clockDesc}`;
      
      // Utiliser la méthode native de la plateforme si disponible
      if (platforms.name === platformName) {
        platforms.share(inviteUrl, message)
          .then(() => {
            showNotification(`✓ Partagé sur ${platformName} !`, 'success');
          })
          .catch(err => {
            console.error('Erreur de partage:', err);
            // Fallback vers la méthode standard
            auth.shareToSocial(platformName, inviteUrl, message);
          });
      } else {
        // Utiliser la méthode standard
        auth.shareToSocial(platformName, inviteUrl, message);
      }
    });
  });
  
  // Vérifier s'il y a une invitation dans l'URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('invite')) {
    const fromName = window.SecurityManager
      ? SecurityManager.sanitizeInput(urlParams.get('from') || 'Un joueur', 20)
      : String(urlParams.get('from') || 'Un joueur').slice(0, 20);
    const invitation = {
      id: String(urlParams.get('invite') || '').slice(0, 80),
      from: {
        username: fromName,
        avatar: { color: '#4ECDC4', initial: fromName.charAt(0) || '?' }
      },
      gameType: window.SecurityManager
        ? SecurityManager.parseGameType(urlParams.get('game'))
        : (urlParams.get('game') === 'go' || urlParams.get('game') === 'rengo' ? 'go' : 'chess'),
      pairsFormat: (urlParams.get('game') === 'rengo' || urlParams.get('game') === 'renchess')
        ? urlParams.get('game')
        : null,
      handBrain: urlParams.get('hb') === '1' || urlParams.get('game') === 'renchess-ht',
      clockConfig: window.SecurityManager
        ? SecurityManager.parseClockConfig(urlParams.get('clock'))
        : { type: 'none' }
    };

    setTimeout(() => {
      displayInvitation(invitation);
    }, 500);
  }

  function displayInvitation(invitation) {
    currentInvitation = invitation;

    const content = document.getElementById('invitationContent');
    if (!content) return;
    content.replaceChildren();

    const gameName = invitation.pairsFormat === 'rengo' && invitation.handBrain
      ? '🎯 Rengo main-tête'
      : invitation.pairsFormat === 'rengo'
        ? '🎯 Rengo (Go 2 vs 2)'
        : invitation.handBrain
          ? '♟️ Renchess main-tête'
          : invitation.pairsFormat === 'renchess'
            ? '♟️ Renchess (Échecs 2 vs 2)'
            : (invitation.gameType === 'chess' ? '♟️ Échecs' : '🎯 Go');
    const clockDesc = invitationSystem.formatClockDescription(invitation.clockConfig);
    const username = window.SecurityManager
      ? SecurityManager.sanitizeInput(invitation.from?.username || 'Un joueur', 20)
      : String(invitation.from?.username || 'Un joueur').slice(0, 20);
    const initial = username.charAt(0) || '?';
    const color = window.SecurityManager && SecurityManager.isSafeCssColor(invitation.from?.avatar?.color)
      ? invitation.from.avatar.color
      : '#4ECDC4';

    const fromRow = document.createElement('div');
    fromRow.className = 'invitation-from';
    const avatar = document.createElement('div');
    avatar.className = 'invitation-avatar';
    avatar.style.background = color;
    avatar.textContent = initial;
    const details = document.createElement('div');
    details.className = 'invitation-details';
    const nameEl = document.createElement('div');
    nameEl.className = 'invitation-username';
    nameEl.textContent = username;
    details.appendChild(nameEl);
    fromRow.appendChild(avatar);
    fromRow.appendChild(details);

    const gameEl = document.createElement('div');
    gameEl.className = 'invitation-game';
    gameEl.textContent = 'Vous invite à jouer une partie de ' + gameName;

    const clockEl = document.createElement('div');
    clockEl.className = 'invitation-clock';
    const strong = document.createElement('strong');
    strong.textContent = 'Cadence proposée : ';
    clockEl.appendChild(strong);
    clockEl.appendChild(document.createTextNode(clockDesc));

    content.appendChild(fromRow);
    content.appendChild(gameEl);
    content.appendChild(clockEl);

    const modal = document.getElementById('invitationModal');
    if (modal) modal.style.display = 'flex';
  }
  
  // Accepter l'invitation
  onEl('btnAcceptInvite', 'click', () => {
    if (!currentInvitation) return;
    
    document.getElementById('invitationModal').style.display = 'none';
    
    // Appliquer la configuration du jeu
    state.rengo = currentInvitation.pairsFormat === 'rengo';
    state.renchess = currentInvitation.pairsFormat === 'renchess' ||
      (!!currentInvitation.handBrain && currentInvitation.gameType === 'chess');
    state.handBrain = !!(currentInvitation.handBrain && (state.renchess || state.rengo));
    const rengoBox = document.getElementById('rengoCheck');
    const renchessBox = document.getElementById('renchessCheck');
    const hbBox = document.getElementById('handBrainCheck');
    if (rengoBox) rengoBox.checked = state.rengo;
    if (renchessBox) renchessBox.checked = state.renchess;
    if (hbBox) hbBox.checked = state.handBrain;
    activate(currentInvitation.gameType);
    resetPairSeats();
    
    // Appliquer la configuration de l'horloge
    const clockCfg = currentInvitation.clockConfig;
    if (clockCfg.type !== 'none') {
      clock.reset();
      
      if (clockCfg.type === 'simple') {
        clock.setupSimple(clockCfg.minutes);
      } else if (clockCfg.type === 'fischer') {
        clock.setupFischer(clockCfg.minutes, clockCfg.increment);
      } else if (clockCfg.type === 'byoyomi') {
        clock.setupByoyomi(clockCfg.mainMinutes, clockCfg.byoyomiSeconds, clockCfg.periods);
      } else if (clockCfg.type === 'canadian') {
        clock.setupCanadian(clockCfg.mainMinutes, clockCfg.periodMinutes, clockCfg.stones);
      }
      
      el.clockDisplay.style.display = 'flex';
      updateClockDisplay();
      clock.start(0);
    }
    
    showNotification(`✓ Invitation acceptée ! La partie commence`, 'success');
    currentInvitation = null;
  });
  
  // Refuser l'invitation
  onEl('btnRejectInvite', 'click', () => {
    document.getElementById('invitationModal').style.display = 'none';
    showNotification('Invitation refusée', 'info');
    currentInvitation = null;
  });
  
  // Ouvrir le modal de contre-proposition
  onEl('btnCounterInvite', 'click', () => {
    if (!currentInvitation) return;
    
    document.getElementById('invitationModal').style.display = 'none';
    
    const clockDesc = invitationSystem.formatClockDescription(currentInvitation.clockConfig);
    document.getElementById('counterInfo').textContent = 
      `${currentInvitation.from.username} propose : ${clockDesc}\nChoisissez un autre timing :`;
    
    document.getElementById('counterModal').style.display = 'flex';
  });
  
  // Sélection du preset de contre-proposition
  document.querySelectorAll('.counter-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.counter-preset-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      
      const presetName = btn.dataset.preset;
      selectedCounterClock = clockPresets[presetName];
    });
  });
  
  // Envoyer la contre-proposition
  onEl('btnSendCounter', 'click', () => {
    if (!selectedCounterClock) {
      showNotification('Veuillez choisir un timing', 'warning');
      return;
    }
    
    document.getElementById('counterModal').style.display = 'none';
    
    const clockDesc = invitationSystem.formatClockDescription(selectedCounterClock);
    showNotification(
      `✓ Contre-proposition envoyée : ${clockDesc}\n${currentInvitation.from.username} va recevoir votre suggestion.`,
      'success'
    );
    
    // Ici, vous devriez envoyer via le réseau avec PeerJS
    // net.send({ type: 'counter-proposal', clockConfig: selectedCounterClock });
    
    currentInvitation = null;
    selectedCounterClock = null;
  });
  
  // Annuler la contre-proposition
  onEl('btnCancelCounter', 'click', () => {
    const cm = document.getElementById('counterModal');
    if (cm) cm.style.display = 'none';
    selectedCounterClock = null;
    // Revenir à l'invitation
    if (currentInvitation) {
      const im = document.getElementById('invitationModal');
      if (im) im.style.display = 'flex';
    }
  });

  // Mock Discord : anti-misclick off pour tester les coups plus vite
  try {
    if (new URLSearchParams(location.search).get("mock") === "1") {
      state.antiMisclickGo = false;
      state.antiMisclickChess = false;
      const goBox = document.getElementById("antiMisclickGoCheck");
      const chBox = document.getElementById("antiMisclickChessCheck");
      if (goBox) goBox.checked = false;
      if (chBox) chBox.checked = false;
    }
  } catch (_) { /* ignore */ }

  // Si le match Discord a démarré trop tôt, relancer maintenant que le hook existe
  if (window.DiscordActivity && DiscordActivity.ready) {
    document.dispatchEvent(new CustomEvent("discord:ready", { detail: DiscordActivity }));
  }

  // === BROADCAST / OBS (une seule source de binding : Broadcast.bindUi) ===
  const bindBtn = (id, fn) => {
    const node = document.getElementById(id);
    if (node) node.addEventListener("click", fn);
  };

  if (window.Broadcast) {
    Broadcast.onAfterToggle = () => publishGameState(true);
    Broadcast.bindUi();
  }
  publishGameState(true);

  window.addEventListener("movePlay", (event) => {
    if (window.discordIntegration && window.discordIntegration.isStreaming) {
      window.discordIntegration.commentMove(event.detail, state.game);
    }
    if (window.Broadcast && Broadcast.timeline.recording) {
      Broadcast.timeline.push("move", event.detail || {});
    }
  });

  // === SYSTÈME DE COMMENTAIRES DISCORD ===
  if (window.discordIntegration) {
    window.discordIntegration.initCommentarySystem();
    const username = auth.getUser()?.username || "Invité";
    window.discordIntegration.setCurrentUser(username, false);

    window.addEventListener("userLogin", (event) => {
      if (event.detail.username) {
        window.discordIntegration.setCurrentUser(event.detail.username, false);
      }
    });

    window.addEventListener("commentReceived", (event) => {
      window.discordIntegration.receiveComment(event.detail);
    });

    const startStream = () => {
      window.discordIntegration.startStream(state.game);
      const user = auth.getUser();
      window.discordIntegration.setCurrentUser(user?.username || "Invité", true);
      const commentaryPanel = document.getElementById("commentaryPanel");
      if (commentaryPanel) commentaryPanel.style.display = "block";
      if (window.Broadcast) {
        const key = Broadcast.startLocalStream(state.game);
        window.discordIntegration.streamKey = key;
        Broadcast.copyWatchLink();
      }
      publishGameState(true);
      setStatus("🔴 Broadcast démarré — lien Watch/OBS dans le presse-papier", "ok");
    };

    const stopStream = () => {
      window.discordIntegration.stopStream();
      if (window.Broadcast) Broadcast.stopLocalStream();
      const user = auth.getUser();
      window.discordIntegration.setCurrentUser(user?.username || "Invité", false);
      setStatus("⏹️ Stream arrêté.", "ok");
    };

    bindBtn("btnStartDiscordStream", startStream);
    bindBtn("btnStreamStop", stopStream);
    bindBtn("btnCopyStreamUrl", () => {
      if (window.Broadcast) Broadcast.copyWatchLink();
      else window.discordIntegration.copyStreamURL();
    });
    bindBtn("btnLeaveSpectator", () => {
      window.discordIntegration.leaveSpectatorMode();
      document.body.classList.remove("spectator-mode");
    });
  }

  // Marquer les boutons déjà branchés par les modules (évite faux « mort »)
  [
    "btnPass", "btnAnalyze", "btnScore", "btnScoreDone", "btnResign", "btnNew",
    "btnClock", "btnSgfExport", "btnSgfImport", "btnUndoPass", "btnApplyGoSetup",
    "btnKataGo", "btnTeaching", "btnReview", "btnAutomatch", "btnBroadcast",
    "btnObsLink", "btnWatchLink", "btnLessonRecord", "btnWebcamToggle",
    "btnInvite", "btnCopy", "btnLogin", "btnLogout"
  ].forEach((id) => {
    const n = document.getElementById(id);
    if (n) {
      try { n.dataset.sbWired = "1"; } catch (_) { /* ignore */ }
    }
  });

})();
