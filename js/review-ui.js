/**
 * UI review / teaching branchée sur ReviewTree + goban.
 */
(function (global) {
  function wireReview(ctx) {
    let tree = null;
    let active = false;

    function ensureTree() {
      if (!ctx.state.go) return null;
      if (!tree) {
        tree = new global.ReviewTree(ctx.state.go);
      }
      return tree;
    }

    function syncBoard() {
      const t = ensureTree();
      if (!t || !ctx.state.go) return;
      const g = t.buildGameAtCursor(
        ctx.state.go.size,
        ctx.state.go.komi,
        ctx.state.go.handicap,
        ctx.state.go.rules
      );
      // Affichage review : ne remplace pas la partie live sauf en mode teaching
      ctx.state.reviewGame = g;
      ctx.state.reviewActive = active;
      if (ctx.paintReview) ctx.paintReview(g);
      else if (ctx.renderGo) ctx.renderGo();
      const st = document.getElementById("reviewStatus");
      if (st) st.textContent = t.statusText();
      const cmt = document.getElementById("reviewComment");
      if (cmt && document.activeElement !== cmt) cmt.value = t.cursor.comment || "";
    }

    function enter() {
      active = true;
      tree = new global.ReviewTree(ctx.state.go);
      tree.goEndMain();
      ctx.state.teaching = true;
      const panel = document.getElementById("reviewPanel");
      if (panel) panel.style.display = "block";
      syncBoard();
      if (ctx.setStatus) ctx.setStatus("Mode review / teaching", "ok");
    }

    function exit() {
      active = false;
      ctx.state.reviewActive = false;
      ctx.state.reviewGame = null;
      ctx.state.teaching = false;
      const panel = document.getElementById("reviewPanel");
      if (panel) panel.style.display = "none";
      if (ctx.renderGo) ctx.renderGo();
      if (ctx.setStatus) ctx.setStatus("Review fermée", "ok");
    }

    function onBoardClick(x, y) {
      if (!active || !tree || !ctx.state.go) return false;
      const g = tree.buildGameAtCursor(
        ctx.state.go.size,
        ctx.state.go.komi,
        ctx.state.go.handicap,
        ctx.state.go.rules
      );
      if (g.over) return true;
      const color = g.turn;
      const ok = g.play(x, y);
      if (!ok) return true;
      const last = g.moves[g.moves.length - 1];
      tree.playVariation(last);
      syncBoard();
      return true;
    }

    const btnEnter = document.getElementById("btnReview");
    const btnExit = document.getElementById("btnReviewExit");
    const btnBack = document.getElementById("btnReviewBack");
    const btnFwd = document.getElementById("btnReviewFwd");
    const btnRoot = document.getElementById("btnReviewRoot");
    const btnEnd = document.getElementById("btnReviewEnd");
    const btnBranch = document.getElementById("btnReviewBranch");
    const btnExport = document.getElementById("btnReviewExport");
    const cmt = document.getElementById("reviewComment");

    if (btnEnter) btnEnter.addEventListener("click", enter);
    if (btnExit) btnExit.addEventListener("click", exit);
    if (btnBack) btnBack.addEventListener("click", () => { if (tree) { tree.back(); syncBoard(); } });
    if (btnFwd) btnFwd.addEventListener("click", () => { if (tree) { tree.forward(0); syncBoard(); } });
    if (btnRoot) btnRoot.addEventListener("click", () => { if (tree) { tree.goRoot(); syncBoard(); } });
    if (btnEnd) btnEnd.addEventListener("click", () => { if (tree) { tree.goEndMain(); syncBoard(); } });
    if (btnBranch) {
      btnBranch.addEventListener("click", () => {
        if (!tree) return;
        const n = tree.branchCount();
        if (n < 2) {
          if (ctx.setStatus) ctx.setStatus("Pas d'autre branche ici", "err");
          return;
        }
        // cycle branches
        const cur = tree.cursor.children.indexOf
          ? 0
          : 0;
        tree.forward(1);
        syncBoard();
      });
    }
    if (btnExport) {
      btnExport.addEventListener("click", () => {
        if (!tree) return;
        const sgf = tree.exportSgf({
          size: ctx.state.go.size,
          komi: ctx.state.go.komi,
          pb: "Noir",
          pw: "Blanc"
        });
        if (global.GoFeatures && GoFeatures.downloadText) {
          GoFeatures.downloadText("review-" + Date.now() + ".sgf", sgf);
        }
        if (ctx.setStatus) ctx.setStatus("SGF variations exporté", "ok");
      });
    }
    if (cmt) {
      cmt.addEventListener("change", () => {
        if (tree) tree.setComment(cmt.value);
      });
    }

    return {
      enter: enter,
      exit: exit,
      onBoardClick: onBoardClick,
      isActive: () => active,
      syncBoard: syncBoard,
      getTree: () => tree
    };
  }

  global.ReviewUI = { wire: wireReview };
})(window);
