"""Иконки врагов и NPC акта I: медальоны умений («умение», бронза) и квадраты вещей («предмет», сталь).
Цвет: Хаос — кроваво-красный, машины корабля — холодное железо, свои — цвет происхождения."""
import glob, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, "/home/claude/icongen")
from system import icon
from style import render
from palettes import ITEM, CLASS
sys.path.insert(0, str(Path(__file__).parent))
from chainaxe_glyph import chainaxe_svg

CHAOS = dict(bg="#2b0b0e", hi="#7a1c1c", accent="#f28a6b")
MACHINE = dict(bg="#17262b", hi="#3d5d66", accent="#a6d4dc")
OWN = CLASS["origin"]
def gi(n):
    f = sorted(glob.glob(f"/home/claude/game-icons/*/{n}.svg"), key=lambda p: (0 if "/lorc/" in p else 1 if "/delapouite/" in p else 2))
    return f[0].split("/")[-2] + "/" + n

# ключ файла: (название в листе, вид, палитра, глиф, коробка)
ICONS = {
    "cult_dark_gods": ("Ради Тёмных Богов", "feature", CHAOS, "candle-skull", 250),
    "cult_mob": ("Толпа", "feature", CHAOS, "minions", 250),
    "cult_knife": ("Ритуальный нож", "item", ITEM["weapon"], "dripping-knife", 300),
    "cult_rags": ("Лоскутная броня", "item", ITEM["armor"], "leather-vest", 280),
    "shooter_multi": ("Мультиатака", "feature", CHAOS, "bullets", 250),
    "shooter_drill": ("Выучка Гвардии", "feature", CHAOS, "crosshair", 250),
    "shooter_suppress": ("Подавляющий огонь", "feature", CHAOS, "bullet-impacts", 250),
    "shooter_bayonet": ("Штык-нож", "item", ITEM["weapon"], "bayonet", 300),
    "leader_bloodlust": ("Жажда крови", "feature", CHAOS, "enrage", 250),
    "leader_blood": ("Кровь для Тёмных богов", "feature", CHAOS, "chalice-drops", 250),
    "leader_scorn": ("Презрение к колдовству", "feature", CHAOS, "shield-reflect", 250),
    "leader_axe": ("Цепной топор", "item", ITEM["weapon"], None, 0),   # свой глиф: tools/chainaxe_glyph.py
    "leader_armor": ("Шипастая броня", "item", ITEM["armor"], "spiked-armor", 280),
    "turret_burst": ("Очередь", "feature", MACHINE, "sentry-gun", 250),
    "turret_motion": ("Бьёт по движению", "feature", MACHINE, "radar-sweep", 250),
    "turret_disarm": ("Как обезвредить", "feature", MACHINE, "unplugged", 250),
    "skull_record": ("Запись допроса", "feature", MACHINE, "scroll-quill", 250),
    "varro_limp": ("Хромает", "feature", OWN, "broken-bone", 250),
    "varro_icon": ("Образок паствы", "feature", OWN, "sheep", 250),
}
OUT = Path("/home/claude/nepreklonny-40k/icons/gen/act1")
SVG = Path("/home/claude/icongen/act1")
def main(sheet, only=None):
    tiles = []
    for key, (name, kind, pal, glyph, box) in ICONS.items():
        if only and key not in only: continue
        svg = chainaxe_svg(pal) if glyph is None else icon(kind, pal, [(gi(glyph), box, 0, 0)])
        im = render(svg, 256)
        SVG.mkdir(exist_ok=True); (SVG / f"{key}.svg").write_text(svg)
        im.convert("RGB").save(OUT / f"{key}.webp", "WEBP", quality=90, method=6)
        tiles.append((name, im))
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
    cw, ch, per = 170, 175, 7
    rows = (len(tiles) + per - 1) // per
    S = Image.new("RGB", (per * cw + 20, rows * ch + 20), "#1e1c1a"); dr = ImageDraw.Draw(S)
    for i, (name, im) in enumerate(tiles):
        x = 10 + (i % per) * cw; y = 10 + (i // per) * ch; t = im.resize((128, 128), Image.LANCZOS); S.paste(t, (x + 21, y + 4), t)
        dr.text((x + (cw - dr.textlength(name, font=font)) / 2, y + 140), name, font=font, fill="#f1e6cf")
    S.save(sheet)
if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:] or None)
