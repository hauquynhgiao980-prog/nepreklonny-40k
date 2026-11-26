"""Обычные стены сплошными прямыми: каждую кромку пола отодвигаем наружу до чёрного верха стены
(медиана по всей длине кромки, так что непрокрашенные места не рвут стену), между комнатами без чёрного —
посередине, у края карты — по краю. Соседние отодвинутые кромки сводим в углы."""
import json, math, sys, numpy as np, cv2
from PIL import Image
from matplotlib.path import Path
sys.path.insert(0, '.')
from rooms import S
from outer import blacktops
from assemble import seg_sub, render

def isect(p, d, q, e):
    den = d[0] * e[1] - d[1] * e[0]
    if abs(den) < 1e-9: return None
    t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den
    return (p[0] + d[0] * t, p[1] + d[1] * t)

def offsets(poly, k, black, lab, W, H, dmax=300, step=4):
    P = poly; n = len(P); path = Path(P); out = []
    for i in range(n):
        a, b = np.array(P[i], float), np.array(P[(i + 1) % n], float)
        L = np.linalg.norm(b - a)
        if L < 1: out.append((a, b, 0.0)); continue
        u = (b - a) / L; nv = np.array([u[1], -u[0]])
        mid = (a + b) / 2
        if path.contains_point(mid + nv * 6): nv = -nv
        hits = []
        for t in np.arange(0.1, 0.91, max(0.05, 16 / L)):
            p = a + (b - a) * t
            for d in range(step, dmax, step):
                q = p + nv * d; x, y = int(q[0] / S), int(q[1] / S)
                if q[0] < 0 or q[1] < 0 or q[0] >= W or q[1] >= H:
                    hits.append(min(d, max(0, (W - p[0]) if nv[0] > .5 else p[0] if nv[0] < -.5 else (H - p[1]) if nv[1] > .5 else p[1]))); break
                if black[y, x]: hits.append(d - step / 2); break
                if lab[y, x] and lab[y, x] != k: hits.append(d / 2); break
        d = float(np.median(hits)) if len(hits) >= max(2, 0.4 * len(np.arange(0.1, 0.91, max(0.05, 16 / L)))) else 0.0
        out.append((a + nv * d, b + nv * d, d))
    return out

def chain(segs):
    """Свести соседние отрезки в углы: продолжить до пересечения или соединить ступенькой."""
    n = len(segs); A = [s[0].copy() for s in segs]; B = [s[1].copy() for s in segs]
    res = []
    for i in range(n):
        j = (i + 1) % n
        d1 = B[i] - A[i]; d2 = B[j] - A[j]
        x = isect(A[i], d1, A[j], d2)
        lim = 3 * max(segs[i][2], segs[j][2]) + 60
        if x is not None and np.linalg.norm(np.array(x) - B[i]) < lim and np.linalg.norm(np.array(x) - A[j]) < lim:
            B[i] = np.array(x); A[j] = np.array(x)
    for i in range(n):
        res.append((A[i], B[i]))
        j = (i + 1) % n
        if np.linalg.norm(B[i] - A[j]) > 2: res.append((B[i], A[j]))
    return res

def extend_doors(doors, normal, reach=140):
    out = []
    for d in doors:
        x1, y1, x2, y2 = d['seg']; p, q = np.array([x1, y1], float), np.array([x2, y2], float)
        u = (q - p) / np.linalg.norm(q - p)
        def cast(o, dirv):
            best = None
            for s in normal:
                a, b = np.array(s[:2], float), np.array(s[2:], float); e = b - a
                den = dirv[0] * e[1] - dirv[1] * e[0]
                if abs(den) < 1e-9: continue
                w = a - o; t = (w[0] * e[1] - w[1] * e[0]) / den; s2 = (w[0] * dirv[1] - w[1] * dirv[0]) / den
                if 0 <= t <= reach and -0.01 <= s2 <= 1.01 and (best is None or t < best): best = t
            return best
        tq = cast(q, u); tp = cast(p, -u)
        if tq: q = q + u * tq
        if tp: p = p - u * tp
        out.append({**d, 'seg': [float(p[0]), float(p[1]), float(q[0]), float(q[1])]})
    return out

def build(m):
    spec = json.load(open(f'{m}.spec.json')); polys = json.load(open(f'{m}.polys.json'))
    im = np.asarray(Image.open(spec['img']).convert('RGB')).astype(np.float32)
    H, W = im.shape[:2]
    sm = cv2.resize(im, (W // S, H // S), interpolation=cv2.INTER_AREA)
    black = blacktops(sm, spec.get('black_thr', 9))
    lab = np.zeros(black.shape, np.int32)
    for i, p in enumerate(polys): cv2.fillPoly(lab, [np.round(np.array(p['poly']) / S).astype(np.int32)], i + 1)
    doors = spec.get('doors', []); wins = spec.get('windows', [])
    walls, normal = [], []
    for k, p in enumerate(polys, 1):
        P = p['poly']; n = len(P)
        # невидимые — кромка пола
        for i in range(n):
            segs = [(tuple(P[i]), tuple(P[(i + 1) % n]))]
            for d in doors + wins: segs = [s for a, b in segs for s in seg_sub(a, b, d['seg'], d.get('band', 28))]
            walls += [{'c': [round(a[0]), round(a[1]), round(b[0]), round(b[1])], 'kind': 'invisible'} for a, b in segs if math.hypot(b[0] - a[0], b[1] - a[1]) >= 8]
        # обычные — та же кромка, отодвинутая до чёрного верха
        for a, b in chain(offsets(P, k, black, lab, W, H, spec.get('dmax', 300))):
            a = (min(max(a[0], 0), W), min(max(a[1], 0), H)); b = (min(max(b[0], 0), W), min(max(b[1], 0), H))
            segs = [(a, b)]
            for d in doors: segs = [s for x, y in segs for s in seg_sub(x, y, d['seg'], 36)]
            for q in normal: segs = [s for x, y in segs for s in seg_sub(x, y, q, 10)]
            for x, y in segs:
                if math.hypot(y[0] - x[0], y[1] - x[1]) >= 10: normal.append([x[0], x[1], y[0], y[1]])
    walls += [{'c': [round(v) for v in q], 'kind': 'wall'} for q in normal]
    for d in extend_doors(doors, normal):
        walls.append({'c': [round(v) for v in d['seg']], 'kind': 'door', 'name': d['name'], 'locked': d.get('locked', False), 'open': d.get('open', False)})
    for w in wins: walls.append({'c': [round(v) for v in w['seg']], 'kind': w.get('kind', 'window'), 'name': w.get('name', '')})
    for o in spec.get('extra', []):
        pts = o['pts']; kk = len(pts)
        for i in (range(kk) if o.get('closed') else range(kk - 1)):
            a, b = pts[i], pts[(i + 1) % kk]
            walls.append({'c': [round(a[0]), round(a[1]), round(b[0]), round(b[1])], 'kind': o.get('kind', 'wall')})
    json.dump(walls, open(f'{m}.walls.json', 'w'))
    # для света: всё внутри обычных стен считается помещением
    vis = np.zeros(black.shape, np.uint8)
    np.save(f'{m}.labels.npy', ((1 - black) * (cv2.dilate((lab > 0).astype(np.uint8), np.ones((61, 61), np.uint8)))).astype(np.int32))
    render(spec['img'], walls, f'{m}_v3.png', spec.get('view', 0.33))
    from collections import Counter
    print(m, Counter(w['kind'] for w in walls))

if __name__ == '__main__':
    for m in sys.argv[1:]: build(m)
