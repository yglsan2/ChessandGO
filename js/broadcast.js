/**
 * Broadcast / OBS / timeline leçon — couche « caméra » pour Social Board.
 *
 * URL :
 *   ?broadcast=1           → mode clean (chrome masqué, overlays live)
 *   ?obs=1&transparent=1   → Browser Source OBS (fond transparent)
 *   ?watch=1&room=CODE     → spectateur lecture seule (via PeerJS observe)
 *   ?stream=KEY            → suit un flux BroadcastChannel local (même machine / mock)
 */
(function (global) {
  const CHANNEL_PREFIX = "sb-broadcast-";

  function qs() {
    try {
      return new URLSearchParams(location.search);
    } catch (_) {
      return new URLSearchParams();
    }
  }

  function formatClockMs(ms) {
    const t = Math.max(0, Math.floor((ms || 0) / 1000));
    const m = Math.floor(t / 60);
    const s = t % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  class LessonTimeline {
    constructor() {
      this.recording = false;
      this.startedAt = 0;
      this.events = [];
    }

    start() {
      this.recording = true;
      this.startedAt = Date.now();
      this.events = [];
      this.push("start", { note: "Enregistrement leçon démarré" });
    }

    stop() {
      this.recording = false;
      this.push("stop", { note: "Fin" });
    }

    push(kind, data) {
      if (!this.recording && kind !== "stop") return;
      this.events.push({
        t: Date.now() - (this.startedAt || Date.now()),
        kind: kind,
        data: data || {}
      });
    }

    exportJson() {
      return JSON.stringify(
        {
          version: 1,
          app: "social-board",
          startedAt: this.startedAt,
          events: this.events
        },
        null,
        2
      );
    }

    download() {
      const blob = new Blob([this.exportJson()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "lesson-timeline-" + Date.now() + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  class BroadcastController {
    constructor() {
      this.active = false;
      this.obsMode = false;
      this.transparent = false;
      this.channel = null;
      this.streamKey = null;
      this.webcamStream = null;
      this.timeline = new LessonTimeline();
      this._lastState = null;
      this._pollTimer = null;
      this._clockTimer = null;
      this._startedAt = 0;
    }

    bootFromUrl() {
      const p = qs();
      if (p.get("broadcast") === "1" || p.get("obs") === "1") {
        this.enter({
          obs: p.get("obs") === "1",
          transparent: p.get("transparent") === "1" || p.get("obs") === "1"
        });
      }
      if (p.get("stream")) {
        this.followLocalStream(p.get("stream"));
      }
      if (p.get("mode") === "spectator" && p.get("stream")) {
        document.body.classList.add("spectator-mode");
      }
    }

    enter(opts) {
      opts = opts || {};
      this.active = true;
      this.obsMode = !!opts.obs;
      this.transparent = !!opts.transparent;
      this._startedAt = Date.now();
      document.body.classList.add("broadcast-mode");
      if (this.transparent) document.body.classList.add("broadcast-transparent");
      if (this.obsMode) document.body.classList.add("obs-mode");

      if (window.streamOverlay) {
        window.streamOverlay.showOverlay();
        if (opts.layout) window.streamOverlay.applyLayout(opts.layout);
        else if (this.obsMode) window.streamOverlay.applyLayout("minimal");
      }

      this.bindUi();
      this.startClockTicker();
      console.log("📺 Broadcast mode ON", { obs: this.obsMode, transparent: this.transparent });
    }

    exit() {
      this.active = false;
      document.body.classList.remove("broadcast-mode", "broadcast-transparent", "obs-mode");
      if (window.streamOverlay) window.streamOverlay.hideOverlay();
      this.stopWebcam();
      this.stopClockTicker();
      if (this.channel) {
        try {
          this.channel.close();
        } catch (_) { /* ignore */ }
        this.channel = null;
      }
    }

    bindUi() {
      const on = (id, fn) => {
        const n = document.getElementById(id);
        if (n && !n._sbBroadcastBound) {
          n._sbBroadcastBound = true;
          n.addEventListener("click", fn);
        }
      };
      on("btnBroadcast", () => {
        if (this.active) this.exit();
        else this.enter({ layout: "commentator" });
        this.updateBroadcastButton();
        if (typeof this.onAfterToggle === "function") this.onAfterToggle();
        else if (typeof window.__sbPublishGameState === "function") window.__sbPublishGameState(true);
      });
      on("btnObsLink", () => this.copyObsLink());
      on("btnWatchLink", () => this.copyWatchLink());
      on("btnLessonRecord", () => {
        if (this.timeline.recording) {
          this.timeline.stop();
          this.downloadLessonPack();
          this.setStatus("Leçon exportée (timeline + coups)", "ok");
        } else {
          this.timeline.start();
          this.setStatus("⏺ Enregistrement leçon (timeline)…", "ok");
        }
        this.updateRecordButton();
      });
      on("btnWebcamToggle", () => this.toggleWebcam());
      this.updateBroadcastButton();
      this.updateRecordButton();
    }

    /** Export timeline + résumé coups (montage YouTube). */
    downloadLessonPack() {
      const snap = this._lastState || {};
      const pack = {
        version: 2,
        app: "social-board",
        game: snap.game || "chess",
        exportedAt: new Date().toISOString(),
        timeline: this.timeline.events,
        moves: snap.moves || [],
        lastMove: snap.lastMoveSan || null,
        fen: snap.fen || null,
        pgnOrMoves: (snap.moves || []).join("\n"),
        note: "Importez la timeline (events[].t en ms) pour caler les chapitres vidéo."
      };
      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "lesson-pack-" + Date.now() + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    }

    updateBroadcastButton() {
      const btn = document.getElementById("btnBroadcast");
      if (!btn) return;
      btn.textContent = this.active ? "⏹ Quitter Broadcast" : "📺 Broadcast / OBS";
      btn.classList.toggle("on", this.active);
    }

    updateRecordButton() {
      const btn = document.getElementById("btnLessonRecord");
      if (!btn) return;
      btn.textContent = this.timeline.recording ? "⏹ Stop + export timeline" : "⏺ Timeline leçon";
      btn.classList.toggle("on", this.timeline.recording);
    }

    setStatus(msg, type) {
      if (typeof window.__sbSetStatus === "function") window.__sbSetStatus(msg, type);
      else {
        const el = document.getElementById("status");
        if (el) el.textContent = msg;
      }
    }

    /** Applique un snapshot jeu aux widgets overlay + republie. */
    applyGameState(snap) {
      if (!snap) return;
      this._lastState = snap;
      if (window.streamOverlay && typeof window.streamOverlay.applyGameState === "function") {
        window.streamOverlay.applyGameState(snap);
      }
      this.publish(snap);
      if (this.timeline.recording && snap.lastMoveSan) {
        this.timeline.push("move", {
          san: snap.lastMoveSan,
          fen: snap.fen || null,
          game: snap.game
        });
      }
      this.updateDuration();
    }

    publish(snap) {
      if (!this.streamKey) return;
      const payload = Object.assign({ type: "state", streamKey: this.streamKey, ts: Date.now() }, snap);
      try {
        localStorage.setItem(CHANNEL_PREFIX + this.streamKey, JSON.stringify(payload));
      } catch (_) { /* quota */ }
      if (this.channel) {
        try {
          this.channel.postMessage(payload);
        } catch (_) { /* ignore */ }
      }
      try {
        if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
          window.dispatchEvent(new CustomEvent("sb:broadcast", { detail: payload }));
        }
      } catch (_) { /* ignore */ }
    }

    startLocalStream(gameType) {
      this.streamKey =
        "sb_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      try {
        this.channel = new BroadcastChannel(CHANNEL_PREFIX + this.streamKey);
      } catch (_) {
        this.channel = null;
      }
      if (!this.active) this.enter({ layout: "commentator" });
      this.setStatus("🔴 Broadcast local — copiez le lien Watch / OBS", "ok");
      return this.streamKey;
    }

    stopLocalStream() {
      this.streamKey = null;
      if (this.channel) {
        try {
          this.channel.close();
        } catch (_) { /* ignore */ }
        this.channel = null;
      }
    }

    followLocalStream(streamKey) {
      this.streamKey = streamKey;
      document.body.classList.add("spectator-mode");
      try {
        this.channel = new BroadcastChannel(CHANNEL_PREFIX + streamKey);
        this.channel.onmessage = (ev) => this.onRemoteState(ev.data);
      } catch (_) { /* ignore */ }
      // Fallback localStorage polling (iframes same-origin)
      this._pollTimer = setInterval(() => {
        try {
          const raw = localStorage.getItem(CHANNEL_PREFIX + streamKey);
          if (!raw) return;
          const data = JSON.parse(raw);
          if (data && data.ts !== (this._lastRemoteTs || 0)) {
            this._lastRemoteTs = data.ts;
            this.onRemoteState(data);
          }
        } catch (_) { /* ignore */ }
      }, 400);
      if (!this.active) this.enter({ layout: "minimal" });
    }

    onRemoteState(data) {
      if (!data) return;
      if (window.streamOverlay && streamOverlay.applyGameState) {
        streamOverlay.applyGameState(data);
      }
      window.dispatchEvent(new CustomEvent("spectatorPosition", { detail: data }));
    }

    obsBrowserUrl() {
      const url = new URL(location.href);
      url.searchParams.set("obs", "1");
      url.searchParams.set("broadcast", "1");
      url.searchParams.set("transparent", "1");
      if (this.streamKey) url.searchParams.set("stream", this.streamKey);
      return url.toString();
    }

    watchUrl(extra) {
      const url = new URL(location.href);
      url.searchParams.set("watch", "1");
      url.searchParams.set("observe", "1");
      url.searchParams.set("broadcast", "1");
      if (this.streamKey) {
        url.searchParams.set("stream", this.streamKey);
        url.searchParams.set("mode", "spectator");
      }
      if (extra && extra.room) url.searchParams.set("room", extra.room);
      if (extra && extra.host) {
        url.searchParams.set("host", extra.host);
        if (extra.token) url.searchParams.set("t", extra.token);
      }
      return url.toString();
    }

    copyObsLink() {
      const u = this.obsBrowserUrl();
      navigator.clipboard.writeText(u).then(() => {
        this.setStatus("📋 Lien OBS Browser Source copié", "ok");
      });
    }

    copyWatchLink() {
      const net = typeof window.__sbGetNet === "function" ? window.__sbGetNet() : null;
      const room =
        (window.__sbShortRoomCode) ||
        (net && net.roomCode) ||
        qs().get("room");
      const host =
        (net && net.role === "host" && net.id) ||
        qs().get("host") ||
        null;
      if (!room && !host && !this.streamKey) {
        this.setStatus("Créez d’abord une partie / Discord pour un vrai lien Watch", "err");
        return;
      }
      const u = this.watchUrl({
        room: room,
        host: host,
        token: (net && net.roomToken) || qs().get("t")
      });
      navigator.clipboard.writeText(u).then(() => {
        this.setStatus(
          host || room
            ? "📋 Lien spectateur PeerJS copié (observe=1)"
            : "📋 Lien Watch local copié (même navigateur)",
          "ok"
        );
      });
    }

    async toggleWebcam() {
      if (this.webcamStream) {
        this.stopWebcam();
        if (window.streamOverlay) {
          streamOverlay.overlayConfig.enabledWidgets.webcam = false;
          streamOverlay.refreshOverlay();
          if (this._lastState) streamOverlay.applyGameState(this._lastState);
        }
        return;
      }
      try {
        this.webcamStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
        if (window.streamOverlay) {
          streamOverlay.overlayConfig.enabledWidgets.webcam = true;
          streamOverlay.refreshOverlay();
          if (this._lastState) streamOverlay.applyGameState(this._lastState);
        }
        const video = document.getElementById("webcamVideo");
        if (video) {
          video.srcObject = this.webcamStream;
          video.play().catch(() => {});
          const ph = video.parentElement && video.parentElement.querySelector(".webcam-placeholder");
          if (ph) ph.style.display = "none";
        }
        this.setStatus("📷 Webcam activée", "ok");
      } catch (err) {
        this.setStatus("Webcam refusée : " + (err.message || err), "err");
      }
    }

    stopWebcam() {
      if (this.webcamStream) {
        this.webcamStream.getTracks().forEach((t) => t.stop());
        this.webcamStream = null;
      }
      const video = document.getElementById("webcamVideo");
      if (video) video.srcObject = null;
    }

    startClockTicker() {
      this.stopClockTicker();
      this._clockTimer = setInterval(() => this.updateDuration(), 1000);
    }

    stopClockTicker() {
      if (this._clockTimer) clearInterval(this._clockTimer);
      this._clockTimer = null;
      if (this._pollTimer) clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    updateDuration() {
      const el = document.getElementById("streamDuration");
      if (!el || !this._startedAt) return;
      const sec = Math.floor((Date.now() - this._startedAt) / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      el.textContent = "⏱️ " + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    }

    markTeaching(kind, data) {
      if (this.timeline.recording) this.timeline.push(kind || "teach", data || {});
    }
  }

  const controller = new BroadcastController();
  global.Broadcast = controller;
  global.LessonTimeline = LessonTimeline;
  global.sbFormatClockMs = formatClockMs;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => controller.bootFromUrl());
  } else {
    controller.bootFromUrl();
  }
})(window);
