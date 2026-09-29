// Système d'horloges de jeu
class GameClock {
  constructor() {
    this.type = "none"; // none, simple, fischer, byoyomi, canadian
    this.mainTime = [0, 0]; // [blanc, noir] en millisecondes
    this.increment = 0; // Fischer increment (ms)
    this.byoyomiTime = 0; // Temps par période byoyomi (ms)
    this.byoyomiPeriods = [0, 0]; // Périodes restantes [blanc, noir]
    this.canadianStones = 0; // Nombre de coups à jouer
    this.currentPlayer = 0; // 0 = blanc, 1 = noir
    this.running = false;
    this.lastTick = 0;
    this.interval = null;
    this.onTimeOut = null;
    this.onUpdate = null;
  }

  // Configurer horloge simple
  setupSimple(minutes) {
    const m = window.SecurityManager
      ? SecurityManager.clampNumber(minutes, 0.5, 180, 10)
      : (Number(minutes) || 10);
    this.type = "simple";
    this.mainTime = [m * 60000, m * 60000];
    this.increment = 0;
  }

  setupFischer(minutes, incrementSeconds) {
    const m = window.SecurityManager
      ? SecurityManager.clampNumber(minutes, 0.5, 180, 10)
      : (Number(minutes) || 10);
    const inc = window.SecurityManager
      ? SecurityManager.clampNumber(incrementSeconds, 0, 120, 0)
      : (Number(incrementSeconds) || 0);
    this.type = "fischer";
    this.mainTime = [m * 60000, m * 60000];
    this.increment = inc * 1000;
  }

  setupByoyomi(mainMinutes, byoyomiSeconds, periods) {
    const main = window.SecurityManager
      ? SecurityManager.clampNumber(mainMinutes, 0.5, 180, 20)
      : (Number(mainMinutes) || 20);
    const byo = window.SecurityManager
      ? SecurityManager.clampNumber(byoyomiSeconds, 5, 120, 30)
      : (Number(byoyomiSeconds) || 30);
    const per = window.SecurityManager
      ? SecurityManager.clampNumber(periods, 1, 10, 5)
      : (Number(periods) || 5);
    this.type = "byoyomi";
    this.mainTime = [main * 60000, main * 60000];
    this.byoyomiTime = byo * 1000;
    this.byoyomiPeriods = [per, per];
  }

  setupCanadian(mainMinutes, periodMinutes, stones) {
    const main = window.SecurityManager
      ? SecurityManager.clampNumber(mainMinutes, 0.5, 180, 30)
      : (Number(mainMinutes) || 30);
    const period = window.SecurityManager
      ? SecurityManager.clampNumber(periodMinutes, 0.5, 60, 5)
      : (Number(periodMinutes) || 5);
    const st = window.SecurityManager
      ? SecurityManager.clampNumber(stones, 1, 50, 25)
      : (Number(stones) || 25);
    this.type = "canadian";
    this.mainTime = [main * 60000, main * 60000];
    this.byoyomiTime = period * 60000;
    this.canadianStones = st;
    this.byoyomiPeriods = [st, st];
  }

  // Démarrer l'horloge
  start(player = 0) {
    if (this.type === "none") return;
    
    this.currentPlayer = player;
    this.running = true;
    this.lastTick = Date.now();
    
    if (!this.interval) {
      this.interval = setInterval(() => this.tick(), 100);
    }
  }

  // Arrêter l'horloge
  stop() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  // Tick de l'horloge
  tick() {
    if (!this.running) return;

    const now = Date.now();
    const elapsed = now - this.lastTick;
    this.lastTick = now;

    const player = this.currentPlayer;

    if (this.type === "simple" || this.type === "fischer") {
      // Décrémenter le temps principal
      this.mainTime[player] -= elapsed;

      if (this.mainTime[player] <= 0) {
        this.mainTime[player] = 0;
        this.stop();
        if (this.onTimeOut) this.onTimeOut(player);
      }
    } else if (this.type === "byoyomi") {
      if (this.mainTime[player] > 0) {
        // Dans le temps principal
        this.mainTime[player] -= elapsed;
        if (this.mainTime[player] <= 0) {
          this.mainTime[player] = 0;
          // Passer en byoyomi
          this.mainTime[player] = this.byoyomiTime;
        }
      } else {
        // En période byoyomi
        this.mainTime[player] -= elapsed;
        if (this.mainTime[player] <= 0) {
          this.byoyomiPeriods[player]--;
          if (this.byoyomiPeriods[player] <= 0) {
            this.mainTime[player] = 0;
            this.stop();
            if (this.onTimeOut) this.onTimeOut(player);
          } else {
            // Réinitialiser la période
            this.mainTime[player] = this.byoyomiTime;
          }
        }
      }
    } else if (this.type === "canadian") {
      if (this.mainTime[player] > 0) {
        // Dans le temps principal
        this.mainTime[player] -= elapsed;
        if (this.mainTime[player] <= 0) {
          this.mainTime[player] = this.byoyomiTime;
          this.byoyomiPeriods[player] = this.canadianStones;
        }
      } else {
        // En période canadienne
        this.mainTime[player] -= elapsed;
        if (this.mainTime[player] <= 0) {
          this.mainTime[player] = 0;
          this.stop();
          if (this.onTimeOut) this.onTimeOut(player);
        }
      }
    }

    if (this.onUpdate) this.onUpdate();
  }

  // Changer de joueur (appelé après un coup)
  switchPlayer() {
    if (!this.running) return;

    const player = this.currentPlayer;

    // Ajouter l'incrément Fischer
    if (this.type === "fischer" && this.increment > 0) {
      this.mainTime[player] += this.increment;
    }

    // Coup joué en période canadienne
    if (this.type === "canadian" && this.mainTime[player] <= this.byoyomiTime) {
      this.byoyomiPeriods[player]--;
      if (this.byoyomiPeriods[player] <= 0) {
        // Tous les coups joués, réinitialiser
        this.mainTime[player] = this.byoyomiTime;
        this.byoyomiPeriods[player] = this.canadianStones;
      }
    }

    // Changer de joueur
    this.currentPlayer = 1 - this.currentPlayer;
    this.lastTick = Date.now();
  }

  // Formater le temps pour affichage
  formatTime(player) {
    const time = Math.max(0, this.mainTime[player]);
    const totalSeconds = Math.floor(time / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const deciseconds = Math.floor((time % 1000) / 100);

    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${seconds}.${deciseconds}`;
    }
  }

  // Obtenir l'info supplémentaire (byoyomi, canadian)
  getExtraInfo(player) {
    if (this.type === "byoyomi" && this.mainTime[player] <= this.byoyomiTime) {
      return `(${this.byoyomiPeriods[player]} périodes)`;
    }
    if (this.type === "canadian" && this.mainTime[player] <= this.byoyomiTime) {
      return `(${this.byoyomiPeriods[player]} coups)`;
    }
    return "";
  }

  // Obtenir l'état actuel
  getState() {
    return {
      type: this.type,
      times: [this.formatTime(0), this.formatTime(1)],
      extras: [this.getExtraInfo(0), this.getExtraInfo(1)],
      currentPlayer: this.currentPlayer,
      running: this.running
    };
  }

  // Réinitialiser
  reset() {
    this.stop();
    this.currentPlayer = 0;
    this.byoyomiPeriods = [0, 0];
  }
}

window.GameClock = GameClock;
