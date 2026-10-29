/**
 * Analyse Go : API KataGo si CONFIG.katagoUrl, sinon revue heuristique locale
 * (Benson + pivots) + SGF pour Lizzie / KaTrain / Sabaki.
 */
(function (global) {
  function localHeuristic(goGame, analysisApi) {
    const score = analysisApi && analysisApi.analyzeGo
      ? analysisApi.analyzeGo(goGame)
      : null;
    const review = analysisApi && analysisApi.reviewGo
      ? analysisApi.reviewGo(goGame)
      : null;
    let text = "— Analyse locale (sans KataGo) —\n\n";
    if (score) text += score.details + "\n\n";
    if (review) text += review.details + "\n";
    text += "\nPour une analyse NN : configurez KATAGO_URL ou ouvrez le SGF dans Lizzie / KaTrain.";
    return {
      ok: true,
      local: true,
      message: text,
      score: score,
      review: review,
      sgf: goGame.exportSgf({ pb: "Noir", pw: "Blanc", dt: new Date().toISOString().slice(0, 10) })
    };
  }

  async function analyzePosition(goGame, opts) {
    opts = opts || {};
    const url = (global.CONFIG && CONFIG.katagoUrl) || opts.url || "";
    if (!url) {
      return localHeuristic(goGame, opts.analysis || global.GameAnalysis && null);
    }
    try {
      const body = {
        sgf: goGame.exportSgf(opts.meta || {}),
        moves: goGame.moves.length,
        size: goGame.size,
        komi: goGame.komi,
        maxVisits: opts.maxVisits || 400
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      return { ok: true, data: data, local: false };
    } catch (err) {
      const fallback = localHeuristic(goGame, opts.analysis);
      fallback.message = "KataGo injoignable (" + (err.message || err) + ")\n\n" + fallback.message;
      fallback.katagoError = String(err.message || err);
      return fallback;
    }
  }

  global.KataGoClient = {
    analyzePosition: analyzePosition,
    localHeuristic: localHeuristic
  };
})(window);
