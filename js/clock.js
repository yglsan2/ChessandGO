// Horloges de jeu précises (performance.now) + snapshot réseau
class GameClock {
  constructor() {
    this.type = "none"; // none, simple, fischer, byoyomi, canadian
    this.mainTime = [0, 0]; // ms restant affiché / temps principal
    this.increment = 0;
    this.byoyomiTime = 0;
    this.byoyomiPeriods = [0, 0];
    this.inByoyomi = [false, false];
    this.canadianStones = 0;
    this.currentPlayer = 0; // 0 = blanc, 1 = noir
    this.running = false;
    this.lastTick = 0;
    this.rafId = null;
    this.interval = null;
    this.onTimeOut = null;
    this.onUpdate = null;
    this.hostAuthoritative = true;
    /** Si false (invité), le tick local n'écoule pas le temps — seulement les snapshots hôte. */
    this.isAuthority = true;
    this._syncTimer = null;
    this.onNeedSync = null;
  }

  setAuthority(isAuthority) {
    this.isAuthority = !!isAuthority;
    if (!this.isAuthority) {
      this.stopSyncBroadcast();
    }
  }

  startSyncBroadcast(intervalMs) {
    this.stopSyncBroadcast();
    if (!this.isAuthority) return;
    const ms = Math.max(500, Number(intervalMs) || 1000);
    this._syncTimer = setInterval(() => {
      if (this.running && this.onNeedSync) this.onNeedSync(this.getSnapshot());
    }, ms);
  }

  stopSyncBroadcast() {
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
      this._syncTimer = null;
    }
  }

  setupSimple(minutes) {
    const m = this._clamp(minutes, 0.5, 180, 10);
    this.type = "simple";
    this.mainTime = [m * 60000, m * 60000];
    this.increment = 0;
    this.inByoyomi = [false, false];
  }

  setupFischer(minutes, incrementSeconds) {
    const m = this._clamp(minutes, 0.5, 180, 10);
    const inc = this._clamp(incrementSeconds, 0, 120, 0);
    this.type = "fischer";
    this.mainTime = [m * 60000, m * 60000];
    this.increment = inc * 1000;
    this.inByoyomi = [false, false];
  }

  setupByoyomi(mainMinutes, byoyomiSeconds, periods) {
    const main = this._clamp(mainMinutes, 0, 180, 20); // 0 = byoyomi immédiat
    const byo = this._clamp(byoyomiSeconds, 5, 300, 30);
    const per = this._clamp(periods, 1, 10, 5);
    this.type = "byoyomi";
    this.mainTime = [main * 60000, main * 60000];
    this.byoyomiTime = byo * 1000;
    this.byoyomiPeriods = [per, per];
    this.inByoyomi = [false, false];
  }

  setupCanadian(mainMinutes, periodMinutes, stones) {
    const main = this._clamp(mainMinutes, 0.5, 180, 30);
    const period = this._clamp(periodMinutes, 0.5, 60, 5);
    const st = this._clamp(stones, 1, 50, 25);
    this.type = "canadian";
    this.mainTime = [main * 60000, main * 60000];
    this.byoyomiTime = period * 60000;
    this.canadianStones = st;
    this.byoyomiPeriods = [st, st];
    this.inByoyomi = [false, false];
  }

  _clamp(value, min, max, fallback) {
    if (window.SecurityManager) {
      return SecurityManager.clampNumber(value, min, max, fallback);
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  now() {
    return (typeof performance !== "undefined" && performance.now)
      ? performance.now()
      : Date.now();
  }

  start(player = 0) {
    if (this.type === "none") return;
    this.currentPlayer = player;
    this.running = true;
    this.lastTick = this.now();
    this._arm();
  }

  stop() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.rafId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  _arm() {
    if (this.interval) return;
    // 50 ms : assez précis pour byoyomi sans surcharger le CPU
    this.interval = setInterval(() => this.tick(), 50);
  }

  tick() {
    if (!this.running || this.type === "none") return;

    // Invité : affichage uniquement — pas d'écoulement local
    if (!this.isAuthority) {
      if (this.onUpdate) this.onUpdate();
      return;
    }

    const now = this.now();
    let elapsed = now - this.lastTick;
    this.lastTick = now;
    if (elapsed < 0) elapsed = 0;
    if (elapsed > 1000) elapsed = 1000; // anti-saut onglet endormi

    const player = this.currentPlayer;

    if (this.type === "simple" || this.type === "fischer") {
      this.mainTime[player] -= elapsed;
      if (this.mainTime[player] <= 0) {
        this.mainTime[player] = 0;
        this.stop();
        if (this.onTimeOut) this.onTimeOut(player);
      }
    } else if (this.type === "byoyomi") {
      this._tickByoyomi(player, elapsed);
    } else if (this.type === "canadian") {
      this._tickCanadian(player, elapsed);
    }

    if (this.onUpdate) this.onUpdate();
  }

  _tickByoyomi(player, elapsed) {
    if (!this.inByoyomi[player]) {
      this.mainTime[player] -= elapsed;
      if (this.mainTime[player] <= 0) {
        this.inByoyomi[player] = true;
        this.mainTime[player] = this.byoyomiTime;
      }
      return;
    }

    this.mainTime[player] -= elapsed;
    if (this.mainTime[player] > 0) return;

    this.byoyomiPeriods[player]--;
    if (this.byoyomiPeriods[player] <= 0) {
      this.mainTime[player] = 0;
      this.stop();
      if (this.onTimeOut) this.onTimeOut(player);
    } else {
      this.mainTime[player] = this.byoyomiTime;
    }
  }

  _tickCanadian(player, elapsed) {
    if (!this.inByoyomi[player]) {
      this.mainTime[player] -= elapsed;
      if (this.mainTime[player] <= 0) {
        this.inByoyomi[player] = true;
        this.mainTime[player] = this.byoyomiTime;
        this.byoyomiPeriods[player] = this.canadianStones;
      }
      return;
    }

    this.mainTime[player] -= elapsed;
    if (this.mainTime[player] > 0) return;

    this.mainTime[player] = 0;
    this.stop();
    if (this.onTimeOut) this.onTimeOut(player);
  }

  switchPlayer() {
    if (!this.running && this.type !== "none") {
      // Si l'horloge n'a pas démarré, démarrer sur le joueur suivant
      this.start(1 - this.currentPlayer);
      return;
    }
    if (!this.running) return;

    const player = this.currentPlayer;

    if (this.type === "fischer" && this.increment > 0) {
      this.mainTime[player] += this.increment;
    }

    if (this.type === "byoyomi" && this.inByoyomi[player]) {
      // Coup joué dans le temps : période conservée, timer remis
      this.mainTime[player] = this.byoyomiTime;
    }

    if (this.type === "canadian" && this.inByoyomi[player]) {
      this.byoyomiPeriods[player]--;
      if (this.byoyomiPeriods[player] <= 0) {
        this.mainTime[player] = this.byoyomiTime;
        this.byoyomiPeriods[player] = this.canadianStones;
      }
    }

    this.currentPlayer = 1 - this.currentPlayer;
    this.lastTick = this.now();
  }

  formatTime(player) {
    const time = Math.max(0, this.mainTime[player]);
    const totalSeconds = Math.floor(time / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const tenths = Math.floor((time % 1000) / 100);

    if (minutes > 0) {
      return minutes + ":" + String(seconds).padStart(2, "0");
    }
    return seconds + "." + tenths;
  }

  getExtraInfo(player) {
    if (this.type === "byoyomi") {
      const per = this.byoyomiPeriods[player];
      const sec = Math.round(this.byoyomiTime / 1000);
      if (this.inByoyomi[player]) {
        return "BYO " + per + "×" + sec + "s";
      }
      // Pendant le temps principal : rappelle les périodes restantes
      return "+" + per + "×" + sec + "s";
    }
    if (this.type === "canadian") {
      if (this.inByoyomi[player]) {
        return this.byoyomiPeriods[player] + "/" + this.canadianStones + " coups";
      }
      return "+" + this.canadianStones + " / " + Math.round(this.byoyomiTime / 60000) + "min";
    }
    if (this.type === "fischer" && this.increment > 0) {
      return "+" + Math.round(this.increment / 1000) + "s";
    }
    return "";
  }

  getState() {
    return {
      type: this.type,
      times: [this.formatTime(0), this.formatTime(1)],
      extras: [this.getExtraInfo(0), this.getExtraInfo(1)],
      currentPlayer: this.currentPlayer,
      running: this.running,
      inByoyomi: this.inByoyomi.slice()
    };
  }

  /** Snapshot pour sync réseau (ms absolues côté horloge). */
  getSnapshot() {
    return {
      type: this.type,
      mainTime: this.mainTime.slice(),
      increment: this.increment,
      byoyomiTime: this.byoyomiTime,
      byoyomiPeriods: this.byoyomiPeriods.slice(),
      inByoyomi: this.inByoyomi.slice(),
      canadianStones: this.canadianStones,
      currentPlayer: this.currentPlayer,
      running: this.running,
      sentAt: Date.now()
    };
  }

  applySnapshot(snap, opts) {
    if (!snap || typeof snap !== "object") return;
    const compensate = !(opts && opts.noCompensate) && !this.isAuthority;
    this.type = snap.type || this.type;
    this.mainTime = Array.isArray(snap.mainTime) ? snap.mainTime.slice() : this.mainTime;
    this.increment = Number(snap.increment) || 0;
    this.byoyomiTime = Number(snap.byoyomiTime) || 0;
    this.byoyomiPeriods = Array.isArray(snap.byoyomiPeriods) ? snap.byoyomiPeriods.slice() : this.byoyomiPeriods;
    this.inByoyomi = Array.isArray(snap.inByoyomi) ? snap.inByoyomi.slice() : [false, false];
    this.canadianStones = Number(snap.canadianStones) || 0;
    this.currentPlayer = snap.currentPlayer === 1 ? 1 : 0;

    // Invité : compenser le lag sur le joueur actif
    if (compensate && snap.running && typeof snap.sentAt === "number") {
      const lag = Math.min(2000, Math.max(0, Date.now() - snap.sentAt));
      if (lag > 0) {
        const p = this.currentPlayer;
        this.mainTime[p] = Math.max(0, this.mainTime[p] - lag);
      }
    }

    this.lastTick = this.now();
    if (snap.running) {
      this.running = true;
      this._arm();
    } else {
      this.stop();
    }
    if (this.onUpdate) this.onUpdate();
  }

  reset() {
    this.stop();
    this.stopSyncBroadcast();
    this.currentPlayer = 0;
    this.byoyomiPeriods = [0, 0];
    this.inByoyomi = [false, false];
  }
}

window.GameClock = GameClock;
