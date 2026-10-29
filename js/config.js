// Configuration des plateformes — surchargeable via /api/config, meta tags, ou query.
(function (global) {
  const DEFAULT_ICE = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
  ];

  const CONFIG = {
    version: "1.1.0",
    api: false,
    discord: {
      clientId: "",
      redirectUri: typeof location !== "undefined" ? location.origin : ""
    },
    telegram: {
      botName: "",
      appName: ""
    },
    facebook: {
      appId: ""
    },
    peerjs: {
      host: "0.peerjs.com",
      port: 443,
      path: "/",
      secure: true,
      debug: 0
    },
    iceServers: DEFAULT_ICE.slice(),
    shareImage: "images/share.png",
    katagoUrl: "",
    ready: null
  };

  function meta(name) {
    const el =
      document.querySelector(`meta[name="sb:${name}"]`) ||
      document.querySelector(`meta[property="sb:${name}"]`);
    return el ? String(el.getAttribute("content") || "").trim() : "";
  }

  function applyMeta() {
    const discordId = meta("discord-client-id");
    const telegramBot = meta("telegram-bot");
    const telegramApp = meta("telegram-app");
    const facebookId = meta("facebook-app-id");
    if (discordId) CONFIG.discord.clientId = discordId;
    if (telegramBot) CONFIG.telegram.botName = telegramBot;
    if (telegramApp) CONFIG.telegram.appName = telegramApp;
    if (facebookId) CONFIG.facebook.appId = facebookId;
  }

  function applyQuery() {
    try {
      const params = new URLSearchParams(location.search);
      if (params.get("discordClientId")) CONFIG.discord.clientId = params.get("discordClientId");
      if (params.get("tgBot")) CONFIG.telegram.botName = params.get("tgBot");
    } catch (_) { /* ignore */ }
  }

  function mergeRemote(remote) {
    if (!remote || typeof remote !== "object") return;
    CONFIG.api = !!remote.api;
    if (remote.discord) {
      CONFIG.discord.clientId = remote.discord.clientId || CONFIG.discord.clientId;
      CONFIG.discord.redirectUri = remote.discord.redirectUri || CONFIG.discord.redirectUri || location.origin;
    }
    if (remote.telegram) {
      CONFIG.telegram.botName = remote.telegram.botName || CONFIG.telegram.botName;
      CONFIG.telegram.appName = remote.telegram.appName || CONFIG.telegram.appName;
    }
    if (remote.facebook) {
      CONFIG.facebook.appId = remote.facebook.appId || CONFIG.facebook.appId;
    }
    if (remote.peerjs) {
      Object.assign(CONFIG.peerjs, remote.peerjs);
    }
    if (Array.isArray(remote.iceServers) && remote.iceServers.length) {
      CONFIG.iceServers = remote.iceServers;
    }
    if (remote.shareImage) CONFIG.shareImage = remote.shareImage;
    if (remote.version) CONFIG.version = remote.version;
    if (remote.katagoUrl) CONFIG.katagoUrl = remote.katagoUrl;
  }

  function peerOptions() {
    const p = CONFIG.peerjs || {};
    return {
      host: p.host,
      port: p.port,
      path: p.path,
      secure: p.secure !== false,
      debug: p.debug || 0,
      config: {
        iceServers: CONFIG.iceServers && CONFIG.iceServers.length
          ? CONFIG.iceServers
          : DEFAULT_ICE
      }
    };
  }

  function shareImageUrl() {
    try {
      return new URL(CONFIG.shareImage || "images/share.png", document.baseURI || location.href).href;
    } catch (_) {
      return location.origin + "/images/share.png";
    }
  }

  function platformReady(name) {
    if (name === "discord") return !!CONFIG.discord.clientId;
    if (name === "telegram") return !!(CONFIG.telegram.botName && CONFIG.telegram.appName);
    if (name === "facebook") return !!CONFIG.facebook.appId;
    return false;
  }

  async function loadRemoteConfig() {
    applyMeta();
    applyQuery();
    try {
      const res = await fetch(new URL("/api/config", location.origin).href, {
        credentials: "omit",
        cache: "no-store"
      });
      if (res.ok) {
        mergeRemote(await res.json());
      }
    } catch (_) {
      CONFIG.api = false;
    }
    document.dispatchEvent(new CustomEvent("sb:config", { detail: CONFIG }));
    return CONFIG;
  }

  CONFIG.peerOptions = peerOptions;
  CONFIG.shareImageUrl = shareImageUrl;
  CONFIG.platformReady = platformReady;
  CONFIG.load = loadRemoteConfig;
  CONFIG.ready = loadRemoteConfig();

  global.CONFIG = CONFIG;
})(window);
