/**
 * Leçons / puzzles pédagogiques échecs (style Lichess / ChessBase).
 * Chaque leçon porte phase + rubriques stratégiques.
 */
(function (global) {
  const LESSONS = [
    {
      id: "mate-1",
      title: "Mat en 1 — corridor",
      level: "débutant",
      phase: "endgame",
      themes: ["back-rank", "king-attack"],
      goal: "Les Blancs jouent et font mat en un coup.",
      fen: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
      answers: [{ from: "f7", to: "h7", san: "Qh7#" }],
      hint: "La dame peut coller le roi sur la bande.",
      comment: "Qh7# — mat du couloir (back rank / bord)."
    },
    {
      id: "fork-1",
      title: "Fourchette de cavalier",
      level: "débutant",
      phase: "opening",
      themes: ["fork", "hanging"],
      goal: "Les Blancs gagnent du matériel par fourchette.",
      fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
      answers: [{ from: "f3", to: "e5", san: "Nxe5" }],
      hint: "Le cavalier f3 attaque e5 non défendu… et autre chose ?",
      comment: "Nxe5 — motif fourchette / pièce en prise."
    },
    {
      id: "pin-1",
      title: "Clouage — gagner du matériel",
      level: "intermédiaire",
      phase: "opening",
      themes: ["pin", "sacrifice", "king-attack"],
      goal: "Exploitez le clouage / sacrifice sur f7.",
      fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5",
      answers: [{ from: "c4", to: "f7", san: "Bxf7+" }],
      hint: "Le roi et la dame sont liés sur la diagonale…",
      comment: "Bxf7+ — attraction / pression sur le roi non roqué."
    },
    {
      id: "endgame-1",
      title: "Opposition — finale de rois",
      level: "intermédiaire",
      phase: "endgame",
      themes: ["king-activity", "zugzwang", "passed"],
      goal: "Les Blancs prennent l'opposition et progressent.",
      fen: "8/8/4k3/8/4K3/8/8/8 w - - 0 1",
      answers: [{ from: "e4", to: "e5", san: "Ke5" }, { from: "e4", to: "d5", san: "Kd5" }, { from: "e4", to: "f5", san: "Kf5" }],
      hint: "Approchez-vous du roi adverse en face-à-face.",
      comment: "Ke5 — roi actif et opposition."
    },
    {
      id: "color-light-1",
      title: "Jeu de couleur — cases claires",
      level: "intermédiaire",
      phase: "middlegame",
      themes: ["color-light", "color-complex", "good-bishop", "attack-weakness"],
      goal: "Exploitez la faiblesse des cases blanches autour du roi noir.",
      fen: "r2q1rk1/ppp2ppp/2n1bn2/3p4/3P4/2PB1N2/PP3PPP/R1BQ1RK1 w - - 0 10",
      answers: [{ from: "d3", to: "h7", san: "Bxh7+" }],
      hint: "Le fou clair vise h7 — classique cadeau grec / complexe clair.",
      comment: "Bxh7+ ouvre le complexe de cases claires autour du roi.",
      colorOverlay: "light"
    },
    {
      id: "color-dark-1",
      title: "Jeu de couleur — cases sombres",
      level: "intermédiaire",
      phase: "middlegame",
      themes: ["color-dark", "color-complex", "opp-bishops", "king-attack"],
      goal: "Dominez le complexe sombre (fou / dame).",
      fen: "r1b2rk1/pp2qppp/2n1pn2/2pp4/3P4/2PBP1B1/PP1N1PPP/R2QK2R w KQ - 0 10",
      answers: [{ from: "g3", to: "d6", san: "Bd6" }, { from: "d1", to: "g4", san: "Qg4" }],
      hint: "Les cases sombres autour du roi noir manquent de défenseurs.",
      comment: "Le fou sombre et la dame jouent sur le même complexe.",
      colorOverlay: "dark"
    },
    {
      id: "structure-iso",
      title: "Pion isolé — pression",
      level: "avancé",
      phase: "middlegame",
      themes: ["isolated", "strong-rooks", "attack-weakness", "blockade"],
      goal: "Mettez la pression sur le pion isolé d5.",
      fen: "r2q1rk1/pp2bppp/2n1bn2/3p4/3P4/2N1BN2/PP2BPPP/R2Q1RK1 w - - 0 11",
      answers: [{ from: "f3", to: "e5", san: "Ne5" }, { from: "c3", to: "b5", san: "Nb5" }],
      hint: "Occupez les cases devant / autour de l'isolani.",
      comment: "Blocage et pression sur d5 — thème Structure ChessBase."
    },
    {
      id: "plan-minority",
      title: "Attaque de minorité",
      level: "avancé",
      phase: "middlegame",
      themes: ["minority", "qs-majority", "pawn-break", "qs-attack"],
      goal: "Lancez le plan b4–b5 typique (structure Carlsbad).",
      fen: "r2q1rk1/pp2ppbp/2n3p1/3p4/3P1B2/2N2N2/PPP2PPP/R2Q1RK1 w - - 0 11",
      answers: [{ from: "b2", to: "b4", san: "b4" }],
      hint: "À l'aile dame, avancez le pion b pour fragiliser c6/d5.",
      comment: "b4 — début de l'attaque de minorité (Plans ChessBase)."
    },
    {
      id: "opp-bishops-attack",
      title: "Fous de couleurs opposées — attaque",
      level: "avancé",
      phase: "middlegame",
      themes: ["opp-bishops", "opp-color-attack", "king-attack", "color-complex"],
      goal: "Avec fous de couleurs opposées, attaquez le roi.",
      fen: "r4rk1/ppp2ppp/3qbn2/8/3P4/2PB2Q1/PP3PPP/R4RK1 w - - 0 14",
      answers: [{ from: "g3", to: "g7", san: "Qxg7#" }, { from: "d3", to: "h7", san: "Bxh7+" }],
      hint: "L'attaquant joue sur sa couleur ; le défenseur ne peut pas contester.",
      comment: "Thème ChessBase : opposite-coloured bishops favour the attacker."
    },
    {
      id: "empty",
      title: "Position libre — démo",
      level: "tous",
      phase: "opening",
      themes: [],
      goal: "Échiquier de départ pour expliquer une ouverture.",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      answers: [],
      hint: "",
      comment: "Choisissez une phase + rubriques, puis fléchez / expliquez."
    }
  ];

  function list(filter) {
    filter = filter || {};
    return LESSONS.filter((l) => {
      if (filter.phase && l.phase !== filter.phase) return false;
      if (filter.theme && !(l.themes || []).includes(filter.theme)) return false;
      return true;
    }).map((l) => ({
      id: l.id,
      title: l.title,
      level: l.level,
      phase: l.phase,
      themes: l.themes || [],
      goal: l.goal
    }));
  }

  function get(id) {
    return LESSONS.find((l) => l.id === id) || null;
  }

  global.ChessTeachingLessons = {
    LESSONS: LESSONS,
    list: list,
    get: get
  };
})(window);
