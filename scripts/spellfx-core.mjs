/* Непреклонный: эффекты заклинаний и сил на шейдерах PIXI.
   Три стиля: варп (псайкер), свет Императора (исповедник, комиссар), машина (техножрец, плазма и разряды).
   Виды: снаряд, луч, удар по разуму, столп пламени, лечение, оберег, область, метка, призыв, на себя.
   Чистый PIXI 7, как движок стрельбы: слои, клетка и время приходят снаружи. */
import { VERT, NOISE, rng, rgb, prog as wprog, quadMesh } from "./weaponfx-core.mjs";

const PIXI = globalThis.PIXI;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = x => Math.max(0, Math.min(1, x));
const ease = k => 1 - Math.pow(1 - k, 3);
const env = (k, a = 0.12, b = 0.35) => (k < a ? k / a : k > 1 - b ? (1 - k) / b : 1);   // нарастание — держать — гаснуть

/* ─────────────────────────── шейдеры ─────────────────────────── */

/* Сфера-снаряд с хвостом: x вдоль полёта, голова в 0.78 длины. */
const ORB_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor; uniform vec3 uHot; uniform float uTime; uniform float uSeed; uniform float uAlpha; uniform float uTail;
${NOISE}
void main() {
  vec2 p = vec2((vUv.x - 0.78) / 0.22, vUv.y * 2.0 - 1.0);
  float r = length(p), ang = atan(p.y, p.x);
  float sw = fbm(vec2(ang * 1.6 + uTime * 7.0 + uSeed * 10.0, r * 3.0 - uTime * 5.0));
  float core = exp(-r * r * 7.0);
  float glow = exp(-r * r * 1.5) * (0.55 + 0.6 * sw);
  float tx = clamp(-p.x / 3.5, 0.0, 1.0);
  float tail = step(p.x, 0.0) * exp(-p.y * p.y / (0.08 + 0.5 * (1.0 - tx))) * (1.0 - tx) * uTail
             * (0.45 + 0.55 * n2(vec2(p.x * 3.0 + uTime * 22.0, p.y * 4.0 + uSeed * 9.0)));
  float a = (core * 1.5 + glow * 0.75 + tail * 0.85) * uAlpha;
  vec3 col = mix(uColor, uHot, clamp(core * 1.3 + tail * 0.15, 0.0, 1.0));
  gl_FragColor = vec4(col * a, a);
}`;

/* Кольцо: ударная волна, круги по разуму, ореол. uR — радиус (0..1 квада), uW — толщина. */
const RING_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor; uniform vec3 uHot; uniform float uR; uniform float uW; uniform float uFill; uniform float uNoise;
uniform float uTime; uniform float uSeed; uniform float uAlpha;
${NOISE}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p), ang = atan(p.y, p.x);
  float d = r - uR + (n2(vec2(ang * 3.0 + uSeed * 10.0, uTime * 2.0 + r * 4.0)) - 0.5) * uNoise;
  float ring = exp(-d * d / (uW * uW));
  float fill = uFill * (1.0 - smoothstep(uR * 0.15, uR, r)) * 0.4;
  float a = (ring + fill) * uAlpha * smoothstep(1.0, 0.93, r);
  vec3 col = mix(uColor, uHot, clamp(ring * 0.75, 0.0, 1.0));
  gl_FragColor = vec4(col * a, a);
}`;

/* Пламя сверху: священное пламя, раскалённый металл, разрыв варпа. Языки идут из центра наружу. */
const FLARE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor; uniform vec3 uHot; uniform float uTime; uniform float uSeed; uniform float uAlpha; uniform float uRays;
${NOISE}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p), ang = atan(p.y, p.x);
  float f = fbm(vec2(ang * 2.2 + uSeed * 7.0, r * 3.5 - uTime * 4.5));
  float f2 = fbm(vec2(ang * 5.0 - uSeed * 3.0, r * 6.0 - uTime * 7.0));
  float tongues = smoothstep(0.42, 0.95, f + 0.55 - r * 0.9) * (0.6 + 0.4 * f2);
  float core = exp(-r * r * 16.0);
  float body = exp(-r * r * 3.4) * (0.45 + 0.9 * f);
  float rays = pow(abs(cos(ang * uRays * 0.5 + uSeed * 6.28)), 18.0) * exp(-r * 2.2) * 0.5;
  float a = (core * 1.6 + body * 0.9 + tongues * 0.7 * exp(-r * 1.2) + rays) * uAlpha * smoothstep(1.0, 0.82, r);
  vec3 col = mix(uColor, uHot, clamp(core * 1.2 + body * 0.35, 0.0, 1.0));
  gl_FragColor = vec4(col * a, a);
}`;

/* Купол-щит: соты, яркий край, волна мерцания. */
const DOME_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor; uniform vec3 uHot; uniform float uSweep; uniform float uTime; uniform float uAlpha; uniform float uScale;
const vec2 s = vec2(1.0, 1.7320508);
float hexd(vec2 p) { p = abs(p); return max(dot(p, s * 0.5), p.x); }
vec2 hexl(vec2 p) {
  vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float inside = 1.0 - smoothstep(0.9, 0.94, r);
  vec2 q = p * uScale / sqrt(max(0.05, 1.0 - min(r * r, 0.95)));   // соты гуще к краю — купол
  float e = smoothstep(0.4, 0.5, hexd(hexl(q)));
  float rim = smoothstep(0.55, 0.9, r) * inside;
  float wave = exp(-pow((r - uSweep) * 7.0, 2.0));
  float a = (e * (0.18 + wave * 0.9) * inside + rim * 0.75 + wave * 0.2 * inside) * uAlpha;
  vec3 col = mix(uColor, uHot, clamp(wave + rim * 0.3, 0.0, 1.0));
  gl_FragColor = vec4(col * a, a);
}`;

/* Гипнотический узор: спираль переливающихся цветов. */
const SPIRAL_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime; uniform float uAlpha; uniform float uSeed;
${NOISE}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p), ang = atan(p.y, p.x);
  float v = sin(ang * 5.0 + r * 16.0 - uTime * 5.0 + fbm(p * 3.0 + uSeed) * 3.0);
  vec3 col = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + r * 0.8 - uTime * 0.25));
  float a = smoothstep(0.1, 1.0, v) * 0.55 * uAlpha * (1.0 - smoothstep(0.75, 1.0, r));
  gl_FragColor = vec4(col * a, a);
}`;

let progs = null;
function prog() {
  progs ??= {
    orb: PIXI.Program.from(VERT, ORB_FRAG, "nk-sfx-orb"),
    ring: PIXI.Program.from(VERT, RING_FRAG, "nk-sfx-ring"),
    flare: PIXI.Program.from(VERT, FLARE_FRAG, "nk-sfx-flare"),
    dome: PIXI.Program.from(VERT, DOME_FRAG, "nk-sfx-dome"),
    spiral: PIXI.Program.from(VERT, SPIRAL_FRAG, "nk-sfx-spiral"),
  };
  return progs;
}

/* ───────────────────────────── палитры ───────────────────────────── */

export const PALETTES = {
  warp:    { c: 0x9a2cff, hot: 0xf2dcff, alt: 0x3ad6ff, dark: 0x14001f, sound: "warp" },
  psychic: { c: 0xe03cff, hot: 0xffe6ff, alt: 0x7a5cff, dark: 0x1a0020, sound: "psy" },
  frost:   { c: 0x4aaeff, hot: 0xf0fbff, alt: 0xbfe8ff, dark: 0x02121f, sound: "frost" },
  holy:    { c: 0xffb830, hot: 0xfff7d8, alt: 0xffffff, dark: 0x2a1a00, sound: "holy" },
  smite:   { c: 0xff7a1e, hot: 0xfff0c8, alt: 0xffd060, dark: 0x2a0800, sound: "holy" },
  heal:    { c: 0xffcf5a, hot: 0xfffbe8, alt: 0x9cffb0, dark: 0x1a1400, sound: "heal" },
  death:   { c: 0x7f9a86, hot: 0xd8f0e0, alt: 0x3a4a3e, dark: 0x050806, sound: "toll" },
  plasma:  { c: 0xff5a10, hot: 0xfff2d0, alt: 0xffb040, dark: 0x200600, sound: "fire" },
  volt:    { c: 0x38c8ff, hot: 0xeafaff, alt: 0x8fe6ff, dark: 0x001018, sound: "zap" },
  thunder: { c: 0xa8c8ff, hot: 0xffffff, alt: 0x6a8ab8, dark: 0x0a0e18, sound: "boom" },
  mech:    { c: 0xff3a2a, hot: 0xffe0d0, alt: 0x38c8ff, dark: 0x1a0402, sound: "zap" },
  steel:   { c: 0xc8d4e6, hot: 0xffffff, alt: 0x8090a0, dark: 0x101418, sound: "blade" },
  power:   { c: 0x3aa8ff, hot: 0xeaf8ff, alt: 0x9fe0ff, dark: 0x001020, sound: "blade" },
  chain:   { c: 0xffa040, hot: 0xfff2d8, alt: 0xff5a10, dark: 0x1a0800, sound: "chain" },
  claw:    { c: 0xd8284e, hot: 0xffd6e0, alt: 0x9a1a6a, dark: 0x1a0008, sound: "blade" },
  blunt:   { c: 0xffd8a8, hot: 0xffffff, alt: 0x8a7a68, dark: 0x1a140e, sound: "blunt" },
  frag:    { c: 0xff8a2a, hot: 0xfff6e0, alt: 0xffc060, dark: 0x2a2420, sound: "boom" },
};

/** Ближний бой: палитра, число дуг, радиус (доли токена цели), время замаха, толщина, особенности. */
export const MELEE = {
  sword: { P: "steel", arcs: 1, rad: 1.4, swing: 150, width: 0.075, span: 1.0 },
  power: { P: "power", arcs: 1, rad: 1.45, swing: 150, width: 0.085, span: 1.05, crackle: true },
  chain: { P: "chain", arcs: 1, rad: 1.4, swing: 230, width: 0.085, span: 0.95, teeth: 1, sparks: true, gore: 1.6 },
  chainaxe: { P: "chain", arcs: 1, rad: 1.4, swing: 260, width: 0.09, span: 0.95, teeth: 1, sparks: true, gore: 2 },
  axe: { P: "steel", arcs: 1, rad: 1.45, swing: 210, width: 0.085, span: 1.1, gore: 1.4 },
  knife: { P: "steel", thrust: 2, reach: 1.1, width: 0.035 },
  spear: { P: "steel", thrust: 1, reach: 1.9, width: 0.045 },
  blunt: { P: "blunt", arcs: 1, rad: 1.0, swing: 190, width: 0.08, span: 0.7, blunt: true },
  claw: { P: "claw", arcs: 3, rad: 1.3, swing: 140, width: 0.06, span: 0.9, gap: 0.32 },
  bite: { P: "claw", arcs: 2, rad: 0.9, swing: 120, width: 0.05, span: 0.8, gap: 0.5, bite: true },
  fist: { P: "blunt", fist: true },
};

/* ───────────────────────────── движок ───────────────────────────── */

export class SpellFX {
  /** @param {{fxLayer:PIXI.Container, underLayer?:PIXI.Container, grid:number, audio?:{volume:number}, onHit?:function}} o */
  constructor({ fxLayer, underLayer = null, decalLayer = null, grid, audio = null, onHit = null, blood = true }) {
    this.fx = fxLayer; this.under = underLayer || fxLayer; this.decals = decalLayer; this.g = grid; this.audio = audio; this.onHit = onHit; this.blood = blood;
    this.time = 0; this.items = []; this.events = []; this.particles = [];
    this.pg = new PIXI.Graphics(); this.pg.blendMode = PIXI.BLEND_MODES.ADD;
    this.fx.addChild(this.pg);
  }
  destroy() { for (const it of this.items) it.mesh?.destroy({ children: true }); this.items = []; this.events = []; this.particles = []; this.pg.destroy(); }
  at(delay, fn) { this.events.push({ t: this.time + delay, fn }); }
  get busy() { return this.items.length > 0 || this.particles.length > 0 || this.events.length > 0; }

  add(mesh, life, update, layer = this.fx, index = null) {
    if (index == null) layer.addChild(mesh); else layer.addChildAt(mesh, Math.min(index, layer.children.length));
    this.items.push({ mesh, born: this.time, life, update });
    return mesh;
  }

  /* ─────── примитивы ─────── */

  light(p, color, size, life, alpha) {
    const m = quadMesh(wprog().light, { uColor: rgb(color), uT: 0, uAlpha: alpha }, p.x, p.y, size, size, 0, PIXI.BLEND_MODES.ADD);
    return this.add(m, life, (it, k) => { m.shader.uniforms.uT = k; }, this.under, 0);
  }
  flash(p, color, hot, size, life, rays = 8, ang = 0) {
    const m = quadMesh(wprog().flash, { uColor: rgb(color), uHot: rgb(hot), uT: 0, uSeed: Math.random(), uAlpha: 1, uRays: rays, uCone: 0 }, p.x, p.y, size, size, ang, PIXI.BLEND_MODES.ADD);
    return this.add(m, life, (it, k) => { m.shader.uniforms.uT = k; });
  }
  mist(p, color, size, life, alpha, seed, grow = 1.6, blend = PIXI.BLEND_MODES.NORMAL, layer = this.fx) {
    const m = quadMesh(wprog().mist, { uColor: rgb(color), uT: 0, uSeed: seed, uAlpha: alpha }, 0, 0, size, size, 0, blend);
    m.position.set(p.x, p.y);
    return this.add(m, life, (it, k) => { m.shader.uniforms.uT = k; m.scale.set(1 + (grow - 1) * Math.sqrt(k)); }, layer);
  }
  /** Кольцо: радиус растёт от r0 до r1 (в пикселях), толщина w (доля), fill — заливка внутри. */
  ring(p, P, r0, r1, life, { w = 0.06, fill = 0, noise = 0.05, alpha = 1, delay = 0, curve = ease, hot = null, layer = this.fx } = {}) {
    const go = () => {
      const S = Math.max(r0, r1) * 2.2;
      const m = quadMesh(prog().ring, { uColor: rgb(P.c), uHot: rgb(hot ?? P.hot), uR: r0 / (S / 2), uW: w, uFill: fill, uNoise: noise, uTime: 0, uSeed: Math.random(), uAlpha: alpha },
        0, 0, S, S, 0, PIXI.BLEND_MODES.ADD);
      m.position.set(p.x, p.y);
      this.add(m, life, (it, k, t) => {
        const u = m.shader.uniforms; u.uTime = t / 1000;
        u.uR = lerp(r0, r1, curve(k)) / (S / 2); u.uAlpha = alpha * (1 - k) * Math.min(1, k * 8 + 0.2);
      }, layer);
    };
    delay ? this.at(delay, go) : go();
  }
  flare(p, P, size, life, { alpha = 1, rays = 0, hold = 0.35, grow = 0.25, layer = this.fx } = {}) {
    const m = quadMesh(prog().flare, { uColor: rgb(P.c), uHot: rgb(P.hot), uTime: 0, uSeed: Math.random(), uAlpha: 0, uRays: rays }, 0, 0, size, size, 0, PIXI.BLEND_MODES.ADD);
    m.position.set(p.x, p.y);
    return this.add(m, life, (it, k, t) => {
      const u = m.shader.uniforms; u.uTime = t / 1000; u.uAlpha = alpha * env(k, 0.12, Math.max(0.2, 0.88 - hold));
      m.scale.set(1 - grow + grow * ease(Math.min(1, k * 3)));
    }, layer);
  }
  dome(p, P, radius, life, { alpha = 0.9, scale = 5 } = {}) {
    const S = radius * 2.2;
    const m = quadMesh(prog().dome, { uColor: rgb(P.c), uHot: rgb(P.hot), uSweep: 0, uTime: 0, uAlpha: 0, uScale: scale }, 0, 0, S, S, 0, PIXI.BLEND_MODES.ADD);
    m.position.set(p.x, p.y);
    return this.add(m, life, (it, k, t) => {
      const u = m.shader.uniforms; u.uTime = t / 1000; u.uSweep = lerp(0.0, 1.2, (t % 900) / 900); u.uAlpha = alpha * env(k, 0.1, 0.4);
      m.scale.set(0.85 + 0.15 * ease(Math.min(1, k * 6)));
    });
  }
  spiral(p, size, life, alpha = 1) {
    const m = quadMesh(prog().spiral, { uTime: 0, uAlpha: 0, uSeed: Math.random() }, 0, 0, size, size, 0, PIXI.BLEND_MODES.ADD);
    m.position.set(p.x, p.y);
    return this.add(m, life, (it, k, t) => { m.shader.uniforms.uTime = t / 1000; m.shader.uniforms.uAlpha = alpha * env(k, 0.15, 0.35); m.rotation = t / 2500; });
  }
  /** Сфера, летящая из a в b. curve — сдвиг середины пути (для дуги). */
  orb(a, b, P, rad, travel, { tail = 1, curve = 0, wob = 0, onArrive = null, seed = Math.random() } = {}) {
    const L = rad / 0.22, W = rad * 2.0;
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1, nx = -dy / dist, ny = dx / dist;
    const m = quadMesh(prog().orb, { uColor: rgb(P.c), uHot: rgb(P.hot), uTime: 0, uSeed: seed % 1, uAlpha: 1, uTail: tail }, 0, 0, L, W, 0, PIXI.BLEND_MODES.ADD);
    const pos = k => {
      const bend = curve * Math.sin(Math.PI * k) * dist + wob * Math.sin(k * 18 + seed * 6) * this.g * 0.12;
      return { x: a.x + dx * k + nx * bend, y: a.y + dy * k + ny * bend };
    };
    let last = pos(0);
    const lt = quadMesh(wprog().light, { uColor: rgb(P.c), uT: 0, uAlpha: 0.4 }, 0, 0, this.g * 2.4, this.g * 2.4, 0, PIXI.BLEND_MODES.ADD);
    this.add(lt, travel, (it, k) => { const q = pos(k); lt.position.set(q.x, q.y); }, this.under, 0);
    this.add(m, travel, (it, k, t) => {
      const e = k, q = pos(e), ang = Math.atan2(q.y - last.y, q.x - last.x) || Math.atan2(dy, dx);
      m.position.set(q.x - Math.cos(ang) * 0.28 * L, q.y - Math.sin(ang) * 0.28 * L); m.rotation = ang;
      m.shader.uniforms.uTime = t / 1000; last = q;
      if (Math.random() < 0.5) this.spark(q, P, ang + Math.PI, 1, 1.5, 0.03, 180);
    });
    if (onArrive) this.at(travel, onArrive);
  }
  /** Луч (шейдер стрельбы с длинным сгустком): из a в b, держится и гаснет. */
  ray(a, b, P, width, life, { grow = 160 } = {}) {
    const len = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    const m = quadMesh(wprog().beam, { uColor: rgb(P.c), uHot: rgb(P.hot), uHead: 0, uTail: -len, uTrail: 0, uTime: 0, uLen: len, uAlpha: 1, uCoreW: 0.2, uSeed: Math.random() },
      (a.x + b.x) / 2, (a.y + b.y) / 2, len, width, ang, PIXI.BLEND_MODES.ADD);
    this.add(m, life, (it, k, t) => {
      const u = m.shader.uniforms; u.uTime = t / 1000;
      u.uHead = Math.min(1, t / grow) * len + 4; u.uTail = -len;
      u.uAlpha = t < life - 220 ? 1 : (life - t) / 220;
    });
  }
  /** Молния: ломаная из a в b, перестраивается каждый кадр. */
  arc(a, b, P, life, { width = 2.4, jag = 0.18, forks = 1 } = {}) {
    const gr = new PIXI.Graphics(); gr.blendMode = PIXI.BLEND_MODES.ADD;
    this.add(gr, life, (it, k) => {
      gr.clear();
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d, n = Math.max(5, Math.round(d / (this.g * 0.18)));
      const pts = [a];
      for (let i = 1; i < n; i++) { const t = i / n, off = (Math.random() - 0.5) * d * jag * Math.sin(Math.PI * t); pts.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off }); }
      pts.push(b);
      const al = (1 - k) * (Math.random() < 0.15 ? 0.3 : 1);
      for (const [w, c, aa] of [[width * 4, P.c, 0.18], [width * 1.8, P.c, 0.55], [width * 0.7, P.hot, 1]]) {
        gr.lineStyle({ width: w, color: c, alpha: aa * al, cap: "round", join: "round" });
        gr.moveTo(pts[0].x, pts[0].y); for (const q of pts.slice(1)) gr.lineTo(q.x, q.y);
      }
      for (let f = 0; f < forks; f++) {
        const s = pts[Math.floor(pts.length * (0.3 + Math.random() * 0.5))], fa = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6, fl = d * 0.18;
        gr.lineStyle({ width: width * 0.8, color: P.hot, alpha: 0.6 * al, cap: "round" });
        gr.moveTo(s.x, s.y).lineTo(s.x + Math.cos(fa) * fl, s.y + Math.sin(fa) * fl);
      }
    });
  }
  /** Нить по разуму: волнистая линия от a к b, бежит и тает. */
  thread(a, b, P, travel, hold = 300) {
    const gr = new PIXI.Graphics(); gr.blendMode = PIXI.BLEND_MODES.ADD;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d, seed = Math.random() * 10;
    this.add(gr, travel + hold, (it, k, t) => {
      gr.clear();
      const head = Math.min(1, t / travel), fade = t > travel ? 1 - (t - travel) / hold : 1, n = 60;
      for (const [w, c, aa] of [[this.g * 0.09, P.c, 0.25], [this.g * 0.035, P.hot, 0.9]]) {
        gr.lineStyle({ width: w, color: c, alpha: aa * fade, cap: "round", join: "round" });
        for (let i = 0; i <= n * head; i++) {
          const s = i / n, amp = this.g * 0.16 * Math.sin(Math.PI * s), off = amp * Math.sin(s * 14 + t / 60 + seed);
          const x = a.x + dx * s + nx * off, y = a.y + dy * s + ny * off;
          i ? gr.lineTo(x, y) : gr.moveTo(x, y);
        }
      }
    });
  }
  /** Сигил: вращающийся круг знаков. style: holy | warp | mech. */
  sigil(p, P, radius, life, style = "holy", { alpha = 1, spin = 1 } = {}) {
    const gr = new PIXI.Graphics(); gr.blendMode = PIXI.BLEND_MODES.ADD; gr.position.set(p.x, p.y);
    const R = radius;
    const draw = () => {
      gr.lineStyle({ width: Math.max(1.5, R * 0.025), color: P.c, alpha: 0.9 }); gr.drawCircle(0, 0, R); gr.drawCircle(0, 0, R * 0.82);
      gr.lineStyle({ width: Math.max(1, R * 0.015), color: P.hot, alpha: 0.8 });
      const ticks = style === "mech" ? 24 : 16;
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * Math.PI * 2, r0 = R * 0.84, r1 = R * (i % 2 ? 0.92 : 0.98);
        gr.moveTo(Math.cos(a) * r0, Math.sin(a) * r0).lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      }
      if (style === "holy") {
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; gr.moveTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2).lineTo(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7); }
        gr.drawCircle(0, 0, R * 0.2);
        gr.beginFill(P.hot, 0.5); for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4, c = { x: Math.cos(a) * R * 0.55, y: Math.sin(a) * R * 0.55 }; gr.drawPolygon([c.x, c.y - R * 0.06, c.x + R * 0.04, c.y, c.x, c.y + R * 0.06, c.x - R * 0.04, c.y]); } gr.endFill();
      } else if (style === "warp") {
        const tri = k => [0, 1, 2].flatMap(i => { const a = -Math.PI / 2 + k + (i / 3) * Math.PI * 2; return [Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72]; });
        gr.drawPolygon(tri(0)); gr.drawPolygon(tri(Math.PI));
        gr.drawEllipse(0, 0, R * 0.3, R * 0.15); gr.beginFill(P.hot, 0.8); gr.drawCircle(0, 0, R * 0.07); gr.endFill();
      } else {
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, w = 0.12; gr.moveTo(Math.cos(a - w) * R * 0.5, Math.sin(a - w) * R * 0.5).lineTo(Math.cos(a - w) * R * 0.62, Math.sin(a - w) * R * 0.62).lineTo(Math.cos(a + w) * R * 0.62, Math.sin(a + w) * R * 0.62).lineTo(Math.cos(a + w) * R * 0.5, Math.sin(a + w) * R * 0.5); }
        gr.drawCircle(0, 0, R * 0.5); gr.drawCircle(0, 0, R * 0.18);
        gr.beginFill(P.hot, 0.7); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; gr.drawRect(Math.cos(a) * R * 0.34 - 2, Math.sin(a) * R * 0.34 - 2, i % 3 ? 4 : 2, 4); } gr.endFill();
      }
    };
    draw();
    return this.add(gr, life, (it, k, t) => { gr.rotation = spin * t / 1400; gr.alpha = alpha * env(k, 0.15, 0.4); gr.scale.set(0.7 + 0.3 * ease(Math.min(1, k * 4))); });
  }

  /* ─────── частицы ─────── */

  spark(p, P, ang, n, speed, size, life, cone = 1.2, R = Math.random) {
    for (let i = 0; i < n; i++) {
      const a = ang + (R() - 0.5) * cone, v = speed * this.g * (0.3 + R() * 0.9);
      this.particles.push({ kind: "spark", x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: this.time, life: life * (0.5 + R() * 0.8), c0: P.hot, c1: P.c, size: this.g * size * (0.5 + R()), drag: 3 });
    }
  }
  motes(p, P, n, radius, life, { up = 0.6, spread = 1, swirl = 0, size = 0.03, c = null, R = Math.random, delay = 400 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, r = radius * Math.sqrt(R()) * spread;
      this.particles.push({ kind: "mote", x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, cx: p.x, cy: p.y, swirl,
        vx: Math.cos(a) * this.g * 0.2 * (R() - 0.3), vy: -this.g * up * (0.4 + R()), born: this.time + R() * delay, life: life * (0.6 + R() * 0.6),
        c0: c ?? (R() < 0.35 ? P.hot : P.c), size: this.g * size * (0.6 + R() * 0.9), drag: 1.2 });
    }
  }
  shards(p, P, n, speed, life, R = Math.random) {
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, v = speed * this.g * (0.4 + R());
      this.particles.push({ kind: "shard", x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: R() * 6, spin: (R() - 0.5) * 12, born: this.time, life: life * (0.6 + R() * 0.6), c0: R() < 0.5 ? P.hot : P.c, size: this.g * (0.04 + R() * 0.07), drag: 2.4 });
    }
  }

  /* ─────── виды эффектов ─────── */

  /** Снаряд: одна или несколько сфер из заклинателя в цели. */
  bolt({ from, tos, P, count = 1, speed = 14, size = 0.3, curve = 0, wob = 0, R, big = false }) {
    const g = this.g;
    this.flash(from, P.c, P.hot, g * 1.1, 220, 6);
    this.light(from, P.c, g * 3, 300, 0.35);
    this.sound(P.sound, "cast");
    tos.forEach((to, ti) => {
      for (let i = 0; i < count; i++) {
        const dir = Math.atan2(to.y - from.y, to.x - from.x);
        const end = to.hit === false ? { x: to.x + Math.cos(dir) * g * 2.2 + Math.cos(dir + Math.PI / 2) * g * 0.9 * (R() < 0.5 ? 1 : -1), y: to.y + Math.sin(dir) * g * 2.2 + Math.sin(dir + Math.PI / 2) * g * 0.9 } : to;
        const dist = Math.hypot(end.x - from.x, end.y - from.y), travel = Math.max(160, dist / (speed * g) * 1000);
        const cv = count > 1 ? (i - (count - 1) / 2) * 0.35 + (R() - 0.5) * 0.1 : curve * (R() < 0.5 ? 1 : -1);
        const start = { x: from.x + Math.cos(dir) * from.r * 0.7, y: from.y + Math.sin(dir) * from.r * 0.7 };
        this.at((ti * count + i) * 120, () => this.orb(start, end, P, g * size * (big ? 1.4 : 1), travel, { curve: cv, wob, seed: R() * 100,
          onArrive: () => to.hit === false ? this.fizzle(end, P, dir) : this.impact(to, P, dir, big, R) }));
      }
    });
  }
  impact(to, P, ang, big, R = Math.random) {
    const g = this.g;
    this.flash(to, P.c, P.hot, g * (big ? 2.8 : 2.0), 300, 9, ang);
    this.flare(to, P, g * (big ? 2.4 : 1.7), 520, { rays: 9, hold: 0.1, grow: 0.5 });
    this.light(to, P.c, g * (big ? 4.5 : 3.4), 520, 0.55);
    this.ring(to, P, g * 0.2, g * (big ? 1.7 : 1.2), 460, { w: 0.05, noise: 0.08 });
    this.spark(to, P, ang + Math.PI, big ? 22 : 12, 6, 0.05, 320, 2.6, R);
    this.mist(to, P.dark, g * 1.2, 900, 0.35, R() * 50, 1.8);
    this.onHit?.(to.id, P.c);
    this.sound(P.sound, "hit");
  }
  fizzle(p, P, ang) {
    this.flash(p, P.c, P.hot, this.g * 0.7, 200, 5, ang); this.spark(p, P, ang + Math.PI, 8, 4, 0.04, 260, 2.5);
  }

  /** Лучи: подряд из заклинателя в цели (по лучу на цель или count на одну). */
  rays({ from, tos, P, count = 1, width = 0.3, R }) {
    const g = this.g;
    this.flash(from, P.c, P.hot, g * 1.1, 220, 6); this.sound(P.sound, "cast");
    let n = 0;
    tos.forEach(to => {
      for (let i = 0; i < count; i++, n++) {
        const dir = Math.atan2(to.y - from.y, to.x - from.x), start = { x: from.x + Math.cos(dir) * from.r * 0.7, y: from.y + Math.sin(dir) * from.r * 0.7 };
        const jit = (R() - 0.5) * to.r * 0.5;
        const end = to.hit === false ? { x: to.x + Math.cos(dir) * g * 2 + Math.cos(dir + 1.57) * to.r * 1.3, y: to.y + Math.sin(dir) * g * 2 + Math.sin(dir + 1.57) * to.r * 1.3 }
          : { x: to.x + Math.cos(dir + 1.57) * jit, y: to.y + Math.sin(dir + 1.57) * jit };
        this.at(n * 260, () => {
          this.ray(start, end, P, g * width, 950);
          this.light({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, P.c, Math.hypot(end.x - start.x, end.y - start.y) * 0.9, 900, 0.25);
          this.sound(P.sound, "ray");
          this.at(150, () => to.hit === false ? this.fizzle(end, P, dir) : this.impact({ ...end, id: to.id }, P, dir, false, R));
        });
      }
    });
  }

  /** Удар по разуму: нить к цели, круги вокруг головы, вспышка. spike — острый всплеск, bind — путы. */
  mind({ from, tos, P, spike = false, bind = false, whisper = false, R }) {
    const g = this.g;
    this.sigil({ x: from.x, y: from.y }, P, from.r * 1.25, 1100, "warp", { alpha: 0.7, spin: 1.6 });
    this.sound(P.sound, "cast");
    tos.forEach((to, i) => {
      const d = Math.hypot(to.x - from.x, to.y - from.y), travel = Math.min(520, 180 + d / g * 40);
      this.at(i * 140, () => this.thread(from, to, P, travel, 380));
      this.at(i * 140 + travel, () => {
        for (let k = 0; k < 3; k++) this.ring(to, P, to.r * 0.4, to.r * (1.6 + k * 0.35), 700, { w: 0.035, delay: k * 130, noise: whisper ? 0.15 : 0.04 });
        this.flash(to, P.c, P.hot, to.r * (spike ? 2.4 : 1.6), 300, spike ? 3 : 10);
        if (spike) this.shards(to, P, 14, 5, 420, R);
        if (whisper) this.mist(to, P.dark, to.r * 2.6, 1300, 0.55, R() * 50, 1.6);
        if (bind) { this.sigil(to, P, to.r * 1.35, 1900, "warp", { spin: -2 }); this.dome(to, P, to.r * 1.25, 1700, { alpha: 0.5, scale: 4 }); }
        this.onHit?.(to.id, P.c);
        this.sound(P.sound, whisper ? "whisper" : "hit");
      });
    });
  }

  /** Столп: священное пламя на цели, мертвенный звон, луч с неба. */
  pillar({ tos, P, toll = false, R }) {
    const g = this.g;
    this.sound(P.sound, "cast");
    tos.forEach((to, i) => this.at(i * 120, () => {
      this.light(to, P.c, g * 3.5, 1300, 0.55);
      this.flare(to, P, to.r * (toll ? 2.4 : 3.0), 1300, { rays: toll ? 0 : 8 });
      this.ring(to, P, to.r * 0.3, to.r * 2.2, 900, { w: 0.05, noise: toll ? 0.12 : 0.05 });
      if (toll) { this.ring(to, P, to.r * 0.3, to.r * 2.6, 1100, { w: 0.03, delay: 380 }); this.mist(to, P.dark, to.r * 3, 1600, 0.6, R() * 50, 1.5); }
      else this.motes(to, P, 26, to.r * 0.9, 1100, { up: 0.9, size: 0.035, R });
      this.onHit?.(to.id, P.c);
      this.sound(P.sound, "hit");
    }));
  }

  /** Лечение: тёплый свет, медленные кольца, искорки поднимаются. mech — синие разряды вместо золота. */
  heal({ from, tos, P, mech = false, big = false, R }) {
    const g = this.g;
    this.sound(P.sound, "cast");
    if (from && !tos.some(t => t.id === from.id)) this.sigil(from, P, from.r * 1.2, 900, mech ? "mech" : "holy", { alpha: 0.6 });
    tos.forEach((to, i) => this.at(150 + i * 110, () => {
      this.light(to, P.c, g * (big ? 4.5 : 3), 1500, 0.5);
      this.ring(to, P, to.r * 1.6, to.r * 0.5, 1100, { w: 0.05, curve: k => ease(k) });
      this.ring(to, P, to.r * 0.4, to.r * 1.5, 1200, { w: 0.04, delay: 300 });
      this.motes(to, P, big ? 44 : 30, to.r * 1.0, 1400, { up: 0.75, size: 0.032, R });
      if (mech) for (let k = 0; k < 4; k++) this.at(k * 180, () => { const a = R() * 6.28; this.arc({ x: to.x + Math.cos(a) * to.r, y: to.y + Math.sin(a) * to.r }, to, P, 160, { width: 1.8, jag: 0.35, forks: 0 }); });
      if (big) this.flare(to, P, to.r * 2.6, 1400, { rays: 12, alpha: 0.8 });
      this.sound(P.sound, "hit");
    }));
  }

  /** Оберег: купол из сот над целью, ореол, тихие искры. */
  ward({ from, tos, P, style = "holy", R }) {
    const g = this.g;
    this.sound(P.sound, "cast");
    if (from && !tos.some(t => t.id === from.id)) this.flash(from, P.c, P.hot, g * 0.9, 240, 6);
    tos.forEach((to, i) => this.at(120 + i * 100, () => {
      this.dome(to, P, to.r * 1.35, 1700, { alpha: 0.85, scale: style === "mech" ? 6 : 4.5 });
      this.sigil(to, P, to.r * 1.15, 1500, style, { alpha: 0.55 });
      this.motes(to, P, 14, to.r, 1200, { up: 0.3, size: 0.025, R });
      this.sound(P.sound, "ward");
    }));
  }

  /** Метка: прицел ауспика, раскалённый металл, кара по оружию, развеянный сигил. */
  mark({ from, tos, P, kind = "reticle", R }) {
    const g = this.g;
    this.sound(P.sound, "cast");
    if (kind === "smite" && from) { this.flare(from, P, from.r * 2.2, 700, { rays: 10, alpha: 0.9 }); this.ring(from, P, from.r * 0.4, from.r * 1.8, 600, { w: 0.05 }); }
    tos.forEach((to, i) => this.at(150 + i * 110, () => {
      if (kind === "reticle") {
        const gr = new PIXI.Graphics(); gr.blendMode = PIXI.BLEND_MODES.ADD; gr.position.set(to.x, to.y);
        const r = to.r * 1.25;
        this.add(gr, 1800, (it, k, t) => {
          gr.clear(); const sc = 1.6 - 0.6 * ease(Math.min(1, k * 4)), a = env(k, 0.08, 0.3) * (Math.floor(t / 90) % 2 || k > 0.25 ? 1 : 0.4);
          gr.lineStyle({ width: 2.2, color: P.c, alpha: a }); gr.drawCircle(0, 0, r * sc);
          for (let q = 0; q < 4; q++) { const ang = q * Math.PI / 2 + t / 900; gr.moveTo(Math.cos(ang) * r * 0.55 * sc, Math.sin(ang) * r * 0.55 * sc).lineTo(Math.cos(ang) * r * 1.25 * sc, Math.sin(ang) * r * 1.25 * sc); }
          gr.lineStyle({ width: 1.2, color: P.hot, alpha: a * 0.8 }); gr.drawCircle(0, 0, r * 0.35 * sc);
        });
        this.light(to, P.c, g * 2.2, 1600, 0.3);
      } else if (kind === "heat") {
        this.flare(to, P, to.r * 2.8, 2400, { rays: 0, alpha: 1, hold: 0.6 });
        for (let q = 0; q < 3; q++) this.ring(to, P, to.r * 0.6, to.r * 1.7, 800, { w: 0.05, delay: q * 650, noise: 0.1 });
        this.light(to, P.c, g * 3.4, 2400, 0.65);
        this.motes(to, P, 22, to.r * 0.8, 1400, { up: 0.5, size: 0.02, R, delay: 1200 });
      } else if (kind === "smite") {
        this.impact(to, P, Math.atan2(to.y - (from?.y ?? to.y), to.x - (from?.x ?? to.x - 1)), true, R);
        this.flare(to, P, to.r * 2.4, 900, { rays: 12 });
      } else if (kind === "shatter") {
        this.sigil(to, P, to.r * 1.3, 700, "warp", { spin: 3 });
        this.at(600, () => { this.shards(to, P, 26, 6, 600, R); this.flash(to, P.c, P.hot, to.r * 2.4, 260, 12); this.ring(to, P, to.r * 0.4, to.r * 2.4, 500, { w: 0.04 }); this.sound(P.sound, "hit"); });
      }
      if (kind !== "shatter" && kind !== "smite") this.sound(P.sound, "hit");
    }));
  }

  /** Область: волна от точки, пасть варпа, узор, хватка щупалец, святые стражи, сияющая волна. */
  area({ at, P, kind = "wave", radius, from = null, R }) {
    const g = this.g, Rr = radius;
    this.sound(P.sound, kind === "wave" || kind === "shatter" ? "boom" : "cast");
    if (kind === "wave" || kind === "shatter") {
      this.flash(at, P.c, P.hot, Rr * 0.8, 260, 12);
      this.light(at, P.c, Rr * 2.6, 700, 0.5);
      this.ring(at, P, g * 0.2, Rr, 520, { w: 0.07, noise: 0.06, fill: 0.4 });
      this.ring(at, P, g * 0.2, Rr * 1.15, 700, { w: 0.03, delay: 90 });
      this.mist(at, 0x3a3632, Rr * 1.4, 1400, 0.4, R() * 50, 1.5);
      this.spark(at, P, 0, 26, 8, 0.04, 420, 6.28, R);
      if (kind === "shatter") this.shards(at, P, 30, 7, 600, R);
    } else if (kind === "void") {
      const disc = new PIXI.Graphics();
      for (let q = 0; q < 14; q++) disc.beginFill(0x030006, 0.11).drawCircle(0, 0, Rr * (1.02 - q * 0.05)).endFill();
      disc.position.set(at.x, at.y);
      this.add(disc, 4200, (it, k) => { disc.alpha = env(k, 0.1, 0.25); disc.scale.set(0.6 + 0.4 * ease(Math.min(1, k * 5))); }, this.fx, 0);
      this.mist(at, P.dark, Rr * 2.1, 4200, 0.7, R() * 50, 1.15);
      this.ring(at, P, Rr * 0.95, Rr * 1.0, 4200, { w: 0.03, noise: 0.18, alpha: 0.9, curve: k => k });
      this.ring(at, P, Rr * 0.3, Rr * 0.9, 1200, { w: 0.05, noise: 0.2 });
      for (let k = 0; k < 6; k++) this.at(k * 600, () => this.motes(at, P, 10, Rr * 0.9, 1100, { up: -0.1, size: 0.03, swirl: 1.2, R, delay: 200 }));
      this.light(at, P.c, Rr * 2.4, 4200, 0.25);
    } else if (kind === "spiral") {
      this.spiral(at, Rr * 2.1, 3600, 0.9);
      this.light(at, P.c, Rr * 2.2, 3600, 0.3);
    } else if (kind === "grasp") {
      const c = from || at;
      this.mist(c, P.dark, Rr * 2.2, 1600, 0.75, R() * 50, 1.2);
      this.ring(c, P, g * 0.3, Rr, 600, { w: 0.08, noise: 0.3, fill: 0.35 });
      for (let k = 0; k < 7; k++) { const a = (k / 7) * 6.28 + R(); this.at(60 * k, () => this.arc(c, { x: c.x + Math.cos(a) * Rr, y: c.y + Math.sin(a) * Rr }, P, 520, { width: 3.2, jag: 0.3, forks: 1 })); }
    } else if (kind === "guardians") {
      const c = from || at, n = 10, life = 4200;
      this.ring(c, P, Rr * 0.95, Rr, life, { w: 0.02, alpha: 0.55, curve: k => k });
      this.light(c, P.c, Rr * 2.4, life, 0.3);
      const gr = new PIXI.Graphics(); gr.blendMode = PIXI.BLEND_MODES.ADD;
      this.add(gr, life, (it, k, t) => {
        gr.clear(); const a0 = t / 700, al = env(k, 0.1, 0.25);
        for (let i = 0; i < n; i++) {
          const a = a0 + (i / n) * 6.28, r = Rr * (0.72 + 0.08 * Math.sin(t / 300 + i));
          const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
          for (let s = 0; s < 6; s++) { const aa = a - s * 0.07; gr.beginFill(s ? P.c : P.hot, al * (1 - s / 6) * 0.8).drawCircle(c.x + Math.cos(aa) * r, c.y + Math.sin(aa) * r, g * 0.06 * (1 - s / 8)).endFill(); }
          gr.beginFill(P.hot, al * 0.35).drawCircle(x, y, g * 0.16).endFill();
        }
      });
    } else if (kind === "radiant") {
      const c = from || at;
      this.flare(c, P, Rr * 0.9, 900, { rays: 14 });
      this.ring(c, P, g * 0.3, Rr, 700, { w: 0.06, fill: 0.25 });
      this.ring(c, P, g * 0.3, Rr * 1.1, 900, { w: 0.03, delay: 160 });
      this.motes(c, P, 40, Rr * 0.8, 1300, { up: 0.6, size: 0.03, R });
      this.light(c, P.c, Rr * 2.6, 1200, 0.5);
    }
  }

  /** Призыв: сигил на месте, вспышка, искры. */
  summon({ at, P, style = "holy", R }) {
    const g = this.g;
    this.sound(P.sound, "cast");
    this.sigil(at, P, g * 0.9, 1600, style, { spin: 1.5 });
    this.at(700, () => { this.flash(at, P.c, P.hot, g * 2, 320, 10); this.light(at, P.c, g * 3.2, 800, 0.5); this.motes(at, P, 24, g * 0.6, 1100, { up: 0.8, R }); this.sound(P.sound, "hit"); });
  }

  /** На себя: развёртка ауспика, шаг через варп, тихий знак. */
  self({ from, P, kind = "glyph", R }) {
    const g = this.g;
    this.sound(P.sound, "cast");
    if (kind === "sweep") {
      const gr = new PIXI.Graphics(); gr.blendMode = PIXI.BLEND_MODES.ADD; const Rr = g * 4;
      this.add(gr, 2200, (it, k, t) => {
        gr.clear(); const a = t / 350, al = env(k, 0.1, 0.3);
        for (let s = 0; s < 14; s++) { gr.beginFill(P.c, al * 0.2 * (1 - s / 14)); gr.moveTo(from.x, from.y); gr.arc(from.x, from.y, Rr, a - s * 0.045 - 0.045, a - s * 0.045); gr.lineTo(from.x, from.y); gr.endFill(); }
        gr.lineStyle({ width: 1.5, color: P.c, alpha: al * 0.6 }); gr.drawCircle(from.x, from.y, Rr); gr.drawCircle(from.x, from.y, Rr * 0.5);
      });
      this.ring(from, P, from.r, Rr, 1100, { w: 0.02, delay: 300 });
    } else if (kind === "blink") {
      this.mist(from, P.dark, from.r * 3.2, 1400, 0.85, R() * 50, 1.4);
      this.ring(from, P, from.r * 2.2, from.r * 0.2, 450, { w: 0.06, curve: k => k * k });
      this.at(420, () => { this.flash(from, P.c, P.hot, from.r * 3, 280, 9); this.spark(from, P, 0, 20, 6, 0.04, 380, 6.28, R); });
    } else {
      this.sigil(from, P, from.r * 1.2, 1300, P === PALETTES.warp || P === PALETTES.psychic ? "warp" : P === PALETTES.volt || P === PALETTES.mech ? "mech" : "holy", { alpha: 0.7 });
      this.motes(from, P, 12, from.r * 0.8, 1000, { up: 0.5, size: 0.025, R });
    }
  }

  /* ─────── кровь, пятна, подпалины ─────── */

  gore(p, ang, n, speed, R = Math.random, big = 1) {
    if (!this.blood) return;
    const g = this.g, blood = [0xb3120f, 0x8f0a0a, 0x6a0606, 0x4c0404];
    for (let i = 0; i < n; i++) {
      const a = ang + (R() - 0.5) * 1.1, v = speed * g * (0.35 + R() * 0.9);
      this.particles.push({ kind: "drop", x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: this.time, life: 380 * (0.5 + R() * 0.8),
        c0: blood[Math.floor(R() * 4)], size: g * (i < 4 ? 0.04 : 0.022) * big * (0.45 + R() * 1.1), drag: 6.5 });
    }
    this.mist({ x: p.x + Math.cos(ang) * g * 0.25, y: p.y + Math.sin(ang) * g * 0.25 }, 0x6e0808, g * 0.9 * big, 520, 0.45, R() * 50, 1.8);
    this.splat({ x: p.x + Math.cos(ang) * g * 0.5, y: p.y + Math.sin(ang) * g * 0.5 }, ang, g * 1.1 * big, R() * 50, [0x7a0a0a, 0x2e0202], 1, 7000, 3000);
  }
  splat(p, ang, size, seed, colors, streak = 1, hold = 6000, fade = 2500) {
    if (!this.decals) return;
    const m = quadMesh(wprog().splat, { uColor: rgb(colors[0]), uDark: rgb(colors[1]), uSeed: seed, uAlpha: 0, uStreak: streak, uGrow: 0.35 }, 0, 0, size * 1.6, size, ang, PIXI.BLEND_MODES.NORMAL);
    m.position.set(p.x, p.y);
    this.add(m, hold + fade, (it, k, t) => {
      const u = m.shader.uniforms;
      u.uGrow = lerp(0.35, 1, 1 - Math.pow(1 - clamp01(t / 260), 3));
      u.uAlpha = (t < 60 ? t / 60 : t > hold ? 1 - (t - hold) / fade : 1) * 0.92;
    }, this.decals);
  }
  scorch(p, size, R = Math.random, hold = 11000) { this.splat(p, R() * 6.28, size, R() * 50, [0x2b2522, 0x0a0908], 0.15, hold, 3500); }

  /* ─────── ближний бой ─────── */

  /** Дуга росчерка: центр, радиус, углы от a0 до a1, замах swing, затем гаснет. */
  sweep(c, rad, a0, a1, swing, P, { width = 0.06, teeth = 0, sparks = false, crackle = false, fade = 200 } = {}) {
    const gr = new PIXI.Graphics(); gr.blendMode = PIXI.BLEND_MODES.ADD;
    const W = this.g * width, dir = Math.sign(a1 - a0) || 1, N = 26;
    let lastArc = 0;
    this.add(gr, swing + fade, (it, k, t) => {
      gr.clear();
      const e = ease(Math.min(1, t / swing)), head = a0 + (a1 - a0) * e, al = t <= swing ? 1 : 1 - (t - swing) / fade;
      const tail = a0 + (head - a0) * (t <= swing ? 0.05 : Math.min(1, (t - swing) / fade) * 0.9);
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const s = i / N, a = tail + (head - tail) * s, r = rad + (teeth ? ((i % 2) ? 1 : -1) * W * 0.6 : 0);
        pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, s });
      }
      for (const [mul, col, aa] of [[3.2, P.c, 0.22], [1.5, P.c, 0.6], [0.55, P.hot, 1]]) {
        for (let i = 1; i < pts.length; i++) {
          const s = pts[i].s, w = W * mul * (0.12 + 0.88 * Math.pow(s, 1.4));
          gr.lineStyle({ width: Math.max(0.8, w), color: col, alpha: aa * al * (0.25 + 0.75 * s), cap: "round" });
          gr.moveTo(pts[i - 1].x, pts[i - 1].y).lineTo(pts[i].x, pts[i].y);
        }
      }
      const hp = pts[pts.length - 1];
      if (t <= swing && sparks) this.spark(hp, P, head + dir * Math.PI / 2, 3, 5, 0.03, 260, 1.4);
      if (t <= swing + 60 && crackle && t - lastArc > 45) {
        lastArc = t; const a = head - dir * (0.2 + Math.random() * 0.5);
        this.arc(hp, { x: c.x + Math.cos(a) * rad * (0.8 + Math.random() * 0.5), y: c.y + Math.sin(a) * rad * (0.8 + Math.random() * 0.5) }, P, 120, { width: 1.6, jag: 0.4, forks: 0 });
      }
    });
  }

  /** Удар в ближнем бою. kind — из MELEE. hit — попал ли. */
  melee({ from, to, kind = "sword", hit = true, crit = false, R = Math.random }) {
    const g = this.g, K = MELEE[kind] ?? MELEE.sword, P = PALETTES[K.P];
    const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, th = Math.atan2(dy, dx);
    const side = R() < 0.5 ? 1 : -1, nx = -uy * side, ny = ux * side;
    const miss = hit ? 0 : to.r * 0.95;                                    // промах — мимо, вбок
    const tp = { x: to.x + nx * miss, y: to.y + ny * miss, r: to.r, id: to.id };
    this.sound(P.sound, kind === "chain" || kind === "chainaxe" ? "chain" : K.blunt || K.fist ? "swing-heavy" : "swing");
    if (K.fist) {
      this.at(80, () => { this.flash(tp, P.c, P.hot, to.r * 1.3, 180, 6, th); this.ring(tp, P, to.r * 0.2, to.r * 1.1, 260, { w: 0.06 }); if (hit) { this.onHit?.(to.id, 0xff7070); this.sound("blunt", "hit"); } });
      return;
    }
    if (K.thrust) {
      for (let i = 0; i < K.thrust; i++) this.at(i * 120, () => {
        const off = (R() - 0.5) * to.r * 0.5, a = { x: tp.x - ux * to.r * K.reach + nx * off * side, y: tp.y - uy * to.r * K.reach + ny * off * side };
        const b = { x: tp.x + ux * to.r * 0.35 + nx * off * 0.3, y: tp.y + uy * to.r * 0.35 + ny * off * 0.3 };
        this.ray(a, b, P, g * K.width * 2.2, 220, { grow: 70 });
        this.at(60, () => hit ? (this.gore(tp, th, crit ? 26 : 14, 5, R, 0.7), this.flash(tp, P.c, P.hot, to.r * 0.8, 140, 5, th), this.onHit?.(to.id, 0xff6a6a), this.sound("blade", "hit"))
          : (this.spark(b, P, th + Math.PI, 7, 4, 0.03, 220, 1.6, R), this.sound("blade", "parry")));
      });
      return;
    }
    const rad = to.r * K.rad * (crit ? 1.15 : 1), span = K.span;
    for (let j = 0; j < K.arcs; j++) {
      const lane = (j - (K.arcs - 1) / 2) * (K.gap ?? 0) * to.r;
      const flip = K.bite && j % 2 ? -1 : 1;
      const c = { x: tp.x - ux * rad * 0.75 + nx * lane, y: tp.y - uy * rad * 0.75 + ny * lane };
      const a0 = th - side * span * flip, a1 = th + side * span * flip;
      this.at(j * 35, () => this.sweep(c, rad, a0, a1, K.swing, P, { width: K.width * (crit ? 1.3 : 1), teeth: K.teeth, sparks: !!K.sparks, crackle: !!K.crackle }));
    }
    const tang = th + side * Math.PI / 2;                                  // куда летит кровь — по ходу росчерка
    this.at(K.swing * 0.55, () => {
      if (hit) {
        if (K.blunt) {
          this.flash(tp, P.c, P.hot, to.r * 1.8, 220, 8, th); this.ring(tp, P, to.r * 0.3, to.r * 1.6, 360, { w: 0.07, noise: 0.06 });
          this.mist(tp, 0x5a5048, to.r * 1.8, 700, 0.35, R() * 50, 1.8); this.gore(tp, th, crit ? 14 : 6, 3, R, 0.6); this.sound("blunt", "hit");
        } else {
          this.flash(tp, P.c, P.hot, to.r * 1.1, 160, 6, tang);
          this.gore(tp, tang, Math.round((crit ? 40 : 24) * (K.gore ?? 1)), 6.5, R, K.gore ?? 1);
          if (K.crackle) { this.flash(tp, P.c, P.hot, to.r * 1.8, 220, 10); this.sound("zap", "hit"); }
          this.sound("blade", "hit");
        }
        this.onHit?.(to.id, crit ? 0xff3030 : 0xff6a6a);
      } else {
        const hp = { x: tp.x - nx * to.r * 0.3, y: tp.y - ny * to.r * 0.3 };
        this.spark(hp, P.c === PALETTES.claw.c ? PALETTES.steel : P, tang + Math.PI, 10, 5, 0.035, 260, 1.8, R);
        this.sound("blade", "parry");
      }
    });
  }

  /** Брошенный нож: короткий стальной росчерк в цель. */
  knifeThrow({ from, to, hit = true, R = Math.random }) {
    const P = PALETTES.steel, th = Math.atan2(to.y - from.y, to.x - from.x);
    const end = hit ? to : { x: to.x + Math.cos(th) * this.g * 1.5 + Math.cos(th + 1.57) * to.r, y: to.y + Math.sin(th) * this.g * 1.5 + Math.sin(th + 1.57) * to.r };
    this.sound("blade", "swing");
    const dist = Math.hypot(end.x - from.x, end.y - from.y), travel = Math.max(120, dist / (this.g * 22) * 1000);
    this.orb({ x: from.x + Math.cos(th) * from.r * 0.7, y: from.y + Math.sin(th) * from.r * 0.7 }, end, P, this.g * 0.09, travel, { tail: 1.6,
      onArrive: () => hit ? (this.gore(to, th, 12, 4, R, 0.6), this.onHit?.(to.id, 0xff6a6a), this.sound("blade", "hit")) : (this.spark(end, P, th + Math.PI, 8, 4, 0.03, 240, 2, R), this.sound("blade", "parry")) });
  }

  /* ─────── гранаты ─────── */

  /** Бросок по дуге: тёмный корпус летит, тень ползёт по полу, мигает огонёк. */
  lob(from, at, travel) {
    const gr = new PIXI.Graphics(), g = this.g;
    this.add(gr, travel, (it, k, t) => {
      gr.clear();
      const x = lerp(from.x, at.x, k), y = lerp(from.y, at.y, k), h = Math.sin(Math.PI * k) * g * 1.1, sc = 1 + h / g * 0.5;
      gr.beginFill(0x000000, 0.35 * (1 - h / (g * 1.6))).drawEllipse(x, y, g * 0.09, g * 0.06).endFill();
      gr.beginFill(0x3c4232).drawCircle(x, y - h, g * 0.085 * sc).endFill();
      gr.lineStyle({ width: 2, color: 0x1a1c16 }).drawCircle(x, y - h, g * 0.085 * sc).lineStyle(0);
      gr.beginFill(0x9aa08a, 0.8).drawCircle(x - g * 0.03 * sc, y - h - g * 0.03 * sc, g * 0.025 * sc).endFill();
      if (Math.floor(t / 110) % 2) gr.beginFill(0xff2a1a).drawCircle(x + g * 0.04 * sc, y - h - g * 0.02 * sc, g * 0.018 * sc).endFill();
    });
  }

  /** Взрыв гранаты. kind: frag | smoke | melta. radius — радиус шаблона в пикселях. */
  explode({ from = null, at, radius, kind = "frag", R = Math.random }) {
    const g = this.g, dist = from ? Math.hypot(at.x - from.x, at.y - from.y) : 0;
    const travel = from ? Math.max(380, Math.min(1000, dist / (g * 9) * 1000)) : 0;
    if (from) { this.lob(from, at, travel); this.sound("blade", "swing"); }
    this.at(travel, () => {
      if (kind === "smoke") {
        this.sound("smoke", "hit");
        for (let i = 0; i < 7; i++) {
          const a = R() * 6.28, r = radius * 0.45 * Math.sqrt(R());
          this.at(i * 140, () => this.mist({ x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r }, 0x8a8a86, radius * (1.1 + R() * 0.5), 9000, 0.75, R() * 50, 1.6));
        }
        this.flash(at, 0xdddddd, 0xffffff, g * 0.8, 160, 5);
        return;
      }
      const P = kind === "melta" ? { c: 0xfff0c0, hot: 0xffffff, alt: 0x40a0ff, dark: 0x201810, sound: "boom" } : PALETTES.frag;
      this.flash(at, P.c, P.hot, radius * 1.15, 380, 14);
      this.flare(at, kind === "melta" ? { c: 0x9ad8ff, hot: 0xffffff } : PALETTES.plasma, radius * 0.95, 750, { rays: 14, hold: 0.05, grow: 0.6 });
      this.light(at, P.c, radius * 3.4, 1000, 0.75);
      this.ring(at, { c: 0xffd8a0, hot: 0xffffff }, g * 0.3, radius, 420, { w: 0.06, noise: 0.05, fill: 0.5 });
      this.ring(at, { c: 0xb0a090, hot: 0xffffff }, g * 0.3, radius * 1.25, 700, { w: 0.03, delay: 80, alpha: 0.6 });
      this.spark(at, { c: 0xff9a30, hot: 0xfff2c0 }, 0, kind === "melta" ? 30 : 70, 15, 0.034, 380, 6.28, R);
      this.shards(at, { c: 0x3a3632, hot: 0x8a8278 }, 22, 9, 520, R);
      for (let i = 0; i < 3; i++) this.at(120 + i * 160, () => { const a = R() * 6.28; this.mist({ x: at.x + Math.cos(a) * radius * 0.25, y: at.y + Math.sin(a) * radius * 0.25 }, 0x2a2622, radius * 1.4, 3800, 0.6, R() * 50, 1.8); });
      this.scorch(at, radius * 1.1, R);
      this.sound("boom", "hit");
    });
    return travel;
  }

  /* ─────── прорыв варпа ─────── */

  /** Лиловая расщелина рвёт пространство: трещина, разрыв, молнии, вихрь, в конце вспышка. */
  breach({ at, P = PALETTES.warp, duration = 10000, R = Math.random }) {
    const g = this.g, L = g * 2.8, ang = -Math.PI / 2 + (R() - 0.5) * 0.6, ca = Math.cos(ang), sa = Math.sin(ang), nx = -sa, ny = ca;
    const N = 24, jag = Array.from({ length: N + 1 }, (_, i) => (R() - 0.5) * g * 0.28 * Math.sin(Math.PI * i / N));
    const pt = (i, w) => { const s = i / N - 0.5; return { x: at.x + ca * s * L + nx * (jag[i] + w), y: at.y + sa * s * L + ny * (jag[i] + w) }; };
    const dark = new PIXI.Graphics(), gr = new PIXI.Graphics(); gr.blendMode = PIXI.BLEND_MODES.ADD;
    this.mist(at, P.dark, g * 7, duration, 0.55, R() * 50, 1.25);
    this.light(at, P.c, g * 9, duration, 0.6);
    this.flare(at, P, g * 3.2, duration, { rays: 0, alpha: 0.8, hold: 0.85, grow: 0.6 });
    this.add(dark, duration, () => {}, this.fx);
    this.add(gr, duration, (it, k, t) => {
      const open = k < 0.12 ? 0 : k < 0.85 ? ease((k - 0.12) / 0.73) * 0.55 : 0.55 + ease((k - 0.85) / 0.15) * 0.45;
      const grow = Math.min(1, k / 0.12), pulse = 1 + 0.12 * Math.sin(t / 140) + 0.06 * Math.sin(t / 37);
      const lo = Math.round(N / 2 - (N / 2) * grow), hi = Math.round(N / 2 + (N / 2) * grow);
      const w = i => Math.max(0.5, g * open * pulse * Math.sin(Math.PI * i / N));
      dark.clear(); gr.clear();
      if (hi - lo < 2) return;
      const up = [], dn = [];
      for (let i = lo; i <= hi; i++) { up.push(pt(i, w(i))); dn.push(pt(i, -w(i))); }
      if (open > 0.01) { dark.beginFill(0x07000e, 0.96).drawPolygon([...up, ...dn.reverse()].flatMap(q => [q.x, q.y])).endFill(); dn.reverse(); }
      for (const [wd, col, aa] of [[g * 0.32, P.c, 0.28], [g * 0.12, P.c, 0.7], [g * 0.04, P.hot, 1]]) {
        for (const edge of open > 0.01 ? [up, dn] : [up]) {
          gr.lineStyle({ width: wd, color: col, alpha: aa, cap: "round", join: "round" });
          gr.moveTo(edge[0].x, edge[0].y); for (const q of edge.slice(1)) gr.lineTo(q.x, q.y);
        }
      }
    });
    // молнии чаще и чаще; пульсы кольцами; огоньки затягивает в разрыв
    let t = 900;
    while (t < duration - 600) {
      const tt = t, step = lerp(420, 90, tt / duration);
      this.at(tt, () => {
        const i = 2 + Math.floor(R() * (N - 4)), from = pt(i, (R() - 0.5) * g * 0.6), a = ang + Math.PI / 2 * (R() < 0.5 ? 1 : -1) + (R() - 0.5) * 1.6, len = g * (1.5 + R() * 3.5 * Math.min(1, tt / 4000));
        this.arc(from, { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len }, P, 140 + R() * 160, { width: 2.2 + R() * 2.2, jag: 0.32, forks: 2 });
        if (R() < 0.35) this.sound("zap", "crack");
      });
      t += step;
    }
    for (let q = 1500; q < duration - 600; q += 1300) this.at(q, () => this.ring(at, P, g * 0.6, g * 4, 1200, { w: 0.03, noise: 0.2, alpha: 0.7 }));
    for (let q = 600; q < duration - 800; q += 450) this.at(q, () => {
      for (let i = 0; i < 6; i++) {
        const a = R() * 6.28, r = g * (3 + R() * 2.5), x = at.x + Math.cos(a) * r, y = at.y + Math.sin(a) * r, v = g * (2 + R() * 2);
        this.particles.push({ kind: "mote", x, y, cx: at.x, cy: at.y, swirl: 1.4, vx: (at.x - x) / r * v, vy: (at.y - y) / r * v, born: this.time, life: 1300, c0: R() < 0.4 ? P.hot : P.c, size: g * 0.03, drag: 0.2 });
      }
    });
    this.sound("rift", "cast", duration);
    this.at(duration - 650, () => {
      this.flash(at, P.c, P.hot, g * 10, 750, 16);
      this.ring(at, P, g * 0.5, g * 11, 800, { w: 0.05, fill: 0.4 });
      this.sound("boom", "hit");
    });
  }

  /* ─────── звук ─────── */
  sound(family, part, dur = 0) {
    const vol = this.audio?.volume ?? 0; if (!vol) return;
    const ac = (SpellFX.ac ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)());
    if (ac.state === "suspended") ac.resume().catch(() => {});
    const t = ac.currentTime + 0.005, out = ac.createGain(); out.gain.value = vol * 0.8; out.connect(ac.destination);
    const envl = (node, a, d, peak, at = 0) => { const gn = ac.createGain(); gn.gain.setValueAtTime(0.0001, t + at); gn.gain.exponentialRampToValueAtTime(peak, t + at + a); gn.gain.exponentialRampToValueAtTime(0.0001, t + at + a + d); node.connect(gn); gn.connect(out); return gn; };
    const osc = (type, f0, f1, dur, at = 0) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t + at); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + at + dur); o.start(t + at); o.stop(t + at + dur + 0.05); return o; };
    const noise = (dur, type, f, q = 0.8, at = 0) => { const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate), d = b.getChannelData(0); for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1; const s = ac.createBufferSource(); s.buffer = b; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; s.connect(fl); s.start(t + at); return fl; };
    const bell = (freqs, dur, peak) => freqs.forEach((f, i) => envl(osc("sine", f, null, dur, i * 0.015), 0.01, dur, peak / (1 + i * 0.6)));
    const F = family, P = part;
    if (F === "rift" && P === "cast") {                      // нарастающий гул на всё время прорыва
      const d = Math.max(1, dur / 1000), o = osc("sawtooth", 38, 55, d), lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260; o.connect(lp);
      const gn = ac.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.5, t + d * 0.9); gn.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.3); lp.connect(gn); gn.connect(out);
      const n = noise(d, "bandpass", 700, 0.7), gn2 = ac.createGain(); gn2.gain.setValueAtTime(0.0001, t); gn2.gain.exponentialRampToValueAtTime(0.25, t + d * 0.9); gn2.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.3); n.connect(gn2); gn2.connect(out);
      return;
    }
    if (P === "swing" || P === "swing-heavy") {             // свист клинка
      const n = noise(0.25, "bandpass", P === "swing" ? 2400 : 900, 1.2); n.frequency.setValueAtTime(P === "swing" ? 3200 : 1200, t); n.frequency.exponentialRampToValueAtTime(P === "swing" ? 700 : 300, t + 0.2);
      envl(n, 0.03, 0.18, P === "swing" ? 0.35 : 0.45); return;
    }
    if (P === "chain") {                                     // мотор цепного меча
      const o = osc("sawtooth", 85, 110, 0.5), am = ac.createOscillator(), ag = ac.createGain(); am.frequency.value = 38; ag.gain.value = 0.5; am.connect(ag); am.start(t); am.stop(t + 0.55);
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400; o.connect(lp); const gn = envl(lp, 0.02, 0.45, 0.35); ag.connect(gn.gain);
      envl(noise(0.4, "bandpass", 3000, 1), 0.02, 0.35, 0.18); return;
    }
    if (P === "parry") { bell([2200, 3300], 0.25, 0.12); envl(noise(0.08, "highpass", 4000), 0.002, 0.06, 0.2); return; }
    if (P === "crack") { envl(noise(0.12, "highpass", 2500, 0.7), 0.002, 0.1, 0.25); return; }
    if (F === "blade" && P === "hit") { envl(noise(0.15, "lowpass", 900), 0.004, 0.12, 0.5); return; }
    if (F === "blunt" && P === "hit") { envl(osc("sine", 120, 45, 0.25), 0.003, 0.25, 0.8); envl(noise(0.15, "lowpass", 500), 0.003, 0.12, 0.5); return; }
    if (F === "smoke" && P === "hit") { envl(noise(1.6, "highpass", 2500, 0.5), 0.05, 1.5, 0.35); return; }
    if (P === "cast") {
      if (F === "holy" || F === "heal") bell(F === "heal" ? [784, 988, 1175] : [523, 659, 784, 1046], 1.4, 0.18);
      else if (F === "warp" || F === "psy") { envl(noise(0.7, "bandpass", 900, 2), 0.35, 0.35, 0.3); envl(osc("sawtooth", 110, 220, 0.6), 0.3, 0.3, 0.08); }
      else if (F === "fire") { const n = noise(0.5, "lowpass", 1800); envl(n, 0.05, 0.4, 0.4); }
      else if (F === "zap") { for (let k = 0; k < 5; k++) envl(noise(0.04, "highpass", 3500, 0.7, k * 0.05), 0.002, 0.03, 0.3, k * 0.05); }
      else if (F === "frost") { bell([1760, 2350, 2637], 0.6, 0.08); envl(noise(0.5, "highpass", 5000), 0.05, 0.4, 0.15); }
      else if (F === "toll") bell([196, 247, 294], 2.2, 0.3);
      else if (F === "boom") envl(noise(0.2, "lowpass", 600), 0.01, 0.15, 0.3);
    } else if (P === "hit") {
      if (F === "holy" || F === "heal") bell([1046, 1318], 0.9, 0.14);
      else if (F === "warp" || F === "psy") { envl(osc("sine", 300, 60, 0.4), 0.005, 0.4, 0.45); envl(noise(0.3, "bandpass", 1600, 1.5), 0.005, 0.25, 0.25); }
      else if (F === "fire") { envl(noise(0.4, "lowpass", 900), 0.005, 0.35, 0.6); envl(osc("sine", 90, 40, 0.3), 0.005, 0.3, 0.5); }
      else if (F === "zap") { envl(osc("square", 1400, 200, 0.25), 0.002, 0.25, 0.15); envl(noise(0.2, "highpass", 2500), 0.002, 0.18, 0.3); }
      else if (F === "frost") { bell([2093, 2794], 0.7, 0.1); envl(noise(0.4, "bandpass", 3000, 2), 0.01, 0.35, 0.2); }
      else if (F === "toll") bell([147, 175, 220], 2.6, 0.25);
      else if (F === "boom") { envl(osc("sine", 70, 28, 0.8), 0.005, 0.8, 0.9); envl(noise(0.9, "lowpass", 400), 0.005, 0.8, 0.7); }
    } else if (P === "ray") {
      envl(osc(F === "frost" ? "triangle" : "sawtooth", F === "frost" ? 1800 : 900, F === "frost" ? 1200 : 300, 0.45), 0.01, 0.45, 0.12);
    } else if (P === "whisper") {
      for (let k = 0; k < 3; k++) envl(noise(0.5, "bandpass", 1200 + k * 500, 6, k * 0.12), 0.15, 0.35, 0.25, k * 0.12);
    } else if (P === "ward") {
      envl(osc("sine", 440, 880, 0.5), 0.05, 0.5, 0.1); envl(noise(0.5, "highpass", 4000), 0.05, 0.4, 0.06);
    }
  }

  stain(p) {
    if (!this.decals || !this.blood) return;
    const gr = new PIXI.Graphics(), a = Math.atan2(p.vy, p.vx);
    gr.beginFill(p.c0, 0.85).drawEllipse(0, 0, p.size * 1.5, p.size * 0.75).endFill();
    gr.beginFill(0x2a0202, 0.5).drawCircle(-p.size * 0.5, 0, p.size * 0.45).endFill();
    gr.position.set(p.x, p.y); gr.rotation = a;
    this.add(gr, 9000, (it, k) => { gr.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; }, this.decals);
  }

  /** Шаг времени в миллисекундах. Возвращает true, пока есть что рисовать. */
  update(dt) {
    this.time += dt;
    if (this.events.length) {
      const due = this.events.filter(e => e.t <= this.time);
      this.events = this.events.filter(e => e.t > this.time);
      due.sort((a, b) => a.t - b.t).forEach(e => e.fn());
    }
    this.items = this.items.filter(it => {
      const t = this.time - it.born, k = clamp01(t / it.life);
      if (t >= it.life) { it.mesh.destroy({ children: true }); return false; }
      it.update?.(it, k, t);
      return true;
    });
    const s = dt / 1000, gr = this.pg;
    gr.clear();
    if (gr.parent) gr.parent.addChild(gr);              // частицы поверх всего в слое
    this.particles = this.particles.filter(p => {
      const age = this.time - p.born; if (age < 0) return true;
      if (age >= p.life) { if (p.kind === "drop") this.stain(p); return false; }
      const k = age / p.life, damp = Math.exp(-p.drag * s);
      p.vx *= damp; p.vy *= damp; p.x += p.vx * s; p.y += p.vy * s;
      if (p.swirl) { const dx = p.x - p.cx, dy = p.y - p.cy; p.x = p.cx + dx * Math.cos(p.swirl * s) - dy * Math.sin(p.swirl * s); p.y = p.cy + dx * Math.sin(p.swirl * s) + dy * Math.cos(p.swirl * s); }
      if (p.kind === "spark") {
        gr.lineStyle({ width: Math.max(1, p.size * (1 - k)), color: k < 0.4 ? p.c0 : p.c1, alpha: 1 - k, cap: "round" });
        gr.moveTo(p.x, p.y).lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      } else if (p.kind === "mote") {
        const a = Math.sin(Math.PI * k) * (0.7 + 0.3 * Math.sin(age / 60 + p.x));
        gr.lineStyle(0); gr.beginFill(p.c0, a * 0.35).drawCircle(p.x, p.y, p.size * 2.2).endFill();
        gr.beginFill(p.c0, a).drawCircle(p.x, p.y, p.size).endFill();
      } else if (p.kind === "drop") {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > this.g * 1.2) { gr.lineStyle({ width: p.size * 1.6, color: p.c0, alpha: 0.95, cap: "round" }); gr.moveTo(p.x, p.y).lineTo(p.x - p.vx * 0.016, p.y - p.vy * 0.016); gr.lineStyle(0); }
        else gr.beginFill(p.c0, 0.95).drawCircle(p.x, p.y, p.size * 0.8).endFill();
      } else if (p.kind === "shard") {
        p.rot += p.spin * s; const z = p.size, c = Math.cos(p.rot), sn = Math.sin(p.rot);
        gr.lineStyle(0); gr.beginFill(p.c0, 1 - k);
        gr.drawPolygon([p.x + c * z, p.y + sn * z, p.x - sn * z * 0.4, p.y + c * z * 0.4, p.x - c * z * 0.6, p.y - sn * z * 0.6]); gr.endFill();
      }
      return true;
    });
    return this.busy;
  }
}
