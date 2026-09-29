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
    
    this.initBoard();
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
    if (this.at(x, y) !== 0) return 'Case occupée';
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
      // Restaurer
      this.board = savedBoard;
      this.captures = savedCaptures;
      return 'Suicide interdit';
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

  analyze() {
    const deadMap = this.findDeadStones();
    const { owner, dame } = this.territoryMap(deadMap);
    const result = {
      terr: [0, 0, 0],
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
          result.terr[owner[y][x]]++;
        }
      }
    }

    // Un point occupé par une pierre morte devient territoire une fois retirée.
    result.terr[1] += result.dead[2];
    result.terr[2] += result.dead[1];

    // Japonais : territoire + prisonniers (captures + morts) + komi
    result.jp[1] = result.terr[1] + this.captures[1] + result.dead[2];
    result.jp[2] = result.terr[2] + this.captures[2] + result.dead[1] + this.komi;

    // Chinois : pierres vivantes + territoire + komi
    result.ch[1] = result.alive[1] + result.terr[1];
    result.ch[2] = result.alive[2] + result.terr[2] + this.komi;

    return result;
  }
}

window.GoGame = GoGame;
