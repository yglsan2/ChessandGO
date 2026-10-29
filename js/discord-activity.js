/**
 * Bootstrap Discord Activity — auth OAuth, matchmaking via instance_id, UI Discord.
 * Dépend de vendor/discord-embedded-app-sdk.js (global DiscordEmbeddedAppSdk).
 */
(function (global) {
  const SCOPES = ["identify", "guilds", "guilds.members.read"];

  class DiscordActivity {
    constructor() {
      this.sdk = null;
      this.ready = false;
      this.isDiscord = false;
      this.user = null;
      this.accessToken = null;
      this.channelId = null;
      this.guildId = null;
      this.instanceId = null;
      this.participants = [];
      this._readyPromise = null;
      this.onReady = null;
      this.onParticipants = null;
      this.onUser = null;
    }

    isMock() {
      try {
        return new URLSearchParams(global.location.search).get("mock") === "1";
      } catch (_) {
        return false;
      }
    }

    detect() {
      try {
        const p = new URLSearchParams(global.location.search);
        if (p.get("discord") === "1" || p.has("frame_id") || p.has("instance_id")) return true;
        if (p.get("mock") === "1") return true;
        if (global.location?.hostname?.endsWith("discordsays.com")) return true;
        if (global.parent !== global.window) {
          if (p.has("frame_id") || p.has("instance_id")) return true;
        }
        const ref = document.referrer || "";
        if (ref.includes("discord.com")) return true;
      } catch (_) { /* cross-origin */ }
      return false;
    }

    clientId() {
      if (this.isMock()) return "mock-client-id";
      return (global.CONFIG && CONFIG.discord && CONFIG.discord.clientId) || "";
    }

    getDiscordSDKClass() {
      if (this.isMock() && global.DiscordMockSDK) return global.DiscordMockSDK;
      const pack = global.DiscordEmbeddedAppSdk;
      if (this.isMock() && pack && pack.DiscordSDKMock) return pack.DiscordSDKMock;
      if (pack && pack.DiscordSDK) return pack.DiscordSDK;
      if (typeof global.DiscordSDK === "function") return global.DiscordSDK;
      return null;
    }

    async start() {
      if (this._readyPromise) return this._readyPromise;
      this._readyPromise = this._start();
      return this._readyPromise;
    }

    async _start() {
      if (global.CONFIG && CONFIG.ready) {
        try { await CONFIG.ready; } catch (_) { /* ignore */ }
      }

      this.isDiscord = this.detect();
      document.body.classList.toggle("platform-discord", this.isDiscord);

      if (!this.isDiscord) {
        console.log("[Discord] Hors Activity — mode web");
        return { ok: false, reason: "not-discord" };
      }

      const clientId = this.clientId();
      const SDK = this.getDiscordSDKClass();
      if (!clientId) {
        this._showBanner("Configurez DISCORD_CLIENT_ID dans .env puis relancez le serveur.");
        return { ok: false, reason: "no-client-id" };
      }
      if (!SDK) {
        this._showBanner(
          this.isMock()
            ? "Mock Discord introuvable (js/discord-mock.js)."
            : "SDK Discord introuvable (vendor/discord-embedded-app-sdk.js)."
        );
        return { ok: false, reason: "no-sdk" };
      }

      try {
        this.sdk = new SDK(clientId);
        await this.sdk.ready();
        this.ready = true;

        // Infos d'instance (canal vocal / Activity)
        try {
          const ch = await this.sdk.commands.getChannel?.() ||
            await this.sdk.commands.getInstanceConnectedChannel?.();
          if (ch) {
            this.channelId = ch.channel_id || ch.id || null;
            this.guildId = ch.guild_id || null;
          }
        } catch (err) {
          console.warn("[Discord] canal:", err);
        }

        this.instanceId = this.sdk.instanceId ||
          new URLSearchParams(location.search).get("instance_id") ||
          null;

        await this.authenticate();
        await this.refreshParticipants();
        this._subscribe();
        this._enableUi();
        this._showBanner(
          (this.isMock() ? "Mock Discord · " : "Discord Activity · ") +
          (this.user?.username || "joueur") +
          (this.instanceId ? " · salon " + String(this.instanceId).slice(0, 8) : ""),
          "ok"
        );

        if (typeof this.onReady === "function") this.onReady(this);
        document.dispatchEvent(new CustomEvent("discord:ready", { detail: this }));
        return { ok: true, user: this.user, instanceId: this.instanceId };
      } catch (err) {
        console.error("[Discord] init échouée", err);
        this._showBanner("Discord Activity : " + (err.message || err));
        return { ok: false, reason: "init-failed", error: String(err) };
      }
    }

    async authenticate() {
      const { code } = await this.sdk.commands.authorize({
        client_id: this.clientId(),
        response_type: "code",
        state: "",
        prompt: "none",
        scope: SCOPES
      });

      const seatUser = this.isMock() && this.sdk._seatUser
        ? this.sdk._seatUser()
        : null;

      const res = await fetch("/api/discord/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          mock: this.isMock(),
          user: seatUser
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Échange OAuth Discord impossible");
      }
      const data = await res.json();
      this.accessToken = data.access_token;

      const auth = await this.sdk.commands.authenticate({
        access_token: this.accessToken
      });
      this.user = auth.user || data.user || seatUser || null;

      if (this.user && global.authInstance && typeof authInstance.loginSocial === "function") {
        authInstance.loginSocial(
          "discord",
          String(this.user.id),
          this.user.username || this.user.global_name || "Joueur"
        );
        window.dispatchEvent(new CustomEvent("userLogin", { detail: authInstance.getUser() }));
      }
      if (typeof this.onUser === "function") this.onUser(this.user);
      return this.user;
    }

    _subscribe() {
      if (!this.sdk || !this.sdk.subscribe) return;
      try {
        this.sdk.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", (ev) => {
          this.participants = ev.participants || [];
          if (typeof this.onParticipants === "function") this.onParticipants(this.participants);
          document.dispatchEvent(new CustomEvent("discord:participants", {
            detail: this.participants
          }));
          this._paintParticipants();
        });
      } catch (err) {
        console.warn("[Discord] subscribe participants", err);
      }
    }

    async refreshParticipants() {
      if (!this.sdk?.commands?.getInstanceConnectedParticipants) return [];
      try {
        const result = await this.sdk.commands.getInstanceConnectedParticipants();
        this.participants = result.participants || result || [];
        this._paintParticipants();
        return this.participants;
      } catch (err) {
        console.warn("[Discord] participants", err);
        return [];
      }
    }

    /** Code salle stable pour l'instance Activity (2 joueurs dans le même salon). */
    instanceRoomCode() {
      try {
        const forced = new URLSearchParams(location.search).get("room");
        if (forced && /^[a-f0-9]{6,16}$/i.test(forced)) return forced.toLowerCase();
      } catch (_) { /* ignore */ }
      const raw = String(this.instanceId || this.channelId || "");
      if (!raw) return null;
      // 12 hex chars dérivés
      let h = 0;
      for (let i = 0; i < raw.length; i++) h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
      const hex = (Math.abs(h).toString(16) + raw.replace(/[^a-f0-9]/gi, "").toLowerCase() + "discord00").slice(0, 12);
      return hex;
    }

    async openInvite() {
      if (!this.sdk?.commands) return false;
      try {
        if (this.sdk.commands.openInviteDialog) {
          await this.sdk.commands.openInviteDialog();
          return true;
        }
        if (this.sdk.commands.inviteUserEmbed) {
          await this.sdk.commands.inviteUserEmbed({});
          return true;
        }
      } catch (err) {
        console.warn("[Discord] invite", err);
      }
      return false;
    }

    async setActivityStatus(detail) {
      // Best-effort : certaines versions exposent setActivity
      try {
        if (this.sdk?.commands?.setActivity) {
          await this.sdk.commands.setActivity({
            activity: {
              type: 0,
              details: detail || "Social Board — Go",
              state: this.user ? ("avec " + this.user.username) : "En partie"
            }
          });
        }
      } catch (_) { /* non critique */ }
    }

    _enableUi() {
      const bar = document.getElementById("discordControls");
      if (bar) bar.style.display = "flex";
      const inviteBtn = document.getElementById("btnDiscordInvite");
      if (inviteBtn) {
        inviteBtn.style.display = "";
        inviteBtn.onclick = () => this.openInvite();
      }
      const startBtn = document.getElementById("btnStartDiscordMatch");
      if (startBtn) {
        startBtn.style.display = "";
      }
    }

    _paintParticipants() {
      const el = document.getElementById("discordParticipants");
      if (!el) return;
      const names = (this.participants || []).map((p) => {
        const u = p.user || p;
        return u.username || u.global_name || "?";
      });
      el.textContent = names.length
        ? names.length + " dans l'Activity : " + names.join(", ")
        : "En attente d'un adversaire Discord…";
    }

    _showBanner(text, kind) {
      let el = document.getElementById("discordBanner");
      if (!el) {
        el = document.createElement("div");
        el.id = "discordBanner";
        el.style.cssText = "position:sticky;top:0;z-index:10000;padding:8px 12px;font-size:13px;text-align:center;";
        document.body.prepend(el);
      }
      el.style.background = kind === "ok" ? "#1e3a5f" : "#5c2b2b";
      el.style.color = "#e8eef8";
      el.textContent = text;
    }
  }

  const activity = new DiscordActivity();
  global.DiscordActivity = activity;

  function boot() {
    activity.start().catch((err) => console.error(err));
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
