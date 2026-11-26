"""Внешние (обычные) стены: дальняя кромка стен локации и середина перегородок между комнатами.
Пол комнат обводится невидимыми стенами (только движение): видно до дальней кромки стены, зайти на стену нельзя."""
import json, math, sys, numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, '.')
from rooms import rectify, S
from assemble import seg_sub, render

def structure(img, thr=22):
    im = np.asarray(Image.open(img).convert('RGB')).astype(np.float32)
    H, W = im.shape[:2]
    sm = cv2.resize(im, (W // S, H // S), interpolation=cv2.INTER_AREA)
    m = (sm.max(axis=2) > thr).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return ndi.binary_fill_holes(m).astype(np.uint8), (W, H)

def labels(polys, struct):
    h, w = struct.shape; lab = np.zeros((h, w), np.int32)
    for i, p in enumerate(polys):
        pts = np.round(np.array(p['poly']) / S).astype(np.int32)
        cv2.fillPoly(lab, [pts], i + 1)
    st = (struct | (lab > 0)).astype(bool)
    _, (iy, ix) = ndi.distance_transform_edt(lab == 0, return_indices=True)
    near = lab[iy, ix]; near[~st] = 0
    # убрать обрывки, не связанные со своей комнатой
    out = np.zeros_like(near)
    for i in range(1, len(polys) + 1):
        n, cc = cv2.connectedComponents((near == i).astype(np.uint8))
        core = cc[lab == i]
        keep = np.bincount(core[core > 0]).argmax() if (core > 0).any() else 0
        if keep: out[cc == keep] = i
    return out

def label_polys(lab, n, eps=3.2, tol=16, min_len=44):
    res = []
    for i in range(1, n + 1):
        m = (lab == i).astype(np.uint8)
        if not m.any(): continue
        k = np.ones((7, 7), np.uint8)
        m = cv2.morphologyEx(cv2.morphologyEx(m, cv2.MORPH_CLOSE, k), cv2.MORPH_OPEN, k)
        cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        c = max(cs, key=cv2.contourArea)
        ap = cv2.approxPolyDP(c, eps, True)[:, 0, :].astype(float)
        # точки на краю растра — ровно на край карты
        hh, ww = m.shape
        ap[:, 0] = np.where(ap[:, 0] <= 1, 0, np.where(ap[:, 0] >= ww - 2, ww, ap[:, 0]))
        ap[:, 1] = np.where(ap[:, 1] <= 1, 0, np.where(ap[:, 1] >= hh - 2, hh, ap[:, 1]))
        res.append(rectify(ap * S, tol, min_len))
    return res

def build(m, thr=22):
    spec = json.load(open(f'{m}.spec.json')); polys = json.load(open(f'{m}.polys.json'))
    struct, (W, H) = structure(spec['img'], spec.get('void_thr', thr))
    lab = labels(polys, struct)
    outers = label_polys(lab, len(polys))
    doors = spec.get('doors', []); wins = spec.get('windows', [])
    walls = []
    # невидимые: кромка пола (без проёмов дверей и окон)
    for p in polys:
        P = p['poly']; n = len(P)
        for i in range(n):
            segs = [(tuple(P[i]), tuple(P[(i + 1) % n]))]
            for d in doors + wins:
                segs = [s for a, b in segs for s in seg_sub(a, b, d['seg'], d.get('band', 28))]
            walls += [{'c': [round(a[0]), round(a[1]), round(b[0]), round(b[1])], 'kind': 'invisible'} for a, b in segs if math.hypot(b[0] - a[0], b[1] - a[1]) >= 8]
    # обычные: контуры долей комнат, общие кромки — один раз, проёмы дверей вырезаны
    normal = []
    for P in outers:
        n = len(P)
        for i in range(n):
            segs = [(tuple(P[i]), tuple(P[(i + 1) % n]))]
            for d in doors:
                segs = [s for a, b in segs for s in seg_sub(a, b, d['seg'], 40)]
            for q in normal:
                segs = [s for a, b in segs for s in seg_sub(a, b, q, 16)]
            for a, b in segs:
                if math.hypot(b[0] - a[0], b[1] - a[1]) >= 12: normal.append([a[0], a[1], b[0], b[1]])
    walls += [{'c': [round(v) for v in q], 'kind': 'wall'} for q in normal]
    for d in doors:
        walls.append({'c': [round(v) for v in d['seg']], 'kind': 'door', 'name': d['name'], 'locked': d.get('locked', False), 'open': d.get('open', False)})
    for w in wins:
        walls.append({'c': [round(v) for v in w['seg']], 'kind': w.get('kind', 'window'), 'name': w.get('name', '')})
    for o in spec.get('extra', []):
        pts = o['pts']; k = len(pts)
        for i in (range(k) if o.get('closed') else range(k - 1)):
            a, b = pts[i], pts[(i + 1) % k]
            walls.append({'c': [round(a[0]), round(a[1]), round(b[0]), round(b[1])], 'kind': o.get('kind', 'wall')})
    json.dump(walls, open(f'{m}.walls.json', 'w'))
    json.dump([p.tolist() for p in outers], open(f'{m}.outer.json', 'w'))
    np.save(f'{m}.labels.npy', lab)
    render(spec['img'], walls, f'{m}_v2.png', spec.get('view', 0.33))
    from collections import Counter
    print(m, Counter(w['kind'] for w in walls))

if __name__ == '__main__':
    for m in sys.argv[1:]: build(m)
