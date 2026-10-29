/* Socle commun : les projets Échecs et Go s'y branchent,
   dans la même page ou chacun dans sa fenêtre. */
(function (global) {
  var CHANNEL_NAME = "social-board";
  var modules = Object.create(null);
  var handlers = [];
  var channel = null;

  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch (err) {
    channel = null;
  }

  var bridge = {
    version: 1,
    projectId: global.SB_PROJECT || "shell",
    paths: {
      chess: "chess/index.html",
      go: "go/index.html",
      shell: "index.html"
    },
    register: function (mod) {
      if (!mod || !mod.id) return;
      modules[mod.id] = mod;
    },
    has: function (id) {
      return !!modules[id];
    },
    list: function () {
      return Object.keys(modules);
    },
    on: function (fn) {
      if (typeof fn === "function") handlers.push(fn);
    },
    emit: function (type, payload, to) {
      var msg = {
        v: 1,
        channel: CHANNEL_NAME,
        type: type,
        to: to || "*",
        from: bridge.projectId,
        payload: payload || {},
        ts: Date.now()
      };
      deliver(msg, "local");
      if (channel) {
        try { channel.postMessage(msg); } catch (err) { /* canal fermé */ }
      }
      postToFrames(msg);
    }
  };

  function postToFrames(msg) {
    try {
      if (global.parent && global.parent !== global) {
        global.parent.postMessage(msg, global.location.origin);
      }
      var frames = global.document ? global.document.querySelectorAll("iframe") : [];
      Array.prototype.forEach.call(frames, function (frame) {
        if (frame.contentWindow) frame.contentWindow.postMessage(msg, global.location.origin);
      });
    } catch (err) { /* pas de cadre */ }
  }

  function deliver(msg, source) {
    if (!msg || msg.v !== 1 || msg.channel !== CHANNEL_NAME) return;
    if (source !== "local" && msg.from === bridge.projectId) return;
    handlers.forEach(function (fn) {
      try { fn(msg, source); } catch (err) { console.warn(err); }
    });
    var target = modules[msg.to];
    if (target && typeof target.onBridge === "function") {
      try { target.onBridge(msg); } catch (err) { console.warn(err); }
    }
  }

  if (channel) {
    channel.onmessage = function (ev) { deliver(ev.data, "channel"); };
  }

  global.addEventListener("message", function (ev) {
    if (ev.origin !== global.location.origin) return;
    deliver(ev.data, "frame");
  });

  global.SocialBoard = bridge;
})(window);
