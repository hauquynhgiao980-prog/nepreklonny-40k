"""Цепной топор: свой глиф (в game-icons его нет) — лезвие с цепью зубьев, мотор у обуха, рукоять с обмоткой."""
import math, sys
sys.path.insert(0, "/home/claude/icongen")
from system import icon

def bez(p0, p1, p2, p3, t):
    u = 1 - t
    return tuple(u**3*a + 3*u*u*t*b + 3*u*t*t*c + t**3*d for a, b, c, d in zip(p0, p1, p2, p3))

def glyph():
    E = [(372, 84), (448, 136), (462, 292), (372, 360)]       # режущая кромка
    teeth = []
    n = 13
    for i in range(n):
        t = 0.04 + 0.92 * i / (n - 1)
        x, y = bez(*E, t); x2, y2 = bez(*E, min(1, t + 0.01))
        tx, ty = x2 - x, y2 - y; L = math.hypot(tx, ty); tx, ty = tx / L, ty / L
        nx, ny = ty, -tx                                       # наружу (вправо от хода сверху вниз)
        if nx < 0: nx, ny = -nx, -ny
        a = (x - tx * 10, y - ty * 10); b = (x + tx * 10, y + ty * 10); c = (x + nx * 22 + tx * 6, y + ny * 22 + ty * 6)
        teeth.append(f"M{a[0]:.1f},{a[1]:.1f} L{c[0]:.1f},{c[1]:.1f} L{b[0]:.1f},{b[1]:.1f} Z")
    track = "M362,112 C420,158 430,284 362,334"
    vents = "".join(f'<rect x="{x}" y="318" width="7" height="44" rx="3" fill="url(#disc)"/>' for x in (236, 252, 268))
    wraps = "".join(f'<rect x="240" y="{y}" width="32" height="7" fill="url(#disc)"/>' for y in range(470, 572, 20))
    return f'''<g filter="url(#sh)"><g transform="translate(250 262) rotate(34) scale(.72) translate(-322 -347)">
<path d="M238,124 L160,150 L178,176 L238,186 Z" fill="url(#gl)"/>
<rect x="240" y="96" width="32" height="500" rx="12" fill="url(#gl)"/>
<path d="M262,112 L372,84 C448,136 462,292 372,360 L262,330 Z" fill="url(#gl)"/>
<path d="{''.join(teeth)}" fill="url(#gl)"/>
<path d="{track}" fill="none" stroke="url(#disc)" stroke-width="9" stroke-dasharray="16 9" stroke-linecap="round"/>
<rect x="222" y="300" width="68" height="76" rx="10" fill="url(#gl)" stroke="url(#disc)" stroke-width="6"/>
{vents}{wraps}
<rect x="230" y="584" width="52" height="26" rx="9" fill="url(#gl)"/>
</g></g>'''

def chainaxe_svg(pal):
    return icon("item", pal, []).replace("</svg>", glyph() + "</svg>")
