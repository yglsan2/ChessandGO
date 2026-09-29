// =================================================
// GESTIONNAIRE DE SÉCURITÉ
// Protection XSS, validation, sanitization
// =================================================

class SecurityManager {
  /**
   * Sanitize HTML pour prévenir XSS
   */
  static sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Sanitize input utilisateur
   */
  static sanitizeInput(input, maxLength = 500) {
    if (typeof input !== 'string') return '';
    
    // Limiter la longueur
    let clean = input.substring(0, maxLength);
    
    // Supprimer les scripts
    clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Supprimer les balises dangereuses
    clean = clean.replace(/<iframe|<object|<embed|<applet|<meta|<link/gi, '');
    
    // Supprimer les événements inline
    clean = clean.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    clean = clean.replace(/on\w+\s*=\s*[^\s>]*/gi, '');
    
    // Supprimer javascript: dans les URLs
    clean = clean.replace(/javascript:/gi, '');
    
    // Encoder les caractères spéciaux HTML
    return this.sanitizeHTML(clean);
  }

  /**
   * Valider username (alphanumérique + underscores)
   */
  static validateUsername(username) {
    if (!username || typeof username !== 'string') return false;
    
    const trimmed = username.trim();
    if (trimmed.length < 3 || trimmed.length > 20) return false;
    if (/[<>"'`\\]/.test(trimmed)) return false;
    return /^[\p{L}\p{N}_ \-]+$/u.test(trimmed);
  }

  /**
   * Valider email
   */
  static validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    
    // RFC 5322 simplifié
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email) && email.length <= 254;
  }

  /**
   * Valider URL
   */
  static validateURL(url) {
    if (!url || typeof url !== 'string') return false;
    
    try {
      const parsed = new URL(url);
      // Autoriser seulement http et https
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  /**
   * Échapper les caractères spéciaux pour Regex
   */
  static escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Générer un ID sécurisé
   */
  static generateSecureId(prefix = '') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const random2 = Math.random().toString(36).substring(2, 15);
    return `${prefix}${timestamp}_${random}${random2}`;
  }

  static clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  static isSafeCssColor(value) {
    return typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
  }

  static safeJsonParse(raw, fallback = null) {
    if (typeof raw !== 'string' || raw.length > 4000) return fallback;
    try {
      return JSON.parse(raw, (key, value) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          return undefined;
        }
        return value;
      });
    } catch (e) {
      return fallback;
    }
  }

  static parseClockConfig(raw) {
    const empty = { type: 'none' };
    const data = typeof raw === 'string' ? this.safeJsonParse(raw, empty) : (raw || empty);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return empty;
    const allowed = ['none', 'simple', 'fischer', 'byoyomi', 'canadian'];
    const type = allowed.includes(data.type) ? data.type : 'none';
    if (type === 'none') return empty;
    return {
      type,
      minutes: this.clampNumber(data.minutes, 0.5, 180, 10),
      increment: this.clampNumber(data.increment, 0, 120, 0),
      mainMinutes: this.clampNumber(data.mainMinutes, 0.5, 180, 20),
      byoyomiSeconds: this.clampNumber(data.byoyomiSeconds, 5, 120, 30),
      periods: this.clampNumber(data.periods, 1, 10, 5),
      periodMinutes: this.clampNumber(data.periodMinutes, 0.5, 60, 5),
      stones: this.clampNumber(data.stones, 1, 50, 25)
    };
  }

  static parseGameType(value) {
    if (value === 'go' || value === 'rengo') return 'go';
    return 'chess';
  }

  static isPairsInvite(value) {
    return value === 'rengo' || value === 'renchess';
  }

  /**
   * Hash simple (NON CRYPTOGRAPHIQUE - pour fingerprinting)
   */
  static simpleHash(str) {
    let hash = 0;
    if (!str || str.length === 0) return hash;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return hash.toString(36);
  }
}

// =================================================
// STOCKAGE SÉCURISÉ
// Chiffrement XOR basique pour localStorage
// =================================================

class SecureStorage {
  constructor() {
    this.key = this.deriveKey();
  }

  /**
   * Dériver une clé basée sur le navigateur
   */
  deriveKey() {
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      new Date().getTimezoneOffset()
    ].join('|');
    
    return SecurityManager.simpleHash(fingerprint);
  }

  /**
   * Chiffrer des données (XOR simple + Base64)
   */
  encrypt(data) {
    try {
      const jsonStr = JSON.stringify(data);
      const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
      
      // XOR avec la clé
      let result = '';
      for (let i = 0; i < base64.length; i++) {
        result += String.fromCharCode(
          base64.charCodeAt(i) ^ this.key.charCodeAt(i % this.key.length)
        );
      }
      
      return btoa(result);
    } catch (e) {
      console.error('Encryption error:', e);
      return null;
    }
  }

  /**
   * Déchiffrer des données
   */
  decrypt(encrypted) {
    try {
      const xored = atob(encrypted);
      let result = '';
      
      for (let i = 0; i < xored.length; i++) {
        result += String.fromCharCode(
          xored.charCodeAt(i) ^ this.key.charCodeAt(i % this.key.length)
        );
      }
      
      const jsonStr = decodeURIComponent(escape(atob(result)));
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('Decryption error:', e);
      return null;
    }
  }

  /**
   * Stocker un item
   */
  setItem(key, data) {
    try {
      const encrypted = this.encrypt(data);
      if (encrypted) {
        localStorage.setItem(key, encrypted);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Storage error:', e);
      return false;
    }
  }

  /**
   * Récupérer un item
   */
  getItem(key) {
    try {
      const encrypted = localStorage.getItem(key);
      if (!encrypted) return null;
      return this.decrypt(encrypted);
    } catch (e) {
      console.error('Retrieval error:', e);
      return null;
    }
  }

  /**
   * Supprimer un item
   */
  removeItem(key) {
    localStorage.removeItem(key);
  }

  /**
   * Vider le stockage
   */
  clear() {
    localStorage.clear();
  }
}

// =================================================
// SÉCURITÉ RÉSEAU
// Validation des messages P2P, rate limiting
// =================================================

class NetworkSecurity {
  constructor(config = {}) {
    this.maxMessageSize = config.maxMessageSize || 10 * 1024; // 10KB
    this.messageLimit = config.messageLimit || 100; // par minute
    this.messageCount = 0;
    this.lastReset = Date.now();
    this.blockedUntil = null;
    this.allowedTypes = config.allowedTypes || [
      'chess', 'go', 'pass', 'resign',
      'chat', 'comment', 'invitation',
      'invitation-response', 'invitation-counter',
      'position', 'move', 'sync', 'hello', 'hello-ok', 'piece-hint', 'go-hint'
    ];
  }

  /**
   * Valider un message reçu
   */
  validateMessage(data, options = {}) {
    const { rateLimit = true } = options;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid message format');
    }

    const size = JSON.stringify(data).length;
    if (size > this.maxMessageSize) {
      throw new Error(`Message too large: ${size} bytes (max: ${this.maxMessageSize})`);
    }

    if (rateLimit && !this.checkRateLimit()) {
      throw new Error('Rate limit exceeded');
    }

    // 4. Vérifier le type de message
    if (!data.type || !this.allowedTypes.includes(data.type)) {
      throw new Error(`Unknown or disallowed message type: ${data.type}`);
    }

    // 5. Sanitizer les champs texte
    if (data.text) {
      data.text = SecurityManager.sanitizeInput(data.text, 500);
    }

    if (data.username) {
      data.username = SecurityManager.sanitizeInput(data.username, 20);
    }

    if (data.type === 'hello') {
      if (typeof data.token !== 'string' || !/^[a-f0-9]{32}$/.test(data.token)) {
        throw new Error('Invalid room token');
      }
    }

    if (data.type === 'piece-hint') {
      if (!['p', 'n', 'b', 'r', 'q', 'k'].includes(data.piece)) {
        throw new Error('Invalid piece hint');
      }
      if (data.color !== 'w' && data.color !== 'b') {
        throw new Error('Invalid hint color');
      }
    }

    if (data.type === 'go-hint') {
      if (!['coin', 'centre', 'bord', 'reponse'].includes(data.zone)) {
        throw new Error('Invalid go hint');
      }
      if (data.color !== 'w' && data.color !== 'b') {
        throw new Error('Invalid hint color');
      }
    }

    if (data.type === 'chess') {
      if (data.variant !== undefined &&
          data.variant !== 'standard' &&
          data.variant !== 'threeCheck' &&
          data.variant !== 'kingOfTheHill') {
        throw new Error('Invalid chess variant');
      }
      if (data.reset !== undefined && data.reset !== true && data.reset !== false) {
        throw new Error('Invalid chess reset flag');
      }
      if (data.checks !== undefined) {
        if (!data.checks || typeof data.checks !== 'object' || Array.isArray(data.checks)) {
          throw new Error('Invalid checks payload');
        }
        const w = data.checks.w;
        const b = data.checks.b;
        if (!Number.isInteger(w) || !Number.isInteger(b) || w < 0 || w > 3 || b < 0 || b > 3) {
          throw new Error('Invalid check counts');
        }
      }
    }

    // 6. Valider les coordonnées Go
    if (data.type === 'go' && typeof data.x !== 'undefined') {
      if (!Number.isInteger(data.x) || !Number.isInteger(data.y)) {
        throw new Error('Invalid Go coordinates');
      }
      if (data.x < 0 || data.x > 18 || data.y < 0 || data.y > 18) {
        throw new Error('Go coordinates out of bounds');
      }
    }

    // 7. Valider un FEN d'échecs
    if (data.fen !== undefined) {
      if (typeof data.fen !== 'string' || data.fen.length > 128) {
        throw new Error('Invalid FEN');
      }
      if (!/^[\w\/\s\-\.]+$/.test(data.fen)) {
        throw new Error('Invalid FEN characters');
      }
    }

    return data;
  }

  /**
   * Vérifier le rate limit
   */
  checkRateLimit() {
    const now = Date.now();

    // Vérifier si bloqué
    if (this.blockedUntil && now < this.blockedUntil) {
      return false;
    }

    // Reset toutes les minutes
    if (now - this.lastReset > 60000) {
      this.messageCount = 0;
      this.lastReset = now;
      this.blockedUntil = null;
    }

    this.messageCount++;

    // Si limite dépassée, bloquer
    if (this.messageCount > this.messageLimit) {
      this.blockedUntil = now + 30000; // 30 secondes
      return false;
    }

    return true;
  }

  /**
   * Obtenir le temps de blocage restant
   */
  getBlockedTime() {
    if (!this.blockedUntil) return 0;
    const remaining = this.blockedUntil - Date.now();
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  /**
   * Réinitialiser le compteur
   */
  reset() {
    this.messageCount = 0;
    this.lastReset = Date.now();
    this.blockedUntil = null;
  }
}

// =================================================
// GESTIONNAIRE D'ERREURS
// Capture et logging centralisé
// =================================================

class ErrorHandler {
  static maxLogs = 50;

  /**
   * Gérer une erreur
   */
  static handleError(error, context = 'Unknown') {
    console.error(`[${context}]`, error);
    this.logError(error, context);
    if (context === 'Global Error' || context === 'Promise Rejection') {
      return;
    }
    this.showUserError(error, context);
  }

  /**
   * Logger une erreur
   */
  static logError(error, context) {
    const errorLog = {
      timestamp: new Date().toISOString(),
      context: context,
      message: error.message || String(error),
      stack: error.stack || '',
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    try {
      // Récupérer les logs existants
      const logs = JSON.parse(localStorage.getItem('error_logs') || '[]');
      logs.push(errorLog);

      // Garder seulement les N dernières erreurs
      if (logs.length > this.maxLogs) {
        logs.splice(0, logs.length - this.maxLogs);
      }

      localStorage.setItem('error_logs', JSON.stringify(logs));
    } catch (e) {
      console.error('Failed to log error:', e);
    }
  }

  /**
   * Afficher une erreur à l'utilisateur
   */
  static showUserError(error, context) {
    const message = this.getUserFriendlyMessage(error);
    if (typeof showNotification === 'function') {
      showNotification(message, 'error');
    }
  }

  /**
   * Obtenir un message user-friendly
   */
  static getUserFriendlyMessage(error) {
    const errorMap = {
      'NetworkError': 'Erreur de connexion. Vérifiez votre connexion internet.',
      'QuotaExceededError': 'Stockage local plein. Veuillez libérer de l\'espace.',
      'TypeError': 'Une erreur s\'est produite. Veuillez recharger la page.',
      'SyntaxError': 'Données corrompues détectées.',
      'SecurityError': 'Opération non autorisée pour des raisons de sécurité.',
      'ReferenceError': 'Erreur interne. Veuillez recharger la page.',
      'Invalid message format': 'Message invalide reçu.',
      'Rate limit exceeded': 'Trop de requêtes. Veuillez patienter.',
      'Message too large': 'Message trop volumineux.'
    };

    const errorName = error.name || '';
    const errorMessage = error.message || '';

    // Chercher une correspondance
    for (const [key, value] of Object.entries(errorMap)) {
      if (errorName === key || errorMessage.includes(key)) {
        return value;
      }
    }

    return 'Une erreur inattendue s\'est produite.';
  }

  /**
   * Récupérer les logs d'erreurs
   */
  static getErrorLogs() {
    try {
      return JSON.parse(localStorage.getItem('error_logs') || '[]');
    } catch (e) {
      return [];
    }
  }

  /**
   * Effacer les logs d'erreurs
   */
  static clearErrorLogs() {
    localStorage.removeItem('error_logs');
  }

  /**
   * Wrapper async avec gestion d'erreur
   */
  static wrapAsync(fn, context = 'AsyncFunction') {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handleError(error, context);
        return null;
      }
    };
  }

  /**
   * Wrapper sync avec gestion d'erreur
   */
  static wrapSync(fn, context = 'SyncFunction') {
    return (...args) => {
      try {
        return fn(...args);
      } catch (error) {
        this.handleError(error, context);
        return null;
      }
    };
  }
}

class CommentRateLimiter {
  constructor(maxPerMinute = 10) {
    this.maxPerMinute = maxPerMinute;
    this.timestamps = [];
    this.blockedUntil = 0;
  }

  canComment() {
    const now = Date.now();
    if (now < this.blockedUntil) {
      const remaining = Math.ceil((this.blockedUntil - now) / 1000);
      throw new Error(`Trop de commentaires. Attendez ${remaining}s.`);
    }
    this.timestamps = this.timestamps.filter((t) => now - t < 60000);
    if (this.timestamps.length >= this.maxPerMinute) {
      this.blockedUntil = now + 30000;
      throw new Error('Trop de commentaires. Veuillez patienter 30 secondes.');
    }
    this.timestamps.push(now);
    return true;
  }
}

// =================================================
// INITIALISATION GLOBALE
// =================================================

window.addEventListener('error', (event) => {
  ErrorHandler.logError(event.error || new Error(event.message), 'Global Error');
});

window.addEventListener('unhandledrejection', (event) => {
  ErrorHandler.logError(
    event.reason || new Error('Unhandled Promise Rejection'),
    'Promise Rejection'
  );
});

window.SecurityManager = SecurityManager;
window.SecureStorage = SecureStorage;
window.NetworkSecurity = NetworkSecurity;
window.ErrorHandler = ErrorHandler;
window.CommentRateLimiter = CommentRateLimiter;
