import { Chess } from "../vendor/chess.min.js";

(function() {
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
    chess: new Chess(),
    go: new window.GoGame(19),
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
    antiMisclickGo: true,
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
    goAnalysis: null
  };

  // Objets globaux
  const sounds = new window.BoardSounds();
  const net = new window.Net();
  const platforms = new window.Platforms();
  const analysis = new window.GameAnalysis();
  analysis.initStockfish();
  const clock = new window.GameClock();
  const auth = new window.AuthSystem();
  const invitationSystem = new window.InvitationSystem(auth, net);
  
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

  // Configuration des sons
  if (el.soundOn) {
    el.soundOn.addEventListener("change", (e) => {
      sounds.setEnabled(e.target.checked);
    });
  }
  sounds.init();

  // Initialiser les plateformes
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
  
  function renderChess() {
    let html = '<div class="chess-frame">';
    html += '<div class="ranks">';
    for (let r = 8; r >= 1; r--) {
      html += '<span>' + r + '</span>';
    }
    html += '</div>';
    
    html += '<div class="chess-board">';
    
    const moves = state.selected ? state.chess.moves({ square: state.selected, verbose: true }) : [];
    const legalSquares = new Set(moves.map(m => m.to));
    
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const sq = FILES[file] + (8 - rank);
        const piece = state.chess.get(sq);
        const pieceImg = piece ? PIECES[piece.color + piece.type] : "";
        const isLight = (rank + file) % 2 === 0;
        let cls = "sq " + (isLight ? "light" : "dark");
        
        if (state.selected === sq) cls += " sel";
        if (state.lastMove && (state.lastMove.from === sq || state.lastMove.to === sq)) cls += " last";
        if (state.analysisMove && state.analysisMove.from === sq) cls += " analysis-from";
        if (state.analysisMove && state.analysisMove.to === sq) cls += " analysis-to";
        
        // Coup en attente de confirmation (antimisclic)
        if (state.pendingChessMove && 
            (state.pendingChessMove.from === sq || state.pendingChessMove.to === sq)) {
          cls += " pending";
        }
        
        // Indicateurs de coups légaux
        if (legalSquares.has(sq)) {
          cls += piece ? " legal-capture" : " legal-move";
        }
        if (state.handBrain && piece && piece.color === state.chess.turn()) {
          const hint = state.pieceHint[state.chess.turn()];
          if (hint && piece.type === hint) cls += " hint-piece";
        }
        if (state.chessVariant === "kingOfTheHill" && HILL_SQUARES.indexOf(sq) !== -1) {
          cls += " koth-sq";
        }
        
        html += '<div class="' + cls + '" data-sq="' + sq + '">';
        if (pieceImg) {
          html += '<img src="images/pieces/' + pieceImg + '.svg" class="pc" draggable="true" alt="' + piece.type + '">';
        }
        html += '</div>';
      }
    }
    
    html += '</div>';
    html += '<div class="files">';
    for (let f = 0; f < 8; f++) {
      html += '<span>' + FILES[f] + '</span>';
    }
    html += '</div>';
    html += '</div>';
    
    el.board.innerHTML = html;
    
    // Attacher les événements avec anti-slip
    document.querySelectorAll(".sq").forEach(sq => {
      sq.addEventListener("click", onChessClick);
      sq.addEventListener("mousemove", () => {
        chessLastMouseMove = Date.now();
      });
      
      // Touch events pour mobile (optimisé)
      sq.addEventListener("touchstart", onChessTouchStart, { passive: true });
      sq.addEventListener("touchmove", onChessTouchMove, { passive: true });
      sq.addEventListener("touchend", onChessTouchEnd, { passive: true });
    });
    
    // Drag & Drop (desktop)
    document.querySelectorAll(".pc").forEach(pc => {
      const sq = pc.parentElement;
      pc.addEventListener("dragstart", onDragStart);
      sq.addEventListener("dragover", onDragOver);
      sq.addEventListener("drop", onDrop);
      sq.addEventListener("dragend", onDragEnd);
    });
    
    document.querySelectorAll(".sq").forEach(sq => {
      sq.addEventListener("dragover", onDragOver);
      sq.addEventListener("drop", onDrop);
    });
    
    updateChessStatus();
    updateVariantHud();
  }

  function onDragStart(e) {
    const sq = e.target.parentElement.dataset.sq;
    const piece = state.chess.get(sq);
    
    if (isChessVariantOver() || !piece || piece.color !== state.chess.turn()) {
      e.preventDefault();
      return;
    }
    
    state.draggedPiece = sq;
    e.target.classList.add("dragging-piece");
    
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", sq);
    }
    
    // Afficher les coups légaux
    state.selected = sq;
    setTimeout(() => renderChess(), 0);
  }

  function onDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
  }

  function onDrop(e) {
    e.preventDefault();
    const to = e.currentTarget.dataset.sq;
    if (state.draggedPiece && to) {
      attemptMove(state.draggedPiece, to);
    }
  }

  function onDragEnd(e) {
    e.target.classList.remove("dragging-piece");
    state.draggedPiece = null;
    if (!state.pendingPromotion) {
      state.selected = null;
      renderChess();
    }
  }
  
  // Touch support pour mobile (échecs)
  let chessTouchStart = null;
  let chessTouchStartTime = 0;
  let chessTouchMoved = false;
  
  function vibrateTouch(duration = 10) {
    if (navigator.vibrate) {
      navigator.vibrate(duration);
    }
  }
  
  function onChessTouchStart(e) {
    const sq = e.currentTarget.dataset.sq;
    const piece = state.chess.get(sq);
    
    chessTouchStartTime = Date.now();
    chessTouchMoved = false;
    
    if (piece && piece.color === state.chess.turn()) {
      chessTouchStart = sq;
      state.selected = sq;
      e.currentTarget.querySelector('.pc')?.classList.add('dragging-piece');
      vibrateTouch(10);
      renderChess();
    }
  }
  
  function onChessTouchMove(e) {
    chessTouchMoved = true;
    chessLastMouseMove = Date.now();
  }
  
  function onChessTouchEnd(e) {
    if (chessTouchStart) {
      const sq = e.currentTarget.dataset.sq;
      e.currentTarget.querySelector('.pc')?.classList.remove('dragging-piece');
      
      // Anti-misclick tactile : rejeter si mouvement détecté ou trop rapide
      const touchDuration = Date.now() - chessTouchStartTime;
      
      if (state.antiMisclickChess && chessTouchMoved && touchDuration < 150) {
        sounds.refuse();
        chessTouchStart = null;
        chessTouchMoved = false;
        return;
      }
      
      if (sq !== chessTouchStart) {
        attemptMove(chessTouchStart, sq);
        vibrateTouch(15);
      } else {
        // Clic sur la même case : sélection ou désélection
        vibrateTouch(10);
      }
      
      chessTouchStart = null;
      chessTouchMoved = false;
    }
  }

  function onChessClick(e) {
    const sq = e.currentTarget.dataset.sq;
    
    if (!sq) return;
    if (isChessVariantOver()) return;
    
    // Anti-slip : rejeter si la souris a bougé récemment (si activé)
    if (state.antiMisclickChess) {
      const timeSinceMove = Date.now() - chessLastMouseMove;
      if (timeSinceMove < ANTI_SLIP_DELAY) {
        sounds.refuse();
        setStatus(`⚠️ Souris instable - attendez ${Math.ceil((ANTI_SLIP_DELAY - timeSinceMove) / 100) / 10}s`, "err");
        return;
      }
    }
    
    // Si on clique sur une pièce de notre couleur, annuler le coup en attente et sélectionner la nouvelle pièce
    const piece = state.chess.get(sq);
    if (piece && piece.color === state.chess.turn()) {
      state.selected = sq;
      state.pendingChessMove = null;
      sounds.select();
      renderChess();
      return;
    }
    
    if (!state.selected) {
      // Pas de pièce sélectionnée et clic sur case vide : ignorer
      return;
    } else {
      // Jouer le coup
      if (sq === state.selected) {
        state.selected = null;
        state.pendingChessMove = null;
        renderChess();
        return;
      }
      
      attemptMove(state.selected, sq);
    }
  }

  function attemptMove(from, to) {
    if (isChessVariantOver()) return;
    // Antimisclic pour les échecs (si activé)
    if (state.antiMisclickChess) {
      // Si c'est déjà le coup en attente, confirmer
      if (state.pendingChessMove && 
          state.pendingChessMove.from === from && 
          state.pendingChessMove.to === to) {
        
        // Vérifier si c'est une promotion
        const piece = state.chess.get(from);
        const isPromotion = piece && piece.type === 'p' && 
                            ((piece.color === 'w' && to[1] === '8') || 
                             (piece.color === 'b' && to[1] === '1'));
        
        if (isPromotion) {
          state.pendingPromotion = { from, to };
          state.pendingChessMove = null;
          showPromotionModal();
          return;
        }
        
        state.pendingChessMove = null;
        executeMove(from, to, 'q');
      } else {
        // Nouveau coup : vérifier s'il est légal
        const moves = state.chess.moves({ square: from, verbose: true });
        const isLegal = moves.some(m => m.to === to);
        
        if (isLegal) {
          // Mettre en attente
          state.pendingChessMove = { from, to };
          sounds.select();
          renderChess();
        } else {
          sounds.refuse();
          state.selected = null;
          state.pendingChessMove = null;
          renderChess();
        }
      }
    } else {
      // Mode sans antimisclic
      const piece = state.chess.get(from);
      const isPromotion = piece && piece.type === 'p' && 
                          ((piece.color === 'w' && to[1] === '8') || 
                           (piece.color === 'b' && to[1] === '1'));
      
      if (isPromotion) {
        state.pendingPromotion = { from, to };
        showPromotionModal();
        return;
      }
      
      executeMove(from, to, 'q');
    }
  }

  function executeMove(from, to, promotion = 'q') {
    const move = state.chess.move({
      from: from,
      to: to,
      promotion: promotion
    });
    
    if (move) {
      state.lastMove = move;
      state.analysisMove = null;
      sounds.move();
      state.selected = null;
      if (state.handBrain) {
        const hint = state.pieceHint[move.color];
        const hintLabel = pieceHintLabel(hint);
        const playedLabel = pieceHintLabel(move.piece);
        if (hint && move.piece !== hint) {
          setTimeout(() => {
            setStatus("✋ La main a joué " + playedLabel + " (la tête avait dit " + hintLabel + ")", "ok");
          }, 0);
        }
        state.pieceHint[move.color] = null;
      }
      advancePairSeat(move.color);
      applyVariantAfterMove(move);
      renderChess();
      
      if (clock.type !== "none") {
        clock.switchPlayer();
        updateClockDisplay();
      }
      
      if (state.chess.in_check()) sounds.check();
      if (isChessVariantOver()) {
        sounds.win();
        clock.stop();
      } else if (state.chess.in_checkmate()) {
        sounds.win();
      }
      
      if (net.connected()) {
        net.send({
          type: "chess",
          fen: state.chess.fen(),
          variant: state.chessVariant,
          checks: { w: state.checksGiven.w, b: state.checksGiven.b }
        });
      }
    } else {
      sounds.refuse();
      state.selected = null;
      renderChess();
    }
  }

  function showPromotionModal() {
    el.promotionModal.style.display = "flex";
    
    const buttons = el.promotionModal.querySelectorAll(".promo-btn");
    buttons.forEach(btn => {
      btn.onclick = () => {
        const piece = btn.dataset.piece;
        el.promotionModal.style.display = "none";
        
        if (state.pendingPromotion) {
          executeMove(state.pendingPromotion.from, state.pendingPromotion.to, piece);
          state.pendingPromotion = null;
        }
      };
    });
  }

  function kingSquare(color) {
    const board = state.chess.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === "k" && piece.color === color) {
          return FILES[file] + (8 - rank);
        }
      }
    }
    return null;
  }

  function isKingOnHill(color) {
    const sq = kingSquare(color);
    return !!sq && HILL_SQUARES.indexOf(sq) !== -1;
  }

  function applyVariantAfterMove(move) {
    if (!move) return;
    if (state.chessVariant === "threeCheck" && state.chess.in_check()) {
      state.checksGiven[move.color] += 1;
      if (state.checksGiven[move.color] >= 3) {
        state.variantWinner = move.color;
      }
    }
    if (state.chessVariant === "kingOfTheHill" && isKingOnHill(move.color)) {
      state.variantWinner = move.color;
    }
  }

  function isChessVariantOver() {
    return !!state.variantWinner || state.chess.game_over();
  }

  function variantSideName(color) {
    return color === "w" ? "Les blancs" : "Les noirs";
  }

  function updateVariantHud() {
    const hud = document.getElementById("variantHud");
    if (!hud) return;
    while (hud.firstChild) hud.removeChild(hud.firstChild);
    if (state.game !== "chess" || state.chessVariant === "standard") {
      hud.style.display = "none";
      return;
    }
    hud.style.display = "";
    if (state.chessVariant === "threeCheck") {
      const bar = document.createElement("div");
      bar.className = "checks-bar";
      ["w", "b"].forEach((side) => {
        const wrap = document.createElement("span");
        wrap.appendChild(document.createTextNode(side === "w" ? "Blanc " : "Noir "));
        for (let i = 0; i < 3; i++) {
          const pip = document.createElement("span");
          pip.className = "check-pip" + (i < state.checksGiven[side] ? " on" : "");
          wrap.appendChild(pip);
        }
        bar.appendChild(wrap);
      });
      hud.appendChild(bar);
    } else if (state.chessVariant === "kingOfTheHill") {
      hud.textContent = "Roi de la colline — amenez le roi en d4, d5, e4 ou e5";
    }
  }

  function applyChessVariantFromNet(data) {
    if (data.variant === "standard" || data.variant === "threeCheck" || data.variant === "kingOfTheHill") {
      state.chessVariant = data.variant;
      const sel = document.getElementById("chessVariant");
      if (sel) sel.value = data.variant;
    }
  }

  function updateChessStatus() {
    let status = "";
    let statusClass = "";
    
    if (state.chess.in_checkmate()) {
      status = "⚔️ ÉCHEC ET MAT ! " + (state.chess.turn() === "w" ? "Les noirs" : "Les blancs") + " gagnent !";
      statusClass = "ok";
    } else if (state.variantWinner) {
      if (state.chessVariant === "threeCheck") {
        status = "3️⃣ 3 échecs ! " + variantSideName(state.variantWinner) + " gagnent !";
      } else if (state.chessVariant === "kingOfTheHill") {
        status = "👑 Le roi a conquis la colline ! " + variantSideName(state.variantWinner) + " gagnent !";
      } else {
        status = variantSideName(state.variantWinner) + " gagnent !";
      }
      statusClass = "ok";
    } else if (state.chess.in_draw()) {
      status = "🤝 Partie nulle";
      statusClass = "ok";
    } else if (state.chess.in_stalemate()) {
      status = "🤝 Pat - partie nulle";
      statusClass = "ok";
    } else if (state.chess.in_check()) {
      status = "⚠️ ÉCHEC ! " + (state.chess.turn() === "w" ? "Trait aux Blancs" : "Trait aux Noirs");
      statusClass = "err";
    } else {
      const turn = state.chess.turn() === "w" ? "♔ Trait aux Blancs" : "♚ Trait aux Noirs";
      status = turn;
      statusClass = state.chess.turn() === "w" ? "white" : "black";
    }
    if (state.renchess && !isChessVariantOver()) {
      if (state.handBrain) {
        const side = state.chess.turn();
        const hint = state.pieceHint[side];
        if (!hint) {
          status += " — 🧠 Tête (" + pairName(side, 0) + ") : choisissez une pièce";
        } else {
          status += " — ✋ Main (" + pairName(side, 1) + ") : jouez" +
            (hint ? " (suggestion : " + pieceHintLabel(hint) + ")" : "");
        }
      } else {
        status += " — " + currentPairName(state.chess.turn());
      }
    }
    setStatus(status, statusClass);
    updatePairsUI();
  }

  function startNewChess(opts) {
    opts = opts || {};
    const sel = document.getElementById("chessVariant");
    if (sel && sel.value) state.chessVariant = sel.value;
    state.chess = new Chess();
    state.selected = null;
    state.lastMove = null;
    state.pendingChessMove = null;
    state.pieceHint = { w: null, b: null };
    state.checksGiven = { w: 0, b: 0 };
    state.variantWinner = null;
    state.analysisMove = null;
    resetPairSeats();
    renderChess();
    if (!opts.fromNet && net.connected()) {
      net.send({
        type: "chess",
        fen: state.chess.fen(),
        variant: state.chessVariant,
        checks: { w: 0, b: 0 },
        reset: true
      });
    }
  }

  // ========== GO ==========

  let goCanvas = null;
  let goHover = null;
  let goBlackStone = null;
  let goWhiteStone = null;
  
  // Anti-misclick : la souris/doigt doit être immobile pendant ~300ms avant d'accepter un clic
  let goLastMouseMove = Date.now();
  let goLastTouchMove = Date.now();
  let goTouchStartTime = 0;
  let goTouchHasMoved = false;
  const TOUCH_MIN_DURATION = 100; // durée minimale pour un tap valide (ms)
  
  // Charger les images des pierres
  function loadGoStones() {
    if (!goBlackStone) {
      goBlackStone = new Image();
      goBlackStone.src = 'images/go/black.svg';
    }
    if (!goWhiteStone) {
      goWhiteStone = new Image();
      goWhiteStone.src = 'images/go/white.svg';
    }
  }

  function renderGo() {
    const size = Math.min(el.board.clientWidth || 400, 600);
    
    loadGoStones();
    
    if (!goCanvas) {
      el.board.innerHTML = "";
      goCanvas = document.createElement("canvas");
      goCanvas.className = "go-board";
      goCanvas.width = size;
      goCanvas.height = size;
      el.board.appendChild(goCanvas);
      
      goCanvas.addEventListener("click", onGoClick);
      goCanvas.addEventListener("mousemove", onGoMove);
      goCanvas.addEventListener("mouseleave", () => {
        goHover = null;
        paintGo();
      });
      
      // Touch events optimisés pour mobile (Go)
      goCanvas.addEventListener("touchstart", (e) => {
        e.preventDefault(); // Empêcher le scroll
        goTouchStartTime = Date.now();
        goTouchHasMoved = false;
        goLastTouchMove = Date.now();
        
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent("mousemove", {
          clientX: touch.clientX,
          clientY: touch.clientY
        });
        onGoMove(mouseEvent);
        vibrateTouch(5); // Feedback léger
      }, { passive: false });
      
      goCanvas.addEventListener("touchmove", (e) => {
        e.preventDefault();
        goTouchHasMoved = true;
        goLastTouchMove = Date.now();
        
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent("mousemove", {
          clientX: touch.clientX,
          clientY: touch.clientY
        });
        onGoMove(mouseEvent);
      }, { passive: false });
      
      goCanvas.addEventListener("touchend", (e) => {
        e.preventDefault();
        
        const touchDuration = Date.now() - goTouchStartTime;
        const timeSinceMove = Date.now() - goLastTouchMove;
        
        // Anti-misclick tactile pour Go
        if (state.antiMisclickGo) {
          // Rejeter si :
          // 1. Le doigt a bougé récemment (< 200ms)
          // 2. Ou le tap était trop court (< 80ms) - probablement un glissement accidentel
          if ((goTouchHasMoved && timeSinceMove < 200) || touchDuration < 80) {
            sounds.refuse();
            vibrateTouch(20); // Vibration de refus
            goHover = null;
            paintGo();
            return;
          }
        }
        
        const touch = e.changedTouches[0];
        const mouseEvent = new MouseEvent("click", {
          clientX: touch.clientX,
          clientY: touch.clientY
        });
        onGoClick(mouseEvent);
        
        // Feedback tactile pour confirmation
        if (state.pendingGoMove) {
          vibrateTouch(10);
        } else {
          vibrateTouch(15);
        }
      }, { passive: false });
    } else {
      goCanvas.width = size;
      goCanvas.height = size;
    }
    
    // Attendre que les images soient chargées
    if (goBlackStone.complete && goWhiteStone.complete) {
      paintGo();
    } else {
      goBlackStone.onload = goWhiteStone.onload = () => paintGo();
    }
    updateGoStatus();
    updateCaptureCounters();
  }

  function paintGo() {
    const ctx = goCanvas.getContext("2d");
    const size = goCanvas.width;
    const boardSize = state.go.size;
    const margin = size * 0.07;
    const cellSize = (size - 2 * margin) / (boardSize - 1);
    
    // Fond bois réaliste - couleur plus chaude
    const woodGradient = ctx.createLinearGradient(0, 0, 0, size);
    woodGradient.addColorStop(0, "#e0c080");
    woodGradient.addColorStop(0.2, "#d4b474");
    woodGradient.addColorStop(0.4, "#c9a860");
    woodGradient.addColorStop(0.6, "#d4ad66");
    woodGradient.addColorStop(0.8, "#c9a860");
    woodGradient.addColorStop(1, "#c5a158");
    ctx.fillStyle = woodGradient;
    ctx.fillRect(0, 0, size, size);
    
    // Veines du bois horizontales subtiles (STATIQUE)
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 12; i++) {
      const y = (size / 12) * i + (i * 11) % 40;
      const grad = ctx.createLinearGradient(0, y, 0, y + 25);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(0.5, "#9d7f4a");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, size, 25);
    }
    
    // Texture fine du bois (STATIQUE)
    ctx.globalAlpha = 0.03;
    for (let i = 0; i < size; i += 3) {
      for (let j = 0; j < size; j += 4) {
        const noise = ((i * 7 + j * 13) % 100) / 100;
        if (noise > 0.5) {
          ctx.fillStyle = noise > 0.75 ? "#8b6f47" : "#e5d0a0";
          ctx.fillRect(i, j, 1, ((i + j) % 8) + 1);
        }
      }
    }
    ctx.globalAlpha = 1.0;
    
    // Lignes du plateau (lignes noires fines et nettes)
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = boardSize >= 19 ? 1.0 : 1.2;
    ctx.lineCap = "square";
    
    for (let i = 0; i < boardSize; i++) {
      const pos = margin + i * cellSize;
      
      // Lignes horizontales
      ctx.beginPath();
      ctx.moveTo(margin, pos);
      ctx.lineTo(size - margin, pos);
      ctx.stroke();
      
      // Lignes verticales
      ctx.beginPath();
      ctx.moveTo(pos, margin);
      ctx.lineTo(pos, size - margin);
      ctx.stroke();
    }
    
    // Bordure extérieure épaisse
    ctx.strokeStyle = "#4a3820";
    ctx.lineWidth = 4;
    const borderOffset = 2;
    ctx.strokeRect(
      margin - borderOffset, 
      margin - borderOffset, 
      (boardSize - 1) * cellSize + borderOffset * 2, 
      (boardSize - 1) * cellSize + borderOffset * 2
    );
    
    // Coordonnées du goban
    if (el.showCoords && el.showCoords.checked) {
      ctx.fillStyle = "#2a2a2a";
      ctx.font = `bold ${Math.max(10, cellSize * 0.35)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      
      const letters = "ABCDEFGHJKLMNOPQRST"; // Pas de 'I' dans les coordonnées Go
      
      // Coordonnées horizontales (lettres)
      for (let i = 0; i < boardSize; i++) {
        const x = margin + i * cellSize;
        ctx.fillText(letters[i], x, margin * 0.4);
        ctx.fillText(letters[i], x, size - margin * 0.4);
      }
      
      // Coordonnées verticales (chiffres)
      for (let i = 0; i < boardSize; i++) {
        const y = margin + i * cellSize;
        const num = boardSize - i;
        ctx.fillText(num.toString(), margin * 0.4, y);
        ctx.fillText(num.toString(), size - margin * 0.4, y);
      }
    }
    
    // Points de repère (hoshi)
    drawHoshiPoints(ctx, boardSize, margin, cellSize);
    paintGoHintZones(ctx, boardSize, margin, cellSize, cellSize * 0.47);
    
    // Pierres 3D
    const stoneRadius = cellSize * 0.47;
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const color = state.go.at(x, y);
        if (color > 0) {
          const px = margin + x * cellSize;
          const py = margin + y * cellSize;
          
          drawStone(ctx, px, py, stoneRadius, color);
          
          // Marquer le dernier coup
          if (state.lastGoMove && state.lastGoMove.x === x && state.lastGoMove.y === y) {
            ctx.fillStyle = color === 1 ? "#fff" : "#000";
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.arc(px, py, stoneRadius * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
          }
        }
      }
    }
    
    paintGoAnalysisOverlay(ctx, boardSize, margin, cellSize, stoneRadius);

    // Pierre en attente de confirmation (antimisclic)
    if (state.pendingGoMove) {
      const px = margin + state.pendingGoMove.x * cellSize;
      const py = margin + state.pendingGoMove.y * cellSize;
      const previewImg = state.go.turn === 1 ? goBlackStone : goWhiteStone;
      
      if (previewImg && previewImg.complete) {
        // Pierre semi-transparente
        ctx.save();
        ctx.globalAlpha = 0.65;
        const previewSize = stoneRadius * 2;
        ctx.drawImage(previewImg, px - stoneRadius, py - stoneRadius, previewSize, previewSize);
        ctx.restore();
        
        // Cercle clignotant autour pour indiquer qu'il faut cliquer à nouveau
        ctx.strokeStyle = state.go.turn === 1 ? "#ffffff" : "#000000";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(px, py, stoneRadius * 1.15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    
    // Pierre de prévisualisation au survol (seulement si pas de pierre en attente)
    if (!state.pendingGoMove && goHover && state.go.inBounds(goHover.x, goHover.y) && !state.scoringMode) {
      const illegal = state.go.whyIllegal(goHover.x, goHover.y);
      const px = margin + goHover.x * cellSize;
      const py = margin + goHover.y * cellSize;
      
      if (illegal) {
        // Croix rouge pour coup illégal
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = "#cc0000";
        ctx.lineWidth = 3;
        const crossSize = stoneRadius * 0.6;
        ctx.beginPath();
        ctx.moveTo(px - crossSize, py - crossSize);
        ctx.lineTo(px + crossSize, py + crossSize);
        ctx.moveTo(px + crossSize, py - crossSize);
        ctx.lineTo(px - crossSize, py + crossSize);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      } else {
        // Image très légère pour le survol
        const previewImg = state.go.turn === 1 ? goBlackStone : goWhiteStone;
        if (previewImg && previewImg.complete) {
          ctx.save();
          ctx.globalAlpha = 0.3;
          const previewSize = stoneRadius * 2;
          ctx.drawImage(previewImg, px - stoneRadius, py - stoneRadius, previewSize, previewSize);
          ctx.restore();
        }
      }
    }
  }

  function drawHoshiPoints(ctx, boardSize, margin, cellSize) {
    let hoshi = [];
    
    if (boardSize === 19) {
      hoshi = [3, 9, 15];
    } else if (boardSize === 13) {
      hoshi = [3, 6, 9];
    } else if (boardSize === 9) {
      hoshi = [4];
    }
    
    const hoshiRadius = boardSize >= 19 ? 4 : 3.5;
    
    for (const x of hoshi) {
      for (const y of hoshi) {
        const px = margin + x * cellSize;
        const py = margin + y * cellSize;
        
        // Point noir avec petit dégradé pour effet 3D
        const grad = ctx.createRadialGradient(px - 0.5, py - 0.5, 0, px, py, hoshiRadius);
        grad.addColorStop(0, "#2a2a2a");
        grad.addColorStop(1, "#000000");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, hoshiRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawStone(ctx, px, py, radius, color) {
    const stoneImg = color === 1 ? goBlackStone : goWhiteStone;
    const size = radius * 2;
    
    if (stoneImg && stoneImg.complete) {
      ctx.save();
      ctx.drawImage(stoneImg, px - radius, py - radius, size, size);
      ctx.restore();
    }
  }

  function getGoCoords(event) {
    const rect = goCanvas.getBoundingClientRect();
    
    // Position de la souris/doigt relative au canvas (en pixels d'affichage)
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Taille du canvas à l'écran
    const displayWidth = rect.width;
    const displayHeight = rect.height;
    
    // Taille interne du canvas
    const canvasWidth = goCanvas.width;
    const canvasHeight = goCanvas.height;
    
    // Convertir les coordonnées d'affichage en coordonnées canvas internes
    const x = (mouseX / displayWidth) * canvasWidth;
    const y = (mouseY / displayHeight) * canvasHeight;
    
    // Paramètres de la grille (doivent correspondre à paintGo)
    const boardSize = state.go.size;
    const margin = canvasWidth * 0.07;
    const cellSize = (canvasWidth - 2 * margin) / (boardSize - 1);
    
    // Calculer les coordonnées de grille brutes
    const rawGx = (x - margin) / cellSize;
    const rawGy = (y - margin) / cellSize;
    
    const gx = Math.round(rawGx);
    const gy = Math.round(rawGy);
    
    // Zone tactile élargie pour mobile : tolérance augmentée
    // Détection d'appareil tactile
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const tolerance = isTouchDevice ? 0.45 : 0.35; // Plus tolérant sur tactile
    
    // Vérifier la distance à l'intersection la plus proche
    const distX = Math.abs(rawGx - gx);
    const distY = Math.abs(rawGy - gy);
    
    // Si trop loin de l'intersection, retourner des coordonnées invalides
    if (distX > tolerance || distY > tolerance) {
      return {x: -1, y: -1};
    }
    
    return {x: gx, y: gy};
  }

  function onGoMove(event) {
    // Enregistrer le moment du dernier mouvement de souris (anti-slip)
    goLastMouseMove = Date.now();
    
    // Mettre à jour la prévisualisation
    const coords = getGoCoords(event);
    if (coords.x !== goHover?.x || coords.y !== goHover?.y) {
      goHover = coords;
      paintGo();
    }
  }

  function onGoClick(event) {
    const coords = getGoCoords(event);
    
    if (!state.go.inBounds(coords.x, coords.y)) return;
    
    // Anti-slip : rejeter si la souris/doigt a bougé récemment (si activé)
    if (state.antiMisclickGo) {
      // Utiliser le dernier mouvement détecté (souris ou tactile)
      const lastMove = Math.max(goLastMouseMove, goLastTouchMove);
      const timeSinceMove = Date.now() - lastMove;
      
      if (timeSinceMove < ANTI_SLIP_DELAY) {
        sounds.refuse();
        vibrateTouch(20); // Feedback tactile de refus
        const waitTime = Math.ceil((ANTI_SLIP_DELAY - timeSinceMove) / 100) / 10;
        setStatus(`⚠️ Mouvement détecté - attendez ${waitTime}s`, "err");
        return;
      }
    }
    
    // Antimisclic : premier clic = prévisualisation, deuxième clic = confirmation (si activé)
    if (state.antiMisclickGo) {
      // Si on clique sur la pierre en attente, on confirme
      if (state.pendingGoMove && 
          state.pendingGoMove.x === coords.x && 
          state.pendingGoMove.y === coords.y) {
        
        // Confirmer le coup
        const success = state.go.play(coords.x, coords.y);
        
        if (success) {
          applyLocalGoMove(coords);
        } else {
          sounds.refuse();
          state.pendingGoMove = null;
          paintGo();
        }
      } else {
        // Nouveau clic : vérifier si légal et mettre en attente
        const illegal = state.go.whyIllegal(coords.x, coords.y);
        
        if (illegal) {
          sounds.refuse();
          const reason = state.go.whyIllegal(coords.x, coords.y);
          setStatus(reason || "Coup illégal", "err");
          state.pendingGoMove = null;
        } else {
          // Mettre en attente (prévisualisation)
          state.pendingGoMove = coords;
          sounds.select(); // Son doux de sélection
        }
        
        paintGo();
      }
    } else {
      // Mode sans antimisclic (ancien comportement)
      const success = state.go.play(coords.x, coords.y);
      
      if (success) {
        applyLocalGoMove(coords);
      } else {
        sounds.refuse();
        const reason = state.go.whyIllegal(coords.x, coords.y);
        setStatus(reason || "Coup illégal", "err");
      }
    }
  }

  function applyLocalGoMove(coords) {
    const playedSide = goPlayedSide();
    state.goAnalysis = null;
    if (state.handBrain && state.rengo) {
      const hint = state.goHint[playedSide];
      if (hint) {
        const followed = goMoveMatchesHint(coords.x, coords.y, hint, state.lastGoMove);
        const hintLabel = goHintLabel(hint);
        setTimeout(() => {
          setStatus(
            followed
              ? "✋ La main a suivi « " + hintLabel + " »"
              : "✋ La main a joué ailleurs (la tête avait dit « " + hintLabel + " »)",
            "ok"
          );
        }, 0);
      }
      state.goHint[playedSide] = null;
    }
    state.lastGoMove = coords;
    state.pendingGoMove = null;
    sounds.move();
    advancePairSeat(playedSide);
    paintGo();
    updateGoStatus();
    updateCaptureCounters();
    if (clock.type !== "none") {
      clock.switchPlayer();
      updateClockDisplay();
    }
    if (net.connected()) {
      net.send({ type: "go", x: coords.x, y: coords.y });
    }
  }

  function updateGoStatus() {
    if (state.go.over) {
      const analysis = state.go.analyze();
      const blackScore = analysis.jp[1];
      const whiteScore = analysis.jp[2];
      const winner = blackScore > whiteScore ? "Noir" : "Blanc";
      setStatus("🏆 Partie terminée ! " + winner + " gagne - Noir: " + blackScore.toFixed(1) + ", Blanc: " + whiteScore.toFixed(1), "ok");
    } else {
      const turn = state.go.turn === 1 ? "● Trait au Noir" : "○ Trait au Blanc";
      const statusClass = state.go.turn === 1 ? "black" : "white";
      let text = turn;
      if (state.rengo && state.handBrain) {
        const side = goToMoveSide();
        const hint = state.goHint[side];
        if (!hint) {
          text += " — 🧠 Tête (" + pairName(side, 0) + ") : choisissez une zone";
        } else {
          text += " — ✋ Main (" + pairName(side, 1) + ") : jouez (suggestion : " + goHintLabel(hint) + ")";
        }
      } else if (state.rengo) {
        text += " — " + currentPairName(goToMoveSide());
      }
      setStatus(text, statusClass);
    }
    updatePairsUI();
  }

  function updateCaptureCounters() {
    if (!el.captureCounters) return;
    el.captureCounters.innerHTML = `
      <div class="capture-count">
        <span class="stone black"></span>
        <span>Noir : ${state.go.captures[1]} captures</span>
      </div>
      <div class="capture-count">
        <span class="stone white"></span>
        <span>Blanc : ${state.go.captures[2]} captures</span>
      </div>
    `;
  }

  function startNewGo() {
    const rawSize = parseInt(el.goSize.value, 10);
    const size = [9, 13, 19].includes(rawSize) ? rawSize : 19;
    const komi = window.SecurityManager
      ? SecurityManager.clampNumber(el.komi.value, 0, 20, 6.5)
      : 6.5;

    state.go = new window.GoGame(size);
    state.go.komi = komi;
    state.lastGoMove = null;
    state.pendingGoMove = null;
    state.goHint = { w: null, b: null };
    state.goAnalysis = null;
    state.scoringMode = false;
    goCanvas = null;
    resetPairSeats();
    renderGo();
  }

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
      state.antiMisclickGo = e.target.checked;
      setStatus(e.target.checked ? "✓ Anti-misclick Go activé" : "⚠️ Anti-misclick Go désactivé", e.target.checked ? "ok" : "err");
    });
  }

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
      if (!state.rengo) {
        state.handBrain = false;
        const hb = document.getElementById("handBrainCheck");
        if (hb) hb.checked = false;
        state.goHint = { w: null, b: null };
      }
      resetPairSeats();
      updateGoStatus();
      setStatus(e.target.checked ? "👥 Rengo activé (2 vs 2, alternance obligatoire)" : "Rengo désactivé", "ok");
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
      if (state.chess.history().length > 0 || state.variantWinner) {
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

  function switchGame(game) {
    state.game = game;
    state.selected = null;
    
    el.btnChess.classList.toggle("on", game === "chess");
    el.btnGo.classList.toggle("on", game === "go");
    el.btnPass.style.display = game === "go" ? "" : "none";
    el.goControls.style.display = game === "go" ? "flex" : "none";
    el.captureCounters.style.display = game === "go" ? "flex" : "none";
    el.btnScore.style.display = game === "go" ? "" : "none";
    
    // Afficher/masquer les contrôles anti-misclick selon le jeu
    el.antiMisclickChess.style.display = game === "chess" ? "" : "none";
    el.antiMisclickGo.style.display = game === "go" ? "" : "none";
    const chessVariantSel = document.getElementById("chessVariant");
    if (chessVariantSel) chessVariantSel.style.display = game === "chess" ? "" : "none";
    const renchessWrap = document.getElementById("renchessWrap");
    if (renchessWrap) renchessWrap.style.display = game === "chess" ? "" : "none";
    const handBrainWrap = document.getElementById("handBrainWrap");
    if (handBrainWrap) {
      handBrainWrap.style.display = isHandBrainToggleVisible() ? "" : "none";
    }
    updatePairsUI();
    render();
    updateVariantHud();
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

  function goToMoveSide() {
    return state.go.turn === 1 ? "b" : "w";
  }

  function goPlayedSide() {
    return state.go.turn === 1 ? "w" : "b";
  }

  function goCornerDepth(size) {
    if (size <= 9) return 3;
    if (size <= 13) return 4;
    return 6;
  }

  function classifyGoPoint(x, y, size) {
    const d = goCornerDepth(size);
    const nearX = x < d || x >= size - d;
    const nearY = y < d || y >= size - d;
    if (nearX && nearY) return "coin";
    if (nearX || nearY) return "bord";
    return "centre";
  }

  function isGoResponse(x, y, lastMove) {
    if (!lastMove) return false;
    const dist = Math.max(Math.abs(x - lastMove.x), Math.abs(y - lastMove.y));
    return dist >= 1 && dist <= 2;
  }

  function goMoveMatchesHint(x, y, hint, lastMove) {
    if (hint === "reponse") return isGoResponse(x, y, lastMove);
    return classifyGoPoint(x, y, state.go.size) === hint;
  }

  function goHintLabel(type) {
    const found = GO_HINTS.find((p) => p.type === type);
    return found ? found.label : "";
  }

  function paintGoHintZones(ctx, boardSize, margin, cellSize, stoneRadius) {
    if (!isHandBrainActive() || state.game !== "go") return;
    const hint = state.goHint[goToMoveSide()];
    if (!hint) return;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = hint === "reponse" ? "#4a9eff" : "#2e7d32";
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        if (state.go.at(x, y) !== 0) continue;
        if (!goMoveMatchesHint(x, y, hint, state.lastGoMove)) continue;
        const px = margin + x * cellSize;
        const py = margin + y * cellSize;
        ctx.beginPath();
        ctx.arc(px, py, stoneRadius * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function paintGoAnalysisOverlay(ctx, boardSize, margin, cellSize, stoneRadius) {
    const overlay = state.goAnalysis;
    if (!overlay || !overlay.owner) return;
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const px = margin + x * cellSize;
        const py = margin + y * cellSize;
        if (overlay.deadMap && overlay.deadMap[y][x]) {
          ctx.save();
          ctx.strokeStyle = "#c62828";
          ctx.lineWidth = Math.max(2, stoneRadius * 0.28);
          const s = stoneRadius * 0.45;
          ctx.beginPath();
          ctx.moveTo(px - s, py - s);
          ctx.lineTo(px + s, py + s);
          ctx.moveTo(px + s, py - s);
          ctx.lineTo(px - s, py + s);
          ctx.stroke();
          ctx.restore();
          continue;
        }
        if (state.go.at(x, y) !== 0) continue;
        const who = overlay.owner[y][x];
        if (!who) continue;
        ctx.fillStyle = who === 1 ? "rgba(20, 20, 20, 0.38)" : "rgba(255, 255, 255, 0.62)";
        const mark = stoneRadius * 0.36;
        ctx.fillRect(px - mark / 2, py - mark / 2, mark, mark);
      }
    }
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

  function pieceHintLabel(type) {
    const found = PIECE_HINTS.find((p) => p.type === type);
    return found ? found.label : "";
  }

  function choosePieceHint(type) {
    if (!state.handBrain || state.game !== "chess" || isChessVariantOver()) return;
    const side = state.chess.turn();
    state.pieceHint[side] = type;
    sounds.select();
    if (net.connected()) {
      net.send({ type: "piece-hint", piece: type, color: side });
    }
    updateChessStatus();
    renderChess();
  }

  function chooseGoHint(type) {
    if (!isHandBrainActive() || state.game !== "go" || state.go.over) return;
    if (!GO_HINTS.some((h) => h.type === type)) return;
    const side = goToMoveSide();
    state.goHint[side] = type;
    sounds.select();
    if (net.connected()) {
      net.send({ type: "go-hint", zone: type, color: side });
    }
    updateGoStatus();
    if (goCanvas) paintGo();
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
      ? state.chess.turn()
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
    const side = state.game === "go" ? goToMoveSide() : state.chess.turn();
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

  function setStatus(text, type = "") {
    el.status.textContent = text;
    el.status.className = "status " + type;
  }

  // Événements des boutons
  el.btnChess.addEventListener("click", () => switchGame("chess"));
  el.btnGo.addEventListener("click", () => switchGame("go"));
  
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

  el.btnPass.addEventListener("click", () => {
    if (state.game === "go" && !state.go.over) {
      const passSuccess = state.go.pass();
      
      if (passSuccess) {
        const playedSide = goPlayedSide();
        state.goAnalysis = null;
        if (state.handBrain) state.goHint[playedSide] = null;
        sounds.move();
        advancePairSeat(playedSide);
        
        if (state.go.passCount === 1) {
          setStatus("⚪ Pass ! Un joueur a passé son tour (1/2)", "ok");
        } else if (state.go.over) {
          setStatus("🏁 Partie terminée ! Deux pass consécutifs. Cliquez sur 'Score' pour voir le résultat.", "ok");
        }
        
        // Changer l'horloge
        if (clock.type !== "none") {
          clock.switchPlayer();
          updateClockDisplay();
        }
        
        renderGo();
        updateGoStatus();
        
        if (net.connected()) {
          net.send({ type: "pass" });
        }
      }
    }
  });

  el.btnScore.addEventListener("click", () => {
    if (state.go.over) {
      const goAnalysis = analysis.analyzeGo(state.go);
      state.goAnalysis = goAnalysis.raw;
      paintGo();
      showAnalysisPanel("Score final — Go", goAnalysis.details);
    } else {
      setStatus("Passez deux fois de suite pour terminer, puis comptez.", "err");
    }
  });

  el.btnResign.addEventListener("click", () => {
    if (confirm("Abandonner la partie ?")) {
      if (state.game === "chess") {
        setStatus("Partie abandonnée", "err");
      } else {
        state.go.resign(state.go.turn);
        updateGoStatus();
      }
      
      if (net.connected()) {
        net.send({ type: "resign" });
      }
    }
  });

  function uciToSquares(uci) {
    if (!uci || uci.length < 4) return null;
    return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
  }

  function pvToSan(fen, uciMoves) {
    try {
      const tmp = new Chess();
      if (!tmp.load(fen)) return (uciMoves || []).join(" ");
      const sans = [];
      (uciMoves || []).slice(0, 6).forEach((uci) => {
        const moved = tmp.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci[4] || "q"
        });
        if (moved) sans.push(moved.san);
      });
      return sans.join(" ") || (uciMoves || []).join(" ");
    } catch (e) {
      return (uciMoves || []).join(" ");
    }
  }

  function showAnalysisPanel(title, text) {
    const panel = document.getElementById("analysisPanel");
    const titleEl = document.getElementById("analysisTitle");
    const body = document.getElementById("analysisBody");
    if (titleEl) titleEl.textContent = title;
    if (body) body.textContent = text;
    if (panel) panel.style.display = "block";
  }

  el.btnAnalyze.addEventListener("click", () => {
    if (state.game === "chess") {
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
      const goAnalysis = analysis.analyzeGo(state.go);
      state.goAnalysis = goAnalysis.raw;
      paintGo();
      showAnalysisPanel("Analyse Go", goAnalysis.details);
      setStatus("✅ Analyse Go — " + goAnalysis.score.winner, "ok");
    }
  });

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
      net.init();
      net.onStatus = setStatus;
      net.onMessage = onNetMessage;
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

  function onNetMessage(data) {
    if (!data || typeof data !== 'object') return;
    try {
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
        const applied = applyRemoteChessFen(data.fen);
        if (!applied.ok) {
          sounds.refuse();
          setStatus("Coup réseau refusé (position invalide)", "err");
          return;
        }
        if (applied.moved) {
          if (state.handBrain) state.pieceHint[applied.move.color] = null;
          advancePairSeat(applied.move.color);
          applyVariantAfterMove(applied.move);
          if (isChessVariantOver()) clock.stop();
        }
        state.selected = null;
        state.pendingChessMove = null;
        renderChess();
      } else if (data.type === "go" && state.game === "go") {
        const played = state.go.play(data.x, data.y);
        if (!played) {
          sounds.refuse();
          setStatus("Coup Go réseau refusé", "err");
          return;
        }
        const playedSide = goPlayedSide();
        if (state.handBrain) state.goHint[playedSide] = null;
        advancePairSeat(playedSide);
        state.lastGoMove = {x: data.x, y: data.y};
        renderGo();
        updateGoStatus();
        updateCaptureCounters();
      } else if (data.type === "pass" && state.game === "go") {
        if (!state.go.pass()) return;
        const playedSide = goPlayedSide();
        if (state.handBrain) state.goHint[playedSide] = null;
        advancePairSeat(playedSide);
        renderGo();
        updateGoStatus();
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
            if (goCanvas) paintGo();
          }
        }
      } else if (data.type === "resign") {
        setStatus("L'adversaire a abandonné !", "ok");
        if (state.game === "go") {
          state.go.resign(state.go.turn);
        }
      }
    } catch (error) {
      console.warn('Message réseau ignoré:', error);
    }
  }

  function normalizeFen(fen) {
    return String(fen || '').split(' ').slice(0, 4).join(' ');
  }

  function applyRemoteChessFen(fen) {
    if (typeof fen !== 'string' || fen.length > 128) return { ok: false };
    try {
      const next = new Chess();
      if (!next.load(fen)) return { ok: false };
      const target = normalizeFen(next.fen());
      if (normalizeFen(state.chess.fen()) === target) {
        return { ok: true, moved: false };
      }
      const moves = state.chess.moves({ verbose: true });
      for (let i = 0; i < moves.length; i++) {
        const clone = new Chess(state.chess.fen());
        if (clone.move(moves[i]) && normalizeFen(clone.fen()) === target) {
          state.chess.load(next.fen());
          return { ok: true, moved: true, move: moves[i] };
        }
      }
      return { ok: false };
    } catch (e) {
      return { ok: false };
    }
  }

  let lastCreatedInvitation = null;

  // Surveiller l'ID de connexion
  net.onReady = function () {
    if (el.inviteUrl && lastCreatedInvitation) {
      el.inviteUrl.value = generateInviteLink(lastCreatedInvitation);
    }
  };

  // Rejoindre une partie si host dans l'URL
  const params = new URLSearchParams(window.location.search);
  const hostId = params.get("host");
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const roomToken = params.get("t") || hashParams.get("t");
  if (hostId) {
    state.mode = "online";
    net.onStatus = setStatus;
    net.onMessage = onNetMessage;
    net.join(hostId, roomToken);
  }
  
  const gameParam = params.get("g");
  if (gameParam === "go") {
    switchGame("go");
  }

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
    // Go
    'go-quick': { type: 'byoyomi', mainMinutes: 10, byoyomiSeconds: 30, periods: 3 },
    'go-standard': { type: 'byoyomi', mainMinutes: 20, byoyomiSeconds: 30, periods: 5 },
    'go-long': { type: 'byoyomi', mainMinutes: 45, byoyomiSeconds: 60, periods: 5 },
    'go-canadian': { type: 'canadian', mainMinutes: 30, periodMinutes: 5, stones: 25 }
  };
  
  function updateClockDisplay() {
    const clockState = clock.getState();
    
    // Afficher les temps
    el.clockWhite.querySelector('.clock-time').textContent = clockState.times[0];
    el.clockBlack.querySelector('.clock-time').textContent = clockState.times[1];
    
    // Afficher les infos supplémentaires
    el.clockWhite.querySelector('.clock-extra').textContent = clockState.extras[0];
    el.clockBlack.querySelector('.clock-extra').textContent = clockState.extras[1];
    
    // Mettre en surbrillance le joueur actif
    el.clockWhite.classList.toggle('active', clockState.currentPlayer === 0 && clockState.running);
    el.clockBlack.classList.toggle('active', clockState.currentPlayer === 1 && clockState.running);
    
    // Alerte temps faible (< 20 secondes)
    const whiteTime = clock.mainTime[0];
    const blackTime = clock.mainTime[1];
    el.clockWhite.classList.toggle('low-time', whiteTime < 20000 && whiteTime > 0);
    el.clockBlack.classList.toggle('low-time', blackTime < 20000 && blackTime > 0);
  }
  
  function applyClockConfig() {
    const type = el.clockType.value;
    
    clock.reset();
    
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
    
    // Démarrer l'horloge pour le bon joueur
    const startPlayer = (state.game === "chess") ? 
      (state.chess.turn() === 'w' ? 0 : 1) : 
      (state.go.turn === 1 ? 0 : 1);
    clock.start(startPlayer);
    
    el.clockModal.style.display = "none";
    
    const typeNames = {
      'simple': 'Simple',
      'fischer': 'Fischer',
      'byoyomi': 'Byoyomi',
      'canadian': 'Canadienne'
    };
    setStatus(`✓ Horloge ${typeNames[type]} activée`, "ok");
  }
  
  el.btnClock.addEventListener("click", () => {
    el.clockModal.style.display = "flex";
  });
  
  el.btnClockCancel.addEventListener("click", () => {
    el.clockModal.style.display = "none";
  });
  
  // Bouton désactiver horloge
  document.getElementById("btnDisableClock").addEventListener("click", () => {
    clock.reset();
    clock.type = "none";
    el.clockDisplay.style.display = "none";
    el.clockModal.style.display = "none";
    setStatus("⏱️ Horloge désactivée", "ok");
  });
  
  // Gestion des presets
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const presetName = btn.dataset.preset;
      const preset = clockPresets[presetName];
      
      if (!preset) return;
      
      // Appliquer le preset
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
      
      // Appliquer immédiatement
      applyClockConfig();
    });
  });
  
  el.clockType.addEventListener("change", (e) => {
    // Afficher les bons champs selon le type
    document.getElementById("clockConfigSimple").style.display = e.target.value === "simple" ? "block" : "none";
    document.getElementById("clockConfigFischer").style.display = e.target.value === "fischer" ? "block" : "none";
    document.getElementById("clockConfigByoyomi").style.display = e.target.value === "byoyomi" ? "block" : "none";
    document.getElementById("clockConfigCanadian").style.display = e.target.value === "canadian" ? "block" : "none";
  });
  
  el.btnClockOk.addEventListener("click", applyClockConfig);

  // ========== INVITATIONS ==========
  
  let currentInvitation = null;
  let selectedCounterClock = null;
  
  // Afficher une notification
  function showNotification(text, type = 'info') {
    const notif = document.getElementById('inviteNotification');
    const content = notif.querySelector('.notification-content');
    const textEl = document.getElementById('notificationText');
    
    textEl.textContent = text;
    content.className = 'notification-content ' + type;
    notif.style.display = 'block';
    
    // Auto-masquer après 5 secondes
    setTimeout(() => {
      notif.style.display = 'none';
    }, 5000);
  }
  
  document.getElementById('btnCloseNotif').addEventListener('click', () => {
    document.getElementById('inviteNotification').style.display = 'none';
  });
  
  // Créer et envoyer une invitation
  document.getElementById('btnInvite').addEventListener('click', () => {
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
      net.onStatus = setStatus;
      net.onMessage = onNetMessage;
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
    if (net.id) url.searchParams.set('host', net.id);
    url.searchParams.set('g', invitation.gameType === 'go' ? 'go' : 'chess');
    if (net.roomToken) url.hash = 't=' + net.roomToken;
    if (state.handBrain) url.searchParams.set('hb', '1');
    return url.toString();
  }
  
  // Copier le lien d'invitation
  document.getElementById('btnCopy').addEventListener('click', () => {
    const inviteUrl = document.getElementById('inviteUrl');
    if (inviteUrl.value) {
      inviteUrl.select();
      document.execCommand('copy');
      showNotification('✓ Lien copié dans le presse-papiers !', 'success');
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
    document.getElementById(btnId).addEventListener('click', () => {
      const inviteUrl = document.getElementById('inviteUrl').value;
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
  document.getElementById('btnAcceptInvite').addEventListener('click', () => {
    if (!currentInvitation) return;
    
    document.getElementById('invitationModal').style.display = 'none';
    
    // Appliquer la configuration du jeu
    switchGame(currentInvitation.gameType);
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
  document.getElementById('btnRejectInvite').addEventListener('click', () => {
    document.getElementById('invitationModal').style.display = 'none';
    showNotification('Invitation refusée', 'info');
    currentInvitation = null;
  });
  
  // Ouvrir le modal de contre-proposition
  document.getElementById('btnCounterInvite').addEventListener('click', () => {
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
  document.getElementById('btnSendCounter').addEventListener('click', () => {
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
  document.getElementById('btnCancelCounter').addEventListener('click', () => {
    document.getElementById('counterModal').style.display = 'none';
    selectedCounterClock = null;
    // Revenir à l'invitation
    if (currentInvitation) {
      document.getElementById('invitationModal').style.display = 'flex';
    }
  });

  // Démarrage initial
  switchGame("chess");

  // === SYSTÈME DE COMMENTAIRES DISCORD ===
  
  // Initialiser le système de commentaires si Discord est disponible
  if (window.discordIntegration) {
    window.discordIntegration.initCommentarySystem();
    
    // Définir l'utilisateur actuel
    const username = auth.getUser()?.username || 'Invité';
    window.discordIntegration.setCurrentUser(username, false);
    
    // Quand l'utilisateur se connecte, mettre à jour
    window.addEventListener('userLogin', (event) => {
      if (event.detail.username) {
        window.discordIntegration.setCurrentUser(event.detail.username, false);
      }
    });

    // Écouter les commentaires entrants (pour les spectateurs)
    window.addEventListener('commentReceived', (event) => {
      const comment = event.detail;
      window.discordIntegration.receiveComment(comment);
    });
    
    const startStream = () => {
      window.discordIntegration.startStream(state.game);
      const user = auth.getUser();
      window.discordIntegration.setCurrentUser(user?.username || 'Invité', true);
      const commentaryPanel = document.getElementById('commentaryPanel');
      if (commentaryPanel) commentaryPanel.style.display = 'block';
      setStatus('🔴 Stream démarré ! Les spectateurs peuvent vous rejoindre.', 'ok');
    };

    const stopStream = () => {
      window.discordIntegration.stopStream();
      const user = auth.getUser();
      window.discordIntegration.setCurrentUser(user?.username || 'Invité', false);
      setStatus('⏹️ Stream arrêté.', 'ok');
    };

    const bind = (id, fn) => {
      const node = document.getElementById(id);
      if (node) node.addEventListener('click', fn);
    };

    bind('btnStartDiscordStream', startStream);
    bind('btnStreamStop', stopStream);
    bind('btnCopyStreamUrl', () => window.discordIntegration.copyStreamURL());
    bind('btnLeaveSpectator', () => window.discordIntegration.leaveSpectatorMode());

    window.addEventListener('movePlay', (event) => {
      if (window.discordIntegration.isStreaming) {
        window.discordIntegration.commentMove(event.detail, state.game);
      }
    });
  }
  
})();
