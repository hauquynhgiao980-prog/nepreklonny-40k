"""Иконки способностей Нерождённого: медальон «умение» (бронза), цвет варпа."""
import glob, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, "/home/claude/icongen")
from system import icon
from style import render

WARP = dict(bg="#24082f", hi="#6d2690", accent="#e3a6ff")
def gi(n):
    f = sorted(glob.glob(f"/home/claude/game-icons/*/{n}.svg"), key=lambda p: (0 if "/lorc/" in p else 1 if "/delapouite/" in p else 2))
    return f[0].split("/")[-2] + "/" + n

ICONS = {  # ключ файла: (название способности, глиф, коробка)
    "multiattack": ("Мультиатака", "claws", 246),
    "claw": ("Коготь", "claw-slashes", 246),
    "word": ("Слово", "screaming", 250),
    "anchors": ("Якоря", "chained-heart", 240),
    "legendary": ("Легендарные действия", "portal", 240),
    "lair": ("Логово: разлом", "lightning-branches", 250),
    "tactics": ("Тактика", "eye-target", 246),
}
OUT = Path("/home/claude/nepreklonny-40k/icons/gen/act1")
def main(sheet, alts=None):
    items = list(ICONS.items())
    if alts: items = [(f"alt_{n}", (n, n, 246)) for n in alts]
    tiles = []
    for key, (name, glyph, box) in items:
        svg = icon("feature", WARP, [(gi(glyph), box, 0, 0)])
        im = render(svg, 256)
        if not alts:
            (Path("/home/claude/icongen/unborn") / f"unborn_{key}.svg").write_text(svg)
            im.convert("RGB").save(OUT / f"unborn_{key}.webp", "WEBP", quality=90, method=6)
        tiles.append((name, im))
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    cw, ch = 170, 175
    S = Image.new("RGB", (len(tiles) * cw + 20, ch + 20), "#1e1c1a"); dr = ImageDraw.Draw(S)
    for i, (name, im) in enumerate(tiles):
        x = 10 + i * cw; t = im.resize((128, 128), Image.LANCZOS); S.paste(t, (x + 21, 14), t)
        dr.text((x + (cw - dr.textlength(name, font=font)) / 2, 150), name, font=font, fill="#f1e6cf")
    S.save(sheet)
if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:] or None)
