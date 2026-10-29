// Gestion réseau peer-to-peer
class Net {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.id = null;
    this.onMessage = null;
    this.onStatus = null;
    this.onReady = null;
    this.joinAttempts = 0;
    this.maxJoinAttempts = 5;
    this.netSecurity = typeof NetworkSecurity !== 'undefined'
      ? new NetworkSecurity()
      : null;
    this.roomToken = null;
    this.role = null; // host | guest | observer
    this.authenticated = false;
    this.handshakeTimer = null;
    this.pendingHostId = null;
    this.observers = [];
    this.onObserver = null;
  }

  generateToken() {
    if (window.crypto && crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }

  isValidToken(token) {
    return typeof token === 'string' && /^[a-f0-9]{32}$/.test(token);
  }

  tokensEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
      return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  init(options = {}) {
    const asHost = options.asHost !== false;
    if (typeof Peer === 'undefined') {
      console.warn('PeerJS non disponible');
      return;
    }

    if (this.peer) return;

    if (asHost) {
      this.role = 'host';
      this.roomToken = this.generateToken();
      this.authenticated = false;
    } else {
      this.role = 'guest';
      this.authenticated = false;
    }

    const config = window.CONFIG && typeof window.CONFIG.peerOptions === 'function'
      ? window.CONFIG.peerOptions()
      : (window.CONFIG?.peerjs || {});
    // PeerJS : options en 1er argument si pas d'id imposé
    this.peer = new Peer(config);

    this.peer.on('open', (id) => {
      this.id = id;
      this.joinAttempts = 0;
      if (this.onReady) this.onReady(id, this.roomToken);
      if (this.onStatus && this.role === 'host') {
        this.onStatus('Salle créée - partagez le lien !', 'ok');
      }
      if (this.pendingHostId) {
        const hostId = this.pendingHostId;
        this.pendingHostId = null;
        this.join(hostId, this.roomToken);
      }
    });

    this.peer.on('connection', (conn) => {
      if (this.role !== 'host') {
        conn.close();
        return;
      }
      // 1re connexion = adversaire ; suivantes = observateurs lecture seule
      if (this.conn && this.conn.open) {
        this._attachObserver(conn);
        return;
      }
      this.authenticated = false;
      this.conn = conn;
      this.setupConnection();
      if (this.onStatus) {
        this.onStatus('Connexion reçue, authentification…', 'ok');
      }
      this.startHandshakeTimeout();
    });

    this.peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      if (this.onStatus) {
        this.onStatus('Erreur de connexion', 'err');
      }
    });
  }

  startHandshakeTimeout() {
    this.clearHandshakeTimeout();
    this.handshakeTimer = setTimeout(() => {
      if (!this.authenticated && this.conn) {
        this.conn.close();
        this.conn = null;
        if (this.onStatus) {
          this.onStatus('Connexion refusée (jeton manquant ou invalide)', 'err');
        }
      }
    }, 8000);
  }

  clearHandshakeTimeout() {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
  }

  setupConnection() {
    if (!this.conn) return;

    this.conn.on('data', (data) => {
      try {
        const validated = this.netSecurity
          ? this.netSecurity.validateMessage(data)
          : data;
        if (!this.acceptHandshakeOrDrop(validated)) return;
        if (!this.authenticated) return;
        if (this.onMessage) this.onMessage(validated);
      } catch (error) {
        console.warn('Message réseau rejeté:', error.message);
      }
    });

    this.conn.on('close', () => {
      this.clearHandshakeTimeout();
      this.conn = null;
      this.authenticated = false;
      if (this.onStatus) {
        this.onStatus('Adversaire déconnecté', 'err');
      }
    });

    this.conn.on('error', (err) => {
      console.error('Connexion P2P:', err);
      if (this.onStatus) {
        this.onStatus('Erreur de connexion', 'err');
      }
    });
  }

  _attachObserver(conn) {
    const obs = { conn: conn, authenticated: false };
    this.observers.push(obs);
    conn.on('data', (data) => {
      try {
        if (data && data.type === 'hello' && this.tokensEqual(data.token, this.roomToken)) {
          obs.authenticated = true;
          conn.send({ type: 'hello-ok', role: 'observer' });
          if (this.onObserver) this.onObserver({ joined: true, count: this.observerCount() });
          if (this.onStatus) this.onStatus('Observateur connecté (' + this.observerCount() + ')', 'ok');
          return;
        }
        // Observateurs : chat seulement
        if (obs.authenticated && data && data.type === 'game-chat' && this.onMessage) {
          this.onMessage(data);
          this.broadcast(data, conn);
        }
      } catch (_) { /* ignore */ }
    });
    conn.on('close', () => {
      this.observers = this.observers.filter((o) => o.conn !== conn);
      if (this.onObserver) this.onObserver({ joined: false, count: this.observerCount() });
    });
  }

  observerCount() {
    return this.observers.filter((o) => o.conn && o.conn.open).length;
  }

  broadcast(data, exceptConn) {
    this.send(data);
    this.observers.forEach((o) => {
      if (!o.authenticated || !o.conn || !o.conn.open) return;
      if (exceptConn && o.conn === exceptConn) return;
      try { o.conn.send(data); } catch (_) { /* ignore */ }
    });
  }

  acceptHandshakeOrDrop(data) {
    if (data.type === 'hello') {
      if (this.role !== 'host') return false;
      if (this.tokensEqual(data.token, this.roomToken)) {
        this.authenticated = true;
        this.clearHandshakeTimeout();
        this.send({ type: 'hello-ok', role: 'guest' });
        if (this.onStatus) this.onStatus('Adversaire authentifié', 'ok');
      } else {
        this.authenticated = false;
        if (this.conn) this.conn.close();
        this.conn = null;
        if (this.onStatus) this.onStatus('Jeton de salle invalide', 'err');
      }
      return false;
    }

    if (data.type === 'hello-ok') {
      if (this.role === 'guest' || this.role === 'observer') {
        this.authenticated = true;
        this.clearHandshakeTimeout();
        if (data.role === 'observer') this.role = 'observer';
        if (this.onStatus) {
          this.onStatus(this.role === 'observer' ? 'Mode observateur' : "Connecté à l'hôte !", 'ok');
        }
      }
      return false;
    }

    return true;
  }

  isValidHostId(hostId) {
    return typeof hostId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(hostId);
  }

  join(hostId, token, opts) {
    opts = opts || {};
    if (!this.isValidHostId(hostId)) {
      if (this.onStatus) this.onStatus('ID de salle invalide', 'err');
      return;
    }
    if (!this.isValidToken(token)) {
      if (this.onStatus) this.onStatus('Lien d\'invitation incomplet (jeton manquant)', 'err');
      return;
    }

    this.role = opts.observe ? 'observer' : 'guest';
    this.roomToken = token;
    this.authenticated = false;

    if (!this.peer) {
      if (this.joinAttempts >= this.maxJoinAttempts) {
        if (this.onStatus) this.onStatus('Impossible de rejoindre la salle', 'err');
        return;
      }
      this.joinAttempts += 1;
      this.pendingHostId = hostId;
      this.init({ asHost: false });
      return;
    }

    this.conn = this.peer.connect(hostId, { reliable: true });
    this.setupConnection();

    this.conn.on('open', () => {
      this.joinAttempts = 0;
      this.send({ type: 'hello', token: this.roomToken, observe: this.role === 'observer' });
      this.startHandshakeTimeout();
    });
  }

  send(data) {
    if (!this.conn || !this.conn.open) return;
    const isHandshake = data && (data.type === 'hello' || data.type === 'hello-ok');
    if (!this.authenticated && !isHandshake) {
      console.warn('Envoi bloqué: handshake incomplet');
      return;
    }
    // Observateur : seulement chat
    if (this.role === 'observer' && data && data.type !== 'game-chat' && !isHandshake) {
      console.warn('Observateur : envoi non autorisé', data.type);
      return;
    }
    try {
      const payload = this.netSecurity
        ? this.netSecurity.validateMessage(data, { rateLimit: false })
        : data;
      this.conn.send(payload);
      // Hôte : relayer aux observateurs
      if (this.role === 'host' && !isHandshake) {
        this.observers.forEach((o) => {
          if (o.authenticated && o.conn && o.conn.open) {
            try { o.conn.send(payload); } catch (_) { /* ignore */ }
          }
        });
      }
    } catch (error) {
      console.warn('Envoi réseau bloqué:', error.message);
    }
  }

  connected() {
    return !!(this.conn && this.conn.open && this.authenticated);
  }
}

window.Net = Net;
