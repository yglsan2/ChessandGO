/**
 * Rubriques pédagogiques échecs — inspiré ChessBase 18 / Fritz Training / ChessTempo.
 * Phases de jeu + Structure / Pièces / Plans + jeu de couleur + motifs tactiques.
 */
(function (global) {
  const PHASES = [
    {
      id: "opening",
      label: "Ouverture",
      short: "Ouv.",
      blurb: "Développement, centre, roque, combats au 1er tiers."
    },
    {
      id: "middlegame",
      label: "Milieu de partie",
      short: "Milieu",
      blurb: "Plans, attaques, structures, transformations."
    },
    {
      id: "endgame",
      label: "Finale",
      short: "Finale",
      blurb: "Roi actif, pions passés, technique, zugzwang."
    }
  ];

  /** ChessBase 18 — catégorie Structure */
  const STRUCTURE = [
    { id: "space", label: "Avantage d'espace", desc: "Contrôle de cases / restriction adverse" },
    { id: "qs-majority", label: "Majorité à l'aile dame", desc: "Créer un pion passé à l'aile" },
    { id: "ks-majority", label: "Majorité à l'aile roi", desc: "Poussée ou attaque liée aux pions" },
    { id: "isolated", label: "Pion isolé", desc: "Force dynamique vs faiblesse chronique" },
    { id: "hanging", label: "Pions pendants", desc: "c4/d4 (ou c5/d5) — tension centrale" },
    { id: "doubled", label: "Pions doublés", desc: "Faiblesse ou colonne semi-ouverte" },
    { id: "backward", label: "Pion arriéré", desc: "Case forte adverse devant le pion" },
    { id: "passed", label: "Pion passé", desc: "Promotion / diversion" },
    { id: "pawn-chain", label: "Chaîne de pions", desc: "Base / tête de chaîne — où attaquer" },
    { id: "pawn-break", label: "Brisure de pions", desc: "f5, c5, e5, b5… ouvrir la position" },
    { id: "closed", label: "Position fermée", desc: "Manœuvres, cavaliers, ruptures" },
    { id: "open", label: "Position ouverte", desc: "Fous, tours, initiative" }
  ];

  /** ChessBase 18 — catégorie Pièces */
  const PIECES = [
    { id: "opp-bishops", label: "Fous de couleurs opposées", desc: "Attaque souvent favorisée" },
    { id: "same-bishops", label: "Fous de même couleur", desc: "Jeu sur une couleur dominante" },
    { id: "bishop-pair", label: "Paire de fous", desc: "Long terme en position ouverte" },
    { id: "good-bishop", label: "Bon fou", desc: "Hors de sa chaîne de pions" },
    { id: "bad-bishop", label: "Mauvais fou", desc: "Bloqué par ses propres pions" },
    { id: "strong-knights", label: "Cavaliers forts / avant-poste", desc: "Case protégée non chassable" },
    { id: "strong-rooks", label: "Tours actives", desc: "Colonnes ouvertes, 7e rangée" },
    { id: "rook-7th", label: "Tour en 7e", desc: "Pression maximale sur le camp adverse" },
    { id: "queen-central", label: "Dame centralisée", desc: "Domination / menaces multiples" },
    { id: "king-activity", label: "Roi actif", desc: "Essentiel en finale" },
    { id: "trapped-piece", label: "Pièce coincée", desc: "Manque de cases de fuite" },
    { id: "exchange-sac", label: "Sacrifice d'échange", desc: "Tour contre pièce mineure + compensation" }
  ];

  /** ChessBase 18 — catégorie Plans */
  const PLANS = [
    { id: "attack-weakness", label: "Attaquer une faiblesse", desc: "Cible fixe (pion, case, roi)" },
    { id: "king-attack", label: "Attaque sur le roi", desc: "Aile roi / roques opposés" },
    { id: "qs-attack", label: "Attaque à l'aile dame", desc: "Expansion ou minorité" },
    { id: "minority", label: "Attaque de minorité", desc: "b4–b5 vs structure Carlsbad" },
    { id: "successful-defence", label: "Défense réussie", desc: "Parades précises, contrejeu" },
    { id: "prophylaxis", label: "Prophylaxie", desc: "Empêcher le plan adverse" },
    { id: "improve-worst", label: "Améliorer la pire pièce", desc: "Principe Nimzowitsch / Karpov" },
    { id: "transform", label: "Transformer l'avantage", desc: "Matériel → position ou finale" },
    { id: "blockade", label: "Blocus", desc: "Bloquer un pion passé / chaîne" },
    { id: "simplification", label: "Simplification", desc: "Échanges favorables" },
    { id: "initiative", label: "Initiative", desc: "Menaces continues, temps" },
    { id: "counterplay", label: "Contrejeu", desc: "Activité plutôt que défense passive" }
  ];

  /** Jeu de couleur — ChessBase « Attack on a colour complex » / problèmes ChessBase */
  const COLOR = [
    {
      id: "color-light",
      label: "Cases blanches (claires)",
      desc: "Domination / faiblesses du complexe clair",
      overlay: "light"
    },
    {
      id: "color-dark",
      label: "Cases noires (sombres)",
      desc: "Domination / faiblesses du complexe sombre",
      overlay: "dark"
    },
    {
      id: "color-complex",
      label: "Jeu de couleur / complexe",
      desc: "Contrôle d'une couleur entière (fous, dames, pions)",
      overlay: "complex"
    },
    {
      id: "color-weak",
      label: "Faiblesses de couleur",
      desc: "Cases d'une couleur non défendables",
      overlay: "weak"
    },
    {
      id: "color-hole",
      label: "Trous / avant-postes",
      desc: "Cases faibles (ex. e5, d6, f5) d'une couleur"
    },
    {
      id: "opp-color-attack",
      label: "Attaque fous de couleurs opposées",
      desc: "L'attaquant joue sur « sa » couleur"
    }
  ];

  /** Motifs tactiques (ChessTempo / Lichess) */
  const TACTICS = [
    { id: "fork", label: "Fourchette" },
    { id: "pin", label: "Clouage" },
    { id: "skewer", label: "Enfilade" },
    { id: "discovery", label: "Attaque à découverte" },
    { id: "double-check", label: "Double échec" },
    { id: "deflection", label: "Déviation" },
    { id: "decoy", label: "Attraction" },
    { id: "clearance", label: "Dégagement" },
    { id: "interference", label: "Interférence" },
    { id: "zwischenzug", label: "Coup intermédiaire" },
    { id: "xray", label: "Rayons X" },
    { id: "sacrifice", label: "Sacrifice" },
    { id: "greek-gift", label: "Cadeau grec (Fxh7+)" },
    { id: "back-rank", label: "Mat du couloir" },
    { id: "smothered", label: "Mat à l'étouffée" },
    { id: "zugzwang", label: "Zugzwang" },
    { id: "promotion", label: "Promotion" },
    { id: "hanging", label: "Pièce en prise" },
    { id: "overload", label: "Surcharge" },
    { id: "quiet", label: "Coup silencieux" }
  ];

  /** Drills Fritz/ChessBase : Attack / Check / Defence */
  const DRILLS = [
    {
      id: "drill-attack",
      label: "Repérer les prises",
      type: "attack",
      blurb: "Cliquez toutes les pièces qui sont en prise (ChessBase Attack)."
    },
    {
      id: "drill-check",
      label: "Repérer les échecs",
      type: "check",
      blurb: "Cliquez les cases depuis lesquelles on peut donner échec."
    },
    {
      id: "drill-defence",
      label: "Cases non défendues",
      type: "defence",
      blurb: "Cliquez les cases de votre camp non protégées (ChessBase Defence)."
    },
    {
      id: "drill-color",
      label: "Exercice jeu de couleur",
      type: "color",
      blurb: "Identifiez les cases faibles du complexe demandé."
    }
  ];

  const GROUPS = [
    { id: "structure", label: "Structure", items: STRUCTURE },
    { id: "pieces", label: "Pièces", items: PIECES },
    { id: "plans", label: "Plans", items: PLANS },
    { id: "color", label: "Jeu de couleur", items: COLOR },
    { id: "tactics", label: "Tactique", items: TACTICS }
  ];

  function allThemes() {
    const out = [];
    GROUPS.forEach((g) => {
      g.items.forEach((it) => {
        out.push(Object.assign({ group: g.id, groupLabel: g.label }, it));
      });
    });
    return out;
  }

  function getTheme(id) {
    return allThemes().find((t) => t.id === id) || null;
  }

  function getPhase(id) {
    return PHASES.find((p) => p.id === id) || null;
  }

  function getDrill(id) {
    return DRILLS.find((d) => d.id === id) || null;
  }

  /** Case claire (a1 sombre en standard) — a1 = file0+rank0 pair → dark */
  function isLightSquare(sq) {
    const file = sq.charCodeAt(0) - 97;
    const rank = Number(sq[1]) - 1;
    return (file + rank) % 2 === 1;
  }

  function squaresOfColor(color /* light|dark */) {
    const files = "abcdefgh";
    const out = [];
    for (let r = 1; r <= 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = files[f] + r;
        const light = isLightSquare(sq);
        if (color === "light" && light) out.push(sq);
        if (color === "dark" && !light) out.push(sq);
      }
    }
    return out;
  }

  /**
   * Calcul drill Attack : pièces capturables par l'adversaire au trait.
   * createChess() → instance chess.js ; fen position.
   */
  function computeDrillTargets(type, fen, createChess) {
    if (!createChess || !fen) return [];
    const c = createChess();
    if (!c.load(fen)) return [];
    const turn = c.turn();
    const enemy = turn === "w" ? "b" : "w";
    const files = "abcdefgh";
    const targets = [];

    if (type === "attack") {
      // Toutes les pièces (des deux camps) actuellement capturables
      const board = createChess();
      board.load(fen);
      for (let r = 1; r <= 8; r++) {
        for (let f = 0; f < 8; f++) {
          const sq = files[f] + r;
          const piece = board.get(sq);
          if (!piece) continue;
          // Une pièce est « en prise » si l'adversaire peut la capturer
          const attackerColor = piece.color === "w" ? "b" : "w";
          if (isSquareAttackedBy(board, sq, attackerColor, createChess, fen)) {
            targets.push(sq);
          }
        }
      }
      return targets;
    }

    if (type === "check") {
      // Cases où une pièce du camp au trait peut se poser pour échec
      const moves = c.moves({ verbose: true });
      const seen = {};
      moves.forEach((m) => {
        if (m.san.indexOf("+") >= 0 || m.san.indexOf("#") >= 0) {
          if (!seen[m.to]) {
            seen[m.to] = true;
            targets.push(m.to);
          }
        }
      });
      return targets;
    }

    if (type === "defence") {
      // Cases occupées ou vides de notre camp non défendues par nous
      for (let r = 1; r <= 8; r++) {
        for (let f = 0; f < 8; f++) {
          const sq = files[f] + r;
          const piece = c.get(sq);
          // Cases « à défendre » : nos pièces + cases autour du roi (simplifié : nos pièces non défendues)
          if (piece && piece.color === turn) {
            if (!isSquareAttackedBy(c, sq, turn, createChess, fen)) {
              targets.push(sq);
            }
          }
        }
      }
      return targets;
    }

    if (type === "color") {
      return squaresOfColor("light"); // défaut ; l'UI précise light/dark
    }

    return targets;
  }

  function isSquareAttackedBy(chess, sq, byColor, createChess, fen) {
    // chess.js : moves of opposite side that capture on sq
    // Astuce : charger position avec trait = byColor et voir captures vers sq
    try {
      const tmp = createChess();
      const parts = String(fen).split(" ");
      parts[1] = byColor;
      if (!tmp.load(parts.join(" "))) return false;
      const moves = tmp.moves({ verbose: true });
      return moves.some((m) => m.to === sq && m.flags && m.flags.indexOf("c") >= 0);
    } catch (_) {
      return false;
    }
  }

  global.ChessTeachingThemes = {
    PHASES: PHASES,
    STRUCTURE: STRUCTURE,
    PIECES: PIECES,
    PLANS: PLANS,
    COLOR: COLOR,
    TACTICS: TACTICS,
    DRILLS: DRILLS,
    GROUPS: GROUPS,
    allThemes: allThemes,
    getTheme: getTheme,
    getPhase: getPhase,
    getDrill: getDrill,
    isLightSquare: isLightSquare,
    squaresOfColor: squaresOfColor,
    computeDrillTargets: computeDrillTargets
  };
})(window);
