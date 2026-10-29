/**
 * Chrome UX in-game : onglets Partie / Teaching / Vidéo / Réglages.
 */
(function () {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function openPanel(id) {
    qsa(".action-tabs button").forEach((b) => {
      b.classList.toggle("on", b.getAttribute("data-panel") === id);
    });
    qsa(".controls-panel").forEach((p) => {
      p.classList.toggle("is-open", p.id === "panel-" + id);
    });
    try {
      sessionStorage.setItem("sb-ux-panel", id);
    } catch (_) { /* ignore */ }
  }

  function bootTeachFromUrl() {
    const params = new URLSearchParams(location.search);
    if (params.get("teach") !== "1") return;
    openPanel("teach");
    setTimeout(() => {
      const chess = document.getElementById("btnChessTeaching");
      const go = document.getElementById("btnTeaching");
      if (chess) chess.click();
      else if (go) go.click();
    }, 600);
  }

  function init() {
    document.body.classList.add("app-shell");
    const tabs = qs(".action-tabs");
    if (!tabs) return;

    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-panel]");
      if (!btn) return;
      openPanel(btn.getAttribute("data-panel"));
    });

    let start = "play";
    try {
      start = sessionStorage.getItem("sb-ux-panel") || "play";
    } catch (_) { /* ignore */ }
    if (new URLSearchParams(location.search).get("broadcast") === "1") start = "video";
    if (new URLSearchParams(location.search).get("teach") === "1") start = "teach";
    openPanel(start);
    bootTeachFromUrl();

    const platforms = document.querySelector("section.platforms");
    if (platforms && !platforms.querySelector(".platforms-toggle")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "platforms-toggle";
      btn.textContent = "Autres partages…";
      btn.style.cssText = "margin-top:8px;font-size:12px;";
      btn.addEventListener("click", () => {
        platforms.classList.toggle("expanded");
        btn.textContent = platforms.classList.contains("expanded")
          ? "Masquer les partages"
          : "Autres partages…";
      });
      platforms.appendChild(btn);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
