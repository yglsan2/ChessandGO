/**
 * Arbre de variations / review teaching.
 * La ligne principale = partie réelle ; les branches = exploration.
 */
(function (global) {
  function nodeId() {
    return "n" + Math.random().toString(16).slice(2, 10);
  }

  class ReviewTree {
    constructor(goGame) {
      this.root = {
        id: nodeId(),
        move: null,
        comment: "",
        nag: "",
        label: "",
        children: [],
        parent: null
      };
      this.cursor = this.root;
      this.mainPath = [this.root.id];
      this.teaching = false;
      if (goGame && goGame.moves) {
        goGame.moves.forEach((m) => this.appendMain(m));
        this.cursor = this.root;
        // avance au bout de la ligne principale
        while (this.cursor.children[0]) this.cursor = this.cursor.children[0];
      }
    }

    appendMain(move) {
      const n = {
        id: nodeId(),
        move: Object.assign({}, move),
        comment: "",
        nag: "",
        label: "",
        children: [],
        parent: null
      };
      // Toujours enfant 0 = ligne principale
      let tip = this.root;
      while (tip.children[0]) tip = tip.children[0];
      n.parent = tip;
      tip.children.unshift(n);
      this.mainPath.push(n.id);
      return n;
    }

    /** Joue une exploration depuis le curseur (branche). */
    playVariation(move) {
      const existing = this.cursor.children.find((c) =>
        c.move &&
        !!c.move.pass === !!move.pass &&
        c.move.x === move.x &&
        c.move.y === move.y &&
        c.move.color === move.color
      );
      if (existing) {
        this.cursor = existing;
        return existing;
      }
      const n = {
        id: nodeId(),
        move: Object.assign({}, move),
        comment: "",
        nag: "",
        label: "",
        children: [],
        parent: this.cursor
      };
      this.cursor.children.push(n);
      this.cursor = n;
      return n;
    }

    /** Supprime la branche courante (OGS Delete). */
    deleteBranch() {
      if (!this.cursor || !this.cursor.parent) return false;
      const parent = this.cursor.parent;
      const idx = parent.children.indexOf(this.cursor);
      if (idx < 0) return false;
      parent.children.splice(idx, 1);
      this.cursor = parent;
      return true;
    }

    setNag(nag) {
      if (!this.cursor) return;
      this.cursor.nag = String(nag || "").slice(0, 4);
    }

    setLabel(label) {
      if (!this.cursor) return;
      this.cursor.label = String(label || "").slice(0, 24);
    }

    back() {
      if (this.cursor.parent) this.cursor = this.cursor.parent;
      return this.cursor;
    }

    forward(branchIndex) {
      const i = branchIndex | 0;
      if (this.cursor.children[i]) this.cursor = this.cursor.children[i];
      return this.cursor;
    }

    goRoot() {
      this.cursor = this.root;
      return this.cursor;
    }

    goEndMain() {
      this.cursor = this.root;
      while (this.cursor.children[0]) this.cursor = this.cursor.children[0];
      return this.cursor;
    }

    pathFromRoot() {
      const path = [];
      let n = this.cursor;
      while (n) {
        path.unshift(n);
        n = n.parent;
      }
      return path;
    }

    /** Reconstruit un GoGame jusqu'au curseur. */
    buildGameAtCursor(size, komi, handicap, rules) {
      const g = new global.GoGame(size || 19);
      if (komi != null) g.komi = komi;
      if (rules) g.rules = rules;
      if (handicap >= 2) g.placeHandicap(handicap);
      this.pathFromRoot().forEach((node) => {
        if (!node.move) return;
        // Édition libre (teaching) : pose / retrait sans règles
        if (node.move.edit) {
          if (node.move.remove) g.set(node.move.x, node.move.y, 0);
          else g.set(node.move.x, node.move.y, node.move.color);
          return;
        }
        g.turn = node.move.color || g.turn;
        if (node.move.pass) g.pass();
        else if (!g.play(node.move.x, node.move.y)) {
          g.set(node.move.x, node.move.y, node.move.color);
          g.moves.push(Object.assign({}, node.move));
          g.turn = node.move.color === 1 ? 2 : 1;
          g.passCount = 0;
        }
      });
      return g;
    }

    setComment(text) {
      this.cursor.comment = String(text || "").slice(0, 500);
    }

    depth() {
      return this.pathFromRoot().length - 1;
    }

    branchCount() {
      return this.cursor.children.length;
    }

    isOnMainLine() {
      let n = this.cursor;
      while (n && n.parent) {
        if (n.parent.children[0] !== n) return false;
        n = n.parent;
      }
      return true;
    }

    /** Export SGF avec variations (enfants 1+ = branches). */
    exportSgf(meta) {
      meta = meta || {};
      const letters = "abcdefghijklmnopqrstuvwxyz";
      const toSgf = (x, y) => letters[x] + letters[y];
      const size = meta.size || 19;
      let out = "(;FF[4]GM[1]CA[UTF-8]SZ[" + size + "]KM[" + (meta.komi != null ? meta.komi : 6.5) + "]";
      if (meta.pb) out += "PB[" + meta.pb + "]";
      if (meta.pw) out += "PW[" + meta.pw + "]";

      function writeNode(node) {
        if (node.move) {
          const c = node.move.color === 1 ? "B" : "W";
          if (node.move.pass) out += ";" + c + "[]";
          else out += ";" + c + "[" + toSgf(node.move.x, node.move.y) + "]";
          if (node.comment) out += "C[" + node.comment.replace(/[\[\]]/g, "") + "]";
          if (node.nag) out += "TE[" + String(node.nag).replace(/[\[\]]/g, "") + "]";
          if (node.label) out += "N[" + String(node.label).replace(/[\[\]]/g, "") + "]";
        } else if (node.comment) {
          out += "C[" + node.comment.replace(/[\[\]]/g, "") + "]";
        }
        if (!node.children.length) return;
        if (node.children.length === 1) {
          writeNode(node.children[0]);
          return;
        }
        // Premier enfant = suite principale dans le même nœud parent ;
        // variations = ( ... )
        writeNode(node.children[0]);
        for (let i = 1; i < node.children.length; i++) {
          out += "(";
          writeNode(node.children[i]);
          out += ")";
        }
      }

      writeNode(this.root);
      out += ")";
      return out;
    }

    statusText() {
      const d = this.depth();
      const br = this.branchCount();
      const main = this.isOnMainLine() ? "ligne principale" : "variation";
      const mv = this.cursor.move
        ? (this.cursor.move.pass
          ? "pass"
          : (this.cursor.move.color === 1 ? "N" : "B") + " " +
            (typeof global.GoGame === "function"
              ? new global.GoGame(19).coord(this.cursor.move.x, this.cursor.move.y)
              : this.cursor.move.x + "," + this.cursor.move.y))
        : "départ";
      const nag = this.cursor.nag ? " " + this.cursor.nag : "";
      const lab = this.cursor.label ? " «" + this.cursor.label + "»" : "";
      return "#" + d + " " + mv + nag + lab + " · " + main + (br ? " · " + br + " suite(s)" : "");
    }
  }

  global.ReviewTree = ReviewTree;
})(window);
