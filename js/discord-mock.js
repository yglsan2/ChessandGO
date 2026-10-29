/**
 * SDK Discord factice pour tests locaux (sans portail Discord).
 * Activé avec ?discord=1&mock=1
 */
(function (global) {
  function uid(prefix) {
    return prefix + Math.random().toString(16).slice(2, 10);
  }

  class DiscordMockSDK {
    constructor(clientId) {
      this.clientId = clientId || "mock-client";
      this.instanceId = new URLSearchParams(location.search).get("instance_id") || "mock-instance";
      this.commands = this._commands();
      this._handlers = {};
      this._ready = false;
    }

    async ready() {
      this._ready = true;
      return true;
    }

    subscribe(event, fn) {
      this._handlers[event] = this._handlers[event] || [];
      this._handlers[event].push(fn);
    }

    _emit(event, payload) {
      (this._handlers[event] || []).forEach((fn) => {
        try { fn(payload); } catch (err) { console.warn(err); }
      });
    }

    _seatUser() {
      const seat = new URLSearchParams(location.search).get("seat") || "a";
      if (seat === "b" || seat === "guest") {
        return {
          id: "222222222222222222",
          username: "AdversaireTest",
          global_name: "Adversaire Test",
          discriminator: "0",
          avatar: null
        };
      }
      return {
        id: "111111111111111111",
        username: "HoteTest",
        global_name: "Hôte Test",
        discriminator: "0",
        avatar: null
      };
    }

    _allParticipants() {
      const me = this._seatUser();
      const other = me.id.startsWith("1")
        ? {
            id: "222222222222222222",
            username: "AdversaireTest",
            global_name: "Adversaire Test"
          }
        : {
            id: "111111111111111111",
            username: "HoteTest",
            global_name: "Hôte Test"
          };
      const both = new URLSearchParams(location.search).get("solo") !== "1";
      const list = [{ user: me }];
      if (both) list.push({ user: other });
      return list;
    }

    _commands() {
      const self = this;
      return {
        authorize: async () => ({ code: "mock-oauth-code-" + uid("") }),
        authenticate: async () => ({ user: self._seatUser() }),
        getInstanceConnectedChannel: async () => ({
          channel_id: "channel-mock",
          guild_id: "guild-mock",
          instance_id: self.instanceId
        }),
        getChannel: async () => ({
          id: "channel-mock",
          guild_id: "guild-mock"
        }),
        getInstanceConnectedParticipants: async () => ({
          participants: self._allParticipants()
        }),
        openInviteDialog: async () => {
          alert("Mock Discord : dialogue d'invitation (simulé).");
          return {};
        },
        setActivity: async () => ({})
      };
    }
  }

  global.DiscordMockSDK = DiscordMockSDK;

  // Exposer aussi sous le même packaging que le vrai SDK
  global.DiscordEmbeddedAppSdk = global.DiscordEmbeddedAppSdk || {};
  global.DiscordEmbeddedAppSdk.DiscordSDKMock = DiscordMockSDK;
})(window);
