/**
 * Rengo 4 joueurs — sièges Noir A/B, Blanc A/B.
 * Broadcast via net.send (PeerJS ou LocalNet).
 */
(function (global) {
  const SEATS = ["b0", "b1", "w0", "w1"];

  function seatLabel(seat) {
    return {
      b0: "Noir A",
      b1: "Noir B",
      w0: "Blanc A",
      w1: "Blanc B"
    }[seat] || seat;
  }

  function createRengoRoom(ctx) {
    const state = {
      seats: { b0: null, b1: null, w0: null, w1: null },
      mySeat: null,
      enabled: false
    };

    function claim(seat, user) {
      if (SEATS.indexOf(seat) < 0) return false;
      // Libérer mon ancien siège
      SEATS.forEach((s) => {
        if (state.seats[s] && state.seats[s].id === user.id) state.seats[s] = null;
      });
      state.seats[seat] = { id: user.id, name: user.name || user.username || user.id };
      state.mySeat = seat;
      broadcast();
      return true;
    }

    function broadcast() {
      if (!ctx.net || !ctx.net.connected()) return;
      ctx.net.send({
        type: "rengo-seats",
        seats: state.seats,
        mySeat: state.mySeat
      });
    }

    function applyRemote(data) {
      if (!data || data.type !== "rengo-seats") return false;
      state.seats = Object.assign({ b0: null, b1: null, w0: null, w1: null }, data.seats || {});
      render();
      return true;
    }

    /** Le joueur local peut-il jouer le trait actuel ? */
    function canPlay(goTurn, pairSeat) {
      if (!state.enabled || !state.mySeat) return true; // hors rengo net
      const side = goTurn === 1 ? "b" : "w";
      const seatIdx = pairSeat[side] || 0;
      const need = side + seatIdx;
      return state.mySeat === need;
    }

    function render() {
      const box = document.getElementById("rengoSeatsPanel");
      if (!box) return;
      box.style.display = state.enabled ? "block" : "none";
      SEATS.forEach((s) => {
        const el = document.getElementById("rengoSeat_" + s);
        if (!el) return;
        const who = state.seats[s];
        el.textContent = who ? (who.name || who.id) : "— libre —";
        el.classList.toggle("mine", state.mySeat === s);
        el.classList.toggle("taken", !!who);
      });
    }

    function enable(on) {
      state.enabled = !!on;
      render();
    }

    function wireUi(getUser) {
      SEATS.forEach((s) => {
        const btn = document.getElementById("rengoClaim_" + s);
        if (!btn) return;
        btn.addEventListener("click", () => {
          const u = getUser();
          claim(s, { id: String(u.id || u.username || "me"), name: u.username || u.global_name || u.name || "moi" });
          render();
          if (ctx.setStatus) ctx.setStatus("Siège " + seatLabel(s), "ok");
        });
      });
    }

    return {
      state: state,
      claim: claim,
      applyRemote: applyRemote,
      canPlay: canPlay,
      enable: enable,
      render: render,
      wireUi: wireUi,
      seatLabel: seatLabel,
      broadcast: broadcast
    };
  }

  global.RengoNet = { createRengoRoom: createRengoRoom, SEATS: SEATS, seatLabel: seatLabel };
})(window);
