"""Пиксельный классификатор пол/стена: признаки цвета и текстуры, RandomForest по прямоугольникам-подсказкам."""
import numpy as np, cv2
from sklearn.ensemble import RandomForestClassifier
S = 4
def feats(sm):
    f = []
    rgb = sm / 255.0
    hsv = cv2.cvtColor(sm.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32) / 255.0
    lum = rgb.max(axis=2)
    f += [rgb[..., i] for i in range(3)] + [hsv[..., 1], hsv[..., 2]]
    for k in (3, 7, 15):
        m = cv2.blur(lum, (k, k)); m2 = cv2.blur(lum * lum, (k, k))
        f += [m, np.sqrt(np.maximum(m2 - m * m, 0))]
        for c in range(3): f.append(cv2.blur(rgb[..., c], (k, k)))
    gx = cv2.Sobel(lum, cv2.CV_32F, 1, 0); gy = cv2.Sobel(lum, cv2.CV_32F, 0, 1)
    g = np.sqrt(gx * gx + gy * gy)
    for k in (5, 11): f.append(cv2.blur(g, (k, k)))
    # доля тёмного вокруг
    dark = (lum < 0.12).astype(np.float32)
    for k in (5, 11, 21): f.append(cv2.blur(dark, (k, k)))
    return np.stack(f, -1)

def train_predict(sm, floor_rects, wall_rects, n=20000):
    F = feats(sm); h, w, d = F.shape
    X, Y = [], []
    rng = np.random.default_rng(0)
    for lab, rects in ((1, floor_rects), (0, wall_rects)):
        for r in rects:
            x0, y0, x1, y1 = [int(v / S) for v in r]
            blk = F[y0:y1, x0:x1].reshape(-1, d)
            if len(blk) > 3000: blk = blk[rng.choice(len(blk), 3000, replace=False)]
            X.append(blk); Y.append(np.full(len(blk), lab))
    lum = sm.max(axis=2)
    vd = F[lum < 15]
    if len(vd): vd = vd[rng.choice(len(vd), min(3000, len(vd)), replace=False)]; X.append(vd); Y.append(np.zeros(len(vd)))
    X = np.concatenate(X); Y = np.concatenate(Y)
    clf = RandomForestClassifier(n_estimators=60, max_depth=14, n_jobs=2, random_state=0).fit(X, Y)
    p = clf.predict_proba(F.reshape(-1, d))[:, 1].reshape(h, w)
    return cv2.GaussianBlur(p.astype(np.float32), (5, 5), 0)
