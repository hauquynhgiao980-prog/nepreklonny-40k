"""Полигоны комнат + двери/окна/препятствия → стены Foundry; проверочный рендер."""
import json, math, sys, numpy as np
from PIL import Image, ImageDraw

def seg_sub(a, b, door, band=28, shrink=0):
    """Вычесть из отрезка ab часть, лежащую вдоль двери (в полосе band)."""
    (x1, y1, x2, y2) = door[:4]
    dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy); ux, uy = dx / L, dy / L
    def proj(p): return ((p[0] - x1) * ux + (p[1] - y1) * uy, -(p[0] - x1) * uy + (p[1] - y1) * ux)
    ta, na = proj(a); tb, nb = proj(b)
    if abs(na) > band or abs(nb) > band: return [(a, b)]
    lo, hi = shrink, L - shrink
    # параметризация вдоль ab
    out = []
    if abs(tb - ta) < 1e-6: return [(a, b)] if not (lo <= ta <= hi) else []
    def at(t):  # точка на ab с проекцией t
        s = (t - ta) / (tb - ta); return (a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s)
    t0, t1 = sorted((ta, tb))
    pieces = []
    if t0 < lo: pieces.append((t0, min(t1, lo)))
    if t1 > hi: pieces.append((max(t0, hi), t1))
    for p0, p1 in pieces:
        if p1 - p0 > 6: out.append((at(p0), at(p1)))
    return out

def build(spec, polys):
    doors = spec.get('doors', []); wins = spec.get('windows', [])
    cut = doors + wins
    walls = []
    for p in polys:
        P = p['poly']; n = len(P)
        for i in range(n):
            segs = [(tuple(P[i]), tuple(P[(i + 1) % n]))]
            for d in cut:
                nxt = []
                for a, b in segs: nxt += seg_sub(a, b, d['seg'], d.get('band', 28))
                segs = nxt
            for a, b in segs:
                if math.hypot(b[0] - a[0], b[1] - a[1]) >= 8:
                    walls.append({'c': [round(a[0]), round(a[1]), round(b[0]), round(b[1])], 'kind': 'wall'})
    for d in doors:
        walls.append({'c': [round(v) for v in d['seg']], 'kind': 'door', 'name': d['name'], 'locked': d.get('locked', False), 'secret': d.get('secret', False)})
    for w in wins:
        walls.append({'c': [round(v) for v in w['seg']], 'kind': w.get('kind', 'window'), 'name': w.get('name', '')})
    for o in spec.get('extra', []):  # дополнительные отрезки: {'pts': [...], 'kind': 'wall'|'limited'|'window'|'invisible', 'closed': bool}
        pts = o['pts']; m = len(pts)
        rng = range(m) if o.get('closed') else range(m - 1)
        for i in rng:
            a, b = pts[i], pts[(i + 1) % m]
            walls.append({'c': [round(a[0]), round(a[1]), round(b[0]), round(b[1])], 'kind': o.get('kind', 'wall')})
    return walls

COL = {'wall': (0, 255, 0), 'invisible': (150, 150, 255), 'door': (255, 0, 255), 'window': (0, 200, 255), 'limited': (255, 200, 0), 'glass': (0, 200, 255)}
def render(img, walls, out, sc=0.33, lights=(), sounds=(), regions=()):
    im = Image.open(img).convert('RGB'); W, H = im.size
    im = im.resize((int(W * sc), int(H * sc))); d = ImageDraw.Draw(im, 'RGBA')
    for r in regions:
        pts = [(x * sc, y * sc) for x, y in zip(r['pts'][0::2], r['pts'][1::2])]
        d.polygon(pts, fill=(255, 255, 255, 40), outline=(255, 255, 255, 200))
    for w in walls:
        x1, y1, x2, y2 = w['c']; c = COL.get(w['kind'], (255, 255, 255))
        if w['kind'] == 'door' and w.get('locked'): c = (255, 60, 60)
        d.line([(x1 * sc, y1 * sc), (x2 * sc, y2 * sc)], fill=c, width=4 if w['kind'] == 'door' else 2)
        d.ellipse([x1 * sc - 2, y1 * sc - 2, x1 * sc + 2, y1 * sc + 2], fill=c)
    for l in lights:
        r = l['dim'] * 128 / 5 * sc
        d.ellipse([l['x'] * sc - r, l['y'] * sc - r, l['x'] * sc + r, l['y'] * sc + r], outline=(255, 255, 0, 120))
        d.ellipse([l['x'] * sc - 4, l['y'] * sc - 4, l['x'] * sc + 4, l['y'] * sc + 4], fill=(255, 255, 0))
    for s in sounds:
        r = s['radius'] * 128 / 5 * sc
        d.ellipse([s['x'] * sc - r, s['y'] * sc - r, s['x'] * sc + r, s['y'] * sc + r], outline=(80, 160, 255, 160))
        d.rectangle([s['x'] * sc - 4, s['y'] * sc - 4, s['x'] * sc + 4, s['y'] * sc + 4], fill=(80, 160, 255))
    im.save(out)

if __name__ == '__main__':
    spec = json.load(open(sys.argv[1])); polys = json.load(open(sys.argv[1].replace('.spec.json', '.polys.json')))
    walls = build(spec, polys)
    json.dump(walls, open(sys.argv[1].replace('.spec.json', '.walls.json'), 'w'))
    render(spec['img'], walls, sys.argv[2], spec.get('view', 0.33))
    print(len(walls), 'walls')
