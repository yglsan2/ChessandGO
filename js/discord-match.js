/**
 * Matchmaking Discord Activity : même instance_id = même partie Go/Échecs.
 * L'hôte = plus petit snowflake Discord présent ; l'autre rejoint via /api/rooms.
 */
(function (global) {
  let started = false;
  let lastCode = null;
  let running = false;

  function setStatus(msg, kind) {
    const el = document.getElementById("status");
    if (el) {
      el.textContent = msg;
      el.className = "status" + (kind ? " " + kind : "");
    }
    const note = document.getElementById("discordMatchStatus");
    if (note) note.textContent = msg;
  }

  function gameKind() {
    if (global.SB_PROJECT === "go") return "go";
    if (global.SB_PROJECT === "chess") return "chess";
    const p = new URLSearchParams(location.search);
    if (p.get("g") === "go" || p.get("game") === "go") return "go";
    return "chess";
  }

  function roomCodeFrom(activity) {
    const urlRoom = new URLSearchParams(location.search).get("room");
    if (urlRoom && /^[a-f0-9]{6,16}$/i.test(urlRoom)) return urlRoom.toLowerCase();
    if (activity && typeof activity.instanceRoomCode === "function") {
      return activity.instanceRoomCode();
    }
    return null;
  }

  function waitFor(pred, ms) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        if (pred()) return resolve(true);
        if (Date.now() - t0 > ms) return resolve(false);
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  function shouldAutoMatch() {
    try {
      const p = new URLSearchParams(location.search);
      return p.get("automatch") === "1" || p.get("mock") === "1";
    } catch (_) {
      return false;
    }
  }

  async function run(activity) {
    if (running) return;
    if (global.__sbNetConnected && global.__sbNetConnected()) return;

    const code = roomCodeFrom(activity);
    if (!code) {
      setStatus("Pas d'instance Discord — lancez depuis un salon Activity", "err");
      return;
    }

    // Éviter double-lancement réussi
    if (started && lastCode === code && global.__sbGetNet && global.__sbGetNet() && global.__sbGetNet().id) {
      return;
    }

    running = true;
    started = true;
    lastCode = code;

    try {
      if (!global.RoomService) {
        setStatus("RoomService absent — impossible de matcher Discord", "err");
        return;
      }

      await activity.refreshParticipants();
      const seat = new URLSearchParams(location.search).get("seat");
      const me = String(activity.user?.id || "");
      const ids = (activity.participants || [])
        .map((p) => String((p.user || p).id || ""))
        .filter(Boolean)
        .sort();
      if (me && ids.indexOf(me) === -1) ids.push(me);
      ids.sort();
      // Mock : seat=a/host force l'hôte (évite course si user pas encore prêt)
      let shouldHost = !ids.length || (!!me && ids[0] === me);
      if (seat === "a" || seat === "host") shouldHost = true;
      if (seat === "b" || seat === "guest") shouldHost = false;

      const foeReady = ids.length >= 2;
      setStatus(
        shouldHost
          ? foeReady
            ? "Discord : hôte — adversaire présent, lancement…"
            : "Discord : vous êtes l'hôte — en attente d'un adversaire…"
          : "Discord : connexion à la partie de l'hôte…",
        "ok"
      );

      const ok = await waitFor(() => typeof global.__sbStartDiscordMatch === "function", 20000);
      if (!ok) {
        setStatus("Hook partie Discord non prêt — rechargez la page", "err");
        started = false;
        return;
      }

      const game = gameKind();
      await global.__sbStartDiscordMatch({
        code: code,
        asHost: shouldHost,
        game: game,
        activity: activity
      });
      // Échecs : hôte = Blancs ; Go : hôte = Noirs (convention table)
      const hostColor = game === "chess" ? "Blancs" : "Noirs";
      const guestColor = game === "chess" ? "Noirs" : "Blancs";
      setStatus(
        shouldHost
          ? foeReady
            ? "Discord : partie en cours (vous = " + hostColor + ")"
            : "Discord : hôte connecté — en attente adversaire…"
          : "Discord : partie en cours (vous = " + guestColor + ")",
        "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus(String(err.message || err), "err");
      started = false;
    } finally {
      running = false;
    }
  }

  function onReady(activity) {
    if (!activity) return;
    if (!shouldAutoMatch() && !document.getElementById("btnStartDiscordMatch")) return;
    if (shouldAutoMatch() || (activity.isDiscord && !(activity.isMock && activity.isMock()))) {
      run(activity);
    }
  }

  document.addEventListener("discord:ready", (ev) => {
    onReady(ev.detail);
  });

  if (global.DiscordActivity && DiscordActivity.ready) {
    onReady(DiscordActivity);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const b = document.getElementById("btnStartDiscordMatch");
    if (b) {
      b.addEventListener("click", async () => {
        started = false;
        lastCode = null;
        if (!DiscordActivity.ready) await DiscordActivity.start();
        if (DiscordActivity.ready) run(DiscordActivity);
      });
    }
  });
})(window);
