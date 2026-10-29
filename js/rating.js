/**
 * Classements Elo + kyu/dan (échelle japonaise / EGF).
 *
 * Go : 20k ≈ 100 Elo, +100 Elo / grade → 1k = 2000, 1d = 2100 … 9d = 2900.
 * Handicap : 1 pierre ≈ 1 grade ≈ 100 Elo.
 * Échecs : Elo classique (départ 1200), K adaptatif.
 */
(function (global) {
  const STORAGE_KEY = "sb_ratings_v1";
  const GO_DEFAULT_ELO = 1000; // ~11k
  const CHESS_DEFAULT_ELO = 1200;

  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }

  /** Elo → grade : négatif = kyu, positif = dan (1k=-1, 1d=1). */
  function eloToGoGrade(elo) {
    const e = Number(elo) || GO_DEFAULT_ELO;
    // 100→20k, 2000→1k, 2100→1d
    if (e >= 2050) return clamp(Math.round((e - 2000) / 100), 1, 9);
    const kyu = clamp(Math.round((2100 - e) / 100), 1, 30);
    return -kyu;
  }

  function goGradeToElo(grade) {
    const g = Number(grade) || -11;
    if (g > 0) return 2000 + g * 100;
    return 2100 + g * 100; // -1 → 2000, -20 → 100
  }

  function formatGoRank(elo, provisional) {
    const g = eloToGoGrade(elo);
    const label = g > 0 ? g + "d" : Math.abs(g) + "k";
    return provisional ? label + "?" : label;
  }

  function formatChessElo(elo) {
    return String(Math.round(Number(elo) || CHESS_DEFAULT_ELO));
  }

  function expectedScore(myElo, oppElo) {
    return 1 / (1 + Math.pow(10, (oppElo - myElo) / 400));
  }

  function kFactor(game, elo, gamesPlayed) {
    if (game === "go") {
      if (gamesPlayed < 8) return 48;
      if (elo < 1500) return 36;
      return 24;
    }
    if (gamesPlayed < 20) return 40;
    if (elo < 2100) return 20;
    if (elo < 2400) return 15;
    return 10;
  }

  function updateElo(myElo, oppElo, score, k) {
    return myElo + k * (score - expectedScore(myElo, oppElo));
  }

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      return data && typeof data === "object" ? data : {};
    } catch (e) {
      return {};
    }
  }

  function saveAll(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* ignore quota */ }
  }

  function playerKey(id) {
    return String(id || "guest").slice(0, 64);
  }

  function getProfile(userId) {
    const all = loadAll();
    const key = playerKey(userId);
    const p = all[key] || {};
    return {
      id: key,
      goElo: Number(p.goElo) || GO_DEFAULT_ELO,
      chessElo: Number(p.chessElo) || CHESS_DEFAULT_ELO,
      goGames: Number(p.goGames) || 0,
      chessGames: Number(p.chessGames) || 0,
      goWins: Number(p.goWins) || 0,
      chessWins: Number(p.chessWins) || 0
    };
  }

  function setProfile(profile) {
    const all = loadAll();
    all[playerKey(profile.id)] = {
      goElo: Math.round(profile.goElo),
      chessElo: Math.round(profile.chessElo),
      goGames: profile.goGames | 0,
      chessGames: profile.chessGames | 0,
      goWins: profile.goWins | 0,
      chessWins: profile.chessWins | 0
    };
    saveAll(all);
    const saved = getProfile(profile.id);
    // Miroir serveur (best-effort)
    try {
      if (typeof fetch === "function" && global.CONFIG && CONFIG.api) {
        fetch("/api/ratings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: saved.id,
            goElo: saved.goElo,
            chessElo: saved.chessElo,
            goGames: saved.goGames,
            chessGames: saved.chessGames,
            goWins: saved.goWins,
            chessWins: saved.chessWins
          })
        }).catch(() => {});
      }
    } catch (_) { /* ignore */ }
    return saved;
  }

  async function pullFromServer(userId) {
    try {
      if (!global.CONFIG || !CONFIG.api) return getProfile(userId);
      const res = await fetch("/api/ratings?id=" + encodeURIComponent(playerKey(userId)));
      if (!res.ok) return getProfile(userId);
      const data = await res.json();
      if (data && data.profile) {
        const p = Object.assign({ id: playerKey(userId) }, data.profile);
        const all = loadAll();
        all[p.id] = {
          goElo: p.goElo,
          chessElo: p.chessElo,
          goGames: p.goGames,
          chessGames: p.chessGames,
          goWins: p.goWins,
          chessWins: p.chessWins
        };
        saveAll(all);
      }
    } catch (_) { /* offline */ }
    return getProfile(userId);
  }

  async function pushResult(players) {
    try {
      if (!global.CONFIG || !CONFIG.api) return;
      await fetch("/api/ratings/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players: players })
      });
    } catch (_) { /* ignore */ }
  }

  /**
   * @param {{
   *   game:'go'|'chess',
   *   playerId:string,
   *   opponentId:string,
   *   result:1|0|0.5,
   *   playerColor?:'b'|'w'|1|2,
   *   handicap?:number,
   *   boardSize?:number,
   *   ranked?:boolean
   * }} opts
   */
  function recordResult(opts) {
    const game = opts.game === "chess" ? "chess" : "go";
    const ranked = opts.ranked !== false;
    const meBefore = getProfile(opts.playerId);

    if (game === "go" && ranked) {
      const size = Number(opts.boardSize) || 19;
      const h = Number(opts.handicap) || 0;
      if (size !== 19 || h > 6) {
        return {
          ranked: false,
          reason: "non classé (19×19, handicap ≤ 6)",
          player: meBefore,
          opponent: getProfile(opts.opponentId)
        };
      }
    }

    const me = getProfile(opts.playerId);
    const opp = getProfile(opts.opponentId);
    const score = opts.result === 1 ? 1 : (opts.result === 0.5 ? 0.5 : 0);

    if (game === "go") {
      const h = Math.max(0, Math.min(9, Number(opts.handicap) || 0));
      const blackIsMe = opts.playerColor === "b" || opts.playerColor === 1 || opts.playerColor == null;
      const black = blackIsMe ? me : opp;
      const white = blackIsMe ? opp : me;
      const blackEff = black.goElo + h * 100;
      const whiteEff = white.goElo;
      const blackScore = blackIsMe ? score : 1 - score;
      const kB = kFactor("go", black.goElo, black.goGames);
      const kW = kFactor("go", white.goElo, white.goGames);
      black.goElo = clamp(updateElo(blackEff, whiteEff, blackScore, kB) - h * 100, 50, 3500);
      white.goElo = clamp(updateElo(whiteEff, blackEff, 1 - blackScore, kW), 50, 3500);
      black.goGames += 1;
      white.goGames += 1;
      if (blackScore === 1) black.goWins += 1;
      if (blackScore === 0) white.goWins += 1;
      setProfile(black);
      setProfile(white);
    } else {
      const before = me.chessElo;
      const kMe = kFactor("chess", me.chessElo, me.chessGames);
      const kOpp = kFactor("chess", opp.chessElo, opp.chessGames);
      me.chessElo = clamp(updateElo(me.chessElo, opp.chessElo, score, kMe), 100, 3500);
      opp.chessElo = clamp(updateElo(opp.chessElo, before, 1 - score, kOpp), 100, 3500);
      me.chessGames += 1;
      opp.chessGames += 1;
      if (score === 1) me.chessWins += 1;
      if (score === 0) opp.chessWins += 1;
      setProfile(me);
      setProfile(opp);
    }

    const meAfter = getProfile(opts.playerId);
    const oppAfter = getProfile(opts.opponentId);
    const delta = game === "go"
      ? Math.round(meAfter.goElo - meBefore.goElo)
      : Math.round(meAfter.chessElo - meBefore.chessElo);

    pushResult([meAfter, oppAfter]);
    return {
      ranked: true,
      player: meAfter,
      opponent: oppAfter,
      playerRank: game === "go"
        ? formatGoRank(meAfter.goElo, meAfter.goGames < 4)
        : formatChessElo(meAfter.chessElo),
      opponentRank: game === "go"
        ? formatGoRank(oppAfter.goElo, oppAfter.goGames < 4)
        : formatChessElo(oppAfter.chessElo),
      delta: delta
    };
  }

  function displayFor(userId, game) {
    const p = getProfile(userId);
    if (game === "chess") {
      return { label: formatChessElo(p.chessElo), elo: p.chessElo, provisional: p.chessGames < 10 };
    }
    return {
      label: formatGoRank(p.goElo, p.goGames < 4),
      elo: p.goElo,
      provisional: p.goGames < 4,
      grade: eloToGoGrade(p.goElo)
    };
  }

  function suggestedHandicap(eloStrong, eloWeak) {
    const diff = Math.round((Number(eloStrong) - Number(eloWeak)) / 100);
    return diff <= 0 ? 0 : clamp(diff, 0, 9);
  }

  function correspondenceTable() {
    const rows = [];
    for (let k = 30; k >= 1; k--) {
      rows.push({
        rank: k + "k",
        elo: goGradeToElo(-k),
        handicapVs1d: suggestedHandicap(goGradeToElo(1), goGradeToElo(-k))
      });
    }
    for (let d = 1; d <= 9; d++) {
      rows.push({ rank: d + "d", elo: goGradeToElo(d), handicapVs1d: Math.max(0, d - 1) });
    }
    return rows;
  }

  global.RatingSystem = {
    GO_DEFAULT_ELO: GO_DEFAULT_ELO,
    CHESS_DEFAULT_ELO: CHESS_DEFAULT_ELO,
    eloToGoGrade: eloToGoGrade,
    goGradeToElo: goGradeToElo,
    formatGoRank: formatGoRank,
    formatChessElo: formatChessElo,
    expectedScore: expectedScore,
    getProfile: getProfile,
    setProfile: setProfile,
    pullFromServer: pullFromServer,
    pushResult: pushResult,
    recordResult: recordResult,
    displayFor: displayFor,
    suggestedHandicap: suggestedHandicap,
    correspondenceTable: correspondenceTable
  };
})(typeof window !== "undefined" ? window : globalThis);
