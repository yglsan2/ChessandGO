// ===================================
// STREAM OVERLAY SYSTEM
// Personnalisation complète de l'écran de streaming
// ===================================

class StreamOverlay {
  constructor() {
    this.currentLayout = 'default';
    this.widgets = new Map();
    this.overlayConfig = this.getDefaultConfig();
    this.isDragging = false;
    this.dragTarget = null;
    this.editMode = false;
    
    this.init();
  }
  
  getDefaultConfig() {
    return {
      // Layout général
      layout: 'default',
      theme: 'dark',
      
      // Widgets activés
      enabledWidgets: {
        playerInfo: true,
        clock: true,
        evaluation: true,
        moveList: true,
        capturedPieces: true,
        lastMove: true,
        streamInfo: true,
        chat: false,
        webcam: false,
        logo: true
      },
      
      // Positions des widgets (% de l'écran)
      widgetPositions: {
        playerInfo: { x: 2, y: 2, width: 25, height: 15 },
        clock: { x: 73, y: 2, width: 25, height: 12 },
        evaluation: { x: 2, y: 85, width: 25, height: 13 },
        moveList: { x: 73, y: 15, width: 25, height: 45 },
        capturedPieces: { x: 73, y: 62, width: 25, height: 10 },
        lastMove: { x: 2, y: 75, width: 25, height: 8 },
        streamInfo: { x: 2, y: 20, width: 25, height: 10 },
        webcam: { x: 75, y: 75, width: 23, height: 23 },
        logo: { x: 45, y: 2, width: 10, height: 8 }
      },
      
      // Style des widgets
      widgetStyles: {
        backgroundColor: 'rgba(26, 29, 46, 0.95)',
        borderColor: '#4a9eff',
        borderWidth: 2,
        borderRadius: 12,
        fontSize: 14,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: 12
      },
      
      // Options d'affichage du plateau
      boardDisplay: {
        showCoordinates: true,
        showLastMove: true,
        showLegalMoves: true,
        highlightCheck: true,
        pieceStyle: 'classic', // classic, wikipedia, alpha
        boardTheme: 'green', // green, blue, brown, gray
        showEvalBar: true,
        showBestMove: false
      },
      
      // Informations du streamer
      streamerInfo: {
        name: '',
        title: '',
        social: {
          twitch: '',
          youtube: '',
          twitter: ''
        }
      }
    };
  }
  
  init() {
    // Charger la config sauvegardée
    this.loadConfig();
    
    // Créer le container overlay
    this.createOverlayContainer();
    
    // Initialiser les widgets
    this.initializeWidgets();
    this.bindUi();
    
    console.log('🎨 Stream Overlay System initialisé');
  }

  bindUi() {
    const on = (id, event, handler) => {
      const node = document.getElementById(id);
      if (node) node.addEventListener(event, handler);
    };

    on('btnStreamConfig', 'click', () => this.openConfigPanel());
    on('btnDiscordStreamConfig', 'click', () => this.openConfigPanel());
    on('btnStreamEdit', 'click', () => this.enableEditMode());
    on('btnCloseStreamConfig', 'click', () => this.closeConfigPanel());
    on('btnPreviewStream', 'click', () => this.showOverlay());
    on('btnExportStreamConfig', 'click', () => this.exportConfig());
    on('btnApplyStreamConfig', 'click', () => {
      this.applyConfig(this.overlayConfig);
      this.closeConfigPanel();
    });
    on('btnResetStreamConfig', 'click', () => {
      if (confirm('Réinitialiser la configuration ?')) this.resetConfig();
    });
    on('importConfig', 'change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) this.importConfig(file);
      e.target.value = '';
    });

    document.querySelectorAll('.layout-preset-btn[data-layout]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.layout-preset-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.applyLayout(btn.dataset.layout);
      });
    });
  }
  
  createOverlayContainer() {
    let container = document.getElementById('streamOverlay');
    
    if (!container) {
      container = document.createElement('div');
      container.id = 'streamOverlay';
      container.className = 'stream-overlay-container';
      document.body.appendChild(container);
    }
    
    this.container = container;
  }
  
  // === WIDGETS ===
  
  initializeWidgets() {
    // Widget Info Joueurs
    this.registerWidget('playerInfo', {
      title: '👥 Joueurs',
      render: () => this.renderPlayerInfo(),
      update: (data) => this.updatePlayerInfo(data)
    });
    
    // Widget Horloge
    this.registerWidget('clock', {
      title: '⏱️ Horloges',
      render: () => this.renderClock(),
      update: (data) => this.updateClock(data)
    });
    
    // Widget Évaluation
    this.registerWidget('evaluation', {
      title: '📊 Évaluation',
      render: () => this.renderEvaluation(),
      update: (data) => this.updateEvaluation(data)
    });
    
    // Widget Liste de coups
    this.registerWidget('moveList', {
      title: '📝 Coups',
      render: () => this.renderMoveList(),
      update: (data) => this.updateMoveList(data)
    });
    
    // Widget Pièces capturées
    this.registerWidget('capturedPieces', {
      title: '💀 Captures',
      render: () => this.renderCapturedPieces(),
      update: (data) => this.updateCapturedPieces(data)
    });
    
    // Widget Dernier coup
    this.registerWidget('lastMove', {
      title: '🎯 Dernier coup',
      render: () => this.renderLastMove(),
      update: (data) => this.updateLastMove(data)
    });
    
    // Widget Info Stream
    this.registerWidget('streamInfo', {
      title: '📺 Stream Info',
      render: () => this.renderStreamInfo(),
      update: (data) => this.updateStreamInfo(data)
    });
    
    // Widget Webcam (placeholder)
    this.registerWidget('webcam', {
      title: '📷 Webcam',
      render: () => this.renderWebcam(),
      update: (data) => {}
    });
    
    // Widget Logo
    this.registerWidget('logo', {
      title: '🎮 Logo',
      render: () => this.renderLogo(),
      update: (data) => {}
    });
    
    // Widget Chat Discord
    this.registerWidget('chat', {
      title: '💬 Chat',
      render: () => this.renderChat(),
      update: (data) => this.updateChat(data)
    });
  }
  
  registerWidget(id, widget) {
    this.widgets.set(id, widget);
  }
  
  // === RENDER WIDGETS ===
  
  renderPlayerInfo() {
    return `
      <div class="widget-content">
        <div class="player-row">
          <div class="player-avatar">⚫</div>
          <div class="player-details">
            <div class="player-name" id="player1Name">Joueur Noir</div>
            <div class="player-rating" id="player1Rating">2000</div>
          </div>
        </div>
        <div class="player-row">
          <div class="player-avatar">⚪</div>
          <div class="player-details">
            <div class="player-name" id="player2Name">Joueur Blanc</div>
            <div class="player-rating" id="player2Rating">2000</div>
          </div>
        </div>
      </div>
    `;
  }
  
  renderClock() {
    return `
      <div class="widget-content clock-widget">
        <div class="clock-display" id="overlayClockBlack">
          <span class="clock-label">⚫ Noir</span>
          <span class="clock-time">5:00</span>
        </div>
        <div class="clock-display" id="overlayClockWhite">
          <span class="clock-label">⚪ Blanc</span>
          <span class="clock-time">5:00</span>
        </div>
      </div>
    `;
  }
  
  renderEvaluation() {
    return `
      <div class="widget-content eval-widget">
        <div class="eval-bar-container">
          <div class="eval-bar-fill" id="evalBarFill" style="height: 50%;"></div>
        </div>
        <div class="eval-details">
          <div class="eval-score" id="evalScore">0.0</div>
          <div class="eval-depth" id="evalDepth">Profondeur: -</div>
          <div class="eval-best-move" id="evalBestMove">Meilleur: -</div>
        </div>
      </div>
    `;
  }
  
  renderMoveList() {
    return `
      <div class="widget-content move-list-widget">
        <div class="move-list-scroll" id="moveListContent">
          <div class="move-item">1. e4 e5</div>
          <div class="move-item">2. Nf3 Nc6</div>
          <div class="move-item current">3. Bb5 a6</div>
        </div>
      </div>
    `;
  }
  
  renderCapturedPieces() {
    return `
      <div class="widget-content captured-widget">
        <div class="captured-row">
          <span>⚪:</span>
          <div class="captured-pieces" id="capturedWhite"></div>
          <span class="material-diff" id="materialWhite">+0</span>
        </div>
        <div class="captured-row">
          <span>⚫:</span>
          <div class="captured-pieces" id="capturedBlack"></div>
          <span class="material-diff" id="materialBlack">+0</span>
        </div>
      </div>
    `;
  }
  
  renderLastMove() {
    return `
      <div class="widget-content last-move-widget">
        <div class="last-move-text" id="lastMoveText">En attente du premier coup...</div>
      </div>
    `;
  }
  
  renderStreamInfo() {
    return `
      <div class="widget-content stream-info-widget">
        <div class="stream-title" id="streamTitle">🔴 LIVE</div>
        <div class="stream-viewers" id="streamViewers">👁️ 0 spectateurs</div>
        <div class="stream-duration" id="streamDuration">⏱️ 00:00</div>
      </div>
    `;
  }
  
  renderWebcam() {
    return `
      <div class="widget-content webcam-widget">
        <video id="webcamVideo" autoplay muted></video>
        <div class="webcam-placeholder">
          <div style="font-size: 48px;">📷</div>
          <div>Webcam</div>
        </div>
      </div>
    `;
  }
  
  renderLogo() {
    return `
      <div class="widget-content logo-widget">
        <div class="logo-text">Social Board</div>
        <div class="logo-subtitle">Échecs & Go</div>
      </div>
    `;
  }
  
  renderChat() {
    return `
      <div class="widget-content chat-widget">
        <div class="chat-messages" id="chatMessages">
          <div class="chat-message">
            <strong>Joueur1:</strong> Bonne partie !
          </div>
          <div class="chat-message">
            <strong>Spectateur:</strong> GG !
          </div>
        </div>
        <input type="text" class="chat-input" placeholder="Envoyer un message..." />
      </div>
    `;
  }
  
  // === LAYOUTS PRÉDÉFINIS ===
  
  applyLayout(layoutName) {
    this.currentLayout = layoutName;
    
    const layouts = {
      // Layout par défaut : équilibré
      'default': {
        enabledWidgets: {
          playerInfo: true,
          clock: true,
          evaluation: true,
          moveList: true,
          capturedPieces: true,
          lastMove: true,
          streamInfo: true,
          chat: false,
          webcam: false,
          logo: true
        }
      },
      
      // Layout minimal : juste le jeu
      'minimal': {
        enabledWidgets: {
          playerInfo: true,
          clock: true,
          evaluation: false,
          moveList: false,
          capturedPieces: false,
          lastMove: false,
          streamInfo: true,
          chat: false,
          webcam: false,
          logo: false
        }
      },
      
      // Layout commentateur : avec webcam
      'commentator': {
        enabledWidgets: {
          playerInfo: true,
          clock: true,
          evaluation: true,
          moveList: true,
          capturedPieces: true,
          lastMove: true,
          streamInfo: true,
          chat: false,
          webcam: true,
          logo: true
        },
        widgetPositions: {
          webcam: { x: 2, y: 65, width: 25, height: 33 }
        }
      },
      
      // Layout tournoi : focus sur les infos
      'tournament': {
        enabledWidgets: {
          playerInfo: true,
          clock: true,
          evaluation: true,
          moveList: true,
          capturedPieces: true,
          lastMove: true,
          streamInfo: true,
          chat: false,
          webcam: false,
          logo: true
        },
        widgetStyles: {
          backgroundColor: 'rgba(16, 33, 62, 0.98)',
          borderColor: '#FFD700',
          borderWidth: 3
        }
      },
      
      // Layout analyse : focus évaluation
      'analysis': {
        enabledWidgets: {
          playerInfo: true,
          clock: true,
          evaluation: true,
          moveList: true,
          capturedPieces: false,
          lastMove: true,
          streamInfo: false,
          chat: false,
          webcam: false,
          logo: false
        },
        widgetPositions: {
          evaluation: { x: 2, y: 20, width: 25, height: 40 },
          moveList: { x: 73, y: 15, width: 25, height: 60 }
        }
      },
      
      // Layout stream complet : tout affiché
      'complete': {
        enabledWidgets: {
          playerInfo: true,
          clock: true,
          evaluation: true,
          moveList: true,
          capturedPieces: true,
          lastMove: true,
          streamInfo: true,
          chat: true,
          webcam: true,
          logo: true
        },
        widgetPositions: {
          chat: { x: 73, y: 75, width: 25, height: 23 },
          webcam: { x: 2, y: 65, width: 20, height: 33 }
        }
      }
    };
    
    if (layouts[layoutName]) {
      Object.assign(this.overlayConfig, layouts[layoutName]);
      this.refreshOverlay();
      console.log(`✅ Layout "${layoutName}" appliqué`);
    }
  }
  
  // === AFFICHAGE ===
  
  showOverlay() {
    this.container.style.display = 'block';
    this.refreshOverlay();
  }
  
  hideOverlay() {
    this.container.style.display = 'none';
  }
  
  refreshOverlay() {
    this.container.innerHTML = '';
    
    // Créer chaque widget activé
    for (const [id, widget] of this.widgets) {
      if (this.overlayConfig.enabledWidgets[id]) {
        this.createWidgetElement(id, widget);
      }
    }
  }
  
  createWidgetElement(id, widget) {
    const pos = this.overlayConfig.widgetPositions[id];
    const style = this.overlayConfig.widgetStyles;
    
    const el = document.createElement('div');
    el.id = `widget-${id}`;
    el.className = 'stream-widget';
    el.dataset.widgetId = id;
    
    // Position et taille
    el.style.position = 'absolute';
    el.style.left = `${pos.x}%`;
    el.style.top = `${pos.y}%`;
    el.style.width = `${pos.width}%`;
    el.style.height = `${pos.height}%`;
    
    // Style
    el.style.backgroundColor = style.backgroundColor;
    el.style.border = `${style.borderWidth}px solid ${style.borderColor}`;
    el.style.borderRadius = `${style.borderRadius}px`;
    el.style.padding = `${style.padding}px`;
    el.style.fontSize = `${style.fontSize}px`;
    el.style.fontFamily = style.fontFamily;
    
    // Header du widget
    const header = document.createElement('div');
    header.className = 'widget-header';
    const title = document.createElement('span');
    title.className = 'widget-title';
    title.textContent = widget.title;
    header.appendChild(title);
    if (this.editMode) {
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'widget-close';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', () => this.removeWidget(id));
      header.appendChild(closeBtn);
    }
    el.appendChild(header);
    
    // Contenu du widget
    const content = document.createElement('div');
    content.className = 'widget-body';
    content.innerHTML = widget.render();
    el.appendChild(content);
    
    // Drag & drop en mode édition
    if (this.editMode) {
      this.makeWidgetDraggable(el);
    }
    
    this.container.appendChild(el);
  }
  
  // === MODE ÉDITION ===
  
  enableEditMode() {
    this.editMode = true;
    this.showOverlay();
    
    // Afficher la grille
    this.container.classList.add('edit-mode');
    
    // Rendre les widgets draggables
    document.querySelectorAll('.stream-widget').forEach(widget => {
      this.makeWidgetDraggable(widget);
    });
    
    console.log('✏️ Mode édition activé');
  }
  
  disableEditMode() {
    this.editMode = false;
    this.container.classList.remove('edit-mode');
    
    // Sauvegarder la config
    this.saveConfig();
    
    console.log('💾 Mode édition désactivé - Config sauvegardée');
  }
  
  makeWidgetDraggable(element) {
    element.style.cursor = 'move';
    
    element.addEventListener('mousedown', (e) => {
      if (!this.editMode) return;
      if (e.target.classList.contains('widget-close')) return;
      
      this.isDragging = true;
      this.dragTarget = element;
      
      const rect = element.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      
      this.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      
      element.classList.add('dragging');
    });
    
    // Resize handles
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'widget-resize-handle';
    resizeHandle.innerHTML = '⋰';
    element.appendChild(resizeHandle);
    
    resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.startResize(element, e);
    });
  }
  
  startResize(element, e) {
    this.isResizing = true;
    this.resizeTarget = element;
    
    const rect = element.getBoundingClientRect();
    this.resizeStart = {
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height
    };
    
    element.classList.add('resizing');
  }
  
  // === CONFIGURATION ===
  
  openConfigPanel() {
    const panel = document.getElementById('streamConfigPanel');
    if (panel) {
      panel.style.display = 'flex';
      this.populateConfigPanel();
    }
  }
  
  closeConfigPanel() {
    const panel = document.getElementById('streamConfigPanel');
    if (panel) {
      panel.style.display = 'none';
    }
  }
  
  populateConfigPanel() {
    // Remplir les options de configuration
    const layoutSelect = document.getElementById('layoutSelect');
    if (layoutSelect) {
      layoutSelect.value = this.currentLayout;
    }
    
    // Widgets activés
    for (const [id, enabled] of Object.entries(this.overlayConfig.enabledWidgets)) {
      const checkbox = document.getElementById(`widget-${id}-enabled`);
      if (checkbox) {
        checkbox.checked = enabled;
      }
    }
    
    // Options d'affichage du plateau
    for (const [key, value] of Object.entries(this.overlayConfig.boardDisplay)) {
      const input = document.getElementById(`board-${key}`);
      if (input) {
        if (input.type === 'checkbox') {
          input.checked = value;
        } else {
          input.value = value;
        }
      }
    }
  }
  
  applyConfig(config) {
    Object.assign(this.overlayConfig, config);
    this.refreshOverlay();
    this.saveConfig();
  }
  
  // === STORAGE ===
  
  saveConfig() {
    try {
      localStorage.setItem('streamOverlayConfig', JSON.stringify(this.overlayConfig));
      console.log('💾 Configuration sauvegardée');
    } catch (e) {
      console.error('❌ Erreur sauvegarde config:', e);
    }
  }
  
  loadConfig() {
    try {
      const saved = localStorage.getItem('streamOverlayConfig');
      if (saved) {
        const parsed = window.SecurityManager
          ? SecurityManager.safeJsonParse(saved, null)
          : JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          this.mergeConfig(parsed);
        }
        console.log('✅ Configuration chargée');
      }
    } catch (e) {
      console.error('❌ Erreur chargement config:', e);
    }
  }

  mergeConfig(incoming) {
    const defaults = this.getDefaultConfig();
    if (typeof incoming.layout === 'string') {
      this.overlayConfig.layout = incoming.layout.slice(0, 40);
    }
    if (incoming.enabledWidgets && typeof incoming.enabledWidgets === 'object') {
      for (const key of Object.keys(defaults.enabledWidgets)) {
        if (typeof incoming.enabledWidgets[key] === 'boolean') {
          this.overlayConfig.enabledWidgets[key] = incoming.enabledWidgets[key];
        }
      }
    }
    if (incoming.widgetPositions && typeof incoming.widgetPositions === 'object') {
      for (const key of Object.keys(defaults.widgetPositions)) {
        const pos = incoming.widgetPositions[key];
        if (!pos || typeof pos !== 'object') continue;
        const clamp = (n, d) => {
          const v = Number(n);
          return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : d;
        };
        const d = defaults.widgetPositions[key];
        this.overlayConfig.widgetPositions[key] = {
          x: clamp(pos.x, d.x),
          y: clamp(pos.y, d.y),
          width: clamp(pos.width, d.width),
          height: clamp(pos.height, d.height)
        };
      }
    }
    if (incoming.streamerInfo && typeof incoming.streamerInfo === 'object') {
      const SM = window.SecurityManager;
      const cut = (s, n) => SM ? SM.sanitizeInput(String(s || ''), n) : String(s || '').slice(0, n);
      this.overlayConfig.streamerInfo.name = cut(incoming.streamerInfo.name, 40);
      this.overlayConfig.streamerInfo.title = cut(incoming.streamerInfo.title, 80);
    }
  }
  
  resetConfig() {
    this.overlayConfig = this.getDefaultConfig();
    this.saveConfig();
    this.refreshOverlay();
    console.log('🔄 Configuration réinitialisée');
  }
  
  // === EXPORT / IMPORT ===
  
  exportConfig() {
    const json = JSON.stringify(this.overlayConfig, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `stream-overlay-config-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    
    console.log('📥 Configuration exportée');
  }
  
  importConfig(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const config = window.SecurityManager
          ? SecurityManager.safeJsonParse(e.target.result, null)
          : JSON.parse(e.target.result);
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
          throw new Error('Invalid config');
        }
        this.overlayConfig = this.getDefaultConfig();
        this.mergeConfig(config);
        this.saveConfig();
        this.refreshOverlay();
        console.log('📤 Configuration importée');
      } catch (err) {
        console.error('❌ Erreur import config:', err);
        alert('Erreur lors de l\'import de la configuration');
      }
    };
    
    reader.readAsText(file);
  }
}

// Instance globale
window.streamOverlay = new StreamOverlay();

// Écouter les events de drag
document.addEventListener('mousemove', (e) => {
  if (window.streamOverlay.isDragging && window.streamOverlay.dragTarget) {
    const containerRect = window.streamOverlay.container.getBoundingClientRect();
    
    let x = ((e.clientX - window.streamOverlay.dragOffset.x) / containerRect.width) * 100;
    let y = ((e.clientY - window.streamOverlay.dragOffset.y) / containerRect.height) * 100;
    
    // Limites
    x = Math.max(0, Math.min(95, x));
    y = Math.max(0, Math.min(95, y));
    
    window.streamOverlay.dragTarget.style.left = `${x}%`;
    window.streamOverlay.dragTarget.style.top = `${y}%`;
  }
  
  if (window.streamOverlay.isResizing && window.streamOverlay.resizeTarget) {
    const containerRect = window.streamOverlay.container.getBoundingClientRect();
    const dx = e.clientX - window.streamOverlay.resizeStart.x;
    const dy = e.clientY - window.streamOverlay.resizeStart.y;
    
    let newWidth = ((window.streamOverlay.resizeStart.width + dx) / containerRect.width) * 100;
    let newHeight = ((window.streamOverlay.resizeStart.height + dy) / containerRect.height) * 100;
    
    // Limites min/max
    newWidth = Math.max(10, Math.min(50, newWidth));
    newHeight = Math.max(10, Math.min(50, newHeight));
    
    window.streamOverlay.resizeTarget.style.width = `${newWidth}%`;
    window.streamOverlay.resizeTarget.style.height = `${newHeight}%`;
  }
});

document.addEventListener('mouseup', () => {
  if (window.streamOverlay.isDragging) {
    window.streamOverlay.isDragging = false;
    if (window.streamOverlay.dragTarget) {
      window.streamOverlay.dragTarget.classList.remove('dragging');
      
      // Sauvegarder la nouvelle position
      const widgetId = window.streamOverlay.dragTarget.dataset.widgetId;
      const left = parseFloat(window.streamOverlay.dragTarget.style.left);
      const top = parseFloat(window.streamOverlay.dragTarget.style.top);
      
      window.streamOverlay.overlayConfig.widgetPositions[widgetId].x = left;
      window.streamOverlay.overlayConfig.widgetPositions[widgetId].y = top;
      
      window.streamOverlay.dragTarget = null;
    }
  }
  
  if (window.streamOverlay.isResizing) {
    window.streamOverlay.isResizing = false;
    if (window.streamOverlay.resizeTarget) {
      window.streamOverlay.resizeTarget.classList.remove('resizing');
      
      // Sauvegarder la nouvelle taille
      const widgetId = window.streamOverlay.resizeTarget.dataset.widgetId;
      const width = parseFloat(window.streamOverlay.resizeTarget.style.width);
      const height = parseFloat(window.streamOverlay.resizeTarget.style.height);
      
      window.streamOverlay.overlayConfig.widgetPositions[widgetId].width = width;
      window.streamOverlay.overlayConfig.widgetPositions[widgetId].height = height;
      
      window.streamOverlay.resizeTarget = null;
    }
  }
});

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StreamOverlay;
}
