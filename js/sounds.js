// Sons de plateau — OGS Original 2013 (réutilisation autorisée) + effets OGS
class BoardSounds {
  constructor() {
    this.enabled = true;
    this.volume = 0.85;
    /** @type {"varied"|"fixed"} varied = échantillons aléatoires + jitter ; fixed = même pierre */
    this.style = "varied";
    this.audioContext = null;
    this._unlocked = false;
    this._buffers = new Map();
    this._loading = new Map();
    this._base = "";
    try {
      this._base = new URL("sounds/", document.baseURI).href;
    } catch (_) {
      this._base = "sounds/";
    }
    // Online-Go.com — pack « Original (2013) », enregistrements mlopezviedma
    this.stoneFiles = [
      "go/stone/stone1.wav",
      "go/stone/stone2.wav",
      "go/stone/stone3.wav",
      "go/stone/stone4.wav",
      "go/stone/stone5.wav"
    ];
    this.captureFiles = ["go/fx/capture.wav"];
    this.refuseFile = "go/fx/refuse.wav";
    this.passFile = "go/pass.mp3";
    this.pieceFiles = this.stoneFiles.slice(0, 3);
  }

  init() {
    this._ensureCtx();
    this.unlock();
    this.stoneFiles.concat([this.refuseFile, this.captureFiles[0], this.passFile]).forEach((f) => this._load(f));
  }

  _ensureCtx() {
    if (!this.audioContext && (window.AudioContext || window.webkitAudioContext)) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.audioContext;
  }

  unlock() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().then(() => { this._unlocked = true; }).catch(() => {});
    } else {
      this._unlocked = true;
    }
  }

  setVolume(v) {
    const n = Number(v);
    this.volume = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.85;
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (enabled) this.init();
  }

  /** @param {"varied"|"fixed"} style */
  setStyle(style) {
    this.style = style === "fixed" ? "fixed" : "varied";
  }

  _isFixed() {
    return this.style === "fixed";
  }

  _url(rel) {
    return this._base + rel.replace(/^\//, "");
  }

  _load(rel) {
    const url = this._url(rel);
    if (this._buffers.has(url)) return Promise.resolve(this._buffers.get(url));
    if (this._loading.has(url)) return this._loading.get(url);
    const ctx = this._ensureCtx();
    if (!ctx) return Promise.resolve(null);
    const p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.arrayBuffer();
      })
      .then((ab) => ctx.decodeAudioData(ab.slice(0)))
      .then((buf) => {
        this._buffers.set(url, buf);
        this._loading.delete(url);
        return buf;
      })
      .catch((err) => {
        this._loading.delete(url);
        console.warn("[sounds] load failed", rel, err);
        return null;
      });
    this._loading.set(url, p);
    return p;
  }

  _pick(list) {
    return list[(Math.random() * list.length) | 0];
  }

  _stoneFile() {
    if (this._isFixed()) return this.stoneFiles[0];
    return this._pick(this.stoneFiles);
  }

  _pieceFile() {
    if (this._isFixed()) return this.pieceFiles[0] || this.stoneFiles[0];
    return this._pick(this.pieceFiles);
  }

  /** En mode fixe : pas de jitter de hauteur (son toujours identique). */
  _wantJitter(explicit) {
    if (explicit === false) return false;
    if (explicit === true) return !this._isFixed();
    return !this._isFixed();
  }

  async _playBuffer(rel, volScale, rateJitter) {
    if (!this.enabled) return;
    this.unlock();
    const ctx = this._ensureCtx();
    if (!ctx) return;
    let buf = this._buffers.get(this._url(rel));
    if (!buf) buf = await this._load(rel);
    if (!buf) {
      try {
        const a = new Audio(this._url(rel));
        a.volume = Math.min(1, this.volume * (volScale == null ? 1 : volScale));
        a.play().catch(() => {});
      } catch (_) { /* ignore */ }
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (this._wantJitter(rateJitter)) {
      src.playbackRate.value = 0.97 + Math.random() * 0.06;
    }
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0.001, this.volume * (volScale == null ? 1 : volScale));
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(0);
  }

  _play(rel, volScale, rateJitter) {
    this._playBuffer(rel, volScale, rateJitter);
  }

  move() { this.stone(); }

  stone() {
    this._play(this._stoneFile(), 1);
  }

  piece() {
    this._play(this._pieceFile(), 0.9);
  }

  capture() {
    const file = this._isFixed() ? this.captureFiles[0] : this._pick(this.captureFiles);
    this._play(file, 1, this._isFixed() ? false : undefined);
  }

  pass() {
    this._play(this.passFile, 0.85, false);
  }

  check() {
    this._play(this._pieceFile(), 1);
    setTimeout(() => this._play(this._pieceFile(), 0.65), 90);
  }

  win() {
    if (this._isFixed()) {
      this._play(this.stoneFiles[0], 0.9, false);
      return;
    }
    this.stoneFiles.slice(0, 3).forEach((f, i) => {
      setTimeout(() => this._play(f, 0.9), i * 140);
    });
  }

  /** Clic de refus (coup illégal / anti-glisse) — toujours le même clip */
  refuse() {
    this._play(this.refuseFile, 0.7, false);
  }

  select() {
    const f = this._isFixed() ? this.stoneFiles[0] : (this.stoneFiles[1] || this.stoneFiles[0]);
    this._play(f, 0.35, false);
  }

  byoyomiTick(urgent) {
    if (this._isFixed()) {
      this._play(this.stoneFiles[0], urgent ? 0.4 : 0.22, false);
      return;
    }
    this._play(this.stoneFiles[urgent ? 2 : 0], urgent ? 0.4 : 0.22);
  }
}

window.BoardSounds = BoardSounds;
