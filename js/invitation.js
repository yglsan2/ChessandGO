// Système d'invitations et de négociation
class InvitationSystem {
  constructor(authSystem, net) {
    this.auth = authSystem;
    this.net = net;
    this.pendingInvites = [];
    this.currentInvite = null;
    this.onInviteReceived = null;
    this.onInviteAccepted = null;
    this.onInviteRejected = null;
    this.onCounterProposal = null;
  }

  // Créer et envoyer une invitation
  createInvitation(gameType, clockConfig) {
    if (!this.auth.isLoggedIn()) {
      return { success: false, error: "Vous devez être connecté" };
    }

    const invitation = {
      id: 'inv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      from: {
        id: this.auth.currentUser.id,
        username: this.auth.currentUser.username,
        avatar: this.auth.currentUser.avatar
      },
      gameType: gameType,
      clockConfig: clockConfig,
      timestamp: Date.now(),
      status: 'pending'
    };

    this.currentInvite = invitation;
    return { success: true, invitation: invitation };
  }

  // Recevoir une invitation
  receiveInvitation(invitation) {
    if (!this.isValidInvitation(invitation)) {
      return null;
    }
    this.pendingInvites.push(invitation);
    if (this.pendingInvites.length > 20) {
      this.pendingInvites.shift();
    }

    if (this.onInviteReceived) {
      this.onInviteReceived(invitation);
    }

    return invitation;
  }

  isValidInvitation(invitation) {
    if (!invitation || typeof invitation !== 'object') return false;
    if (typeof invitation.id !== 'string' || invitation.id.length > 80) return false;
    const game = invitation.gameType;
    if (game !== 'chess' && game !== 'go') return false;
    if (!invitation.from || typeof invitation.from.username !== 'string') return false;
    if (invitation.from.username.length > 20) return false;
    return true;
  }

  // Accepter une invitation
  acceptInvitation(invitationId) {
    const invite = this.pendingInvites.find(inv => inv.id === invitationId);
    
    if (!invite) {
      return { success: false, error: "Invitation non trouvée" };
    }

    invite.status = 'accepted';
    
    const response = {
      type: 'invitation-response',
      invitationId: invitationId,
      action: 'accept',
      from: {
        id: this.auth.currentUser.id,
        username: this.auth.currentUser.username,
        avatar: this.auth.currentUser.avatar
      },
      timestamp: Date.now()
    };

    if (this.onInviteAccepted) {
      this.onInviteAccepted(invite);
    }

    return { success: true, response: response, invitation: invite };
  }

  // Refuser une invitation
  rejectInvitation(invitationId) {
    const invite = this.pendingInvites.find(inv => inv.id === invitationId);
    
    if (!invite) {
      return { success: false, error: "Invitation non trouvée" };
    }

    invite.status = 'rejected';
    this.pendingInvites = this.pendingInvites.filter(inv => inv.id !== invitationId);
    
    const response = {
      type: 'invitation-response',
      invitationId: invitationId,
      action: 'reject',
      from: {
        id: this.auth.currentUser.id,
        username: this.auth.currentUser.username
      },
      timestamp: Date.now()
    };

    if (this.onInviteRejected) {
      this.onInviteRejected(invite);
    }

    return { success: true, response: response };
  }

  // Proposer un autre timing (contre-proposition)
  proposeCounterTiming(invitationId, newClockConfig) {
    const invite = this.pendingInvites.find(inv => inv.id === invitationId);
    
    if (!invite) {
      return { success: false, error: "Invitation non trouvée" };
    }

    const counterProposal = {
      type: 'invitation-counter',
      invitationId: invitationId,
      action: 'counter-propose',
      from: {
        id: this.auth.currentUser.id,
        username: this.auth.currentUser.username,
        avatar: this.auth.currentUser.avatar
      },
      originalClock: invite.clockConfig,
      proposedClock: newClockConfig,
      timestamp: Date.now()
    };

    if (this.onCounterProposal) {
      this.onCounterProposal(counterProposal);
    }

    return { success: true, counterProposal: counterProposal };
  }

  // Formatter la description d'une horloge
  formatClockDescription(clockConfig) {
    if (!clockConfig || clockConfig.type === 'none') {
      return "sans limite de temps";
    }

    const { type, minutes, increment, mainMinutes, byoyomiSeconds, periods, periodMinutes, stones } = clockConfig;

    if (type === 'simple') {
      if (minutes <= 1) return `⚡ Bullet ${minutes} min`;
      if (minutes <= 5) return `🔥 Blitz ${minutes} min`;
      if (minutes <= 15) return `⚡ Rapide ${minutes} min`;
      return `🏛️ Classique ${minutes} min`;
    }

    if (type === 'fischer') {
      return `⚡ Fischer ${minutes}+${increment}`;
    }

    if (type === 'byoyomi') {
      return `🎯 Byoyomi ${mainMinutes}min + ${periods}×${byoyomiSeconds}s`;
    }

    if (type === 'canadian') {
      return `🍁 Canadienne ${mainMinutes}min + ${periodMinutes}min/${stones} coups`;
    }

    return "horloge personnalisée";
  }

  // Obtenir le nom du jeu
  getGameName(gameType) {
    return gameType === 'chess' ? '♟️ Échecs' : '🎯 Go';
  }

  // Formatter le message d'invitation complet
  formatInvitationMessage(invitation) {
    const game = this.getGameName(invitation.gameType);
    const clock = this.formatClockDescription(invitation.clockConfig);
    const username = invitation.from.username;

    return `${username} vous invite à jouer une partie de ${game}\nCadence : ${clock}`;
  }

  // Supprimer une invitation
  removeInvitation(invitationId) {
    this.pendingInvites = this.pendingInvites.filter(inv => inv.id !== invitationId);
  }

  // Obtenir toutes les invitations en attente
  getPendingInvites() {
    return this.pendingInvites.filter(inv => inv.status === 'pending');
  }
}

window.InvitationSystem = InvitationSystem;
