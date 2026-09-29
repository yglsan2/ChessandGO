// Moteur d'analyse pour échecs (Stockfish worker) et Go (territoire + vie/mort)
class GameAnalysis {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.analyzing = false;
    this.callback = null;
    this.lines = {};
    this.bestMove = null;
    this.timeoutId = null;
    this.pending = null;
    this.uciVariant = "chess";
  }

  engineAvailable() {
    return typeof Worker === "function";
  }

  initStockfish() {
    if (this.worker || !this.engineAvailable()) return;
    try {
      this.worker = new Worker("vendor/stockfish.js");
    } catch (err) {
      this.worker = null;
      return;
    }
    this.worker.onmessage = (event) => {
      this.onEngineLine(typeof event.data === "string" ? event.data : String(event.data || ""));
    };
    this.worker.onerror = () => {
      this.fail("Stockfish a échoué (moteur indisponible)");
    };
    this.worker.postMessage("uci");
  }

  variantOption(name) {
    if (name === "threeCheck") return "3check";
    if (name === "kingOfTheHill") return "kingofthehill";
    return "chess";
  }

  onEngineLine(line) {
    if (!line) return;
    if (line.indexOf("uciok") !== -1 || line.indexOf("readyok") !== -1) {
      if (line.indexOf("uciok") !== -1) {
        this.worker.postMessage("setoption name MultiPV value 3");
      }
      this.ready = true;
      if (this.pending && !this.analyzing) this.startPending();
      return;
    }
    if (!this.analyzing) return;

    if (line.indexOf("info") === 0 && line.indexOf("score") !== -1 && line.indexOf(" pv ") !== -1) {
      const mp = line.match(/\bmultipv (\d+)/);
      const depth = line.match(/\bdepth (\d+)/);
      const score = line.match(/\bscore (cp|mate) (-?\d+)/);
      const pv = line.match(/\bpv ([a-h1-8qrbn ]+)/i);
      if (!score || !pv) return;
      const index = mp ? parseInt(mp[1], 10) : 1;
      this.lines[index] = {
        depth: depth ? parseInt(depth[1], 10) : 0,
        kind: score[1],
        value: parseInt(score[2], 10),
        moves: pv[1].trim().split(/\s+/).filter(Boolean)
      };
    }

    if (line.indexOf("bestmove") === 0) {
      const parts = line.split(/\s+/);
      this.bestMove = parts[1] && parts[1] !== "(none)" ? parts[1] : null;
      this.finish(null);
    }
  }

  formatEval(kind, value, sideToMove) {
    const whiteSign = sideToMove === "b" ? -1 : 1;
    if (kind === "mate") {
      const mateForWhite = value * whiteSign;
      if (mateForWhite === 0) return "Mat";
      return mateForWhite > 0 ? "Mat blanc en " + mateForWhite : "Mat noir en " + Math.abs(mateForWhite);
    }
    const pawns = (value * whiteSign) / 100;
    const abs = Math.abs(pawns).toFixed(2);
    if (pawns > 0) return "+" + abs;
    if (pawns < 0) return "−" + abs;
    return "0.00";
  }

  finish(error) {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    const cb = this.callback;
    const pendingSide = this.pending ? this.pending.side : "w";
    this.analyzing = false;
    this.callback = null;
    this.pending = null;
    if (!cb) return;
    if (error) {
      cb({ error: error });
      return;
    }
    const ordered = [1, 2, 3].map((i) => this.lines[i]).filter(Boolean);
    const top = ordered[0];
    cb({
      bestMove: this.bestMove || (top && top.moves[0]) || null,
      evaluation: top ? this.formatEval(top.kind, top.value, pendingSide) : "0.00",
      lines: ordered.map((line) => ({
        moves: line.moves.slice(0, 6).join(" "),
        uci: line.moves.slice(),
        eval: this.formatEval(line.kind, line.value, pendingSide),
        depth: line.depth
      }))
    });
  }

  fail(message) {
    if (this.worker && this.analyzing) {
      try { this.worker.postMessage("stop"); } catch (e) { /* ignore */ }
    }
    this.finish(message);
  }

  startPending() {
    if (!this.pending || !this.worker || !this.ready) return;
    this.analyzing = true;
    this.lines = {};
    this.bestMove = null;
    const job = this.pending;
    if (job.variant && job.variant !== this.uciVariant) {
      this.worker.postMessage("setoption name UCI_Variant value " + job.variant);
      this.uciVariant = job.variant;
    }
    this.worker.postMessage("position fen " + job.fen);
    this.worker.postMessage("go movetime 2000");
    this.timeoutId = setTimeout(() => {
      if (this.analyzing && this.worker) this.worker.postMessage("stop");
    }, 20000);
  }

  analyzeChess(fen, depth, callback, options) {
    options = options || {};
    const d = Math.max(8, Math.min(22, Number(depth) || 16));
    this.initStockfish();
    if (!this.worker) {
      callback({ error: "Stockfish non disponible" });
      return;
    }
    if (this.analyzing && this.worker) {
      this.worker.postMessage("stop");
      this.analyzing = false;
    }
    this.callback = callback;
    this.pending = {
      fen: fen,
      depth: d,
      side: options.side || "w",
      variant: this.variantOption(options.variant)
    };
    if (this.ready) {
      this.startPending();
    } else {
      this.timeoutId = setTimeout(() => {
        if (!this.ready) this.fail("Stockfish n'a pas démarré");
      }, 45000);
    }
  }

  analyzeGo(goGame) {
    const analysis = goGame.analyze();
    const black = analysis.jp[1];
    const white = analysis.jp[2];
    const lead = Math.abs(black - white);
    const winner = black === white ? "Égalité" : (black > white ? "Noir" : "Blanc");
    const details =
      "Règle japonaise\n" +
      "Noir : " + black.toFixed(1) + "  (territoire " + analysis.terr[1] +
      ", captures " + goGame.captures[1] + ", morts blancs " + analysis.dead[2] + ")\n" +
      "Blanc : " + white.toFixed(1) + "  (territoire " + analysis.terr[2] +
      ", captures " + goGame.captures[2] + ", morts noirs " + analysis.dead[1] +
      ", komi " + goGame.komi + ")\n\n" +
      "Règle chinoise\n" +
      "Noir : " + analysis.ch[1].toFixed(1) + "   Blanc : " + analysis.ch[2].toFixed(1) + "\n\n" +
      (winner === "Égalité"
        ? "Position nulle (écart 0)"
        : "Avantage : " + winner + " de " + lead.toFixed(1) + " points") +
      "\nDame : " + analysis.dame + "  ·  Pierres mortes : " + (analysis.dead[1] + analysis.dead[2]);

    return {
      score: {
        black: black.toFixed(1),
        white: white.toFixed(1),
        winner: winner
      },
      territory: {
        black: analysis.terr[1],
        white: analysis.terr[2]
      },
      captures: {
        black: goGame.captures[1],
        white: goGame.captures[2]
      },
      komi: goGame.komi,
      details: details,
      raw: analysis
    };
  }

  stop() {
    if (this.worker && this.analyzing) {
      this.worker.postMessage("stop");
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.analyzing = false;
    this.callback = null;
    this.pending = null;
  }
}

window.GameAnalysis = GameAnalysis;
