"""Процедурная разметка: заливка комнат от затравок, барьеры — тёмные швы и линии дверей."""
import json, math, sys, numpy as np, cv2
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

S = 4  # масштаб анализа: 1 px = 4 px карты (32 px на клетку)

def load(path):
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    h, w = im.shape[:2]
    return cv2.resize(im, (w // S, h // S), interpolation=cv2.INTER_AREA), (w, h)

def barrier_mask(sm, thr, dil=1):
    lum = sm.max(axis=2)
    b = (lum < thr).astype(np.uint8)
    b = cv2.morphologyEx(b, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    if dil: b = cv2.dilate(b, np.ones((2 * dil + 1, 2 * dil + 1), np.uint8))
    return b

def draw_lines(mask, segs, val=1, width=2):
    img = Image.fromarray(mask); d = ImageDraw.Draw(img)
    for s in segs:
        x1, y1, x2, y2 = [v / S for v in s[:4]]
        d.line([(x1, y1), (x2, y2)], fill=val, width=width)
    return np.asarray(img).copy()

def fill_room(bar, seed, smooth=2):
    h, w = bar.shape
    ff = bar.copy() * 255
    m = np.zeros((h + 2, w + 2), np.uint8)
    sx, sy = int(seed[0] / S), int(seed[1] / S)
    if bar[sy, sx]:
        ok = False
        for r in range(1, 8):
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    if 0 <= sy + dy < h and 0 <= sx + dx < w and not bar[sy + dy, sx + dx]:
                        sx, sy, ok = sx + dx, sy + dy, True; break
                if ok: break
            if ok: break
        if not ok: return np.zeros_like(bar)
    cv2.floodFill(ff, m, (sx, sy), 128, flags=4)
    reg = (ff == 128).astype(np.uint8)
    reg = ndi.binary_fill_holes(reg).astype(np.uint8)
    if smooth:
        k = np.ones((2 * smooth + 1, 2 * smooth + 1), np.uint8)
        reg = cv2.morphologyEx(reg, cv2.MORPH_CLOSE, k)
        reg = cv2.morphologyEx(reg, cv2.MORPH_OPEN, k)
        reg = ndi.binary_fill_holes(reg).astype(np.uint8)
    # самая большая связная часть
    n, lab = cv2.connectedComponents(reg)
    if n > 2:
        sizes = [(lab == i).sum() for i in range(1, n)]
        reg = (lab == 1 + int(np.argmax(sizes))).astype(np.uint8)
    return reg

def contour(reg, eps=1.5):
    cs, _ = cv2.findContours(reg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)
    ap = cv2.approxPolyDP(c, eps, True)[:, 0, :].astype(float) * S
    return ap

def snap(poly, tol_deg=8, grid=8):
    """Почти горизонтальные и вертикальные стороны выпрямить."""
    P = poly.copy(); n = len(P)
    for it in range(2):
        for i in range(n):
            a, b = P[i], P[(i + 1) % n]
            dx, dy = b[0] - a[0], b[1] - a[1]
            ang = abs(math.degrees(math.atan2(dy, dx))) % 180
            if ang < tol_deg or ang > 180 - tol_deg:
                y = round((a[1] + b[1]) / 2 / grid) * grid; P[i][1] = y; P[(i + 1) % n][1] = y
            elif abs(ang - 90) < tol_deg:
                x = round((a[0] + b[0]) / 2 / grid) * grid; P[i][0] = x; P[(i + 1) % n][0] = x
    # убрать вырожденные точки
    out = []
    for p in P:
        if not out or abs(p[0] - out[-1][0]) + abs(p[1] - out[-1][1]) > 4: out.append(p)
    if len(out) > 2 and abs(out[0][0] - out[-1][0]) + abs(out[0][1] - out[-1][1]) <= 4: out.pop()
    return np.array(out)

def _line_isect(p, d, q, e):
    den = d[0] * e[1] - d[1] * e[0]
    if abs(den) < 1e-9: return None
    t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den
    return (p[0] + d[0] * t, p[1] + d[1] * t)

def rectify(poly, tol=14, min_len=20, grid=4):
    """Стороны → направления 0/45/90/135°, вершины — пересечения соседних прямых."""
    P = [tuple(p) for p in poly]
    for _ in range(3):
        n = len(P)
        if n < 3: return np.array(P)
        L = []
        for i in range(n):
            a, b = P[i], P[(i + 1) % n]
            dx, dy = b[0] - a[0], b[1] - a[1]
            ln = math.hypot(dx, dy)
            ang = math.degrees(math.atan2(dy, dx))
            sn = round(ang / 45) * 45
            if abs(((ang - sn + 180) % 360) - 180) <= tol: ang = sn
            r = math.radians(ang)
            m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            L.append([m, (math.cos(r), math.sin(r)), ln, ang])
        # слить соседние стороны одного направления
        merged = []
        for l in L:
            if merged and abs(((l[3] - merged[-1][3] + 180) % 360) - 180) < 1:
                pm = merged[-1]; w1, w2 = pm[2], l[2]
                m = ((pm[0][0] * w1 + l[0][0] * w2) / (w1 + w2), (pm[0][1] * w1 + l[0][1] * w2) / (w1 + w2))
                merged[-1] = [m, pm[1], w1 + w2, pm[3]]
            else: merged.append(l)
        if len(merged) > 1 and abs(((merged[0][3] - merged[-1][3] + 180) % 360) - 180) < 1:
            pm, l = merged.pop(), merged[0]; w1, w2 = pm[2], l[2]
            merged[0] = [((pm[0][0] * w1 + l[0][0] * w2) / (w1 + w2), (pm[0][1] * w1 + l[0][1] * w2) / (w1 + w2)), l[1], w1 + w2, l[3]]
        n = len(merged); Q = []
        for i in range(n):
            a, b = merged[i - 1], merged[i]
            x = _line_isect(a[0], a[1], b[0], b[1])
            if x is None or math.hypot(x[0] - b[0][0], x[1] - b[0][1]) > 4 * (b[2] + a[2]):
                x = b[0]
            Q.append((round(x[0] / grid) * grid, round(x[1] / grid) * grid))
        # убрать короткие стороны
        R = []
        for q in Q:
            if R and math.hypot(q[0] - R[-1][0], q[1] - R[-1][1]) < min_len: continue
            R.append(q)
        if len(R) > 2 and math.hypot(R[0][0] - R[-1][0], R[0][1] - R[-1][1]) < min_len: R.pop()
        P = R
    return np.array(P, dtype=float)
