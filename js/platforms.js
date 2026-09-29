// Intégration plateformes sociales
class Platforms {
  constructor() {
    this.name = this.detectPlatform();
    this.initialized = false;
    this.errors = [];
  }

  detectPlatform() {
    const userAgent = navigator.userAgent.toLowerCase();
    const url = window.location.href.toLowerCase();
    const referrer = document.referrer.toLowerCase();
    
    // Détection Telegram Web App (prioritaire)
    if (window.Telegram?.WebApp) {
      console.log('✓ Plateforme détectée: Telegram Web App');
      return 'telegram';
    }
    
    // Détection Facebook/Messenger
    if (window.FBInstant || window.FB || 
        referrer.includes('facebook.com') || 
        referrer.includes('messenger.com') ||
        userAgent.includes('fban') || 
        userAgent.includes('fbav')) {
      console.log('✓ Plateforme détectée: Facebook/Messenger');
      return 'facebook';
    }
    
    // Détection Discord (Embedded Activity)
    if (window.DiscordSDK || 
        url.includes('discord.com') ||
        referrer.includes('discord.com')) {
      console.log('✓ Plateforme détectée: Discord');
      return 'discord';
    }
    
    // Détection Reddit
    if (referrer.includes('reddit.com') || url.includes('reddit.com')) {
      console.log('✓ Plateforme détectée: Reddit');
      return 'reddit';
    }
    
    // Détection WhatsApp Web
    if (userAgent.includes('whatsapp')) {
      console.log('✓ Plateforme détectée: WhatsApp');
      return 'whatsapp';
    }
    
    console.log('✓ Plateforme détectée: Web standard');
    return 'web';
  }

  label() {
    const labels = {
      facebook: 'Facebook/Messenger',
      discord: 'Discord',
      telegram: 'Telegram',
      reddit: 'Reddit',
      whatsapp: 'WhatsApp',
      web: 'Web'
    };
    return labels[this.name] || 'Web';
  }

  // Vérifier la compatibilité
  checkCompatibility() {
    const checks = {
      canvas: !!document.createElement('canvas').getContext,
      localStorage: this.testLocalStorage(),
      webAudio: !!(window.AudioContext || window.webkitAudioContext),
      peerJS: typeof Peer !== 'undefined',
      svg: !!document.createElementNS
    };
    
    const incompatible = Object.entries(checks)
      .filter(([key, value]) => !value)
      .map(([key]) => key);
    
    if (incompatible.length > 0) {
      console.warn('⚠️ Fonctionnalités non supportées:', incompatible);
      this.errors.push(`Fonctionnalités manquantes: ${incompatible.join(', ')}`);
    }
    
    return incompatible.length === 0;
  }

  testLocalStorage() {
    try {
      const test = '__test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Facebook/Messenger
  initFacebook() {
    console.log('🔧 Initialisation Facebook...');
    
    // Adapter l'interface pour Facebook
    this.adaptInterface('facebook');
    
    // Vérifier si FBInstant est disponible
    if (window.FBInstant) {
      window.FBInstant.initializeAsync()
        .then(() => {
          console.log('✓ Facebook Instant Games initialisé');
          this.initialized = true;
          
          // Démarrer le jeu
          return window.FBInstant.startGameAsync();
        })
        .then(() => {
          console.log('✓ Facebook Instant Games démarré');
        })
        .catch(err => {
          console.error('❌ Erreur Facebook Instant Games:', err);
          this.errors.push(`Facebook: ${err.message}`);
        });
    } else if (window.FB) {
      // FB SDK standard
      window.fbAsyncInit = () => {
        FB.init({
          version: 'v18.0',
          xfbml: true
        });
        console.log('✓ Facebook SDK initialisé');
        this.initialized = true;
      };
    } else {
      console.log('ℹ️ Facebook SDK non détecté, mode web standard');
      this.initialized = true;
    }
  }

  // Discord
  initDiscord() {
    console.log('🔧 Initialisation Discord...');
    
    this.adaptInterface('discord');
    
    if (window.DiscordSDK) {
      window.DiscordSDK.init({
        clientId: 'YOUR_DISCORD_CLIENT_ID', // À remplacer
        scope: ['activities.read', 'activities.write']
      })
        .then(() => {
          console.log('✓ Discord SDK initialisé');
          this.initialized = true;
        })
        .catch(err => {
          console.error('❌ Erreur Discord SDK:', err);
          this.errors.push(`Discord: ${err.message}`);
          this.initialized = true; // Continuer en mode dégradé
        });
    } else {
      console.log('ℹ️ Discord SDK non détecté, mode web standard');
      this.initialized = true;
    }
  }

  // Telegram
  initTelegram() {
    console.log('🔧 Initialisation Telegram...');
    
    this.adaptInterface('telegram');
    
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      
      try {
        // Initialiser l'app
        tg.ready();
        tg.expand();
        
        // Appliquer le thème Telegram
        const theme = tg.themeParams;
        const SM = window.SecurityManager;
        if (theme.bg_color && (!SM || SM.isSafeCssColor(theme.bg_color))) {
          document.body.style.backgroundColor = theme.bg_color;
        }
        if (theme.text_color && (!SM || SM.isSafeCssColor(theme.text_color))) {
          document.body.style.color = theme.text_color;
        }
        
        // Désactiver le swipe pour fermer
        tg.disableVerticalSwipes();
        
        // Bouton retour
        tg.BackButton.onClick(() => {
          tg.close();
        });
        
        console.log('✓ Telegram WebApp initialisé');
        console.log('  Version:', tg.version);
        console.log('  Plateforme:', tg.platform);
        
        this.initialized = true;
      } catch (err) {
        console.error('❌ Erreur Telegram WebApp:', err);
        this.errors.push(`Telegram: ${err.message}`);
      }
    } else {
      console.log('ℹ️ Telegram WebApp non détecté, mode web standard');
      this.initialized = true;
    }
  }

  // Reddit
  initReddit() {
    console.log('🔧 Initialisation Reddit...');
    this.adaptInterface('reddit');
    console.log('✓ Mode Reddit (pas de SDK spécifique)');
    this.initialized = true;
  }

  // WhatsApp
  initWhatsApp() {
    console.log('🔧 Initialisation WhatsApp...');
    this.adaptInterface('whatsapp');
    console.log('✓ Mode WhatsApp');
    this.initialized = true;
  }

  // Adapter l'interface selon la plateforme
  adaptInterface(platform) {
    const body = document.body;
    body.classList.add(`platform-${platform}`);
    
    // Meta tags pour chaque plateforme
    this.updateMetaTags(platform);
    
    // Ajustements CSS spécifiques
    const platformStyles = {
      facebook: { maxWidth: '100%', margin: '0' },
      discord: { maxWidth: '100vw', height: '100vh' },
      telegram: { background: 'var(--tg-theme-bg-color, #1a1d2e)' },
      reddit: { maxWidth: '800px', margin: '0 auto' },
      whatsapp: { maxWidth: '100%', fontSize: '14px' }
    };
    
    if (platformStyles[platform]) {
      Object.assign(body.style, platformStyles[platform]);
    }
  }

  // Mettre à jour les meta tags pour le partage
  updateMetaTags(platform) {
    const title = 'Social Board - Échecs & Go';
    const description = 'Jouez aux échecs et au Go avec vos amis sur tous les réseaux sociaux !';
    const image = window.location.origin + '/images/share.png'; // À créer
    
    const metaTags = {
      // Open Graph (Facebook, WhatsApp, etc.)
      'og:title': title,
      'og:description': description,
      'og:image': image,
      'og:type': 'website',
      'og:url': window.location.href,
      
      // Twitter
      'twitter:card': 'summary_large_image',
      'twitter:title': title,
      'twitter:description': description,
      'twitter:image': image
    };
    
    Object.entries(metaTags).forEach(([property, content]) => {
      let meta = document.querySelector(`meta[property="${property}"]`) ||
                 document.querySelector(`meta[name="${property}"]`);
      
      if (!meta) {
        meta = document.createElement('meta');
        if (property.startsWith('og:')) {
          meta.setAttribute('property', property);
        } else {
          meta.setAttribute('name', property);
        }
        document.head.appendChild(meta);
      }
      
      meta.setAttribute('content', content);
    });
  }

  // Initialisation principale
  init() {
    console.log(`🚀 Initialisation de la plateforme: ${this.label()}`);
    
    // Vérifier la compatibilité
    const compatible = this.checkCompatibility();
    if (!compatible) {
      console.warn('⚠️ Certaines fonctionnalités peuvent ne pas fonctionner');
    }
    
    // Initialiser selon la plateforme
    switch(this.name) {
      case 'facebook':
        this.initFacebook();
        break;
      case 'discord':
        this.initDiscord();
        break;
      case 'telegram':
        this.initTelegram();
        break;
      case 'reddit':
        this.initReddit();
        break;
      case 'whatsapp':
        this.initWhatsApp();
        break;
      default:
        this.initialized = true;
    }
    
    // Afficher les erreurs s'il y en a
    if (this.errors.length > 0) {
      console.error('❌ Erreurs d\'initialisation:', this.errors);
    }
  }

  // Partager le jeu sur la plateforme
  share(inviteLink, message) {
    console.log(`📤 Partage sur ${this.label()}: ${inviteLink}`);
    
    switch(this.name) {
      case 'facebook':
        return this.shareFacebook(inviteLink, message);
      case 'telegram':
        return this.shareTelegram(inviteLink, message);
      case 'discord':
        return this.shareDiscord(inviteLink, message);
      default:
        return this.shareGeneric(inviteLink, message);
    }
  }

  shareFacebook(link, message) {
    if (window.FBInstant) {
      return window.FBInstant.shareAsync({
        intent: 'INVITE',
        text: message,
        data: { url: link }
      });
    } else if (window.FB) {
      window.FB.ui({
        method: 'share',
        href: link
      });
    }
  }

  shareTelegram(link, message) {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`);
    }
  }

  shareDiscord(link, message) {
    // Discord n'a pas d'API de partage direct, copier dans le presse-papiers
    navigator.clipboard.writeText(`${message}\n${link}`).then(() => {
      alert('Lien copié ! Collez-le dans Discord.');
    });
  }

  shareGeneric(link, message) {
    if (navigator.share) {
      return navigator.share({
        title: 'Social Board',
        text: message,
        url: link
      });
    } else {
      // Fallback: copier dans le presse-papiers
      navigator.clipboard.writeText(link);
      alert('Lien copié dans le presse-papiers !');
    }
  }

  // Obtenir le status
  getStatus() {
    return {
      platform: this.name,
      label: this.label(),
      initialized: this.initialized,
      errors: this.errors,
      compatible: this.errors.length === 0
    };
  }
}

window.Platforms = Platforms;
