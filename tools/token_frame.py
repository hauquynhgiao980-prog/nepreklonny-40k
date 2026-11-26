"""Токены NPC и врагов: портрет в круге (внутренний радиус как у прегенов — 148 из 200) + процедурная рамка."""
import numpy as np, sys, json
from PIL import Image, ImageDraw, ImageFilter
N = 1600; C = N / 2; K = N / 400          # рисуем в 4×, потом 400
RIN, ROUT = 148 * K, 186 * K
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
r = np.hypot(xx - C, yy - C); ang = np.arctan2(yy - C, xx - C)

def ring_rgba(style):
    t = np.clip((r - RIN) / (ROUT - RIN), 0, 1)
    light = 0.72 + 0.28 * np.cos(ang + np.deg2rad(135))          # свет слева сверху
    bevel = 1 - 0.55 * (2 * t - 1) ** 2                          # выпуклость кольца
    if style == "chaos":   base = np.array([62, 46, 40]); edge = np.array([120, 24, 18])
    elif style == "warp":  base = np.array([52, 40, 56]); edge = np.array([150, 60, 200])
    elif style == "naval": base = np.array([96, 92, 86]); edge = np.array([170, 128, 62])
    else:                  base = np.array([78, 76, 74]); edge = np.array([40, 38, 36])
    rng = np.random.default_rng(3); grain = rng.normal(0, 1, (N, N)).astype(np.float32)
    from scipy.ndimage import gaussian_filter
    grain = gaussian_filter(grain, 2.5); grain /= grain.std()
    col = base[None, None, :] * (light * bevel)[..., None] * (1 + 0.08 * grain[..., None])
    # внутренняя кромка
    inner = (r >= RIN) & (r < RIN + 5 * K)
    col[inner] = edge
    outer = (r > ROUT - 4 * K) & (r <= ROUT)
    col[outer] = col[outer] * 0.45
    a = ((r >= RIN) & (r <= ROUT)).astype(np.float32)
    img = np.dstack([np.clip(col, 0, 255), a * 255]).astype(np.uint8)
    im = Image.fromarray(img, "RGBA"); d = ImageDraw.Draw(im)
    rm = (RIN + ROUT) / 2
    if style in ("chaos", "warp"):       # восемь стрелок наружу — знак, но рядовой: узкие и тёмные
        for k in range(8):
            a0 = k * np.pi / 4 - np.pi / 2
            tip = (C + np.cos(a0) * (ROUT + 13 * K), C + np.sin(a0) * (ROUT + 13 * K))
            b1 = (C + np.cos(a0 - 0.045) * (ROUT - 1 * K), C + np.sin(a0 - 0.045) * (ROUT - 1 * K))
            b2 = (C + np.cos(a0 + 0.045) * (ROUT - 1 * K), C + np.sin(a0 + 0.045) * (ROUT - 1 * K))
            d.polygon([tip, b1, b2], fill=(92, 30, 24, 255) if style == "chaos" else (96, 44, 130, 255), outline=(24, 10, 8, 255))
        for k in range(16):
            a0 = k * np.pi / 8 + np.pi / 16
            x, y = C + np.cos(a0) * rm, C + np.sin(a0) * rm
            d.ellipse([x - 4 * K, y - 4 * K, x + 4 * K, y + 4 * K], fill=(28, 20, 18, 255))
    else:                      # заклёпки
        n = 12 if style == "convict" else 16
        for k in range(n):
            a0 = k * 2 * np.pi / n
            x, y = C + np.cos(a0) * rm, C + np.sin(a0) * rm
            col1 = (180, 172, 160, 255) if style == "convict" else (206, 160, 84, 255)
            d.ellipse([x - 5 * K, y - 5 * K, x + 5 * K, y + 5 * K], fill=(30, 28, 26, 255))
            d.ellipse([x - 4 * K, y - 4 * K, x + 3 * K, y + 3 * K], fill=col1)
        if style == "convict":  # табличка с номером внизу
            w, h = 40 * K, 20 * K; y0 = C + rm - h / 2
            d.rounded_rectangle([C - w, y0, C + w, y0 + h], radius=3 * K, fill=(196, 160, 36, 255), outline=(30, 28, 26, 255), width=int(2 * K))
            for i in range(-3, 4):
                x = C + i * 12 * K
                d.polygon([(x - 4 * K, y0 + h), (x + 4 * K, y0), (x + 9 * K, y0), (x + 1 * K, y0 + h)], fill=(30, 28, 26, 255))
    return im

def token(src, cx, cy, side, style, out, label=None):
    p = Image.open(src).convert("RGB")
    crop = p.crop((int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2))).resize((int(2 * RIN), int(2 * RIN)), Image.LANCZOS)
    canvas = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    m = Image.new("L", crop.size, 0); ImageDraw.Draw(m).ellipse([0, 0, crop.size[0] - 1, crop.size[1] - 1], fill=255)
    canvas.paste(crop, (int(C - RIN), int(C - RIN)), m)
    # внутренняя тень от рамки
    sh = Image.new("L", (N, N), 0); ImageDraw.Draw(sh).ellipse([C - RIN, C - RIN, C + RIN, C + RIN], outline=255, width=int(10 * K))
    sh = sh.filter(ImageFilter.GaussianBlur(10 * K))
    shadow = Image.new("RGBA", (N, N), (0, 0, 0, 0)); shadow.putalpha(sh.point(lambda v: int(v * 0.8)))
    inside = Image.new("L", (N, N), 0); ImageDraw.Draw(inside).ellipse([C - RIN, C - RIN, C + RIN, C + RIN], fill=255)
    shadow.putalpha(Image.fromarray(np.minimum(np.asarray(shadow.split()[3]), np.asarray(inside))))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(ring_rgba(style))
    canvas.resize((400, 400), Image.LANCZOS).save(out, "WEBP", quality=90, method=6)

if __name__ == "__main__":
    for j in json.load(open(sys.argv[1])):
        token(**j)
        print(j["out"])
