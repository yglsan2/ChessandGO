/**
 * Simulateur 2 joueurs Discord (BroadcastChannel / net-local).
 * Support Go et Échecs via ?game=chess|go
 */
(function () {
  const params = new URLSearchParams(location.search);
  let game = params.get("game") === "chess" ? "chess" : "go";
  const INSTANCE = "testdiscord01";
  const ROOM_CODE = game === "chess" ? "c1b2c3d4e5f6" : "a1b2c3d4e5f6";

  function urlFor(seat) {
    const q = new URLSearchParams({
      discord: "1",
      mock: "1",
      seat: seat,
      instance_id: INSTANCE,
      room: ROOM_CODE,
      g: game,
      automatch: "1",
      v: "10"
    });
    const base = game === "chess" ? "../chess/?" : "../go/?";
    return base + q.toString();
  }

  function colorHint(seat) {
    if (game === "chess") {
      return seat === "a"
        ? "HoteTest · Blancs"
        : "AdversaireTest · Noirs";
    }
    return seat === "a"
      ? "HoteTest · Noirs"
      : "AdversaireTest · Blancs";
  }

  function load() {
    const frameA = document.getElementById("frameA");
    const frameB = document.getElementById("frameB");
    const statusA = document.getElementById("statusA");
    const statusB = document.getElementById("statusB");
    const titleGame = document.getElementById("simGameLabel");
    if (titleGame) titleGame.textContent = game === "chess" ? "Échecs" : "Go";

    frameA.src = urlFor("a");
    frameB.src = "about:blank";
    statusA.textContent = "hôte démarre…";
    statusB.textContent = "dans 3 s…";
    setTimeout(() => {
      frameB.src = urlFor("b");
      statusA.textContent = colorHint("a");
      statusB.textContent = colorHint("b");
    }, 3000);
  }

  function setGame(next) {
    game = next === "chess" ? "chess" : "go";
    const url = new URL(location.href);
    url.searchParams.set("game", game);
    history.replaceState(null, "", url.toString());
    document.querySelectorAll("[data-sim-game]").forEach((b) => {
      b.classList.toggle("on", b.getAttribute("data-sim-game") === game);
    });
    load();
  }

  document.getElementById("btnReload")?.addEventListener("click", load);
  document.getElementById("btnOpenA")?.addEventListener("click", () => window.open(urlFor("a"), "_blank"));
  document.getElementById("btnOpenB")?.addEventListener("click", () => window.open(urlFor("b"), "_blank"));
  document.querySelectorAll("[data-sim-game]").forEach((btn) => {
    btn.addEventListener("click", () => setGame(btn.getAttribute("data-sim-game")));
  });

  document.querySelectorAll("[data-sim-game]").forEach((b) => {
    b.classList.toggle("on", b.getAttribute("data-sim-game") === game);
  });
  load();
})();
