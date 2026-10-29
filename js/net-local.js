/**
 * Transport local pour le simulateur Discord (2 onglets / iframes même navigateur).
 * Remplace PeerJS quand ?mock=1 — sync immédiate via BroadcastChannel.
 */
(function (global) {
  function isMockMode() {
    try {
      return new URLSearchParams(location.search).get("mock") === "1";
    } catch (_) {
      return false;
    }
  }

  class LocalNet {
    constructor() {
      this.id = null;
      this.role = null;
      this.roomToken = null;
      this.roomCode = null;
      this.authenticated = false;
      this.onMessage = null;
      this.onStatus = null;
      this.onReady = null;
      this._channel = null;
      this._peerOpen = false;
      this._connectedPeer = false;
    }

    generateToken() {
      const bytes = new Uint8Array(16);
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
      else for (let i = 0; i < 16; i++) bytes[i] = (Math.random() * 256) | 0;
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }

    _chanName(code) {
      return "sb-local-" + String(code || "default");
    }

    _openChannel(code) {
      this.roomCode = code;
      if (this._channel) {
        try { this._channel.close(); } catch (_) { /* ignore */ }
      }
      try {
        this._channel = new BroadcastChannel(this._chanName(code));
      } catch (err) {
        console.error(err);
        if (this.onStatus) this.onStatus("BroadcastChannel indisponible", "err");
        return;
      }
      this._channel.onmessage = (ev) => this._onRaw(ev.data);
    }

    _onRaw(msg) {
      if (!msg || msg.v !== 1) return;
      if (msg.from === this.id) return;

      if (msg.type === "hello" && this.role === "host") {
        if (msg.token === this.roomToken) {
          this.authenticated = true;
          this._connectedPeer = true;
          this._post({ type: "hello-ok", token: this.roomToken });
          if (this.onStatus) this.onStatus("Adversaire connecté (local)", "ok");
        }
        return;
      }
      if (msg.type === "hello-ok" && this.role === "guest") {
        this.authenticated = true;
        this._connectedPeer = true;
        if (this.onStatus) this.onStatus("Connecté à l'hôte (local)", "ok");
        return;
      }
      if (!this.authenticated) return;
      // Les coups sont dans payload ; hello déjà filtrés
      const data = msg.payload || msg;
      if (data && data.type && data.type !== "hello" && data.type !== "hello-ok") {
        if (this.onMessage) this.onMessage(data);
      }
    }

    _post(payload) {
      if (!this._channel) return;
      this._channel.postMessage({
        v: 1,
        from: this.id,
        type: payload.type,
        token: payload.token,
        payload: payload.type === "hello" || payload.type === "hello-ok" ? null : payload,
        ts: Date.now()
      });
    }

    init(options) {
      const asHost = !options || options.asHost !== false;
      this.role = asHost ? "host" : "guest";
      this.authenticated = false;
      this._connectedPeer = false;
      this.id = (asHost ? "host_" : "guest_") + Math.random().toString(16).slice(2, 10);
      if (asHost) this.roomToken = this.generateToken();
      this._peerOpen = true;
      if (this.onReady) this.onReady(this.id, this.roomToken);
      if (asHost && this.onStatus) {
        this.onStatus("Salle locale prête — en attente de l'adversaire", "ok");
      }
    }

    /** Attache la salle mock (code d'instance Discord). */
    attachRoom(code, token) {
      if (token) this.roomToken = token;
      this._openChannel(code);
      if (this.role === "guest" && this.roomToken) {
        this._post({ type: "hello", token: this.roomToken });
      }
    }

    join(hostId, token) {
      this.role = "guest";
      this.roomToken = token;
      this.authenticated = false;
      if (!this.id) this.init({ asHost: false });
      // hostId mock : "local_<code>"
      let code = this.roomCode;
      const hid = String(hostId || "");
      if (hid.indexOf("local_") === 0) code = hid.slice(6);
      else if (hid.indexOf("local:") === 0) code = hid.slice(6);
      if (!code) {
        code = new URLSearchParams(location.search).get("instance_id") || "mock";
        // instance_id texte → même dérivation que DiscordActivity.instanceRoomCode côté match
      }
      this._openChannel(code);
      this._post({ type: "hello", token: this.roomToken });
      if (this.onStatus) this.onStatus("Connexion locale…", "ok");
    }

    send(data) {
      if (!this.authenticated && data && data.type !== "hello" && data.type !== "hello-ok") {
        console.warn("LocalNet: envoi bloqué (pas encore connecté)");
        return;
      }
      this._post(data);
    }

    connected() {
      return !!(this.authenticated && this._connectedPeer);
    }
  }

  function installLocalNetIfMock() {
    if (!isMockMode()) return false;
    if (typeof BroadcastChannel === "undefined") return false;
    global.Net = LocalNet;
    global.__sbLocalNet = true;
    console.log("[Net] Mode local mock (BroadcastChannel)");
    return true;
  }

  global.LocalNet = LocalNet;
  global.installLocalNetIfMock = installLocalNetIfMock;
  installLocalNetIfMock();
})(window);
