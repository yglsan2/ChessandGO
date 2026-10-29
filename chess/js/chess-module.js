import { Chess } from "../../vendor/chess.min.js";

export function createChessModule(ctx) {
  const state = ctx.state;
  const el = ctx.el;
  const net = ctx.net;
  const sounds = ctx.sounds;
  const clock = ctx.clock;
  const analysis = ctx.analysis;

  function setStatus(...args) { if (ctx.api.setStatus) return ctx.api.setStatus(...args); }
  function resetPairSeats(...args) { if (ctx.api.resetPairSeats) return ctx.api.resetPairSeats(...args); }
  function advancePairSeat(...args) { if (ctx.api.advancePairSeat) return ctx.api.advancePairSeat(...args); }
  function updateClockDisplay(...args) { if (ctx.api.updateClockDisplay) return ctx.api.updateClockDisplay(...args); }
  function updatePairsUI(...args) { if (ctx.api.updatePairsUI) return ctx.api.updatePairsUI(...args); }
  function pairName(...args) { return ctx.api.pairName ? ctx.api.pairName(...args) : ""; }
  function currentPairName(...args) { return ctx.api.currentPairName ? ctx.api.currentPairName(...args) : ""; }
  function isHandBrainActive(...args) { return ctx.api.isHandBrainActive ? ctx.api.isHandBrainActive(...args) : false; }
  function isPairsMode(...args) { return ctx.api.isPairsMode ? ctx.api.isPairsMode(...args) : false; }
  function showAnalysisPanel(...args) { if (ctx.api.showAnalysisPanel) return ctx.api.showAnalysisPanel(...args); }

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
  // Anti-misclick
  const ANTI_SLIP_DELAY = 300; // millisecondes
  let chessLastMouseMove = Date.now();
  let chessTouchLastSq = null;
  let chessRatedRecorded = false;

  function teachingDisplayChess() {
    const sess = state._chessTeachingSession;
    if (sess && sess.enabled && sess.mode === "control") {
      const fen = state._chessTeachDisplayFen || sess.displayFen(state.chess);
      try {
        return new Chess(fen);
      } catch (_) {}
    }
    return state.chess;
  }

  function colorHex(id) {
    if (window.TeachingMarks && TeachingMarks.colorHex) return TeachingMarks.colorHex(id);
    const map = {
      red: "#e53935", blue: "#1e88e5", green: "#43a047", orange: "#fb8c00",
      purple: "#8e24aa", yellow: "#fdd835", cyan: "#00acc1", white: "#fafafa", black: "#212121"
    };
    return map[id] || id || "#43a047";
  }

  function isBoardFlipped() {
    const sess = state._chessTeachingSession;
    if (sess && sess.enabled && sess.boardFlipped) return true;
    return !!state.chessBoardFlipped;
  }

  function squareCenterPct(sq) {
    let file = FILES.indexOf(sq[0]);
    let rank = Number(sq[1]) - 1;
    if (isBoardFlipped()) {
      file = 7 - file;
      rank = 7 - rank;
    }
    return {
      x: ((file + 0.5) / 8) * 100,
      y: ((7 - rank + 0.5) / 8) * 100
    };
  }

  function paintChessTeachingOverlays() {
    const board = el.board && el.board.querySelector(".chess-board");
    if (!board) return;
    let svg = board.querySelector("svg.chess-teach-overlay");
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "chess-teach-overlay");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("preserveAspectRatio", "none");
      board.appendChild(svg);
    }
    const sess = state._chessTeachingSession;
    let content = '<defs><marker id="teachArrowHead" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="context-stroke"/></marker></defs>';

    if (sess && sess.enabled) {
      (sess.arrows || []).forEach((a, i) => {
        const p1 = squareCenterPct(a.from);
        const p2 = squareCenterPct(a.to);
        const col = colorHex(a.color);
        const w = a.style === "force" ? 2.2 : a.style === "weak" ? 1.1 : 1.6;
        const dash = a.style === "weak" ? ' stroke-dasharray="3 2"' : "";
        const mid = "ah" + i;
        content += '<defs><marker id="' + mid + '" markerWidth="4" markerHeight="4" refX="3.2" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 Z" fill="' + col + '"/></marker></defs>';
        content += '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y +
          '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round" marker-end="url(#' + mid + ')"' + dash +
          ' opacity="0.9"/>';
      });
      if (sess.arrowFrom) {
        const p = squareCenterPct(sess.arrowFrom);
        content += '<circle cx="' + p.x + '" cy="' + p.y + '" r="5" fill="none" stroke="' +
          colorHex(sess.markColor) + '" stroke-width="1.2" stroke-dasharray="2 2"/>';
      }
      if (sess.ghostMove && sess.ghostMove.from && sess.ghostMove.to) {
        const p1 = squareCenterPct(sess.ghostMove.from);
        const p2 = squareCenterPct(sess.ghostMove.to);
        content += '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y +
          '" stroke="#ff9800" stroke-width="1.4" stroke-dasharray="2 2" opacity="0.85"/>';
      }
      if (sess.laserNorm) {
        const lx = sess.laserNorm.x * 100;
        const ly = sess.laserNorm.y * 100;
        content += '<circle cx="' + lx + '" cy="' + ly + '" r="2.2" fill="rgba(255,40,40,0.7)" stroke="#ff2020" stroke-width="0.6"/>';
        content += '<line x1="' + (lx - 4) + '" y1="' + ly + '" x2="' + (lx + 4) + '" y2="' + ly + '" stroke="#ff3030" stroke-width="0.5"/>';
        content += '<line x1="' + lx + '" y1="' + (ly - 4) + '" x2="' + lx + '" y2="' + (ly + 4) + '" stroke="#ff3030" stroke-width="0.5"/>';
      }
      if (sess.mode === "control") {
        content += '<text x="2" y="5" font-size="4" fill="#d7e3ff" opacity="0.9">TEACHING</text>';
      }
      if (sess.quiz && !sess.quiz.solved) {
        content += '<text x="2" y="10" font-size="3.5" fill="#ffe082">QUIZ</text>';
      }
    }
    svg.innerHTML = content;

    // Overlay jeu de couleur (ChessBase colour complex)
    board.querySelectorAll(".sq").forEach((cell) => {
      cell.classList.remove("color-overlay-light", "color-overlay-dark", "color-overlay-weak");
    });
    if (sess && sess.enabled && sess.colorOverlay) {
      const mode = sess.colorOverlay;
      board.querySelectorAll(".sq").forEach((cell) => {
        const sq = cell.getAttribute("data-sq");
        if (!sq) return;
        const file = FILES.indexOf(sq[0]);
        const rank = Number(sq[1]) - 1;
        const isLight = (file + rank) % 2 === 1;
        if (mode === "light" && isLight) cell.classList.add("color-overlay-light");
        if (mode === "dark" && !isLight) cell.classList.add("color-overlay-dark");
        if (mode === "complex") {
          cell.classList.add(isLight ? "color-overlay-light" : "color-overlay-dark");
        }
        if (mode === "weak") {
          // Faiblesses : cases d'une couleur sans pièce alliée (approximation visuelle)
          cell.classList.add(isLight ? "color-overlay-weak" : "color-overlay-dark");
        }
      });
    }

    // Marques sur cases
    board.querySelectorAll(".sq .teach-mark").forEach((n) => n.remove());
    if (sess && sess.enabled && sess.marks) {
      Object.keys(sess.marks).forEach((sq) => {
        const mark = sess.marks[sq];
        const cell = board.querySelector('.sq[data-sq="' + sq + '"]');
        if (!cell || !mark) return;
        const span = document.createElement("span");
        span.className = "teach-mark teach-mark-" + mark.type;
        span.style.color = colorHex(mark.color);
        if (mark.type === "letter" || mark.type === "number") span.textContent = mark.text || "";
        else if (mark.type === "circle") span.textContent = "○";
        else if (mark.type === "square") span.textContent = "□";
        else if (mark.type === "cross" || mark.type === "dead") span.textContent = "✕";
        else if (mark.type === "good") span.textContent = "●";
        else if (mark.type === "bad") span.textContent = "●";
        else if (mark.type === "hot") span.textContent = "●";
        else span.textContent = "★";
        cell.appendChild(span);
      });
    }

    // Badge phase / rubriques
    let badge = board.parentElement && board.parentElement.querySelector(".chess-teach-phase-badge");
    if (sess && sess.enabled && (sess.phase || (sess.themes && sess.themes.length))) {
      if (!badge && board.parentElement) {
        badge = document.createElement("div");
        badge.className = "chess-teach-phase-badge";
        board.parentElement.appendChild(badge);
      }
      if (badge) {
        const phaseLabel = sess.phase && window.ChessTeachingThemes
          ? (ChessTeachingThemes.getPhase(sess.phase) || {}).label
          : "";
        const n = (sess.themes || []).length;
        badge.style.display = "block";
        badge.textContent = (phaseLabel || "Rubriques") + (n ? " · " + n + " thème(s)" : "");
      }
    } else if (badge) {
      badge.style.display = "none";
    }
  }

  function renderChess() {
    const display = teachingDisplayChess();
    const flipped = isBoardFlipped();
    let html = '<div class="chess-frame' + (flipped ? " flipped" : "") + '">';
    html += '<div class="ranks">';
    if (flipped) {
      for (let r = 1; r <= 8; r++) html += '<span>' + r + '</span>';
    } else {
      for (let r = 8; r >= 1; r--) html += '<span>' + r + '</span>';
    }
    html += '</div>';
    
    html += '<div class="chess-board">';
    
    const moves = state.selected ? display.moves({ square: state.selected, verbose: true }) : [];
    const legalSquares = new Set(moves.map(m => m.to));
    
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const f = flipped ? 7 - file : file;
        const r = flipped ? rank + 1 : (8 - rank);
        const sq = FILES[f] + r;
        const piece = display.get(sq);
        const pieceImg = piece ? PIECES[piece.color + piece.type] : "";
        const isLight = (f + (r - 1)) % 2 === 1;
        let cls = "sq " + (isLight ? "light" : "dark");
        
        if (state.selected === sq) cls += " sel";
        if (state.lastMove && (state.lastMove.from === sq || state.lastMove.to === sq) &&
            !(state._chessTeachingSession && state._chessTeachingSession.mode === "control")) {
          cls += " last";
        }
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
        if (state.handBrain && piece && piece.color === display.turn()) {
          const hint = state.pieceHint[display.turn()];
          if (hint && piece.type === hint) cls += " hint-piece";
        }
        if (state.chessVariant === "kingOfTheHill" && HILL_SQUARES.indexOf(sq) !== -1) {
          cls += " koth-sq";
        }
        
        html += '<div class="' + cls + '" data-sq="' + sq + '">';
        if (pieceImg) {
          html += '<img src="' + new URL("images/pieces/" + pieceImg + ".svg", document.baseURI).href + '" class="pc" draggable="true" alt="' + piece.type + '">';
        }
        html += '</div>';
      }
    }
    
    html += '</div>';
    html += '<div class="files">';
    if (flipped) {
      for (let f = 7; f >= 0; f--) html += '<span>' + FILES[f] + '</span>';
    } else {
      for (let f = 0; f < 8; f++) html += '<span>' + FILES[f] + '</span>';
    }
    html += '</div>';
    html += '</div>';
    
    el.board.innerHTML = html;
    paintChessTeachingOverlays();

    // Classroom : masquer l'éval pour l'élève
    const sess = state._chessTeachingSession;
    const analysisPanel = document.getElementById("analysisPanel");
    if (analysisPanel && sess && sess.enabled && sess.perms && sess.perms.hideEval && sess.myRole === "student") {
      analysisPanel.style.display = "none";
    }

    const goalEl = document.getElementById("chessTeachPinnedGoal");
    if (goalEl) {
      if (sess && sess.enabled && sess.pinnedGoal) {
        goalEl.style.display = "block";
        goalEl.textContent = "🎯 " + sess.pinnedGoal;
      } else {
        goalEl.style.display = "none";
      }
    }
    
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
  
  function squareFromTouch(e) {
    const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (!t) return null;
    const elAt = document.elementFromPoint(t.clientX, t.clientY);
    const cell = elAt && elAt.closest ? elAt.closest(".sq") : null;
    return cell ? cell.dataset.sq : null;
  }

  function onChessTouchStart(e) {
    const display = teachingDisplayChess();
    const sq = e.currentTarget.dataset.sq;
    const piece = display.get(sq);

    chessTouchStartTime = Date.now();
    chessTouchMoved = false;
    chessTouchLastSq = sq;

    if (piece && piece.color === display.turn()) {
      if (!canControlSide(piece.color)) {
        sounds.refuse();
        return;
      }
      chessTouchStart = sq;
      state.selected = sq;
      e.currentTarget.querySelector(".pc")?.classList.add("dragging-piece");
      vibrateTouch(10);
      renderChess();
    }
  }

  function onChessTouchMove(e) {
    chessTouchMoved = true;
    chessLastMouseMove = Date.now();
    const sq = squareFromTouch(e);
    if (sq) chessTouchLastSq = sq;
  }

  function onChessTouchEnd(e) {
    if (!chessTouchStart) return;
    document.querySelectorAll(".pc.dragging-piece").forEach((n) => n.classList.remove("dragging-piece"));
    const sq = squareFromTouch(e) || chessTouchLastSq || e.currentTarget.dataset.sq;
    const touchDuration = Date.now() - chessTouchStartTime;

    if (state.antiMisclickChess && chessTouchMoved && touchDuration < 120) {
      sounds.refuse();
      chessTouchStart = null;
      chessTouchMoved = false;
      return;
    }

    if (sq && sq !== chessTouchStart) {
      attemptMove(chessTouchStart, sq);
      vibrateTouch(15);
    } else {
      vibrateTouch(10);
    }
    chessTouchStart = null;
    chessTouchMoved = false;
    chessTouchLastSq = null;
  }

  /** En ligne / Discord : on ne joue que sa couleur. Solo / teaching control = libre. */
  function canControlSide(color) {
    if (net && net.role === "observer") return false;
    if (state.chessTeaching && state._chessTeachingSession && state._chessTeachingSession.enabled) {
      return state._chessTeachingSession.canPlayMove(color);
    }
    if (state.mode === "online" && net && net.connected && net.connected()) {
      const my = state.color === "b" ? "b" : "w";
      return color === my;
    }
    return true;
  }

  function onChessClick(e) {
    const sq = e.currentTarget.dataset.sq;
    
    if (!sq) return;

    // Teaching (Take Control / marques / quiz)
    if (state.chessTeaching && typeof state._onChessTeachingClick === "function") {
      const handled = state._onChessTeachingClick(sq, e);
      if (handled) return;
    }

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
      if (!canControlSide(piece.color)) {
        sounds.refuse();
        setStatus("Ce n'est pas votre camp", "err");
        return;
      }
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
    if (isChessVariantOver()) {
      sounds.refuse();
      return;
    }
    const piece = state.chess.get(from);
    if (piece && !canControlSide(piece.color)) {
      sounds.refuse();
      setStatus("Ce n'est pas votre camp", "err");
      state.selected = null;
      renderChess();
      return;
    }
    // Teaching : variations / blocage couleur / outils non-coup
    if (state.chessTeaching && state._chessTeachingSession && state._chessTeachingSession.enabled) {
      const sess = state._chessTeachingSession;
      if (sess.mode === "control") {
        if (!sess.canEdit() || sess.tool !== "move") {
          sounds.refuse();
          return;
        }
        const result = sess.handleSquare(to, from, state.chess);
        if (result.kind === "variation") {
          state.selected = null;
          state._chessTeachDisplayFen = result.fen;
          if (sounds.piece) sounds.piece();
          else sounds.move();
          renderChess();
          return;
        }
        if (result.kind === "illegal") {
          sounds.refuse();
          state.selected = null;
          renderChess();
          return;
        }
        return;
      }
      if (!sess.canPlayMove(state.chess.turn())) {
        sounds.refuse();
        setStatus("Ce n'est pas votre trait (teaching)", "err");
        return;
      }
    }
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
      if (move.captured && sounds.capture) sounds.capture();
      else if (sounds.piece) sounds.piece();
      else sounds.move();
      state.selected = null;
      if (typeof state._onChessTeachingLiveMove === "function") {
        state._onChessTeachingLiveMove(move);
      }
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
      updateChessStatus();
      updateVariantHud();
      
      if (clock.type !== "none") {
        clock.switchPlayer();
        updateClockDisplay();
      }
      
      if (state.chess.in_check()) sounds.check();
      if (isChessVariantOver()) {
        sounds.win();
        clock.stop();
        maybeRecordChessResult();
      }
      
      if (net.connected()) {
        net.send({
          type: "chess",
          fen: state.chess.fen(),
          variant: state.chessVariant,
          checks: { w: state.checksGiven.w, b: state.checksGiven.b },
          move: { from: move.from, to: move.to, san: move.san, color: move.color, promotion: move.promotion },
          over: isChessVariantOver(),
          winner: chessWinnerColor(),
          clock: clock && clock.getSnapshot ? clock.getSnapshot() : null
        });
      }
      if (typeof window.__sbEmitMovePlay === "function") {
        window.__sbEmitMovePlay({
          san: move.san,
          from: move.from,
          to: move.to,
          color: move.color,
          game: "chess"
        });
      } else if (typeof window.__sbPublishGameState === "function") {
        window.__sbPublishGameState(true);
      }
    } else {
      sounds.refuse();
      state.selected = null;
      renderChess();
    }
  }

  function chessWinnerColor() {
    if (state.variantWinner) return state.variantWinner;
    if (state.chess && state.chess.in_checkmate()) {
      return state.chess.turn() === "w" ? "b" : "w";
    }
    if (state.chessResigned) return state.chessResigned === "w" ? "b" : "w";
    if (state.chess && (state.chess.in_draw() || state.chess.in_stalemate())) return null;
    return null;
  }

  function maybeRecordChessResult() {
    if (chessRatedRecorded || !isChessVariantOver()) return;
    chessRatedRecorded = true;
    if (typeof ctx.api.recordGameResult === "function") {
      ctx.api.recordGameResult(chessWinnerColor());
    }
  }

  function resignChess(byColor) {
    if (isChessVariantOver()) return false;
    const loser = byColor || state.color || state.chess.turn();
    state.chessResigned = loser === "b" ? "b" : "w";
    state.variantWinner = state.chessResigned === "w" ? "b" : "w";
    clock.stop();
    sounds.win();
    updateChessStatus();
    renderChess();
    maybeRecordChessResult();
    return true;
  }

  function offerDraw() {
    if (isChessVariantOver()) return;
    if (net.connected()) {
      net.send({ type: "chess-draw-offer", from: state.color || "w" });
      setStatus("Proposition de nulle envoyée…", "ok");
    } else {
      state.chessDraw = true;
      clock.stop();
      setStatus("🤝 Partie nulle (accord)", "ok");
      updateChessStatus();
      maybeRecordChessResult();
    }
  }

  function acceptDraw() {
    state.chessDraw = true;
    state.variantWinner = null;
    clock.stop();
    setStatus("🤝 Partie nulle", "ok");
    chessRatedRecorded = false;
    maybeRecordChessResult();
    if (net.connected()) net.send({ type: "chess-draw-accept" });
    updateChessStatus();
    renderChess();
  }

  function exportPgn() {
    try {
      let pgn = state.chess.pgn();
      if (!pgn || !String(pgn).trim()) {
        pgn = '[Event "Social Board"]\n[Site "Discord"]\n\n' + (state.chess.history() || []).join(" ");
      }
      if (state.variantWinner) {
        pgn += state.variantWinner === "w" ? " 1-0" : " 0-1";
      } else if (state.chessDraw || (state.chess && state.chess.in_draw())) {
        pgn += " 1/2-1/2";
      }
      return pgn;
    } catch (e) {
      return state.chess.fen();
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

  function applyChecksFromNet(checks) {
    if (!checks) return;
    state.checksGiven = {
      w: Math.max(0, checks.w | 0),
      b: Math.max(0, checks.b | 0)
    };
    if (state.chessVariant === "threeCheck") {
      if (state.checksGiven.w >= 3) state.variantWinner = "w";
      else if (state.checksGiven.b >= 3) state.variantWinner = "b";
    }
  }

  function isChessVariantOver() {
    return !!state.variantWinner || !!state.chessDraw || !!state.chessResigned ||
      !!(state.chess && state.chess.game_over());
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
    
    if (state.chessResigned) {
      status = "🏳️ Abandon — " + variantSideName(state.variantWinner || (state.chessResigned === "w" ? "b" : "w")) + " gagnent";
      statusClass = "ok";
    } else if (state.chessDraw) {
      status = "🤝 Partie nulle";
      statusClass = "ok";
    } else if (state.chess.in_checkmate()) {
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
    if (state.mode === "online" && state.color && !isChessVariantOver()) {
      status += state.color === "w" ? " · vous = Blancs" : " · vous = Noirs";
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
    state.chessResigned = null;
    state.chessDraw = false;
    state.analysisMove = null;
    chessRatedRecorded = false;
    resetPairSeats();
    renderChess();
    updateChessStatus();
    updateVariantHud();
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

  function loadChessState(snap) {
    if (!snap || !snap.fen) return false;
    try {
      const next = new Chess();
      if (!next.load(snap.fen)) return false;
      state.chess = next;
      if (snap.variant) state.chessVariant = snap.variant;
      applyChecksFromNet(snap.checks);
      if (snap.winner) state.variantWinner = snap.winner;
      else if (snap.resigned) {
        state.chessResigned = snap.resigned;
        state.variantWinner = snap.resigned === "w" ? "b" : "w";
      } else if (snap.draw) {
        state.chessDraw = true;
      }
      state.selected = null;
      state.pendingChessMove = null;
      state.lastMove = snap.lastMove || null;
      renderChess();
      updateChessStatus();
      updateVariantHud();
      return true;
    } catch (e) {
      return false;
    }
  }

  function serializeChessState() {
    return {
      fen: state.chess ? state.chess.fen() : START_FEN,
      variant: state.chessVariant || "standard",
      checks: { w: state.checksGiven.w, b: state.checksGiven.b },
      winner: state.variantWinner || null,
      resigned: state.chessResigned || null,
      draw: !!state.chessDraw,
      lastMove: state.lastMove ? {
        from: state.lastMove.from,
        to: state.lastMove.to,
        san: state.lastMove.san,
        color: state.lastMove.color
      } : null,
      hostColor: state.hostColor || "w",
      yourColorHint: state.color || null
    };
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

  function normalizeFen(fen) {
    return String(fen || '').split(' ').slice(0, 4).join(' ');
  }

  function applyRemoteChessFen(fen, opts) {
    opts = opts || {};
    if (typeof fen !== "string" || fen.length > 128) return { ok: false };
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
      // Force resync si demandé (rattrapage désync)
      if (opts.force) {
        state.chess.load(next.fen());
        return { ok: true, moved: true, move: opts.move || null, forced: true };
      }
      return { ok: false, needSync: true };
    } catch (e) {
      return { ok: false };
    }
  }

  function init() {
    if (!state.chess) state.chess = new Chess();
  }

  return {
    id: "chess",
    label: "Échecs",
    init: init,
    renderChess: renderChess,
    updateChessStatus: updateChessStatus,
    updateVariantHud: updateVariantHud,
    isChessVariantOver: isChessVariantOver,
    applyChessVariantFromNet: applyChessVariantFromNet,
    applyRemoteChessFen: applyRemoteChessFen,
    applyVariantAfterMove: applyVariantAfterMove,
    applyChecksFromNet: applyChecksFromNet,
    startNewChess: startNewChess,
    loadChessState: loadChessState,
    serializeChessState: serializeChessState,
    resignChess: resignChess,
    offerDraw: offerDraw,
    acceptDraw: acceptDraw,
    exportPgn: exportPgn,
    chessWinnerColor: chessWinnerColor,
    maybeRecordChessResult: maybeRecordChessResult,
    canControlSide: canControlSide,
    pieceHintLabel: pieceHintLabel,
    choosePieceHint: choosePieceHint,
    uciToSquares: uciToSquares,
    pvToSan: pvToSan,
    normalizeFen: normalizeFen,
    paintChessTeachingOverlays: paintChessTeachingOverlays,
    Chess: Chess
  };
}
