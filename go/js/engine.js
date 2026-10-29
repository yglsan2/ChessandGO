// Moteur de jeu de Go
class GoGame {
  constructor(size = 19) {
    const allowed = [9, 13, 19];
    const n = Number(size);
    this.size = allowed.includes(n) ? n : 19;
    this.board = [];
    this.turn = 1; // 1 = noir, 2 = blanc
    this.captures = [0, 0, 0]; // [unused, noir, blanc]
    this.moves = [];
    this.history = [];
    this.passCount = 0;
    this.over = false;
    this.resigned = false;
    this.komi = 6.5;
    this.handicap = 0;
    this.rules = "japanese"; // japanese | chinese | aga | nz
    
    this.initBoard();
  }

  /** Positions hoshi classiques pour handicap (noir). */
  static handicapPoints(size, n) {
    const h = Math.max(0, Math.min(9, Number(n) || 0));
    if (h < 2) return [];
    let star;
    if (size >= 19) star = [3, 9, 15];
    else if (size >= 13) star = [3, 6, 9];
    else star = [2, 4, 6];
    const [a, m, b] = star;
    // Ordre classique : coin haut-droit, bas-gauche, bas-droit, haut-gauche, puis côtés + centre
    const pts = [
      { x: b, y: a },
      { x: a, y: b },
      { x: b, y: b },
      { x: a, y: a },
      { x: m, y: m },
      { x: a, y: m },
      { x: b, y: m },
      { x: m, y: a },
      { x: m, y: b }
    ];
    // 2 pierres = coins opposés ; 3 = + un coin ; 5 inclut centre ; etc.
    if (h === 2) return [pts[0], pts[1]];
    if (h === 3) return [pts[0], pts[1], pts[2]];
    if (h === 4) return pts.slice(0, 4);
    if (h === 5) return pts.slice(0, 4).concat([pts[4]]);
    if (h === 6) return pts.slice(0, 4).concat([pts[5], pts[6]]);
    if (h === 7) return pts.slice(0, 4).concat([pts[5], pts[6], pts[4]]);
    if (h === 8) return pts.slice(0, 4).concat([pts[5], pts[6], pts[7], pts[8]]);
    return pts.slice(0, 9);
  }

  placeHandicap(n) {
    const h = Math.max(0, Math.min(9, Number(n) || 0));
    this.handicap = h < 2 ? 0 : h;
    if (this.handicap < 2) {
      this.turn = 1;
      return [];
    }
    const pts = GoGame.handicapPoints(this.size, this.handicap);
    pts.forEach((p) => this.set(p.x, p.y, 1));
    this.turn = 2; // Blanc joue en premier après handicap
    // Komi handicap classique JP : 0.5
    if (this.rules === "japanese" && this.komi === 6.5) this.komi = 0.5;
    if (this.rules === "chinese" || this.rules === "aga") {
      // 0.5 + 1 par pierre de handicap (approx AGA/CN)
      this.komi = 0.5 + Math.max(0, this.handicap - (this.rules === "aga" ? 1 : 0));
    }
    return pts;
  }

  /** Annule les passes de fin (retour au jeu après un double-pass involontaire). */
  undoPasses() {
    let removed = 0;
    while (this.moves.length && this.moves[this.moves.length - 1].pass) {
      const m = this.moves.pop();
      this.turn = m.color;
      removed++;
    }
    this.passCount = 0;
    this.over = false;
    this.resigned = false;
    return removed;
  }

  serializeState() {
    return {
      size: this.size,
      board: this.board.map((row) => row.slice()),
      turn: this.turn,
      captures: this.captures.slice(),
      moves: this.moves.map((m) => Object.assign({}, m)),
      passCount: this.passCount,
      over: this.over,
      resigned: this.resigned,
      komi: this.komi,
      handicap: this.handicap,
      rules: this.rules,
      hash: this.getBoardHash()
    };
  }

  loadState(snap) {
    if (!snap || !Array.isArray(snap.board)) return false;
    this.size = snap.size || this.size;
    this.initBoard();
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        this.board[y][x] = (snap.board[y] && snap.board[y][x]) || 0;
      }
    }
    this.turn = snap.turn === 2 ? 2 : 1;
    this.captures = Array.isArray(snap.captures) ? snap.captures.slice() : [0, 0, 0];
    this.moves = Array.isArray(snap.moves) ? snap.moves.map((m) => Object.assign({}, m)) : [];
    this.passCount = snap.passCount | 0;
    this.over = !!snap.over;
    this.resigned = snap.resigned || false;
    this.komi = Number(snap.komi);
    if (!Number.isFinite(this.komi)) this.komi = 6.5;
    this.handicap = snap.handicap | 0;
    this.rules = snap.rules || "japanese";
    return true;
  }

  /** Import SGF minimal (branche principale, sans variations). */
  static fromSgf(text) {
    const src = String(text || "");
    const sz = +(src.match(/SZ\[(\d+)\]/i) || [])[1] || 19;
    const km = parseFloat((src.match(/KM\[([0-9.+-]+)\]/i) || [])[1]);
    const g = new GoGame(sz);
    if (Number.isFinite(km)) g.komi = km;
    const ha = +(src.match(/HA\[(\d+)\]/i) || [])[1] || 0;
    if (ha >= 2) g.placeHandicap(ha);
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const re = /;([BW])\[([a-z]{0,2})\]/gi;
    let m;
    while ((m = re.exec(src))) {
      const color = m[1].toUpperCase() === "B" ? 1 : 2;
      g.turn = color;
      const coord = m[2];
      if (!coord) {
        g.pass();
        continue;
      }
      const x = letters.indexOf(coord[0]);
      const y = letters.indexOf(coord[1]);
      if (x < 0 || y < 0) continue;
      if (!g.play(x, y)) {
        // coup illégal dans SGF : forcer pose
        g.set(x, y, color);
        g.moves.push({ x: x, y: y, pass: false, color: color });
        g.turn = color === 1 ? 2 : 1;
        g.passCount = 0;
      }
    }
    return g;
  }

  initBoard() {
    this.board = [];
    for (let i = 0; i < this.size; i++) {
      this.board[i] = [];
      for (let j = 0; j < this.size; j++) {
        this.board[i][j] = 0;
      }
    }
  }

  inBounds(x, y) {
    return x >= 0 && x < this.size && y >= 0 && y < this.size;
  }

  at(x, y) {
    if (!this.inBounds(x, y)) return -1;
    return this.board[y][x];
  }

  set(x, y, color) {
    if (this.inBounds(x, y)) {
      this.board[y][x] = color;
    }
  }

  getGroup(x, y) {
    const color = this.at(x, y);
    if (color === 0) return [];
    
    const group = [];
    const visited = new Set();
    const stack = [{x, y}];
    
    while (stack.length > 0) {
      const pos = stack.pop();
      const key = pos.x + ',' + pos.y;
      
      if (visited.has(key)) continue;
      visited.add(key);
      
      if (this.at(pos.x, pos.y) === color) {
        group.push(pos);
        
        // Vérifier les 4 directions
        const neighbors = [
          {x: pos.x - 1, y: pos.y},
          {x: pos.x + 1, y: pos.y},
          {x: pos.x, y: pos.y - 1},
          {x: pos.x, y: pos.y + 1}
        ];
        
        for (const n of neighbors) {
          if (this.inBounds(n.x, n.y) && !visited.has(n.x + ',' + n.y)) {
            stack.push(n);
          }
        }
      }
    }
    
    return group;
  }

  getLibertyPoints(group) {
    const liberties = new Map();
    for (const stone of group) {
      this.neighbors4(stone.x, stone.y).forEach((n) => {
        if (this.inBounds(n.x, n.y) && this.at(n.x, n.y) === 0) {
          liberties.set(n.x + "," + n.y, n);
        }
      });
    }
    return Array.from(liberties.values());
  }

  getLiberties(group) {
    const liberties = new Set();
    
    for (const stone of group) {
      const neighbors = [
        {x: stone.x - 1, y: stone.y},
        {x: stone.x + 1, y: stone.y},
        {x: stone.x, y: stone.y - 1},
        {x: stone.x, y: stone.y + 1}
      ];
      
      for (const n of neighbors) {
        if (this.inBounds(n.x, n.y) && this.at(n.x, n.y) === 0) {
          liberties.add(n.x + ',' + n.y);
        }
      }
    }
    
    return liberties.size;
  }

  captureGroup(group, capturingColor) {
    for (const stone of group) {
      this.set(stone.x, stone.y, 0);
    }
    this.captures[capturingColor] += group.length;
  }

  removeCaptures(x, y, color) {
    const opponent = color === 1 ? 2 : 1;
    const neighbors = [
      {x: x - 1, y: y},
      {x: x + 1, y: y},
      {x: x, y: y - 1},
      {x: x, y: y + 1}
    ];
    
    for (const n of neighbors) {
      if (this.at(n.x, n.y) === opponent) {
        const group = this.getGroup(n.x, n.y);
        if (this.getLiberties(group) === 0) {
          this.captureGroup(group, color);
        }
      }
    }
  }

  wouldBeSuicide(x, y, color) {
    const savedBoard = this.board.map((row) => row.slice());
    const savedCaptures = this.captures.slice();
    this.set(x, y, color);
    this.removeCaptures(x, y, color);
    const group = this.getGroup(x, y);
    const suicide = this.getLiberties(group) === 0;
    this.board = savedBoard;
    this.captures = savedCaptures;
    return suicide;
  }

  getBoardHash() {
    return this.board.map(row => row.join(',')).join(';');
  }

  whyIllegal(x, y) {
    if (!this.inBounds(x, y)) return 'Hors du plateau';
    if (this.at(x, y) !== 0) return 'misclic';
    if (this.over) return 'Partie terminée';
    
    // Sauvegarder l'état actuel
    const savedBoard = this.board.map(row => [...row]);
    const savedCaptures = [...this.captures];
    
    // Simuler le coup
    this.set(x, y, this.turn);
    this.removeCaptures(x, y, this.turn);
    
    // Vérifier le suicide
    const group = this.getGroup(x, y);
    const liberties = this.getLiberties(group);
    
    if (liberties === 0) {
      // New Zealand : suicide multi-pierres autorisé
      if (this.rules !== "nz") {
        this.board = savedBoard;
        this.captures = savedCaptures;
        return 'Suicide interdit';
      }
    }
    
    // Vérifier le Ko (simple - position précédente)
    const newHash = this.getBoardHash();
    const prevHash = this.history.length > 0 ? this.history[this.history.length - 1] : null;
    
    // Vérifier aussi le Superko (toutes les positions)
    let koViolation = false;
    if (prevHash === newHash) {
      koViolation = true;
    } else {
      // Superko : vérifier toutes les positions précédentes
      for (let i = 0; i < this.history.length; i++) {
        if (this.history[i] === newHash) {
          koViolation = true;
          break;
        }
      }
    }
    
    // Restaurer l'état
    this.board = savedBoard;
    this.captures = savedCaptures;
    
    if (koViolation) {
      return 'Ko/Superko interdit';
    }
    
    return null;
  }

  play(x, y) {
    const illegal = this.whyIllegal(x, y);
    if (illegal) return false;
    
    // Sauvegarder l'état avant le coup
    this.history.push(this.getBoardHash());
    
    // Poser la pierre
    this.set(x, y, this.turn);
    
    // Retirer les captures
    this.removeCaptures(x, y, this.turn);
    
    // Enregistrer le coup
    this.moves.push({x, y, pass: false, color: this.turn});
    
    // Passer au joueur suivant
    this.turn = this.turn === 1 ? 2 : 1;
    this.passCount = 0;
    
    return true;
  }

  pass() {
    if (this.over) return false;
    
    // Enregistrer le pass
    this.moves.push({x: -1, y: -1, pass: true, color: this.turn});
    
    // Incrémenter le compteur de pass
    this.passCount++;
    
    // Si deux pass consécutifs, la partie est terminée
    if (this.passCount >= 2) {
      this.over = true;
    }
    
    // Changer de joueur
    this.turn = this.turn === 1 ? 2 : 1;
    
    return true;
  }

  resign(color) {
    this.over = true;
    this.resigned = color;
  }

  coord(x, y) {
    const letters = 'ABCDEFGHJKLMNOPQRST';
    return letters[x] + (this.size - y);
  }

  neighbors4(x, y) {
    return [
      { x: x - 1, y: y },
      { x: x + 1, y: y },
      { x: x, y: y - 1 },
      { x: x, y: y + 1 }
    ];
  }

  isVacant(x, y, dead) {
    if (!this.inBounds(x, y)) return false;
    const color = this.at(x, y);
    if (color === 0) return true;
    return !!(dead && dead[y] && dead[y][x]);
  }

  collectGroups(dead) {
    const seen = new Set();
    const groups = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const color = this.at(x, y);
        if (color === 0 || (dead && dead[y][x])) continue;
        const key = x + "," + y;
        if (seen.has(key)) continue;
        const stones = this.getGroup(x, y).filter((s) => !(dead && dead[s.y][s.x]));
        if (!stones.length) continue;
        stones.forEach((s) => seen.add(s.x + "," + s.y));
        groups.push({
          color: color,
          stones: stones,
          id: stones.map((s) => s.x + "," + s.y).sort()[0]
        });
      }
    }
    return groups;
  }

  collectRegions(dead) {
    const seen = new Set();
    const regions = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.isVacant(x, y, dead)) continue;
        const start = x + "," + y;
        if (seen.has(start)) continue;
        const points = [];
        const adjColors = new Set();
        const adjChains = new Set();
        const stack = [{ x: x, y: y }];
        while (stack.length) {
          const pos = stack.pop();
          const key = pos.x + "," + pos.y;
          if (seen.has(key) || !this.isVacant(pos.x, pos.y, dead)) continue;
          seen.add(key);
          points.push(pos);
          this.neighbors4(pos.x, pos.y).forEach((n) => {
            if (!this.inBounds(n.x, n.y)) return;
            if (this.isVacant(n.x, n.y, dead)) {
              stack.push(n);
              return;
            }
            const color = this.at(n.x, n.y);
            if (color > 0 && !(dead && dead[n.y][n.x])) {
              adjColors.add(color);
              const group = this.getGroup(n.x, n.y).filter((s) => !(dead && dead[s.y][s.x]));
              if (group.length) {
                adjChains.add(group.map((s) => s.x + "," + s.y).sort()[0]);
              }
            }
          });
        }
        regions.push({ points: points, adjColors: adjColors, adjChains: adjChains });
      }
    }
    return regions;
  }

  bensonAliveIds(color, dead) {
    const groups = this.collectGroups(dead).filter((g) => g.color === color);
    let remaining = new Set(groups.map((g) => g.id));
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 64) {
      changed = false;
      const vital = {};
      remaining.forEach((id) => { vital[id] = 0; });
      this.collectRegions(dead).forEach((region) => {
        if (region.adjColors.size !== 1 || !region.adjColors.has(color)) return;
        let allInside = true;
        region.adjChains.forEach((id) => {
          if (!remaining.has(id)) allInside = false;
        });
        if (!allInside || region.adjChains.size === 0) return;
        region.adjChains.forEach((id) => { vital[id] = (vital[id] || 0) + 1; });
      });
      remaining.forEach((id) => {
        if ((vital[id] || 0) < 2) {
          remaining.delete(id);
          changed = true;
        }
      });
    }
    return remaining;
  }

  countExclusiveEyes(group, regions) {
    let eyes = 0;
    regions.forEach((region) => {
      if (region.adjColors.size !== 1 || !region.adjColors.has(group.color)) return;
      if (region.adjChains.size !== 1 || !region.adjChains.has(group.id)) return;
      if (region.points.length > 0 && region.points.length <= 6) eyes += 1;
    });
    return eyes;
  }

  isWeakAndEnclosed(group, dead, eyes) {
    if (eyes >= 2) return false;
    const opponent = group.color === 1 ? 2 : 1;
    const libs = this.getLibertyPoints(group.stones);
    if (libs.length === 0) return true;
    if (libs.length > 2) return false;
    const tightlyHeld = libs.every((lib) => {
      return this.neighbors4(lib.x, lib.y).some((n) => {
        if (!this.inBounds(n.x, n.y)) return false;
        if (dead && dead[n.y][n.x]) return false;
        return this.at(n.x, n.y) === opponent;
      });
    });
    if (!tightlyHeld) return false;
    if (eyes === 0) return true;
    return eyes === 1 && libs.length === 1;
  }

  findDeadStones() {
    const dead = [];
    for (let y = 0; y < this.size; y++) {
      dead[y] = [];
      for (let x = 0; x < this.size; x++) dead[y][x] = false;
    }
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 16) {
      changed = false;
      const aliveIds = new Set([
        ...this.bensonAliveIds(1, dead),
        ...this.bensonAliveIds(2, dead)
      ]);
      const regions = this.collectRegions(dead);
      this.collectGroups(dead).forEach((group) => {
        if (aliveIds.has(group.id)) return;
        const eyes = this.countExclusiveEyes(group, regions);
        if (!this.isWeakAndEnclosed(group, dead, eyes)) return;
        group.stones.forEach((s) => {
          if (!dead[s.y][s.x]) {
            dead[s.y][s.x] = true;
            changed = true;
          }
        });
      });
    }
    return dead;
  }

  livingStoneCount(dead) {
    const count = [0, 0, 0];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const color = this.at(x, y);
        if (color > 0 && !(dead && dead[y][x])) count[color]++;
      }
    }
    return count;
  }

  territoryMap(dead) {
    const owner = [];
    for (let y = 0; y < this.size; y++) {
      owner[y] = [];
      for (let x = 0; x < this.size; x++) owner[y][x] = 0;
    }
    const living = this.livingStoneCount(dead);
    const smallMax = this.size <= 9 ? 12 : (this.size <= 13 ? 18 : 25);
    let dame = 0;
    this.collectRegions(dead).forEach((region) => {
      let who = 0;
      if (region.adjColors.size === 1) {
        const color = [...region.adjColors][0];
        const opponent = color === 1 ? 2 : 1;
        if (living[opponent] > 0 || region.points.length <= smallMax) who = color;
      }
      if (!who) dame += region.points.length;
      region.points.forEach((p) => { owner[p.y][p.x] = who; });
    });
    return { owner: owner, dame: dame };
  }

  /** Copie / crée une grille de morts (false partout). */
  emptyDeadMap() {
    const dead = [];
    for (let y = 0; y < this.size; y++) {
      dead[y] = [];
      for (let x = 0; x < this.size; x++) dead[y][x] = false;
    }
    return dead;
  }

  /**
   * Analyse territoriale.
   * @param {{ deadMap?: boolean[][] }} [opts] — morts manuels (sinon Benson auto)
   *
   * Japonais : chaque pierre morte donne 1 prisonnier + 1 point de territoire
   *            (intersection libérée) → compte bien 2× dans le total JP.
   * Chinois  : pierres vivantes + intersections contrôlées (dont points des morts).
   */
  analyze(opts) {
    opts = opts || {};
    const deadMap = opts.deadMap ? opts.deadMap.map((row) => row.slice()) : this.findDeadStones();
    const { owner, dame } = this.territoryMap(deadMap);
    const result = {
      terr: [0, 0, 0],
      emptyTerr: [0, 0, 0],
      stones: [0, 0, 0],
      alive: [0, 0, 0],
      dead: [0, 0, 0],
      dame: dame,
      komi: this.komi,
      jp: [0, 0, 0],
      ch: [0, 0, 0],
      owner: owner,
      deadMap: deadMap
    };

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const color = this.at(x, y);
        if (color > 0) {
          result.stones[color]++;
          if (deadMap[y][x]) result.dead[color]++;
          else result.alive[color]++;
        } else if (owner[y][x] > 0) {
          result.emptyTerr[owner[y][x]]++;
          result.terr[owner[y][x]]++;
        }
      }
    }

    // Points libérés par les morts → territoire affiché
    result.terr[1] += result.dead[2];
    result.terr[2] += result.dead[1];

    // Japonais : territoire (vide + points morts) + prisonniers de partie + morts
    result.jp[1] = result.terr[1] + this.captures[1] + result.dead[2];
    result.jp[2] = result.terr[2] + this.captures[2] + result.dead[1] + this.komi;

    // Chinois : vivant + territoire (vide + points des morts adverses)
    result.ch[1] = result.alive[1] + result.terr[1];
    result.ch[2] = result.alive[2] + result.terr[2] + this.komi;

    const leadJp = result.jp[1] - result.jp[2];
    result.leadJp = leadJp;
    result.winnerJp = leadJp === 0 ? 0 : (leadJp > 0 ? 1 : 2);
    const leadCh = result.ch[1] - result.ch[2];
    result.leadCh = leadCh;
    result.winnerCh = leadCh === 0 ? 0 : (leadCh > 0 ? 1 : 2);
    result.moveCount = this.moves.length;
    result.hash = this.getBoardHash();

    return result;
  }

  /** Bascule une pierre (ou groupe) comme morte/vivante pour le comptage manuel. */
  toggleDeadGroup(x, y, deadMap) {
    if (!this.inBounds(x, y) || !deadMap) return deadMap;
    const color = this.at(x, y);
    if (color === 0) return deadMap;
    const group = this.getGroup(x, y);
    const mark = !deadMap[y][x];
    group.forEach((s) => {
      deadMap[s.y][s.x] = mark;
    });
    return deadMap;
  }

  /** Rejoue la partie jusqu'au coup n (0 = vide). */
  cloneAtMove(n) {
    const g = new GoGame(this.size);
    g.komi = this.komi;
    const limit = Math.max(0, Math.min(n, this.moves.length));
    for (let i = 0; i < limit; i++) {
      const m = this.moves[i];
      if (m.pass) g.pass();
      else g.play(m.x, m.y);
    }
    return g;
  }

  exportSgf(meta) {
    meta = meta || {};
    const sz = this.size;
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const toSgf = (x, y) => letters[x] + letters[y];
    let sgf = "(;FF[4]GM[1]CA[UTF-8]SZ[" + sz + "]KM[" + this.komi + "]";
    if (this.handicap >= 2) {
      sgf += "HA[" + this.handicap + "]AB";
      GoGame.handicapPoints(sz, this.handicap).forEach((p) => {
        sgf += "[" + toSgf(p.x, p.y) + "]";
      });
    }
    if (meta.pb) sgf += "PB[" + String(meta.pb).replace(/[\[\]]/g, "") + "]";
    if (meta.pw) sgf += "PW[" + String(meta.pw).replace(/[\[\]]/g, "") + "]";
    if (meta.dt) sgf += "DT[" + meta.dt + "]";
    if (meta.re) sgf += "RE[" + String(meta.re).replace(/[\[\]]/g, "") + "]";
    this.moves.forEach((m) => {
      // Ne pas rejouer les pierres de handicap dans les coups
      if (m.handicap) return;
      const color = m.color === 1 ? "B" : "W";
      if (m.pass) sgf += ";" + color + "[]";
      else sgf += ";" + color + "[" + toSgf(m.x, m.y) + "]";
    });
    sgf += ")";
    return sgf;
  }

  /** Estimation rapide pour l'UI (règle japonaise). */
  estimate() {
    const a = this.analyze();
    return {
      black: a.jp[1],
      white: a.jp[2],
      lead: a.leadJp,
      winner: a.winnerJp,
      dame: a.dame,
      dead: a.dead[1] + a.dead[2],
      raw: a
    };
  }
}

window.GoGame = GoGame;
