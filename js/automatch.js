/**
 * Client automatch — file d'attente serveur /api/automatch
 */
(function (global) {
  class AutomatchClient {
    constructor() {
      this.ticket = null;
      this.pollTimer = null;
      this.onMatch = null;
      this.onStatus = null;
    }

    async enqueue(opts) {
      opts = opts || {};
      const body = {
        userId: String(opts.userId || "guest").slice(0, 64),
        game: opts.game === "chess" ? "chess" : "go",
        size: Number(opts.size) || 19,
        ranked: opts.ranked !== false,
        elo: Number(opts.elo) || 1000,
        name: String(opts.name || opts.userId || "joueur").slice(0, 32)
      };
      const res = await fetch("/api/automatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error("Automatch indisponible");
      const data = await res.json();
      this.ticket = data.ticket;
      if (data.match) {
        if (this.onMatch) this.onMatch(data.match);
        return data;
      }
      if (this.onStatus) this.onStatus("En file d'attente…", "ok");
      this._poll();
      return data;
    }

    _poll() {
      this.stop();
      this.pollTimer = setInterval(async () => {
        if (!this.ticket) return;
        try {
          const res = await fetch("/api/automatch/" + encodeURIComponent(this.ticket));
          if (!res.ok) return;
          const data = await res.json();
          if (data.status === "matched" && data.match) {
            this.stop();
            if (this.onMatch) this.onMatch(data.match);
          } else if (data.status === "waiting" && this.onStatus) {
            this.onStatus("File : " + (data.position || "?") + " — " + (data.waiting || 0) + " joueur(s)", "ok");
          }
        } catch (_) { /* ignore */ }
      }, 1500);
    }

    async cancel() {
      this.stop();
      if (!this.ticket) return;
      try {
        await fetch("/api/automatch/" + encodeURIComponent(this.ticket), { method: "DELETE" });
      } catch (_) { /* ignore */ }
      this.ticket = null;
    }

    stop() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    }
  }

  global.AutomatchClient = AutomatchClient;
})(window);
