/** Lanceur Discord Activity — injecte le code de salle dans les liens (CSP-safe). */
(async function () {
  const status = document.getElementById("status");
  if (!status) return;
  try {
    if (window.CONFIG && CONFIG.ready) await CONFIG.ready;
    if (!window.DiscordActivity) {
      status.textContent = "SDK Discord absent.";
      return;
    }
    const result = await DiscordActivity.start();
    if (result.ok) {
      status.textContent =
        "Connecté : " +
        ((result.user && result.user.username) || "joueur") +
        " — choisissez Go ou Échecs, puis invitez quelqu’un dans l’Activity.";
      const code =
        DiscordActivity.instanceRoomCode && DiscordActivity.instanceRoomCode();
      if (code) {
        const q = "&room=" + encodeURIComponent(code);
        const set = (id, base) => {
          const el = document.getElementById(id);
          if (el) el.href = base + q;
        };
        set("goLink", "../go/?discord=1&g=go");
        set("chessLink", "../chess/?discord=1&g=chess");
        set("goTeach", "../go/?discord=1&teach=1&g=go");
        set("chessTeach", "../chess/?discord=1&teach=1&g=chess");
      }
    } else if (result.reason === "not-discord") {
      status.textContent =
        "Hors Discord : ouvrez depuis une Activity, ou utilisez le mock / les pages Go et Échecs.";
    } else {
      status.textContent =
        "Discord non prêt (" + result.reason + "). Voir le guide Discord.";
    }
  } catch (err) {
    status.textContent = String(err.message || err);
  }
})();
