// Client API salles (fallback silencieux si hébergement statique sans backend)
(function (global) {
  class RoomService {
    constructor() {
      this.available = null;
    }

    async ping() {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        this.available = res.ok;
        return this.available;
      } catch (_) {
        this.available = false;
        return false;
      }
    }

    async create({ peerId, token, game, code, source }) {
      if (this.available === false) return null;
      try {
        const res = await fetch("/api/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peerId, token, game, code, source })
        });
        if (!res.ok) return null;
        this.available = true;
        return await res.json();
      } catch (_) {
        this.available = false;
        return null;
      }
    }

    async resolve(code) {
      if (!code || !/^[a-f0-9]{6,16}$/i.test(code)) return null;
      try {
        const res = await fetch("/api/rooms/" + encodeURIComponent(code.toLowerCase()), {
          cache: "no-store"
        });
        if (!res.ok) return null;
        this.available = true;
        return await res.json();
      } catch (_) {
        return null;
      }
    }
  }

  global.RoomService = RoomService;
})(window);
