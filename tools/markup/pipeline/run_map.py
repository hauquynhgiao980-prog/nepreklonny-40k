import json, sys, numpy as np, cv2
from PIL import Image, ImageDraw
sys.path.insert(0, '.')
from rooms import *

def run(spec, out_png=None):
    sm, (W, H) = load(spec['img'])
    if all('poly' in r for r in spec['rooms']):
        polys = [{'name': r['name'], 'poly': r['poly'], 'area': 0} for r in spec['rooms']]
        return polys
    if 'floor' in spec:
        from clf import train_predict
        import os
        cache = spec['img'] + '.p.npy'
        if os.path.exists(cache) and not spec.get('retrain'): pr = np.load(cache)
        else: pr = train_predict(sm, spec['floor'], spec['wall']); np.save(cache, pr)
        bar = (pr < spec.get('pthr', 0.5)).astype(np.uint8)
        bar = cv2.morphologyEx(bar, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    else:
        bar = barrier_mask(sm, spec.get('thr', 28), spec.get('dil', 1))
    cuts = [d['seg'] for d in spec.get('doors', [])] + spec.get('cuts', []) + [w['seg'] for w in spec.get('windows', [])]
    ext = spec.get('cut_ext', 48)
    def extend(sg):
        x1, y1, x2, y2 = sg[:4]; L = max(1e-6, ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** .5)
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        return [x1 - ux * ext, y1 - uy * ext, x2 + ux * ext, y2 + uy * ext]
    bar = draw_lines(bar, [extend(c) for c in cuts], 1, spec.get('cutw', 3))
    for r in spec.get('force_floor', []):  # прямоугольники, которые точно пол
        x0, y0, x1, y1 = [int(v / S) for v in r]; bar[y0:y1, x0:x1] = 0
    for r in spec.get('force_wall', []):
        x0, y0, x1, y1 = [int(v / S) for v in r]; bar[y0:y1, x0:x1] = 1
    polys = []
    for room in spec['rooms']:
        if 'poly' in room:
            polys.append({'name': room['name'], 'poly': room['poly'], 'area': 0}); continue
        reg = None
        for sd in room['seeds']:
            r = fill_room(bar, sd, room.get('smooth', spec.get('smooth', 2)))
            reg = r if reg is None else (reg | r)
        if room.get('close'):
            k = np.ones((room['close'], room['close']), np.uint8); reg = cv2.morphologyEx(reg, cv2.MORPH_CLOSE, k)
        reg = ndi.binary_fill_holes(reg).astype(np.uint8)
        P = rectify(contour(reg, room.get('eps', spec.get('eps', 2.5))), room.get('tol', spec.get('tol', 14)), spec.get('min_len', 24))
        polys.append({'name': room['name'], 'poly': P.tolist(), 'area': float(reg.sum())})
    if out_png:
        im = Image.open(spec['img']).convert('RGB')
        sc = spec.get('view', 0.25)
        im = im.resize((int(W * sc), int(H * sc)))
        d = ImageDraw.Draw(im)
        for p in polys:
            pts = [(x * sc, y * sc) for x, y in p['poly']]
            d.line(pts + [pts[0]], fill=(0, 255, 0), width=2)
        for dd in spec.get('doors', []):
            x1, y1, x2, y2 = dd['seg']; d.line([(x1 * sc, y1 * sc), (x2 * sc, y2 * sc)], fill=(255, 0, 255), width=4)
        for ww in spec.get('windows', []):
            x1, y1, x2, y2 = ww['seg']; d.line([(x1 * sc, y1 * sc), (x2 * sc, y2 * sc)], fill=(0, 200, 255), width=4)
        im.save(out_png)
    return polys

if __name__ == '__main__':
    spec = json.load(open(sys.argv[1]))
    polys = run(spec, sys.argv[2])
    for p in polys: print(p['name'], len(p['poly']), int(p['area']))
    json.dump(polys, open(sys.argv[1].replace('.spec.json', '.polys.json'), 'w'))
