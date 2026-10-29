// ===================================
// DISCORD ACTIVITIES INTEGRATION
// Streaming live d'échecs et Go sur Discord
// ===================================

class DiscordIntegration {
  constructor() {
    this.discordSDK = null;
    this.isDiscord = false;
    this.channelId = null;
    this.guildId = null;
    this.instanceId = null;
    this.participants = new Map();
    this.isStreaming = false;
    this.isSpectator = false;
    this.streamKey = null;
    this.comments = [];
    this.commentLimiter = typeof CommentRateLimiter !== 'undefined'
      ? new CommentRateLimiter(10)
      : null;
    this.currentUser = { id: 'user_' + Date.now(), username: 'Commentateur', isStreamer: false };
    
    this.init();
  }
  
  async init() {
    // Détecter si on est dans Discord
    this.isDiscord = this.detectDiscord();
    
    if (this.isDiscord) {
      console.log('🎮 Discord Activities détecté !');
      await this.initDiscordSDK();
    } else {
      console.log('📱 Mode standalone (hors Discord)');
    }
  }
  
  detectDiscord() {
    const params = new URLSearchParams(window.location.search);
    const href = window.location.href;
    const referrer = document.referrer || '';
    return (
      href.includes('discord.com') ||
      referrer.includes('discord.com') ||
      params.has('frame_id') ||
      params.has('instance_id')
    );
  }
  
  async initDiscordSDK() {
    try {
      // Charger le SDK Discord si disponible
      if (typeof DiscordSDK !== 'undefined') {
        const clientId = (window.CONFIG && window.CONFIG.discord && window.CONFIG.discord.clientId) || '';
        if (!clientId) {
          console.warn('Discord clientId manquant (CONFIG / .env)');
          this.enableDiscordSimulation();
          return;
        }
        this.discordSDK = new DiscordSDK(clientId);
        
        await this.discordSDK.ready();
        
        // Récupérer les infos du channel
        const { channel_id, guild_id, instance_id } = await this.discordSDK.commands.getInstanceConnectedChannel();
        
        this.channelId = channel_id;
        this.guildId = guild_id;
        this.instanceId = instance_id;
        
        console.log('✅ Discord SDK initialisé', {
          channel: this.channelId,
          guild: this.guildId,
          instance: this.instanceId
        });
        
        // Configurer les événements Discord
        this.setupDiscordEvents();
        
        // Activer l'UI Discord
        this.enableDiscordUI();
        
      } else {
        // Fallback : mode simulation Discord
        console.log('⚠️ Discord SDK non disponible, mode simulation');
        this.enableDiscordSimulation();
      }
    } catch (error) {
      console.error('❌ Erreur initialisation Discord SDK:', error);
      this.enableDiscordSimulation();
    }
  }
  
  setupDiscordEvents() {
    if (!this.discordSDK) return;
    
    // Écouter les nouveaux participants
    this.discordSDK.subscribe('VOICE_STATE_UPDATE', (event) => {
      console.log('👥 Participant update:', event);
      this.updateParticipants(event);
    });
    
    // Écouter les messages du channel
    this.discordSDK.subscribe('SPEAKING_START', (event) => {
      console.log('🎤 Speaking:', event);
    });
    
    // Écouter les changements d'activité
    this.discordSDK.subscribe('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', (event) => {
      console.log('🔄 Participants update:', event);
      this.syncParticipants(event.participants);
    });
  }
  
  enableDiscordUI() {
    // Afficher les contrôles Discord
    const discordControls = document.getElementById('discordControls');
    if (discordControls) {
      discordControls.style.display = 'flex';
    }
    
    // Indiquer qu'on est sur Discord
    const header = document.querySelector('h1');
    if (header) {
      header.textContent = '';
      header.appendChild(document.createTextNode('🎮 Social Board '));
      const span = document.createElement('span');
      span.style.color = '#5865F2';
      span.textContent = 'sur Discord';
      header.appendChild(span);
    }
  }
  
  enableDiscordSimulation() {
    // Mode simulation pour développement
    this.isDiscord = true;
    this.channelId = 'simulation_channel';
    this.guildId = 'simulation_guild';
    this.instanceId = 'simulation_instance';
    
    this.enableDiscordUI();
    
    console.log('🧪 Mode Discord Simulation activé');
  }
  
  // === STREAMING LIVE ===
  
  async startStream(gameType = 'chess') {
    if (this.isStreaming) {
      console.log('⚠️ Stream déjà en cours');
      return;
    }
    
    this.isStreaming = true;
    this.streamKey = this.generateStreamKey();
    
    console.log(`🔴 LIVE : Stream ${gameType} démarré !`);
    console.log(`📺 Stream Key: ${this.streamKey}`);
    
    // Mettre à jour l'activité Discord
    if (this.discordSDK) {
      await this.updateActivity(`🔴 LIVE ${gameType === 'chess' ? '♟️ Échecs' : '🎯 Go'}`);
    }
    
    // Afficher l'UI de streaming
    this.showStreamingUI(gameType);
    
    // Envoyer une notification dans le channel Discord
    this.sendDiscordNotification(`🔴 **LIVE** : Partie de ${gameType === 'chess' ? 'échecs' : 'Go'} en cours !\n📺 Rejoignez pour regarder !`);
    
    // Commencer à broadcaster les coups
    this.startBroadcasting();
    
    return this.streamKey;
  }
  
  stopStream() {
    if (!this.isStreaming) return;
    
    this.isStreaming = false;
    
    console.log('⏹️ Stream arrêté');
    
    // Mettre à jour l'activité
    if (this.discordSDK) {
      this.updateActivity('En jeu');
    }
    
    // Cacher l'UI de streaming
    this.hideStreamingUI();
    
    // Notification fin de stream
    this.sendDiscordNotification('⏹️ Stream terminé. Merci d\'avoir regardé !');
    
    this.stopBroadcasting();
  }
  
  showStreamingUI(gameType) {
    const streamingBar = document.getElementById('streamingBar');
    if (streamingBar) {
      streamingBar.style.display = 'flex';
      
      const statusText = streamingBar.querySelector('#streamStatus');
      if (statusText) {
        statusText.textContent = '';
        statusText.appendChild(document.createTextNode('🔴 LIVE sur Discord • '));
        const count = document.createElement('span');
        count.style.opacity = '0.8';
        count.textContent = this.participants.size + ' spectateur(s)';
        statusText.appendChild(count);
      }
      
      // Animer l'indicateur LIVE
      const liveIndicator = streamingBar.querySelector('.live-indicator');
      if (liveIndicator) {
        liveIndicator.classList.add('pulsing');
      }
    }
  }
  
  hideStreamingUI() {
    const streamingBar = document.getElementById('streamingBar');
    if (streamingBar) {
      streamingBar.style.display = 'none';
    }
  }
  
  generateStreamKey() {
    return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // === MODE SPECTATEUR ===
  
  async joinAsSpectator(streamKey) {
    this.isSpectator = true;
    this.streamKey = streamKey;
    
    console.log(`👁️ Mode spectateur activé : ${streamKey}`);
    
    // Afficher l'UI spectateur
    this.showSpectatorUI();
    
    // Se connecter au stream
    this.connectToStream(streamKey);
    
    // Notification
    this.sendDiscordNotification(`👁️ Un spectateur a rejoint le stream`);
  }
  
  leaveSpectatorMode() {
    this.isSpectator = false;
    this.streamKey = null;
    
    console.log('👋 Mode spectateur quitté');
    
    this.hideSpectatorUI();
    this.disconnectFromStream();
  }
  
  showSpectatorUI() {
    const spectatorBar = document.getElementById('spectatorBar');
    if (spectatorBar) {
      spectatorBar.style.display = 'flex';
    }
    
    // Désactiver les contrôles de jeu
    const controls = document.querySelectorAll('.controls button');
    controls.forEach(btn => {
      if (!btn.id.includes('leave') && !btn.id.includes('spectator')) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
      }
    });
  }
  
  hideSpectatorUI() {
    const spectatorBar = document.getElementById('spectatorBar');
    if (spectatorBar) {
      spectatorBar.style.display = 'none';
    }
    
    // Réactiver les contrôles
    const controls = document.querySelectorAll('.controls button');
    controls.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  }
  
  // === BROADCASTING ===
  
  startBroadcasting() {
    // Écouter les coups joués pour les diffuser
    window.addEventListener('movePlay', (event) => {
      this.broadcastMove(event.detail);
    });
    
    // Écouter les changements de position
    window.addEventListener('positionUpdate', (event) => {
      this.broadcastPosition(event.detail);
    });
    
    console.log('📡 Broadcasting démarré');
  }
  
  stopBroadcasting() {
    // Nettoyer les listeners
    window.removeEventListener('movePlay', this.broadcastMove);
    window.removeEventListener('positionUpdate', this.broadcastPosition);
    
    console.log('📡 Broadcasting arrêté');
  }
  
  broadcastMove(moveData) {
    if (!this.isStreaming) return;
    
    console.log('📡 Broadcasting move:', moveData);
    
    // Envoyer via Discord SDK si disponible
    if (this.discordSDK) {
      this.discordSDK.commands.sendActivityAction({
        type: 'MOVE',
        data: moveData
      });
    }
    
    // Envoyer via localStorage pour simulation
    const streamData = {
      type: 'move',
      streamKey: this.streamKey,
      data: moveData,
      timestamp: Date.now()
    };
    
    localStorage.setItem(`discord_stream_${this.streamKey}`, JSON.stringify(streamData));
    
    // Trigger custom event pour les spectateurs locaux
    window.dispatchEvent(new CustomEvent('streamUpdate', { detail: streamData }));
    
    // Mettre à jour le compteur de spectateurs
    this.updateSpectatorCount();
  }
  
  broadcastPosition(positionData) {
    if (!this.isStreaming) return;
    
    // Similaire à broadcastMove
    const streamData = {
      type: 'position',
      streamKey: this.streamKey,
      data: positionData,
      timestamp: Date.now()
    };
    
    localStorage.setItem(`discord_stream_${this.streamKey}`, JSON.stringify(streamData));
    window.dispatchEvent(new CustomEvent('streamUpdate', { detail: streamData }));
  }
  
  // === SPECTATOR STREAMING ===
  
  connectToStream(streamKey) {
    console.log(`🔌 Connexion au stream: ${streamKey}`);
    
    // Écouter les updates du stream
    window.addEventListener('streamUpdate', (event) => {
      this.handleStreamUpdate(event.detail);
    });
    
    // Polling pour simulation (en production, utiliser WebSocket)
    this.streamPolling = setInterval(() => {
      this.pollStream(streamKey);
    }, 500);
  }
  
  disconnectFromStream() {
    console.log('🔌 Déconnexion du stream');
    
    if (this.streamPolling) {
      clearInterval(this.streamPolling);
      this.streamPolling = null;
    }
    
    window.removeEventListener('streamUpdate', this.handleStreamUpdate);
  }
  
  pollStream(streamKey) {
    const streamData = localStorage.getItem(`discord_stream_${streamKey}`);
    
    if (streamData) {
      try {
        const data = JSON.parse(streamData);
        this.handleStreamUpdate(data);
      } catch (e) {
        console.error('Erreur parsing stream data:', e);
      }
    }
  }
  
  handleStreamUpdate(streamData) {
    if (streamData.type === 'move') {
      console.log('👁️ Coup reçu:', streamData.data);
      
      // Appliquer le coup reçu au plateau local
      window.dispatchEvent(new CustomEvent('spectatorMove', { detail: streamData.data }));
    } else if (streamData.type === 'position') {
      console.log('👁️ Position reçue:', streamData.data);
      
      // Mettre à jour la position
      window.dispatchEvent(new CustomEvent('spectatorPosition', { detail: streamData.data }));
    }
  }
  
  // === PARTICIPANTS ===
  
  updateParticipants(event) {
    if (!event.user) return;
    
    this.participants.set(event.user.id, {
      id: event.user.id,
      username: event.user.username,
      avatar: event.user.avatar,
      isStreamer: false,
      timestamp: Date.now()
    });
    
    this.updateSpectatorCount();
  }
  
  syncParticipants(participants) {
    this.participants.clear();
    
    participants.forEach(p => {
      this.participants.set(p.id, {
        id: p.id,
        username: p.username || 'Inconnu',
        avatar: p.avatar,
        isStreamer: false,
        timestamp: Date.now()
      });
    });
    
    this.updateSpectatorCount();
  }
  
  updateSpectatorCount() {
    const count = this.participants.size;
    
    const countElement = document.getElementById('spectatorCount');
    if (countElement) {
      countElement.textContent = count;
    }
    
    const statusText = document.getElementById('streamStatus');
    if (statusText && this.isStreaming) {
      statusText.textContent = '🔴 LIVE sur Discord • ' + count + ' spectateur(s)';
    }
  }
  
  // === DISCORD ACTIVITY ===
  
  async updateActivity(state = 'En jeu', details = '') {
    if (!this.discordSDK) return;
    
    try {
      await this.discordSDK.commands.setActivity({
        activity: {
          type: 0, // PLAYING
          state: state,
          details: details,
          timestamps: {
            start: Date.now()
          },
          assets: {
            large_image: 'social_board_logo',
            large_text: 'Social Board - Échecs & Go'
          },
          buttons: [
            {
              label: '👁️ Regarder le stream',
              url: window.location.href
            }
          ]
        }
      });
      
      console.log('✅ Discord Activity mise à jour:', state);
    } catch (error) {
      console.error('❌ Erreur mise à jour Activity:', error);
    }
  }
  
  // === NOTIFICATIONS DISCORD ===
  
  async sendDiscordNotification(message, embed = null) {
    console.log('📢 Discord Notification:', message);
    
    // Afficher en overlay dans l'app
    this.showNotificationOverlay(message);
    
    // Si SDK disponible, envoyer au channel
    if (this.discordSDK && this.channelId) {
      try {
        // Note: Nécessite un bot Discord configuré
        // En production, envoyer via webhook ou bot
        console.log('📨 Envoi notification au channel:', this.channelId);
      } catch (error) {
        console.error('❌ Erreur envoi notification:', error);
      }
    }
  }
  
  showNotificationOverlay(message) {
    const overlay = document.createElement('div');
    overlay.className = 'discord-notification';

    const content = document.createElement('div');
    content.className = 'notification-content';

    const img = document.createElement('img');
    img.src = 'https://cdn.discordapp.com/embed/avatars/0.png';
    img.alt = 'Discord';
    img.width = 32;
    img.height = 32;
    img.style.borderRadius = '50%';

    const textWrap = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = 'Discord';
    const p = document.createElement('p');
    p.textContent = String(message || '').slice(0, 300);
    textWrap.appendChild(title);
    textWrap.appendChild(p);

    content.appendChild(img);
    content.appendChild(textWrap);
    overlay.appendChild(content);
    document.body.appendChild(overlay);

    setTimeout(() => overlay.classList.add('show'), 10);
    setTimeout(() => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 300);
    }, 5000);
  }
  
  // === WEBHOOKS ===
  
  async sendWebhook(webhookUrl, content, embeds = []) {
    const SM = window.SecurityManager;
    if (!webhookUrl || (SM && !SM.validateURL(webhookUrl))) return;
    if (!webhookUrl.startsWith('https://discord.com/api/webhooks/') &&
        !webhookUrl.startsWith('https://discordapp.com/api/webhooks/')) {
      console.warn('Webhook Discord refusé : URL non autorisée');
      return;
    }
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: content,
          embeds: embeds,
          username: 'Social Board',
          avatar_url: 'https://your-domain.com/logo.png'
        })
      });
      
      if (response.ok) {
        console.log('✅ Webhook Discord envoyé');
      }
    } catch (error) {
      console.error('❌ Erreur envoi webhook:', error);
    }
  }
  
  // === UTILS ===
  
  getStreamURL() {
    if (window.Broadcast && typeof Broadcast.watchUrl === 'function') {
      const net = typeof window.__sbGetNet === 'function' ? window.__sbGetNet() : null;
      return Broadcast.watchUrl({
        room: window.__sbShortRoomCode || (net && net.roomCode),
        host: net && net.role === 'host' ? net.id : null,
        token: net && net.roomToken
      });
    }
    const url = new URL(window.location.href);
    if (this.streamKey) {
      url.searchParams.set('stream', this.streamKey);
      url.searchParams.set('mode', 'spectator');
    }
    url.searchParams.set('broadcast', '1');
    url.searchParams.set('observe', '1');
    return url.toString();
  }
  
  copyStreamURL() {
    if (window.Broadcast && Broadcast.copyWatchLink) {
      Broadcast.copyWatchLink();
      return;
    }
    const url = this.getStreamURL();
    navigator.clipboard.writeText(url).then(() => {
      console.log('📋 URL du stream copié !');
      this.showNotificationOverlay('📋 Lien Watch / OBS copié !');
    }).catch(err => {
      console.error('Erreur copie URL:', err);
    });
  }

  // === SYSTÈME DE COMMENTAIRES ===

  initCommentarySystem() {
    const commentaryPanel = document.getElementById('commentaryPanel');
    const btnToggleCommentary = document.getElementById('btnToggleCommentary');
    const btnSendComment = document.getElementById('btnSendComment');
    const commentaryInput = document.getElementById('commentaryInput');

    if (!commentaryPanel) return;

    // Afficher le panneau de commentaires
    commentaryPanel.style.display = 'block';

    // Toggle panneau
    if (btnToggleCommentary) {
      btnToggleCommentary.addEventListener('click', () => {
        commentaryPanel.classList.toggle('collapsed');
        btnToggleCommentary.textContent = commentaryPanel.classList.contains('collapsed') ? '+' : '−';
      });
    }

    // Envoyer un commentaire
    if (btnSendComment && commentaryInput) {
      const sendComment = () => {
        const text = commentaryInput.value.trim();
        if (text.length === 0) return;

        this.sendComment(text);
        commentaryInput.value = '';
      };

      btnSendComment.addEventListener('click', sendComment);
      commentaryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          sendComment();
        }
      });
    }

    // Afficher message d'accueil
    this.addSystemComment('💬 Système de commentaires activé ! Vous pouvez commenter la partie en direct.');
  }

  sendComment(text, moveRef = null) {
    try {
      if (this.commentLimiter) {
        this.commentLimiter.canComment();
      }
    } catch (error) {
      this.showNotificationOverlay(error.message);
      return;
    }

    const SM = window.SecurityManager;
    const cleanText = SM
      ? SM.sanitizeInput(String(text || '').trim(), 500)
      : String(text || '').trim().slice(0, 500);
    if (!cleanText) return;

    const comment = {
      id: (SM && SM.generateSecureId('comment_')) || ('comment_' + Date.now()),
      userId: this.currentUser.id,
      username: SM
        ? SM.sanitizeInput(this.currentUser.username, 20)
        : String(this.currentUser.username || 'Joueur').slice(0, 20),
      text: cleanText,
      moveRef: moveRef ? String(moveRef).slice(0, 16) : null,
      timestamp: Date.now(),
      isStreamer: this.isStreaming,
      isSpectator: this.isSpectator
    };

    this.comments.push(comment);
    this.displayComment(comment);
    this.broadcastComment(comment);
  }

  appendHighlightedText(parent, text) {
    const regex = /\b([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?|[A-T](?:[1-9]|1[0-9]))\b/g;
    let last = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > last) {
        parent.appendChild(document.createTextNode(text.slice(last, match.index)));
      }
      const span = document.createElement('span');
      span.className = 'commentary-move-ref';
      span.textContent = match[0];
      parent.appendChild(span);
      last = regex.lastIndex;
    }
    if (last < text.length) {
      parent.appendChild(document.createTextNode(text.slice(last)));
    }
  }

  displayComment(comment) {
    const commentaryList = document.getElementById('commentaryList');
    if (!commentaryList) return;

    const emptyMsg = commentaryList.querySelector('.commentary-empty');
    if (emptyMsg) emptyMsg.remove();

    const SM = window.SecurityManager;
    const username = SM
      ? SM.sanitizeInput(comment.username || '?', 20)
      : String(comment.username || '?').slice(0, 20);
    const text = SM
      ? SM.sanitizeInput(comment.text || '', 500)
      : String(comment.text || '').slice(0, 500);

    const commentDiv = document.createElement('div');
    commentDiv.className = 'commentary-item';
    if (comment.isStreamer) commentDiv.classList.add('streamer');
    else if (comment.isSpectator) commentDiv.classList.add('spectator');

    const userType = comment.isStreamer ? 'streamer' : (comment.isSpectator ? 'spectator' : '');
    const header = document.createElement('div');
    header.className = 'commentary-header-info';

    const avatar = document.createElement('div');
    avatar.className = 'commentary-avatar';
    avatar.textContent = username.charAt(0).toUpperCase();

    const nameEl = document.createElement('span');
    nameEl.className = 'commentary-username ' + userType;
    nameEl.textContent = username;

    const timeEl = document.createElement('span');
    timeEl.className = 'commentary-timestamp';
    timeEl.textContent = this.formatCommentTime(comment.timestamp);

    header.appendChild(avatar);
    header.appendChild(nameEl);
    header.appendChild(timeEl);

    const textEl = document.createElement('div');
    textEl.className = 'commentary-text';
    this.appendHighlightedText(textEl, text);

    commentDiv.appendChild(header);
    commentDiv.appendChild(textEl);
    commentaryList.appendChild(commentDiv);
    commentaryList.scrollTop = commentaryList.scrollHeight;
  }

  broadcastComment(comment) {
    if (!this.isStreaming && !this.isSpectator) return;

    // Envoyer via Discord SDK si disponible
    if (this.discordSDK) {
      try {
        this.discordSDK.commands.sendActivityAction({
          type: 'COMMENT',
          data: comment
        });
      } catch (error) {
        console.error('Erreur envoi commentaire Discord:', error);
      }
    }

    // Envoyer via localStorage pour simulation
    const streamData = {
      type: 'comment',
      streamKey: this.streamKey,
      data: comment,
      timestamp: Date.now()
    };

    localStorage.setItem(`discord_comment_${this.streamKey}_${comment.id}`, JSON.stringify(streamData));
    
    // Trigger custom event
    window.dispatchEvent(new CustomEvent('commentReceived', { detail: comment }));
  }

  receiveComment(comment) {
    if (!comment || typeof comment !== 'object' || !comment.id) return;
    if (this.comments.some(c => c.id === comment.id)) return;
    if (this.comments.length > 200) this.comments.shift();
    this.comments.push(comment);
    this.displayComment(comment);
  }

  addSystemComment(text) {
    const systemComment = {
      id: 'system_' + Date.now(),
      userId: 'system',
      username: 'Système',
      text: text,
      timestamp: Date.now(),
      isStreamer: false,
      isSpectator: false
    };

    this.displayComment(systemComment);
  }

  formatCommentTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  setCurrentUser(username, isStreamer = false) {
    this.currentUser = {
      id: 'user_' + Date.now(),
      username: username,
      isStreamer: isStreamer
    };

    console.log('👤 Utilisateur défini:', this.currentUser);
  }

  clearComments() {
    this.comments = [];
    const commentaryList = document.getElementById('commentaryList');
    if (commentaryList) {
      commentaryList.innerHTML = '<div class="commentary-empty">Aucun commentaire pour le moment...</div>';
    }
  }

  exportComments() {
    const commentsText = this.comments.map(c => {
      const time = this.formatCommentTime(c.timestamp);
      return `[${time}] ${c.username}: ${c.text}`;
    }).join('\n');

    return commentsText;
  }

  // Commenter automatiquement un coup joué
  commentMove(move, gameType = 'chess') {
    if (!this.isStreaming) return;

    let moveNotation = '';
    
    if (gameType === 'chess') {
      moveNotation = move.san || move.from + move.to;
    } else if (gameType === 'go') {
      moveNotation = move.coord || `${move.x},${move.y}`;
    }

    // Ne pas envoyer de commentaire automatique, juste stocker la référence
    // Le streamer peut y faire référence dans son commentaire
    return moveNotation;
  }
}

// Instance globale
window.discordIntegration = new DiscordIntegration();

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DiscordIntegration;
}
