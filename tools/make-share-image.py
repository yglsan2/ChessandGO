#!/usr/bin/env python3
"""Génère images/share.png pour les aperçus Open Graph."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "images" / "share.png"


def font(size: int):
    for name in (
        "segoeui.ttf",
        "SegoeUI.ttf",
        "arial.ttf",
        "DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    w, h = 1200, 630
    img = Image.new("RGB", (w, h), "#121526")
    draw = ImageDraw.Draw(img)

    # Fond atmosphère
    for i in range(18):
        y = int(h * i / 18)
        shade = 18 + i * 2
        draw.rectangle((0, y, w, y + h // 18 + 2), fill=(shade, shade + 4, shade + 18))

    # Goban stylisé
    board = (210, 176, 110)
    bx, by, bs = 120, 140, 360
    draw.rounded_rectangle((bx, by, bx + bs, by + bs), radius=18, fill=board)
    margin = 28
    step = (bs - 2 * margin) / 8
    for i in range(9):
        x = bx + margin + i * step
        y = by + margin + i * step
        draw.line((bx + margin, y, bx + bs - margin, y), fill=(40, 30, 20), width=2)
        draw.line((x, by + margin, x, by + bs - margin), fill=(40, 30, 20), width=2)
    for gx, gy in ((2, 2), (2, 6), (6, 2), (6, 6), (4, 4)):
        cx = bx + margin + gx * step
        cy = by + margin + gy * step
        draw.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=(30, 24, 16))
    # Pierres
    for gx, gy, color in ((3, 3, (20, 20, 22)), (5, 4, (245, 245, 245)), (4, 5, (20, 20, 22))):
        cx = bx + margin + gx * step
        cy = by + margin + gy * step
        r = 18
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)

    # Échiquier stylisé
    cx0, cy0, cs = 720, 160, 320
    light, dark = (235, 210, 160), (120, 85, 50)
    cell = cs / 8
    for row in range(8):
        for col in range(8):
            x0 = cx0 + col * cell
            y0 = cy0 + row * cell
            draw.rectangle((x0, y0, x0 + cell, y0 + cell), fill=light if (row + col) % 2 == 0 else dark)

    title = font(64)
    sub = font(28)
    draw.text((120, 40), "Social Board", fill=(245, 248, 255), font=title)
    draw.text((120, 520), "Échecs & Go — jouez avec vos amis", fill=(180, 190, 220), font=sub)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"OK {OUT} ({OUT.stat().st_size} octets)")


if __name__ == "__main__":
    main()
