import sys
from PIL import Image, ImageDraw, ImageFont
src, x0, y0, x1, y1, out = sys.argv[1], *map(int, sys.argv[2:6]), sys.argv[6]
sc = float(sys.argv[7]) if len(sys.argv) > 7 else 1.0
im = Image.open(src).convert('RGB').crop((x0, y0, x1, y1))
d = ImageDraw.Draw(im)
step = 32
for x in range((x0 // step + 1) * step, x1, step):
    c = (0, 255, 255) if x % 128 == 0 else (0, 110, 110)
    if x % 64 == 0 or x % 128 == 0: d.line([(x - x0, 0), (x - x0, y1 - y0)], fill=c, width=1)
    if x % 128 == 0: d.text((x - x0 + 2, 2), str(x), fill=(255, 255, 0))
for y in range((y0 // step + 1) * step, y1, step):
    c = (0, 255, 255) if y % 128 == 0 else (0, 110, 110)
    if y % 64 == 0 or y % 128 == 0: d.line([(0, y - y0), (x1 - x0, y - y0)], fill=c, width=1)
    if y % 128 == 0: d.text((2, y - y0 + 2), str(y), fill=(255, 255, 0))
if sc != 1: im = im.resize((int(im.width * sc), int(im.height * sc)))
im.save(out)
