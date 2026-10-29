/**
 * Marques pédagogiques Go (triangle, lettre, flèche, mort…).
 * Types : formes, étoiles, croix (mort), capture, pastilles couleur, flèches.
 */
(function (global) {
  const COLORS = [
    { id: "red", hex: "#e53935", label: "Rouge" },
    { id: "blue", hex: "#1e88e5", label: "Bleu" },
    { id: "green", hex: "#43a047", label: "Vert" },
    { id: "orange", hex: "#fb8c00", label: "Orange" },
    { id: "purple", hex: "#8e24aa", label: "Violet" },
    { id: "yellow", hex: "#fdd835", label: "Jaune" },
    { id: "cyan", hex: "#00acc1", label: "Cyan" },
    { id: "white", hex: "#fafafa", label: "Blanc" },
    { id: "black", hex: "#212121", label: "Noir" }
  ];

  const MARK_TYPES = [
    "triangle", "square", "circle", "star", "cross",
    "dead", "capture", "good", "bad", "hot",
    "letter", "number"
  ];

  function colorHex(idOrHex) {
    if (!idOrHex) return "#e53935";
    if (idOrHex.charAt(0) === "#") return idOrHex;
    const c = COLORS.find((x) => x.id === idOrHex);
    return c ? c.hex : "#e53935";
  }

  function drawStar(ctx, cx, cy, r, color) {
    const spikes = 5;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const ang = (Math.PI / spikes) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, r * 0.12);
    ctx.fill();
    ctx.stroke();
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, style) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // raccourcir pour ne pas manger les pierres
    const inset = Math.min(len * 0.22, 18);
    const sx = x1 + ux * inset;
    const sy = y1 + uy * inset;
    const ex = x2 - ux * inset;
    const ey = y2 - uy * inset;
    const head = Math.min(14, len * 0.28);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = style === "force" ? 3.5 : style === "weak" ? 1.5 : 2.5;
    if (style === "weak") ctx.setLineDash([6, 4]);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);

    // pointe
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ux * head - uy * head * 0.45, ey - uy * head + ux * head * 0.45);
    ctx.lineTo(ex - ux * head + uy * head * 0.45, ey - uy * head - ux * head * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function paintMark(ctx, mark, px, py, r) {
    if (!mark) return;
    const color = colorHex(mark.color);
    const type = mark.type;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, r * 0.18);

    if (type === "triangle") {
      ctx.beginPath();
      ctx.moveTo(px, py - r);
      ctx.lineTo(px + r * 0.9, py + r * 0.7);
      ctx.lineTo(px - r * 0.9, py + r * 0.7);
      ctx.closePath();
      ctx.stroke();
    } else if (type === "square") {
      ctx.strokeRect(px - r * 0.7, py - r * 0.7, r * 1.4, r * 1.4);
    } else if (type === "circle") {
      ctx.beginPath();
      ctx.arc(px, py, r * 0.75, 0, Math.PI * 2);
      ctx.stroke();
    } else if (type === "star") {
      drawStar(ctx, px, py, r * 0.85, color);
    } else if (type === "cross" || type === "dead") {
      // Croix = pierre morte / mauvaise
      const s = r * (type === "dead" ? 0.7 : 0.55);
      ctx.lineWidth = Math.max(2.5, r * 0.22);
      ctx.beginPath();
      ctx.moveTo(px - s, py - s);
      ctx.lineTo(px + s, py + s);
      ctx.moveTo(px + s, py - s);
      ctx.lineTo(px - s, py + s);
      ctx.stroke();
      if (type === "dead") {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, r * 0.95, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === "capture") {
      // Anneau + petit éclair de capture
      ctx.lineWidth = Math.max(2.5, r * 0.2);
      ctx.beginPath();
      ctx.arc(px, py, r * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, r * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    } else if (type === "good" || type === "bad" || type === "hot") {
      // Pastille Lizzie-like
      const fill = type === "good" ? "#43a047" : type === "bad" ? "#e53935" : "#fb8c00";
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = mark.color ? color : fill;
      ctx.beginPath();
      ctx.arc(px, py, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (type === "letter" || type === "number") {
      ctx.font = "bold " + Math.max(11, r * 1.1) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.strokeText(mark.text || "", px, py);
      ctx.fillStyle = color;
      ctx.fillText(mark.text || "", px, py);
    }
    ctx.restore();
  }

  function paintAllMarks(ctx, marks, boardSize, margin, cellSize, stoneRadius) {
    if (!marks) return;
    const r = stoneRadius * 0.72;
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const mark = marks[y] && marks[y][x];
        if (!mark) continue;
        paintMark(ctx, mark, margin + x * cellSize, margin + y * cellSize, r);
      }
    }
  }

  function paintArrows(ctx, arrows, margin, cellSize) {
    if (!arrows || !arrows.length) return;
    arrows.forEach((a) => {
      const x1 = margin + a.x1 * cellSize;
      const y1 = margin + a.y1 * cellSize;
      const x2 = margin + a.x2 * cellSize;
      const y2 = margin + a.y2 * cellSize;
      drawArrow(ctx, x1, y1, x2, y2, colorHex(a.color), a.style || "move");
    });
  }

  global.TeachingMarks = {
    COLORS: COLORS,
    MARK_TYPES: MARK_TYPES,
    colorHex: colorHex,
    paintMark: paintMark,
    paintAllMarks: paintAllMarks,
    paintArrows: paintArrows,
    drawArrow: drawArrow,
    drawStar: drawStar
  };
})(window);
