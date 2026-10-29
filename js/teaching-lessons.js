/**
 * Bibliothèque de positions pédagogiques (tsumego / formes classiques).
 * Coordonnées : x,y depuis le coin haut-gauche (0-based), couleur 1=N 2=B.
 */
(function (global) {
  const LESSONS = [
    {
      id: "capture-1",
      title: "Capture — atari simple",
      size: 9,
      level: "débutant",
      goal: "Noir en trait : capturez la pierre blanche.",
      setup: [
        [2, 2, 1], [3, 2, 1], [2, 3, 1],
        [3, 3, 2]
      ],
      turn: 1,
      answers: [{ x: 3, y: 4 }],
      hint: "Comptez les libertés de la pierre blanche.",
      comment: "La blanche n'a plus qu'une liberté en (4,4) → atari. Jouez dessus pour capturer."
    },
    {
      id: "connect-1",
      title: "Connexion — sauver deux pierres",
      size: 9,
      level: "débutant",
      goal: "Noir en trait : connectez vos pierres menacées.",
      setup: [
        [2, 2, 1], [4, 2, 1],
        [3, 1, 2], [3, 3, 2]
      ],
      turn: 1,
      answers: [{ x: 3, y: 2 }],
      hint: "Il manque un point entre vos deux pierres.",
      comment: "Sans connexion en (3,3), les noires sont séparées et fragiles."
    },
    {
      id: "eye-1",
      title: "Deux yeux — forme vivante",
      size: 9,
      level: "débutant",
      goal: "Noir : assurez deux yeux (jouez le point vital).",
      setup: [
        [1, 1, 1], [2, 1, 1], [3, 1, 1],
        [1, 2, 1], [3, 2, 1],
        [1, 3, 1], [2, 3, 1], [3, 3, 1],
        [0, 1, 2], [0, 2, 2], [0, 3, 2],
        [1, 0, 2], [2, 0, 2], [3, 0, 2],
        [4, 1, 2], [4, 2, 2], [4, 3, 2],
        [1, 4, 2], [2, 4, 2], [3, 4, 2]
      ],
      turn: 1,
      answers: [{ x: 2, y: 2 }],
      hint: "Où se forme le second œil ?",
      comment: "Le centre (3,3) crée deux yeux. Si Blanc y joue, le groupe meurt."
    },
    {
      id: "ladder-1",
      title: "Shicho — échelle",
      size: 9,
      level: "intermédiaire",
      goal: "Noir : capturez par échelle (premier coup).",
      setup: [
        [2, 1, 1], [1, 2, 1],
        [2, 2, 2]
      ],
      turn: 1,
      answers: [{ x: 3, y: 2 }, { x: 2, y: 3 }],
      hint: "Atari en diagonale — continuez la ligne d'échelle.",
      sequence: [
        { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }
      ],
      comment: "Atari en poursuivant l'échelle. Deux premières cases possibles selon la direction."
    },
    {
      id: "snapback",
      title: "Snapback — oubli classique",
      size: 9,
      level: "intermédiaire",
      goal: "Noir : capturez en snapback.",
      setup: [
        [3, 2, 1], [4, 2, 1], [5, 2, 1],
        [3, 3, 1], [5, 3, 1],
        [3, 4, 1], [4, 4, 1], [5, 4, 1],
        [4, 3, 2]
      ],
      turn: 1,
      answers: [{ x: 4, y: 3 }],
      hint: "La blanche n'a qu'une liberté — mais attention au retour.",
      comment: "Blanc n'a qu'une liberté. Si vous capturez « bêtement » ailleurs, regardez le snapback !"
    },
    {
      id: "corner-3-3",
      title: "Invasion 3-3",
      size: 13,
      level: "intermédiaire",
      goal: "Blanc : invadez le coin en 3-3 (point classique).",
      setup: [
        [2, 2, 1], [3, 3, 1]
      ],
      turn: 2,
      answers: [{ x: 2, y: 3 }, { x: 3, y: 2 }],
      comment: "Le 3-3 (selon orientation) réduit le coin. Ici (3,4) ou (4,3)."
    },
    {
      id: "empty",
      title: "Goban vide — démo libre",
      size: 19,
      level: "tous",
      goal: "Position libre pour expliquer (joseki, fuseki…).",
      setup: [],
      turn: 1,
      answers: [],
      comment: "Take Control puis posez les pierres pour votre leçon."
    }
  ];

  function applyLesson(goGame, lesson) {
    if (!goGame || !lesson) return null;
    const size = lesson.size || goGame.size;
    const g = new global.GoGame(size);
    g.komi = goGame.komi;
    g.rules = goGame.rules || "japanese";
    (lesson.setup || []).forEach((s) => {
      g.set(s[0], s[1], s[2]);
    });
    g.turn = lesson.turn === 2 ? 2 : 1;
    g.moves = [];
    g.passCount = 0;
    g.over = false;
    return g;
  }

  function listLessons() {
    return LESSONS.map((l) => ({
      id: l.id,
      title: l.title,
      size: l.size,
      level: l.level,
      goal: l.goal
    }));
  }

  function getLesson(id) {
    return LESSONS.find((l) => l.id === id) || null;
  }

  /** Parcours débutant = chapitres (style Lichess Study). */
  const PLANS = [
    {
      id: "debutant-1",
      title: "Parcours débutant",
      chapters: ["capture-1", "connect-1", "eye-1", "ladder-1", "snapback"]
    },
    {
      id: "demo-libre",
      title: "Démo libre 19×19",
      chapters: ["empty"]
    }
  ];

  function listPlans() {
    return PLANS.map((p) => ({
      id: p.id,
      title: p.title,
      count: p.chapters.length
    }));
  }

  function getPlan(id) {
    const p = PLANS.find((x) => x.id === id);
    if (!p) return null;
    return {
      id: p.id,
      title: p.title,
      chapters: p.chapters.map((cid) => getLesson(cid)).filter(Boolean)
    };
  }

  global.TeachingLessons = {
    LESSONS: LESSONS,
    PLANS: PLANS,
    list: listLessons,
    get: getLesson,
    apply: applyLesson,
    listPlans: listPlans,
    getPlan: getPlan
  };
})(window);
