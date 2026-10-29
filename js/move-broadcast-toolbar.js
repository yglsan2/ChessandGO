/** Place la barre Broadcast dans l'onglet Vidéo (évite script inline / CSP). */
(function () {
  function place() {
    const panel = document.getElementById("panel-video");
    const bar = document.getElementById("broadcastToolbar");
    if (panel && bar && bar.parentElement !== panel) panel.appendChild(bar);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", place);
  } else {
    place();
  }
})();
