export function createGoModule(ctx) {
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

  const GO_HINTS = [
    { type: "coin", label: "Coin" },
    { type: "centre", label: "Centre" },
    { type: "bord", label: "Bord" },
    { type: "reponse", label: "Réponse" }
  ];
  // Anti-glisse (1 clic) : refuse si on a glissé pendant l'appui — PAS un double-clic
  const POINTER_DRAG_PX = 10;
  const TOUCH_MOVE_PX = 14;
  const TOUCH_MIN_DURATION = 50;

  // ========== GO ==========

  let goCanvas = null;
  let goHover = null;
  let goBlackStone = null;
  let goWhiteStone = null;
  let goManualDead = null; // grille morts manuels (scoring)
  
  // Pose : direct | slip (anti-glisse 1 clic) | confirm (2 clics, mode séparé)
  let goPointerDown = null; // { x, y, t, dragged }
  let goTouchStartTime = 0;
  let goTouchHasMoved = false;
  let goTouchStartPos = null;
  let goLastPointer = null; // {x,y} intersection sous le pointeur
  let goSkipNextClick = false; // mouseup anti-slip a déjà géré

  function resolveGoPlaceMode() {
    const m = state.goPlaceMode;
    if (m === "slip" || m === "kgs") return "slip";
    if (m === "direct" || m === "confirm") return m;
    return state.antiMisclickGo ? "slip" : "direct";
  }
  
  // Charger les images des pierres
  function loadGoStones() {
    if (!goBlackStone) {
      goBlackStone = new Image();
      goBlackStone.src = new URL("images/go/black.svg", document.baseURI).href;
    }
    if (!goWhiteStone) {
      goWhiteStone = new Image();
      goWhiteStone.src = new URL("images/go/white.svg", document.baseURI).href;
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
      
      goCanvas.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        goPointerDown = {
          x: e.clientX,
          y: e.clientY,
          t: Date.now(),
          dragged: false
        };
      });
      goCanvas.addEventListener("mousemove", (e) => {
        if (goPointerDown && !goPointerDown.dragged) {
          const dx = e.clientX - goPointerDown.x;
          const dy = e.clientY - goPointerDown.y;
          if (dx * dx + dy * dy > POINTER_DRAG_PX * POINTER_DRAG_PX) {
            goPointerDown.dragged = true;
          }
        }
        onGoMove(e);
      });
      goCanvas.addEventListener("mouseup", (e) => {
        if (e.button !== 0) return;
        const placeMode = resolveGoPlaceMode();
        if (placeMode === "slip" && goPointerDown) {
          if (goPointerDown.dragged) {
            sounds.refuse();
            setStatus("misclic", "err");
            goSkipNextClick = true;
            goPointerDown = null;
            return;
          }
        }
        goPointerDown = null;
      });
      goCanvas.addEventListener("mouseleave", () => {
        goHover = null;
        goPointerDown = null;
        paintGo();
      });
      goCanvas.addEventListener("click", (e) => {
        if (goSkipNextClick) {
          goSkipNextClick = false;
          return;
        }
        onGoClick(e);
      });
      
      goCanvas.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (state.pendingGoMove) {
          state.pendingGoMove = null;
          paintGo();
          setStatus("Sélection annulée", "ok");
        }
      });

      // Touch events optimisés pour mobile (Go)
      goCanvas.addEventListener("touchstart", (e) => {
        e.preventDefault();
        goTouchStartTime = Date.now();
        goTouchHasMoved = false;
        const touch = e.touches[0];
        goTouchStartPos = { x: touch.clientX, y: touch.clientY };
        onGoMove(new MouseEvent("mousemove", {
          clientX: touch.clientX,
          clientY: touch.clientY
        }));
        vibrateTouch(4);
      }, { passive: false });
      
      goCanvas.addEventListener("touchmove", (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        if (goTouchStartPos) {
          const dx = touch.clientX - goTouchStartPos.x;
          const dy = touch.clientY - goTouchStartPos.y;
          if (dx * dx + dy * dy > TOUCH_MOVE_PX * TOUCH_MOVE_PX) {
            goTouchHasMoved = true;
          }
        }
        onGoMove(new MouseEvent("mousemove", {
          clientX: touch.clientX,
          clientY: touch.clientY
        }));
      }, { passive: false });
      
      goCanvas.addEventListener("touchend", (e) => {
        e.preventDefault();
        const touchDuration = Date.now() - goTouchStartTime;
        const placeMode = resolveGoPlaceMode();

        // Anti-glisse : glisser du doigt → refus sonore (toujours 1 pose si tap propre)
        if (placeMode === "slip" && (goTouchHasMoved || touchDuration < TOUCH_MIN_DURATION)) {
          sounds.refuse();
          setStatus("misclic", "err");
          goHover = null;
          paintGo();
          return;
        }
        
        const touch = e.changedTouches[0];
        onGoClick(new MouseEvent("click", {
          clientX: touch.clientX,
          clientY: touch.clientY
        }));
        
        if (state.pendingGoMove) vibrateTouch(8);
        else vibrateTouch(12);
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
    try {
      document.dispatchEvent(new CustomEvent("sb-go-rendered"));
    } catch (_) { /* ignore */ }
  }

  function paintGo() {
    if (!goCanvas || !state.go) return;
    const displayGame = (state.reviewActive && state.reviewGame) ? state.reviewGame : state.go;
    const ctx = goCanvas.getContext("2d");
    const size = goCanvas.width;
    const boardSize = displayGame.size;
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
    const lastMove = displayGame.moves.length
      ? displayGame.moves[displayGame.moves.length - 1]
      : (state.reviewActive ? null : state.lastGoMove);
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const color = displayGame.at(x, y);
        if (color > 0) {
          const px = margin + x * cellSize;
          const py = margin + y * cellSize;
          
          drawStone(ctx, px, py, stoneRadius, color);
          
          if (lastMove && !lastMove.pass && lastMove.x === x && lastMove.y === y) {
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
    
    if (!state.reviewActive) {
      paintGoAnalysisOverlay(ctx, boardSize, margin, cellSize, stoneRadius);
    }

    // Pierre en attente de confirmation (antimisclic)
    if (!state.reviewActive && state.pendingGoMove) {
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
    const hoverGame = displayGame;
    if (!state.pendingGoMove && goHover && hoverGame.inBounds(goHover.x, goHover.y) && !state.scoringMode) {
      const illegal = hoverGame.over ? "Partie terminée" : hoverGame.whyIllegal(goHover.x, goHover.y);
      const px = margin + goHover.x * cellSize;
      const py = margin + goHover.y * cellSize;
      
      if (illegal) {
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
        const previewImg = hoverGame.turn === 1 ? goBlackStone : goWhiteStone;
        if (previewImg && previewImg.complete) {
          ctx.save();
          ctx.globalAlpha = 0.3;
          const previewSize = stoneRadius * 2;
          ctx.drawImage(previewImg, px - stoneRadius, py - stoneRadius, previewSize, previewSize);
          ctx.restore();
        }
      }
    }

    // Pédagogie : territoire estimé, numéros, marques, fantôme, traits
    paintTeachingTerritory(ctx, displayGame, boardSize, margin, cellSize, stoneRadius);
    paintTeachingMoveNumbers(ctx, displayGame, boardSize, margin, cellSize, stoneRadius);
    paintTeachingMarks(ctx, boardSize, margin, cellSize, stoneRadius);
    paintTeachingGhost(ctx, margin, cellSize, stoneRadius);
    paintTeachingStrokes(ctx, goCanvas.width, goCanvas.height);
    paintQuizAnswers(ctx, margin, cellSize, stoneRadius);
    paintTeachingLaser(ctx, goCanvas.width, goCanvas.height);
    paintTeachingNag(ctx, margin, cellSize, stoneRadius, displayGame);

    if (state.reviewActive || (state.teaching && state._teachingSession && state._teachingSession.mode === "control")) {
      ctx.fillStyle = "rgba(20,40,80,0.55)";
      ctx.fillRect(8, 8, 140, 22);
      ctx.fillStyle = "#d7e3ff";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "left";
      const sess = state._teachingSession;
      const label = sess && sess.quiz
        ? (sess.quiz.solved ? "QUIZ ✓" : "QUIZ ?")
        : (sess && sess.mode === "control" ? "TEACHING" : "REVIEW");
      ctx.fillText(label, 14, 23);
    }
  }

  function paintTeachingTerritory(ctx, game, boardSize, margin, cellSize, stoneRadius) {
    const session = state._teachingSession;
    if (!session || !session.enabled || !session.showTerritory || !game) return;
    let analysis;
    try { analysis = game.analyze(); } catch (_) { return; }
    if (!analysis || !analysis.owner) return;
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        if (game.at(x, y) !== 0) continue;
        const who = analysis.owner[y][x];
        if (!who) continue;
        const px = margin + x * cellSize;
        const py = margin + y * cellSize;
        const mark = stoneRadius * 0.32;
        ctx.fillStyle = who === 1 ? "rgba(20,20,20,0.35)" : "rgba(255,255,255,0.55)";
        ctx.fillRect(px - mark / 2, py - mark / 2, mark, mark);
      }
    }
  }

  function paintTeachingMoveNumbers(ctx, game, boardSize, margin, cellSize, stoneRadius) {
    const session = state._teachingSession;
    if (!session || !session.enabled || !session.showMoveNumbers || !game) return;
    const moves = game.moves || [];
    const start = Math.max(0, moves.length - 60);
    for (let i = start; i < moves.length; i++) {
      const m = moves[i];
      if (!m || m.pass || m.edit) continue;
      const px = margin + m.x * cellSize;
      const py = margin + m.y * cellSize;
      const n = i + 1;
      ctx.save();
      ctx.font = "bold " + Math.max(9, cellSize * 0.32) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = m.color === 1 ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.75)";
      ctx.fillStyle = m.color === 1 ? "#111" : "#f5f5f5";
      ctx.strokeText(String(n), px, py);
      ctx.fillText(String(n), px, py);
      ctx.restore();
    }
  }

  function paintTeachingGhost(ctx, margin, cellSize, stoneRadius) {
    const session = state._teachingSession;
    if (!session || !session.ghostMove) return;
    const g = session.ghostMove;
    const px = margin + g.x * cellSize;
    const py = margin + g.y * cellSize;
    ctx.save();
    ctx.globalAlpha = 0.45;
    const img = g.color === 2 ? goWhiteStone : goBlackStone;
    if (img && img.complete) {
      ctx.drawImage(img, px - stoneRadius, py - stoneRadius, stoneRadius * 2, stoneRadius * 2);
    } else {
      ctx.fillStyle = g.color === 2 ? "#eee" : "#222";
      ctx.beginPath();
      ctx.arc(px, py, stoneRadius * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ff9800";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(px, py, stoneRadius * 1.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function paintTeachingStrokes(ctx, w, h) {
    const session = state._teachingSession;
    if (!session || !session.enabled) return;
    const strokes = (session.strokes || []).slice();
    if (session._drawPreview && session._drawPreview.length > 1) {
      strokes.push({ points: session._drawPreview });
    }
    if (!strokes.length) return;
    ctx.save();
    ctx.strokeStyle = "rgba(230, 60, 40, 0.85)";
    ctx.lineWidth = Math.max(2, w * 0.008);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokes.forEach((s) => {
      const pts = s.points || [];
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x * w, pts[0].y * h);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * w, pts[i].y * h);
      ctx.stroke();
    });
    ctx.restore();
  }

  function paintTeachingLaser(ctx, w, h) {
    const session = state._teachingSession;
    if (!session || !session.enabled || !session.laserNorm) return;
    const lx = session.laserNorm.x * w;
    const ly = session.laserNorm.y * h;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 40, 40, 0.9)";
    ctx.fillStyle = "rgba(255, 60, 40, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(lx, ly, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lx - 16, ly);
    ctx.lineTo(lx + 16, ly);
    ctx.moveTo(lx, ly - 16);
    ctx.lineTo(lx, ly + 16);
    ctx.stroke();
    ctx.restore();
  }

  function paintTeachingNag(ctx, margin, cellSize, stoneRadius, game) {
    const session = state._teachingSession;
    if (!session || !session.tree || !session.tree.cursor) return;
    const node = session.tree.cursor;
    if (!node.move || node.move.pass || !node.nag) return;
    const px = margin + node.move.x * cellSize;
    const py = margin + node.move.y * cellSize;
    ctx.save();
    ctx.font = "bold " + Math.max(12, cellSize * 0.4) + "px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.fillStyle = node.nag.indexOf("?") >= 0 ? "#c62828" : "#2e7d32";
    ctx.strokeText(node.nag, px + stoneRadius * 0.55, py - stoneRadius * 0.35);
    ctx.fillText(node.nag, px + stoneRadius * 0.55, py - stoneRadius * 0.35);
    if (node.label) {
      ctx.font = Math.max(10, cellSize * 0.28) + "px sans-serif";
      ctx.fillStyle = "#1565c0";
      ctx.strokeText(node.label, px + stoneRadius * 0.55, py + stoneRadius * 0.9);
      ctx.fillText(node.label, px + stoneRadius * 0.55, py + stoneRadius * 0.9);
    }
    ctx.restore();
  }

  function paintQuizAnswers(ctx, margin, cellSize, stoneRadius) {
    const session = state._teachingSession;
    if (!session || !session.quiz || !session.quiz.showAnswer) return;
    (session.quiz.answers || []).forEach((a) => {
      const px = margin + a.x * cellSize;
      const py = margin + a.y * cellSize;
      ctx.save();
      ctx.strokeStyle = "#2e7d32";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, stoneRadius * 0.95, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  function paintTeachingMarks(ctx, boardSize, margin, cellSize, stoneRadius) {
    const session = state._teachingSession;
    if (!session || !session.enabled) return;
    if (window.TeachingMarks) {
      TeachingMarks.paintAllMarks(ctx, session.marks, boardSize, margin, cellSize, stoneRadius);
      TeachingMarks.paintArrows(ctx, session.arrows, margin, cellSize);
      // Preview départ de flèche
      if (session.arrowFrom) {
        const px = margin + session.arrowFrom.x * cellSize;
        const py = margin + session.arrowFrom.y * cellSize;
        ctx.save();
        ctx.strokeStyle = TeachingMarks.colorHex(session.markColor);
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(px, py, stoneRadius * 0.9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      return;
    }
    // Fallback minimal
    if (!session.marks) return;
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const mark = session.marks[y] && session.marks[y][x];
        if (!mark) continue;
        const px = margin + x * cellSize;
        const py = margin + y * cellSize;
        ctx.strokeStyle = "#c62828";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, stoneRadius * 0.6, 0, Math.PI * 2);
        ctx.stroke();
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
    const coords = getGoCoords(event);
    goLastPointer = coords.x >= 0 ? { x: coords.x, y: coords.y } : null;
    if (coords.x !== goHover?.x || coords.y !== goHover?.y) {
      goHover = coords;
      paintGo();
    }
  }

  function onGoClick(event) {
    const coords = getGoCoords(event);
    if (!state.go.inBounds(coords.x, coords.y)) {
      // Clic hors intersection → annule la sélection
      if (state.pendingGoMove) {
        state.pendingGoMove = null;
        paintGo();
      }
      return;
    }

    // Teaching session (Take Control / marques / play filtré)
    if (state.teaching && typeof state._onTeachingClick === "function") {
      const handled = state._onTeachingClick(coords.x, coords.y, event);
      if (handled) return;
    }

    // Mode review / teaching : variations
    if (state.reviewActive && typeof state._onReviewClick === "function") {
      state._onReviewClick(coords.x, coords.y);
      return;
    }

    // Observateur / hors tour en ligne
    if (net && net.role === "observer") {
      sounds.refuse();
      setStatus("Mode spectateur — lecture seule", "err");
      return;
    }
    if (state.mode === "online" && net && net.connected && net.connected() && !state.teaching) {
      const myColor = state.goColor === 2 ? 2 : 1;
      if (state.go.turn !== myColor) {
        sounds.refuse();
        setStatus("Ce n'est pas votre camp (vous = " + (myColor === 1 ? "Noir" : "Blanc") + ")", "err");
        return;
      }
    }

    // Rengo net : vérifier le siège
    if (state.rengo && typeof state._rengoCanPlay === "function") {
      if (!state._rengoCanPlay(state.go.turn, state.pairSeat)) {
        sounds.refuse();
        setStatus("Ce n'est pas votre siège rengo", "err");
        return;
      }
    }

    // Mode comptage : marquer morts / vivants
    if (state.scoringMode) {
      if (state.go.at(coords.x, coords.y) === 0) return;
      if (!goManualDead) {
        const auto = state.go.analyze();
        goManualDead = auto.deadMap.map((row) => row.slice());
      }
      state.go.toggleDeadGroup(coords.x, coords.y, goManualDead);
      const scored = state.go.analyze({ deadMap: goManualDead });
      state.goAnalysis = scored;
      paintGo();
      setStatus(
        "Comptage — N " + scored.jp[1].toFixed(1) + " / B " + scored.jp[2].toFixed(1) +
          " · cliquez une pierre pour basculer mort/vivant · puis Done",
        "ok"
      );
      if (typeof state._onDeadMarked === "function") state._onDeadMarked(goManualDead);
      return;
    }

    if (state.go.over) return;

    const placeMode = resolveGoPlaceMode();
    const confirming =
      state.pendingGoMove &&
      state.pendingGoMove.x === coords.x &&
      state.pendingGoMove.y === coords.y;

    // Mode 2 clics uniquement (séparé de l'anti-glisse)
    if (placeMode === "confirm") {
      if (confirming) {
        const capsBefore = state.go.captures.slice();
        const success = state.go.play(coords.x, coords.y);
        if (success) {
          const captured =
            (state.go.captures[1] - capsBefore[1]) +
            (state.go.captures[2] - capsBefore[2]);
          applyLocalGoMove(coords, captured);
        } else {
          sounds.refuse();
          state.pendingGoMove = null;
          paintGo();
        }
      } else {
        const illegal = state.go.whyIllegal(coords.x, coords.y);
        if (illegal) {
          if (state.pendingGoMove) {
            state.pendingGoMove = null;
            paintGo();
          }
          sounds.refuse();
          setStatus(illegal, "err");
        } else {
          state.pendingGoMove = coords;
          sounds.select();
          setStatus("Confirmez le coup (recliquez la pierre)", "ok");
          paintGo();
        }
      }
      return;
    }

    // direct ou slip : un seul clic
    if (state.pendingGoMove) {
      state.pendingGoMove = null;
    }
    const capsBefore = state.go.captures.slice();
    const success = state.go.play(coords.x, coords.y);
    if (success) {
      const captured =
        (state.go.captures[1] - capsBefore[1]) +
        (state.go.captures[2] - capsBefore[2]);
      applyLocalGoMove(coords, captured);
    } else {
      sounds.refuse();
      setStatus(state.go.whyIllegal(coords.x, coords.y) || "misclic", "err");
    }
  }

  function applyLocalGoMove(coords, capturedCount) {
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
    if (capturedCount > 0 && sounds.capture) sounds.capture();
    else if (sounds.stone) sounds.stone();
    else sounds.move();
    if (typeof state._onTeachingLiveMove === "function") {
      const last = state.go.moves[state.go.moves.length - 1];
      if (last) state._onTeachingLiveMove(last);
    }
    advancePairSeat(playedSide);
    paintGo();
    updateGoStatus();
    updateCaptureCounters();
    if (clock.type !== "none") {
      clock.switchPlayer();
      updateClockDisplay();
    }
    if (net.connected()) {
      if (window.MatchProtocol) {
        net.send(MatchProtocol.goPayload(state.go, coords.x, coords.y, clock));
      } else {
        net.send({ type: "go", x: coords.x, y: coords.y });
      }
    }
    if (typeof window.__sbEmitMovePlay === "function") {
      window.__sbEmitMovePlay({
        x: coords.x,
        y: coords.y,
        game: "go"
      });
    } else if (typeof window.__sbPublishGameState === "function") {
      window.__sbPublishGameState(true);
    }
  }

  function updateGoStatus() {
    if (state.go.over) {
      if (state.scoringMode) {
        setStatus("Comptage — marquez les morts, puis Done", "ok");
      } else {
        const analysis = state.go.analyze();
        const blackScore = analysis.jp[1];
        const whiteScore = analysis.jp[2];
        const winner = blackScore > whiteScore ? "Noir" : "Blanc";
        setStatus("🏆 Partie terminée ! " + winner + " gagne - Noir: " + blackScore.toFixed(1) + ", Blanc: " + whiteScore.toFixed(1), "ok");
      }
    } else {
      const turn = state.go.turn === 1 ? "● Trait au Noir" : "○ Trait au Blanc";
      const statusClass = state.go.turn === 1 ? "black" : "white";
      let text = turn;
      if (state.go.passCount === 1) {
        text += " — pass (1/2)";
      }
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
    const rulesEl = document.getElementById("goRules");
    if (rulesEl) state.go.rules = rulesEl.value || "japanese";
    const handEl = document.getElementById("goHandicap");
    const hand = handEl ? parseInt(handEl.value, 10) || 0 : 0;
    if (hand >= 2) state.go.placeHandicap(hand);
    if (state.matchMeta) {
      state.matchMeta.handicap = state.go.handicap;
      state.matchMeta.rules = state.go.rules;
      state.matchMeta.scoringDone = { me: false, foe: false };
    }
    state.lastGoMove = null;
    state.pendingGoMove = null;
    state.goHint = { w: null, b: null };
    state.goAnalysis = null;
    state.scoringMode = false;
    goManualDead = null;
    goCanvas = null;
    resetPairSeats();
    renderGo();
  }

  function enterScoringMode() {
    state.scoringMode = true;
    state.pendingGoMove = null;
    const auto = state.go.analyze();
    goManualDead = auto.deadMap.map((row) => row.slice());
    state.goAnalysis = auto;
    paintGo();
    if (typeof state._onDeadMarked === "function") state._onDeadMarked(goManualDead);
    return auto;
  }

  function rescoreWithManualDead() {
    if (!goManualDead) return state.go.analyze();
    const scored = state.go.analyze({ deadMap: goManualDead });
    state.goAnalysis = scored;
    paintGo();
    return scored;
  }

  function exitScoringMode() {
    state.scoringMode = false;
    goManualDead = null;
  }

  function getManualDead() {
    return goManualDead;
  }

  function setManualDead(dead) {
    goManualDead = dead;
    state.scoringMode = true;
    if (dead) {
      state.goAnalysis = state.go.analyze({ deadMap: dead });
      paintGo();
    }
  }

  function goToMoveSide() {
    if (!state.go) return "b";
    return state.go.turn === 1 ? "b" : "w";
  }

  function goPlayedSide() {
    if (!state.go) return "w";
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

  function init() {
    if (!state.go && window.GoGame) state.go = new window.GoGame(19);
    loadGoStones();
  }

  if (typeof document !== "undefined") {
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && state.pendingGoMove) {
        state.pendingGoMove = null;
        if (goCanvas) paintGo();
        setStatus("Sélection annulée", "ok");
      }
    });
  }

  return {
    id: "go",
    label: "Go",
    init: init,
    renderGo: renderGo,
    paintGo: paintGo,
    updateGoStatus: updateGoStatus,
    updateCaptureCounters: updateCaptureCounters,
    startNewGo: startNewGo,
    enterScoringMode: enterScoringMode,
    rescoreWithManualDead: rescoreWithManualDead,
    exitScoringMode: exitScoringMode,
    getManualDead: getManualDead,
    setManualDead: setManualDead,
    goToMoveSide: goToMoveSide,
    goPlayedSide: goPlayedSide,
    goHintLabel: goHintLabel,
    chooseGoHint: chooseGoHint
  };
}
