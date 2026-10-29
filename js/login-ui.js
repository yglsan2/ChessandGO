// Branche l'UI de connexion (manquante auparavant dans app.js)
(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function show(el, on) {
    if (!el) return;
    el.style.display = on ? (el.classList.contains("modal") ? "flex" : "block") : "none";
  }

  function waitAuth() {
    return new Promise((resolve) => {
      if (window.AuthSystem || window.authInstance) return resolve();
      const t = setInterval(() => {
        if (window.AuthSystem) {
          clearInterval(t);
          resolve();
        }
      }, 30);
      setTimeout(() => {
        clearInterval(t);
        resolve();
      }, 5000);
    });
  }

  function getAuth() {
    if (window.authInstance) return window.authInstance;
    if (window.AuthSystem) {
      window.authInstance = new window.AuthSystem();
      return window.authInstance;
    }
    return null;
  }

  function updateUserChrome(auth) {
    const user = auth && auth.getUser && auth.getUser();
    const display = $("userDisplay");
    const loginBtn = $("btnLogin");
    const nameEl = $("userName");
    const avatarEl = $("userAvatar");
    if (!display || !loginBtn) return;

    if (user) {
      display.style.display = "flex";
      loginBtn.style.display = "none";
      if (nameEl) nameEl.textContent = user.username;
      if (avatarEl) {
        avatarEl.textContent = (user.avatar && user.avatar.initial) || user.username.charAt(0);
        avatarEl.style.background = (user.avatar && user.avatar.color) || "#4ECDC4";
      }
    } else {
      display.style.display = "none";
      loginBtn.style.display = "";
    }
  }

  function setSocialAvailability() {
    const cfg = window.CONFIG || {};
    const note = document.querySelector("#loginSocial .login-social-note");
    const map = {
      btnLoginFacebook: "facebook",
      btnLoginDiscord: "discord",
      btnLoginTelegram: "telegram"
    };
    Object.entries(map).forEach(([id, platform]) => {
      const btn = $(id);
      if (!btn) return;
      const ready = cfg.platformReady ? cfg.platformReady(platform) : false;
      const embedded =
        (platform === "discord" && window.DiscordSDK) ||
        (platform === "telegram" && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe?.user) ||
        (platform === "facebook" && (window.FBInstant || window.FB));
      btn.disabled = !(ready || embedded);
      btn.title = btn.disabled
        ? "Configurez " + platform + " dans .env / meta sb:* ou ouvrez l'app depuis la plateforme"
        : "Connexion " + platform;
    });
    if (note) {
      const any =
        (cfg.platformReady && (cfg.platformReady("discord") || cfg.platformReady("telegram") || cfg.platformReady("facebook"))) ||
        !!(window.Telegram?.WebApp || window.DiscordSDK || window.FBInstant);
      note.textContent = any
        ? "Les boutons actifs utilisent l’identité fournie par la plateforme ou la config serveur."
        : "Mode invité recommandé ici. Pour Facebook / Discord / Telegram, renseignez .env puis relancez le serveur, ou ouvrez l’app depuis la plateforme.";
    }
  }

  function wireTabs() {
    document.querySelectorAll(".login-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".login-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const name = tab.getAttribute("data-tab");
        show($("loginUsername"), name === "username");
        show($("loginEmail"), name === "email");
        show($("loginSocial"), name === "social");
        if (name === "username") $("loginUsername").style.display = "block";
        if (name === "email") $("loginEmail").style.display = "block";
        if (name === "social") $("loginSocial").style.display = "block";
      });
    });
  }

  function emitLogin(user) {
    window.dispatchEvent(new CustomEvent("userLogin", { detail: user }));
  }

  async function init() {
    await waitAuth();
    if (window.CONFIG && window.CONFIG.ready) {
      try { await window.CONFIG.ready; } catch (_) { /* ignore */ }
    }
    const auth = getAuth();
    if (!auth) return;

    // Exposer pour app.js si besoin
    window.authInstance = auth;
    updateUserChrome(auth);
    setSocialAvailability();
    wireTabs();

    const openLogin = () => {
      const modal = $("loginModal");
      if (modal) modal.style.display = "flex";
      setSocialAvailability();
    };
    const closeLogin = () => {
      const modal = $("loginModal");
      if (modal) modal.style.display = "none";
    };

    const btnLogin = $("btnLogin");
    if (btnLogin) btnLogin.addEventListener("click", openLogin);
    const btnClose = $("btnCloseLogin");
    if (btnClose) btnClose.addEventListener("click", closeLogin);

    const btnLogout = $("btnLogout");
    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        auth.logout();
        updateUserChrome(auth);
        window.dispatchEvent(new CustomEvent("userLogout"));
      });
    }

    const btnUser = $("btnLoginUsername");
    if (btnUser) {
      btnUser.addEventListener("click", () => {
        const name = ($("inputUsername") && $("inputUsername").value) || "";
        const result = auth.login(name);
        if (!result.success) {
          alert(result.error || "Connexion impossible");
          return;
        }
        updateUserChrome(auth);
        emitLogin(result.user);
        closeLogin();
      });
    }

    const btnEmail = $("btnLoginEmail");
    if (btnEmail) {
      btnEmail.addEventListener("click", async () => {
        const email = ($("inputEmail") && $("inputEmail").value) || "";
        const result = await auth.requestEmailLogin(email);
        if (!result.success) {
          alert(result.error || "Email non disponible");
          return;
        }
        alert(result.message || "Vérifiez votre boîte mail (fonctionnalité à activer côté serveur).");
      });
    }

    async function tryPlatformLogin(platform) {
      const cfg = window.CONFIG || {};
      if (platform === "telegram" && window.Telegram?.WebApp?.initDataUnsafe?.user) {
        const u = window.Telegram.WebApp.initDataUnsafe.user;
        const result = auth.loginSocial("telegram", String(u.id), u.username || u.first_name || "joueur");
        if (result.success) {
          updateUserChrome(auth);
          emitLogin(result.user);
          closeLogin();
          return;
        }
      }
      if (platform === "discord" && window.discordIntegration?.discordSDK) {
        try {
          const { user } = await window.discordIntegration.discordSDK.commands.authenticate({});
          if (user) {
            const result = auth.loginSocial("discord", String(user.id), user.username || "joueur");
            if (result.success) {
              updateUserChrome(auth);
              emitLogin(result.user);
              closeLogin();
              return;
            }
          }
        } catch (err) {
          console.warn(err);
        }
      }
      if (platform === "facebook" && window.FBInstant) {
        try {
          const player = await FBInstant.player.getID();
          const name = FBInstant.player.getName() || "joueur";
          const result = auth.loginSocial("facebook", String(player), name);
          if (result.success) {
            updateUserChrome(auth);
            emitLogin(result.user);
            closeLogin();
            return;
          }
        } catch (err) {
          console.warn(err);
        }
      }

      const ready = cfg.platformReady && cfg.platformReady(platform);
      alert(
        ready
          ? "Ouvrez Social Board depuis " + platform + " (Activity / Mini App / Instant Game) pour récupérer votre identité."
          : "Plateforme non configurée. Ajoutez les clés dans .env (voir .env.example) ou jouez en mode pseudo."
      );
    }

    ["Facebook", "Discord", "Telegram"].forEach((label) => {
      const btn = $("btnLogin" + label);
      if (btn) btn.addEventListener("click", () => tryPlatformLogin(label.toLowerCase()));
    });

    document.addEventListener("sb:config", setSocialAvailability);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
