// Configuration des plateformes sociales
const CONFIG = {
  discord: {
    clientId: '', // À configurer dans le portail Discord
    redirectUri: window.location.origin
  },
  telegram: {
    botName: '', // Nom du bot Telegram
    appName: ''  // Nom de la Mini App
  },
  peerjs: {
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true
  }
};

window.CONFIG = CONFIG;
