"""Процедурный свет: ищем на арте светящиеся пятна (красные лампы, тёплые лампы и свечи, зелёные экраны)."""
import json, math, sys, numpy as np, cv2
from PIL import Image
from matplotlib.path import Path

KINDS = {
  'red':    dict(color='#ff2b1c', dim=15, bright=4, alpha=0.32, anim=('pulse', 2, 3)),
  'warm':   dict(color='#ffc46b', dim=20, bright=7, alpha=0.25, anim=('torch', 2, 2)),
  'candle': dict(color='#ff9f40', dim=10, bright=3, alpha=0.22, anim=('flame', 4, 3)),
  'green':  dict(color='#3cff86', dim=8, bright=2, alpha=0.25, anim=('pulse', 1, 1)),
}

def detect(img, S=4):
    im = np.asarray(Image.open(img).convert('RGB')).astype(np.float32)
    h, w = im.shape[:2]
    sm = cv2.resize(im, (w // S, h // S), interpolation=cv2.INTER_AREA)
    R, G, B = sm[..., 0], sm[..., 1], sm[..., 2]
    masks = {
      'red': (R > 200) & (G < 120) & (B < 120) & (R - G > 110),
      'warm': (R > 225) & (G > 170) & (B < 175) & (R - B > 70),
      'green': (G > 170) & (R < 150) & (G - R > 60) & (G - B > 30),
    }
    out = []
    for k, m in masks.items():
        m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        m = cv2.dilate(m, np.ones((5, 5), np.uint8))
        n, lab, st, cen = cv2.connectedComponentsWithStats(m)
        for i in range(1, n):
            a = st[i, cv2.CC_STAT_AREA]
            if a < (10 if k != 'green' else 14): continue
            x, y = cen[i] * S
            out.append({'kind': k, 'x': float(x), 'y': float(y), 'area': int(a)})
    return out

def merge(lights, dist=110):
    lights = sorted(lights, key=lambda l: -l['area']); res = []
    for l in lights:
        for r in res:
            if r['kind'] == l['kind'] and math.hypot(r['x'] - l['x'], r['y'] - l['y']) < dist:
                r['area'] += l['area']; break
        else: res.append(dict(l))
    return res

def inside_any(polys, x, y):
    return any(Path(p).contains_point((x, y)) for p in polys)

def pull_inside(polys, x, y, inset=24):
    """Если точка вне комнат — ближайшая точка на границе ближайшей комнаты, сдвинутая внутрь."""
    if inside_any(polys, x, y): return x, y, 0
    best = None
    for P in polys:
        n = len(P)
        for i in range(n):
            ax, ay = P[i]; bx, by = P[(i + 1) % n]
            dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy or 1
            t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / L2))
            px, py = ax + dx * t, ay + dy * t; d = math.hypot(x - px, y - py)
            if best is None or d < best[0]: best = (d, px, py, P)
    d, px, py, P = best
    # шаг внутрь: пробуем направление от точки к ближайшей
    vx, vy = px - x, py - y; L = math.hypot(vx, vy) or 1
    qx, qy = px + vx / L * inset, py + vy / L * inset
    if not Path(P).contains_point((qx, qy)):
        cx, cy = np.mean([p[0] for p in P]), np.mean([p[1] for p in P])
        vx, vy = cx - px, cy - py; L = math.hypot(vx, vy) or 1; qx, qy = px + vx / L * inset, py + vy / L * inset
    return qx, qy, d

LAB = {}
def run(spec_path, polys_path):
    import os
    lp = spec_path.replace('.spec.json', '.labels.npy')
    if os.path.exists(lp): LAB[spec_path] = np.load(lp)
    spec = json.load(open(spec_path)); polys = [p['poly'] for p in json.load(open(polys_path))]
    L = merge(detect(spec['img']), spec.get('merge', 150))
    for r in spec.get('light_exclude', []):
        L = [l for l in L if not (r[0] <= l['x'] <= r[2] and r[1] <= l['y'] <= r[3])]
    def bdist(x, y):
        best = 1e9
        for P in polys:
            n = len(P)
            for i in range(n):
                ax, ay = P[i]; bx, by = P[(i + 1) % n]
                dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy or 1
                t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / L2))
                best = min(best, math.hypot(x - ax - dx * t, y - ay - dy * t))
        return best
    L = [l for l in L if l['kind'] == 'green' or bdist(l['x'], l['y']) < spec.get('near_wall', 230) or not inside_any(polys, l['x'], l['y'])]
    out = []
    for l in L:
        k = l['kind']
        if k == 'warm' and l['area'] < spec.get('candle_area', 60): k = 'candle'
        lab = LAB.get(spec_path)
        if lab is not None and lab[min(lab.shape[0] - 1, int(l['y'] / 4)), min(lab.shape[1] - 1, int(l['x'] / 4))] > 0:
            x, y, moved = l['x'], l['y'], 0      # лампа на стене: внутренняя стена теперь невидимая, свет не гасит
        else:
            x, y, moved = pull_inside(polys, l['x'], l['y'])
        if moved > spec.get('max_pull', 260): continue
        cfg = dict(KINDS[k])
        if k in ('red', 'warm') and l['area'] > 200: cfg['dim'] = int(cfg['dim'] * 1.4); cfg['bright'] = int(cfg['bright'] * 1.4)
        out.append({'kind': k, 'x': round(x), 'y': round(y), **cfg})
    for e in spec.get('lights_extra', []):
        out = [o for o in out if math.hypot(o['x'] - e['x'], o['y'] - e['y']) > 170]
    for r in spec.get('light_exclude_kind', []):
        out = [o for o in out if not (o['kind'] == r[0] and r[1] <= o['x'] <= r[3] and r[2] <= o['y'] <= r[4])]
    for e in spec.get('lights_extra', []): out.append(e)
    return out

if __name__ == '__main__':
    sys.path.insert(0, '.')
    from assemble import render
    m = sys.argv[1]
    spec = json.load(open(f'{m}.spec.json'))
    L = run(f'{m}.spec.json', f'{m}.polys.json')
    json.dump(L, open(f'{m}.lights.json', 'w'))
    walls = json.load(open(f'{m}.walls.json'))
    render(spec['img'], walls, f'{m}_lights.png', spec.get('view', 0.33), lights=L)
    from collections import Counter
    print(m, len(L), Counter(l['kind'] for l in L))
