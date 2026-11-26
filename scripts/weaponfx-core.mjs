/* Непреклонный: эффекты стрелкового оружия на шейдерах PIXI.
   Лазерные очереди, пулевые трассеры, дульные вспышки, попадания, искры, кровь и пятна.
   Чистый PIXI 7 без Foundry: движок получает слои, размер клетки и время снаружи,
   поэтому его можно гонять и в Foundry, и на тестовом стенде. */

const PIXI = globalThis.PIXI;

/* ─────────────────────────── шейдеры ─────────────────────────── */

export const VERT = `
precision highp float;
attribute vec2 aVertexPosition;
attribute vec2 aUvs;
uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;
varying vec2 vUv;
void main() {
  vUv = aUvs;
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
}`;

export const NOISE = `
float h1(float n) { return fract(sin(n) * 43758.5453123); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float n1(float x) { float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), u.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }`;

/* Луч: полоса вдоль пути. vUv.x — от дула (0) к концу (1), vUv.y — поперёк.
   Видимый сгусток — между хвостом и головой (в пикселях вдоль пути), за головой тянется остывающий след. */
const BEAM_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uHead;
uniform float uTail;
uniform float uTrail;
uniform float uTime;
uniform float uLen;
uniform float uAlpha;
uniform float uCoreW;
uniform float uSeed;
${NOISE}
void main() {
  float px = vUv.x * uLen;
  float y = vUv.y * 2.0 - 1.0;
  float ay = abs(y);
  float seg = smoothstep(uTail - 3.0, uTail + 10.0, px) * (1.0 - smoothstep(uHead - 2.0, uHead + 2.0, px));
  float head = exp(-pow((px - uHead) / 14.0, 2.0)) * step(px, uHead + 6.0);
  float trail = (1.0 - smoothstep(uHead - 2.0, uHead + 1.0, px)) * uTrail;
  float wob = (n1(px * 0.045 + uSeed * 13.0 - uTime * 25.0) - 0.5) * 0.12;
  float yy = ay + wob * trail;
  float core = exp(-yy * yy / (uCoreW * uCoreW));
  float glow = exp(-yy * yy * 4.5);
  float flick = 0.82 + 0.18 * n1(px * 0.11 - uTime * 70.0 + uSeed * 7.0);
  float body = seg + head * 0.9;
  float a = (body * (core * 1.15 + glow * 0.6) + trail * (core * 0.55 + glow * 0.22)) * flick * uAlpha;
  vec3 col = mix(uColor, uHot, clamp(core * (body + 0.25), 0.0, 1.0));
  gl_FragColor = vec4(col * a, a);
}`;

/* Вспышка: дульное пламя (конус вперёд + лучи) или вспышка попадания. Локальные координаты: x — вдоль выстрела. */
const FLASH_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uT;
uniform float uSeed;
uniform float uAlpha;
uniform float uRays;
uniform float uCone;
${NOISE}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float k = 1.0 - uT;
  float rays = pow(abs(cos(ang * uRays * 0.5 + uSeed * 6.2831)), 14.0) * (0.6 + 0.4 * n1(ang * 5.0 + uSeed * 31.0));
  float fx = max(p.x, 0.0);
  float cone = exp(-pow(p.y / (0.08 + 0.32 * fx), 2.0)) * (1.0 - smoothstep(0.25, 1.0, fx / (0.35 + 0.65 * k))) * step(0.0, p.x) * uCone;
  float core = exp(-r * r * (22.0 - 10.0 * uT));
  float halo = exp(-r * r * 3.2);
  float a = (core * 1.3 + halo * 0.35 * k + rays * exp(-r * 2.6) * 0.75 * k + cone * (0.9 + 0.3 * n2(p * 9.0 + uSeed))) * k * uAlpha;
  a *= smoothstep(1.0, 0.85, r);
  vec3 col = mix(uColor, uHot, clamp(core + cone * 0.6, 0.0, 1.0));
  gl_FragColor = vec4(col * a, a);
}`;

/* Отсвет на полу: мягкое пятно света вокруг вспышки. */
const LIGHT_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uT;
uniform float uAlpha;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float k = 1.0 - uT;
  float a = exp(-r * r * 4.5) * k * k * uAlpha * smoothstep(1.0, 0.8, r);
  gl_FragColor = vec4(uColor * a, a);
}`;

/* Облачко: кровяная взвесь, дым, пыль. Обычное смешивание. */
const MIST_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uT;
uniform float uSeed;
uniform float uAlpha;
${NOISE}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float n = fbm(p * 2.6 + vec2(uSeed * 7.0, uSeed * 3.0) + uT * 0.8);
  float m = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.7);
  float a = m * uAlpha * (1.0 - uT) * (0.45 + 0.55 * n);
  gl_FragColor = vec4(uColor * a, a);
}`;

/* Пятно: брызги крови или подпалина. x — вдоль выстрела (из точки попадания вперёд). */
const SPLAT_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uDark;
uniform float uSeed;
uniform float uAlpha;
uniform float uStreak;
uniform float uGrow;
${NOISE}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  vec2 s = vec2(uSeed * 11.0, uSeed * 5.0);
  float g = uGrow;
  // главная лужица у точки попадания
  float d = length(vec2((p.x + 0.5) * 1.35, p.y * 1.7)) + (fbm(p * 4.5 + s) - 0.5) * 0.7;
  float main = 1.0 - smoothstep(0.30 * g, 0.36 * g, d);
  // струи вперёд по направлению выстрела
  float fwd = clamp((p.x + 0.35) / 1.25, 0.0, 1.0);
  float lane = n1(p.y * 15.0 / (0.25 + fwd) + uSeed * 40.0);
  float streak = smoothstep(0.8, 0.93, lane) * step(-0.35, p.x) * (1.0 - smoothstep(0.55 * g, 0.95 * g, fwd))
               * (1.0 - smoothstep(0.12 + 0.5 * fwd, 0.2 + 0.6 * fwd, abs(p.y))) * uStreak;
  // капли веером
  vec2 cell = floor(p * 14.0);
  vec2 f = fract(p * 14.0) - 0.5;
  float rnd = h2(cell + s);
  vec2 off = vec2(h2(cell + s + 3.1), h2(cell + s + 7.7)) - 0.5;
  float drop = 1.0 - smoothstep(0.05 + 0.13 * rnd, 0.09 + 0.15 * rnd, length((f - off * 0.55) * vec2(0.7, 1.0)));
  float inCone = step(-0.2, p.x) * (1.0 - smoothstep(0.1 + 0.55 * fwd, 0.2 + 0.65 * fwd, abs(p.y))) * step(rnd, 0.55 - 0.45 * fwd) * step(fwd, 0.95 * g);
  drop *= inCone * uStreak;
  float m = clamp(main + streak * 0.85 + drop, 0.0, 1.0);
  float shade = fbm(p * 6.0 + s * 2.0);
  vec3 col = mix(uDark, uColor, smoothstep(0.25, 0.75, shade));
  float edge = smoothstep(0.0, 0.5, m);
  float a = m * uAlpha * (0.82 + 0.18 * edge);
  gl_FragColor = vec4(col * a, a);
}`;

/* ───────────────────────────── утилиты ───────────────────────────── */

export function rng(seed) {                       // mulberry32: у всех клиентов один и тот же узор
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rgb = hex => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = x => Math.max(0, Math.min(1, x));

let programs = null;
export function prog() {
  programs ??= {
    beam: PIXI.Program.from(VERT, BEAM_FRAG, "nk-wfx-beam"),
    flash: PIXI.Program.from(VERT, FLASH_FRAG, "nk-wfx-flash"),
    mist: PIXI.Program.from(VERT, MIST_FRAG, "nk-wfx-mist"),
    light: PIXI.Program.from(VERT, LIGHT_FRAG, "nk-wfx-light"),
    splat: PIXI.Program.from(VERT, SPLAT_FRAG, "nk-wfx-splat"),
  };
  return programs;
}

/** Повёрнутый прямоугольник: центр (cx,cy), длина вдоль угла ang, ширина поперёк. uv: x вдоль, y поперёк. */
export function quadMesh(program, uniforms, cx, cy, len, wid, ang, blend) {
  const c = Math.cos(ang), s = Math.sin(ang), hl = len / 2, hw = wid / 2;
  const pt = (u, v) => [cx + c * u - s * v, cy + s * u + c * v];
  const verts = [...pt(-hl, -hw), ...pt(hl, -hw), ...pt(hl, hw), ...pt(-hl, hw)];
  const geom = new PIXI.Geometry()
    .addAttribute("aVertexPosition", verts, 2)
    .addAttribute("aUvs", [0, 0, 1, 0, 1, 1, 0, 1], 2)
    .addIndex([0, 1, 2, 0, 2, 3]);
  const mesh = new PIXI.Mesh(geom, new PIXI.Shader(program, uniforms));
  mesh.blendMode = blend;
  return mesh;
}

/* ───────────────────────────── оружие ───────────────────────────── */

/** Пресеты: цвет, скорость (клеток/с), длина сгустка, ширина, звук. */
export const KINDS = {
  laser: { color: 0xff2a14, hot: 0xfff2e0, speed: 75, streak: 1.7, width: 0.32, core: 0.16, trail: 0.75, interval: 95,
           flash: 0xff3a1a, flashHot: 0xfff0d0, impact: 0xff5a20, sparks: 10, sparkColor: [0xfff0c0, 0xff7a20], scorch: true },
  slug: { color: 0xffa630, hot: 0xfff6d0, speed: 55, streak: 0.8, width: 0.16, core: 0.22, trail: 0.25, interval: 70,
          flash: 0xffa020, flashHot: 0xfffbe0, impact: 0xffc060, sparks: 7, sparkColor: [0xfff8d0, 0xffa030], scorch: false },
  bolt: { color: 0xff8a20, hot: 0xffffff, speed: 45, streak: 1.0, width: 0.26, core: 0.2, trail: 0.45, interval: 130,
          flash: 0xff9020, flashHot: 0xffffe0, impact: 0xffb040, sparks: 18, sparkColor: [0xffffe0, 0xff6010], scorch: true, boom: true },
};

/** Какой это ствол — по флагу предмета, иначе по названию. Возвращает { kind, shots } или null. */
export function classify(name = "", flag = null) {
  if (flag?.kind) return { kind: flag.kind, shots: flag.shots ?? 1 };
  const n = name.toLowerCase();
  if (/лазпист|laspistol|лазерный пистолет/.test(n)) return { kind: "laser", shots: 2 };
  if (/лаз|las|лазер|laser/.test(n)) return { kind: "laser", shots: 3 };
  if (/болт|bolt/.test(n)) return { kind: "bolt", shots: 2 };
  if (/автопист|autopistol|автоган|autogun|пистолет-пулем|пулем/.test(n)) return { kind: "slug", shots: 3 };
  return { kind: "slug", shots: 1 };
}

/* ───────────────────────────── движок ───────────────────────────── */

export class WeaponFX {
  /**
   * @param {object} o
   * @param {PIXI.Container} o.fxLayer     — над токенами: лучи, вспышки, искры
   * @param {PIXI.Container} o.decalLayer  — пятна крови и подпалины (лучше под токенами)
   * @param {number} o.grid                — размер клетки в пикселях
   * @param {function} [o.onHit]           — (targetId, strength) реакция токена
   * @param {object} [o.audio]             — { volume } или null, чтобы без звука
   * @param {boolean} [o.blood=true]
   */
  constructor({ fxLayer, decalLayer, grid, onHit = null, audio = null, blood = true }) {
    this.fx = fxLayer; this.decals = decalLayer; this.g = grid; this.onHit = onHit; this.blood = blood;
    this.audio = audio; this.time = 0; this.items = []; this.events = [];
    this.sparks = new PIXI.Graphics(); this.sparks.blendMode = PIXI.BLEND_MODES.ADD;
    this.drops = new PIXI.Graphics();
    this.fx.addChild(this.drops, this.sparks);
    this.particles = [];
  }

  destroy() {
    for (const it of this.items) it.mesh?.destroy();
    this.items = []; this.events = []; this.particles = [];
    this.sparks.destroy(); this.drops.destroy();
  }

  at(delay, fn) { this.events.push({ t: this.time + delay, fn }); }

  /**
   * Очередь выстрелов.
   * @param {object} o
   * @param {{x:number,y:number,r:number}} o.from — центр стрелка и радиус токена
   * @param {{x:number,y:number,r:number,id?:string}} o.to — центр цели и радиус
   * @param {string} o.kind — laser | slug | bolt
   * @param {number} o.shots
   * @param {boolean[]} o.hits — попал ли каждый выстрел
   * @param {boolean} [o.crit]
   * @param {number} o.seed
   */
  shoot({ from, to, kind = "laser", shots = 1, hits = [], crit = false, seed = 1 }) {
    const K = KINDS[kind] ?? KINDS.slug, R = rng(seed), g = this.g;
    const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
    const ux = dx / dist, uy = dy / dist;
    const muzzle = { x: from.x + ux * from.r * 0.92, y: from.y + uy * from.r * 0.92 };
    for (let i = 0; i < shots; i++) {
      const delay = i * K.interval + R() * 18;
      const hit = !!hits[i];
      let end, endAng;
      if (hit) {
        const spread = (R() - 0.5) * to.r * 0.5, along = (R() - 0.5) * to.r * 0.3;
        end = { x: to.x - uy * spread + ux * along, y: to.y + ux * spread + uy * along };
      } else {
        const side = R() < 0.5 ? -1 : 1, off = to.r * (1.05 + R() * 0.7) * side, over = g * (1.5 + R() * 2.5);
        end = { x: to.x - uy * off + ux * over, y: to.y + ux * off + uy * over };
      }
      endAng = Math.atan2(end.y - muzzle.y, end.x - muzzle.x);
      const len = Math.hypot(end.x - muzzle.x, end.y - muzzle.y);
      const travel = Math.max(45, (len / (K.speed * g)) * 1000);
      const s = R() * 1000;
      this.at(delay, () => {
        this.muzzleFlash(muzzle, endAng, K, s, crit);
        this.sound(kind, i);
        this.projectile(muzzle, end, endAng, len, travel, K, s, crit);
      });
      this.at(delay + travel, () => {
        if (hit) this.impactHit(end, endAng, K, s, crit, to.id, R);
        else this.impactMiss(end, endAng, K, s, R);
      });
    }
  }

  muzzleFlash(p, ang, K, seed, crit) {
    const g = this.g, size = g * (crit ? 1.7 : 1.35);
    this.light(p, K.flash, g * (crit ? 3.6 : 3.0), 120, 0.32);
    const mesh = quadMesh(prog().flash, {
      uColor: rgb(K.flash), uHot: rgb(K.flashHot), uT: 0, uSeed: seed % 1, uAlpha: 1.15, uRays: 7, uCone: 1,
    }, p.x + Math.cos(ang) * size * 0.34, p.y + Math.sin(ang) * size * 0.34, size, size * 0.8, ang, PIXI.BLEND_MODES.ADD);
    this.fx.addChild(mesh);
    this.items.push({ mesh, born: this.time, life: 90, update: (it, k) => { mesh.shader.uniforms.uT = k; } });
  }

  projectile(a, b, ang, len, travel, K, seed, crit) {
    const g = this.g, wid = g * K.width * (crit ? 1.35 : 1), streak = g * K.streak;
    const mesh = quadMesh(prog().beam, {
      uColor: rgb(K.color), uHot: rgb(K.hot), uHead: 0, uTail: -streak, uTrail: 0, uTime: 0, uLen: len,
      uAlpha: 1, uCoreW: K.core, uSeed: (seed % 97) / 97,
    }, (a.x + b.x) / 2, (a.y + b.y) / 2, len, wid, ang, PIXI.BLEND_MODES.ADD);
    this.fx.addChild(mesh);
    const fade = 170;
    this.items.push({
      mesh, born: this.time, life: travel + fade,
      update: (it, k, t) => {
        const u = mesh.shader.uniforms;
        u.uTime = t / 1000;
        if (t <= travel) {
          const head = (t / travel) * len;
          u.uHead = head; u.uTail = head - streak; u.uTrail = K.trail * clamp01(t / 40);
        } else {
          const f = (t - travel) / fade;
          u.uHead = len; u.uTail = lerp(len - streak, len, f); u.uTrail = K.trail * (1 - f) * (1 - f); u.uAlpha = 1 - f * 0.6;
        }
      },
    });
  }

  light(p, color, size, life, alpha) {
    const mesh = quadMesh(prog().light, { uColor: rgb(color), uT: 0, uAlpha: alpha }, p.x, p.y, size, size, 0, PIXI.BLEND_MODES.ADD);
    this.fx.addChildAt(mesh, 0);
    this.items.push({ mesh, born: this.time, life, update: (it, k) => { mesh.shader.uniforms.uT = k; } });
  }

  flash(p, ang, color, hot, size, life, rays = 9, cone = 0) {
    const mesh = quadMesh(prog().flash, { uColor: rgb(color), uHot: rgb(hot), uT: 0, uSeed: Math.random(), uAlpha: 1, uRays: rays, uCone: cone },
      p.x, p.y, size, size, ang, PIXI.BLEND_MODES.ADD);
    this.fx.addChild(mesh);
    this.items.push({ mesh, born: this.time, life, update: (it, k) => { mesh.shader.uniforms.uT = k; } });
  }

  mist(p, color, size, life, alpha, seed, layer = this.fx, grow = 1.6, drift = null) {
    const mesh = quadMesh(prog().mist, { uColor: rgb(color), uT: 0, uSeed: seed, uAlpha: alpha }, 0, 0, size, size, 0, PIXI.BLEND_MODES.NORMAL);
    mesh.position.set(p.x, p.y);
    layer.addChild(mesh);
    this.items.push({ mesh, born: this.time, life, update: (it, k) => {
      mesh.shader.uniforms.uT = k; mesh.scale.set(1 + (grow - 1) * Math.sqrt(k));
      if (drift) mesh.position.set(p.x + drift.x * k, p.y + drift.y * k);
    } });
  }

  splat(p, ang, size, seed, colors, streak = 1, hold = 6000, fade = 2500) {
    if (!this.decals) return;
    const mesh = quadMesh(prog().splat, {
      uColor: rgb(colors[0]), uDark: rgb(colors[1]), uSeed: seed, uAlpha: 0, uStreak: streak, uGrow: 0.35,
    }, 0, 0, size * 1.6, size, ang, PIXI.BLEND_MODES.NORMAL);
    mesh.position.set(p.x, p.y);
    this.decals.addChild(mesh);
    this.items.push({ mesh, born: this.time, life: hold + fade, update: (it, k, t) => {
      const u = mesh.shader.uniforms;
      u.uGrow = lerp(0.35, 1, 1 - Math.pow(1 - clamp01(t / 260), 3));
      u.uAlpha = t < 60 ? t / 60 : (t > hold ? 1 - (t - hold) / fade : 1);
      u.uAlpha *= 0.92;
    } });
  }

  burst(p, ang, n, cone, speed, colors, life, R, kind = "spark", size = 1) {
    const g = this.g;
    for (let i = 0; i < n; i++) {
      const a = ang + (R() - 0.5) * cone, v = speed * g * (0.35 + R() * 0.9);
      const blood = [0xb3120f, 0x8f0a0a, 0x6a0606, 0x4c0404];
      this.particles.push({
        kind, x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: this.time, life: life * (0.5 + R() * 0.8),
        c0: colors ? colors[0] : blood[Math.floor(R() * 4)], c1: colors ? colors[1] : 0x3a0303,
        size: g * size * (0.45 + R() * 1.1), drag: kind === "drop" ? 6.5 : 3.2,
      });
    }
  }

  impactHit(p, ang, K, seed, crit, targetId, R) {
    const g = this.g;
    this.light(p, K.impact, g * 2.4, 140, 0.28);
    this.flash(p, ang, K.impact, 0xffffff, g * (crit ? 1.3 : 0.9), 130, 6);
    this.burst(p, ang + Math.PI, Math.round(K.sparks * 0.6), 2.4, 6, K.sparkColor, 220, R, "spark", 0.05);
    if (this.blood) {
      const n = crit ? 70 : 46;
      this.burst(p, ang, n, 1.25, 7.5, null, 380, R, "drop", 0.022);
      this.burst(p, ang, crit ? 8 : 5, 0.6, 4.0, null, 300, R, "drop", 0.045);    // несколько крупных сгустков
      this.mist({ x: p.x + Math.cos(ang) * g * 0.25, y: p.y + Math.sin(ang) * g * 0.25 }, 0x6e0808, g * 0.95, 560, 0.5, R() * 50, this.fx, 1.9,
        { x: Math.cos(ang) * g * 0.45, y: Math.sin(ang) * g * 0.45 });
      this.splat({ x: p.x + Math.cos(ang) * g * 0.55, y: p.y + Math.sin(ang) * g * 0.55 }, ang, g * (crit ? 1.55 : 1.15), R() * 50,
        [0x7a0a0a, 0x2e0202], 1, 7000, 3000);
    }
    if (K.scorch) this.mist({ x: p.x, y: p.y }, 0x3a3532, g * 0.6, 900, 0.35, R() * 50, this.fx, 2.2,
      { x: Math.cos(ang - 1.2) * g * 0.3, y: Math.sin(ang - 1.2) * g * 0.3 });
    if (K.boom) { this.flash(p, ang, 0xff7a10, 0xfff0c0, g * 1.8, 260, 11); this.mist(p, 0x2a2420, g * 1.3, 1400, 0.5, R() * 50, this.fx, 2.0); }
    this.onHit?.(targetId, crit ? 2 : 1);
    this.sound("hit");
  }

  impactMiss(p, ang, K, seed, R) {
    const g = this.g;
    this.flash(p, ang, K.impact, K.hot, g * 0.55, 110, 5);
    this.burst(p, ang + Math.PI, K.sparks, 2.8, 5, K.sparkColor, 260, R, "spark", 0.045);
    if (K.scorch) {
      this.splat(p, ang, g * 0.55, R() * 50, [0x2b2522, 0x0c0a09], 0.25, 5000, 2500);
      this.flash(p, ang, 0xff5a10, 0xffb070, g * 0.35, 700, 3);           // тлеющая точка
    }
    this.mist(p, 0x6a625a, g * 0.5, 700, 0.3, R() * 50, this.fx, 2.0, { x: -Math.cos(ang) * g * 0.2, y: -Math.sin(ang) * g * 0.2 });
    if (K.boom) { this.flash(p, ang, 0xff7a10, 0xfff0c0, g * 1.5, 240, 11); this.mist(p, 0x2a2420, g * 1.2, 1300, 0.5, R() * 50, this.fx, 2.0); }
  }

  /* ─────── синтез звука: без файлов, чтобы модуль был самодостаточным ─────── */
  sound(kind, i = 0) {
    const vol = this.audio?.volume ?? 0;
    if (!vol) return;
    const ac = (WeaponFX.ac ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)());
    if (ac.state === "suspended") ac.resume().catch(() => {});
    const t = ac.currentTime + 0.005, out = ac.createGain();
    out.gain.value = vol; out.connect(ac.destination);
    const env = (node, a, d, peak) => { const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); node.connect(g); g.connect(out); return g; };
    const noise = dur => { const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate), d = b.getChannelData(0); for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1; const s = ac.createBufferSource(); s.buffer = b; return s; };
    if (kind === "laser") {
      const o = ac.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(1500 - i * 90, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.14);
      const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 2600; o.connect(f);
      env(f, 0.004, 0.15, 0.55); o.start(t); o.stop(t + 0.2);
      const n = noise(0.08), nf = ac.createBiquadFilter(); nf.type = "highpass"; nf.frequency.value = 3000; n.connect(nf); env(nf, 0.002, 0.06, 0.25); n.start(t);
    } else if (kind === "slug" || kind === "bolt") {
      const n = noise(0.18), f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = kind === "bolt" ? 700 : 1400; f.Q.value = 0.7;
      n.connect(f); env(f, 0.002, kind === "bolt" ? 0.16 : 0.08, 0.9); n.start(t);
      const o = ac.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(kind === "bolt" ? 70 : 110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      env(o, 0.003, 0.12, 0.7); o.start(t); o.stop(t + 0.2);
    } else if (kind === "hit") {
      const n = noise(0.12), f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 520;
      n.connect(f); env(f, 0.003, 0.1, 0.6); n.start(t);
    }
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
    // частицы: искры — штрихи с аддитивным свечением, капли — тёмные кружки
    const s = dt / 1000;
    this.sparks.clear(); this.drops.clear();
    this.particles = this.particles.filter(p => {
      const age = this.time - p.born; if (age >= p.life) {
        if (p.kind === "drop" && this.decals && this.blood) this.stain(p);
        return false;
      }
      const k = age / p.life, damp = Math.exp(-p.drag * s);
      p.vx *= damp; p.vy *= damp; p.x += p.vx * s; p.y += p.vy * s;
      if (p.kind === "spark") {
        const c = k < 0.4 ? p.c0 : p.c1, len = 0.028;
        this.sparks.lineStyle({ width: Math.max(1, p.size * (1 - k)), color: c, alpha: 1 - k, cap: "round" });
        this.sparks.moveTo(p.x, p.y).lineTo(p.x - p.vx * len, p.y - p.vy * len);
      } else {
        const sp = Math.hypot(p.vx, p.vy), c = k < 0.6 ? p.c0 : p.c1;
        if (sp > this.g * 1.2) {                     // летит — вытянутый штрих
          this.drops.lineStyle({ width: p.size * 1.6, color: c, alpha: 0.95, cap: "round" });
          this.drops.moveTo(p.x, p.y).lineTo(p.x - p.vx * 0.016, p.y - p.vy * 0.016);
          this.drops.lineStyle(0);
        } else this.drops.beginFill(c, 0.95).drawCircle(p.x, p.y, p.size * 0.8).endFill();
      }
      return true;
    });
    return this.items.length > 0 || this.particles.length > 0 || this.events.length > 0;
  }

  /** Упавшая капля остаётся на полу и тает вместе с пятнами. */
  stain(p) {
    const gr = new PIXI.Graphics(), a = Math.atan2(p.vy, p.vx);
    gr.beginFill(p.c0, 0.85).drawEllipse(0, 0, p.size * 1.5, p.size * 0.75).endFill();      // капля вытянута по ходу полёта
    gr.beginFill(0x2a0202, 0.5).drawCircle(-p.size * 0.5, 0, p.size * 0.45).endFill();
    gr.position.set(p.x, p.y); gr.rotation = a;
    this.decals.addChild(gr);
    this.items.push({ mesh: gr, born: this.time, life: 9000, update: (it, k) => { gr.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; } });
  }

  get busy() { return this.items.length > 0 || this.particles.length > 0 || this.events.length > 0; }
}

/** Разложить попадания по очереди: при попадании первый выстрел точно в цель, остальные — как повезёт; при промахе мимо все. */
export function burstHits(shots, hit, crit, R) {
  return Array.from({ length: shots }, (_, i) => hit && (i === 0 || crit || R() < 0.6));
}
