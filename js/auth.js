// Système d'authentification et d'invitations
class AuthSystem {
  constructor() {
    this.currentUser = null;
    this.storage = typeof SecureStorage !== 'undefined' ? new SecureStorage() : null;
    this.loginFailures = [];
    this.loadUser();
  }

  loadUser() {
    try {
      let parsed = null;
      if (this.storage) {
        parsed = this.storage.getItem('socialboard_user');
      }
      if (!parsed) {
        const saved = localStorage.getItem('socialboard_user');
        if (!saved) return;
        parsed = window.SecurityManager
          ? SecurityManager.safeJsonParse(saved, null)
          : JSON.parse(saved);
      }
      if (!this.isValidUser(parsed)) {
        localStorage.removeItem('socialboard_user');
        return;
      }
      this.currentUser = parsed;
    } catch (e) {
      console.warn('Profil utilisateur corrompu, réinitialisation');
      localStorage.removeItem('socialboard_user');
      this.currentUser = null;
    }
  }

  isValidUser(user) {
    return user &&
      typeof user === 'object' &&
      typeof user.id === 'string' &&
      user.id.length <= 80 &&
      typeof user.username === 'string' &&
      user.username.length >= 1 &&
      user.username.length <= 20;
  }

  saveUser() {
    try {
      if (this.currentUser) {
        if (this.storage) {
          this.storage.setItem('socialboard_user', this.currentUser);
        } else {
          localStorage.setItem('socialboard_user', JSON.stringify(this.currentUser));
        }
      } else {
        localStorage.removeItem('socialboard_user');
      }
    } catch (e) {
      console.error('Impossible d\'enregistrer le profil', e);
    }
  }

  sanitizeName(name) {
    const SM = window.SecurityManager;
    if (SM) {
      return SM.sanitizeInput(String(name || '').trim(), 20);
    }
    return String(name || '').trim().slice(0, 20);
  }

  canAttemptLogin() {
    const now = Date.now();
    this.loginFailures = this.loginFailures.filter((t) => now - t < 15 * 60 * 1000);
    return this.loginFailures.length < 5;
  }

  recordLoginFailure() {
    this.loginFailures.push(Date.now());
  }

  login(username) {
    if (!this.canAttemptLogin()) {
      return { success: false, error: "Trop de tentatives. Réessayez dans 15 minutes." };
    }
    const clean = this.sanitizeName(username);
    const SM = window.SecurityManager;
    if (SM && !SM.validateUsername(clean)) {
      this.recordLoginFailure();
      return { success: false, error: "Pseudo invalide (3–20 caractères, sans < > \" ')" };
    }
    if (!clean || clean.length < 3) {
      this.recordLoginFailure();
      return { success: false, error: "Le pseudo doit contenir au moins 3 caractères" };
    }

    this.currentUser = {
      id: (SM && SM.generateSecureId('user_')) || ('user_' + Date.now()),
      username: clean,
      type: 'username',
      avatar: this.generateAvatar(clean),
      created: Date.now()
    };

    this.loginFailures = [];
    this.saveUser();
    return { success: true, user: this.currentUser };
  }

  loginEmail(email, code) {
    if (!this.canAttemptLogin()) {
      return { success: false, error: "Trop de tentatives. Réessayez dans 15 minutes." };
    }
    const SM = window.SecurityManager;
    const cleanEmail = String(email || '').trim().slice(0, 254);
    if ((SM && !SM.validateEmail(cleanEmail)) || !cleanEmail.includes('@')) {
      this.recordLoginFailure();
      return { success: false, error: "Email invalide" };
    }
    const codeStr = String(code || '');
    if (!/^[A-Za-z0-9]{4,10}$/.test(codeStr)) {
      this.recordLoginFailure();
      return { success: false, error: "Code invalide" };
    }

    const username = this.sanitizeName(cleanEmail.split('@')[0]);
    this.currentUser = {
      id: (SM && SM.generateSecureId('email_')) || ('email_' + Date.now()),
      username: username || 'joueur',
      emailHint: cleanEmail.slice(0, 2) + '***',
      type: 'email',
      avatar: this.generateAvatar(username || 'joueur'),
      created: Date.now()
    };

    this.loginFailures = [];

    this.saveUser();
    return { success: true, user: this.currentUser };
  }

  loginSocial(platform, socialId, socialName) {
    const allowed = ['facebook', 'discord', 'telegram', 'twitter'];
    if (!allowed.includes(platform)) {
      return { success: false, error: "Plateforme non reconnue" };
    }
    const cleanName = this.sanitizeName(socialName) || 'joueur';
    const cleanId = String(socialId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    if (!cleanId) {
      return { success: false, error: "Identifiant social invalide" };
    }

    this.currentUser = {
      id: platform + '_' + cleanId,
      username: cleanName,
      type: platform,
      socialId: cleanId,
      avatar: this.generateAvatar(cleanName),
      created: Date.now()
    };

    this.saveUser();
    return { success: true, user: this.currentUser };
  }

  logout() {
    this.currentUser = null;
    this.saveUser();
  }

  generateAvatar(name) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
      '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
    ];
    let hash = 0;
    const safe = String(name || '?');
    for (let i = 0; i < safe.length; i++) {
      hash = safe.charCodeAt(i) + ((hash << 5) - hash);
    }
    return {
      color: colors[Math.abs(hash) % colors.length],
      initial: safe.charAt(0).toUpperCase()
    };
  }

  getUser() {
    return this.currentUser;
  }

  isLoggedIn() {
    return this.currentUser !== null;
  }

  createInvitation(gameType, clockType, roomId) {
    if (!this.isLoggedIn()) {
      return { success: false, error: "Vous devez être connecté" };
    }
    const games = ['chess', 'go'];
    if (!games.includes(gameType)) {
      return { success: false, error: "Type de jeu invalide" };
    }
    const SM = window.SecurityManager;
    const invitation = {
      id: (SM && SM.generateSecureId('inv_')) || ('inv_' + Date.now()),
      host: this.currentUser,
      gameType: gameType,
      clockType: String(clockType || 'none').slice(0, 40),
      roomId: String(roomId || '').slice(0, 64),
      created: Date.now(),
      expires: Date.now() + (24 * 60 * 60 * 1000)
    };
    return { success: true, invitation: invitation };
  }

  generateInviteLink(invitation) {
    const baseUrl = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({
      invite: invitation.id,
      host: invitation.roomId,
      game: invitation.gameType,
      clock: invitation.clockType
    });
    return `${baseUrl}?${params.toString()}`;
  }

  shareToSocial(platform, inviteLink, message) {
    const SM = window.SecurityManager;
    if (SM && !SM.validateURL(inviteLink)) {
      return false;
    }
    const encodedLink = encodeURIComponent(inviteLink);
    const encodedMessage = encodeURIComponent(String(message || '').slice(0, 280));
    const urls = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedLink}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodedLink}&text=${encodedMessage}`,
      reddit: `https://reddit.com/submit?url=${encodedLink}&title=${encodedMessage}`,
      telegram: `https://t.me/share/url?url=${encodedLink}&text=${encodedMessage}`,
      whatsapp: `https://wa.me/?text=${encodedMessage}%20${encodedLink}`
    };
    if (urls[platform]) {
      window.open(urls[platform], '_blank', 'noopener,noreferrer,width=600,height=400');
      return true;
    }
    return false;
  }
}

window.AuthSystem = AuthSystem;
