// Шейдеры «Дела»: сфера души и проявление карандашного арта. Чистый WebGL 1, без PIXI.

const VERT = `attribute vec2 p; varying vec2 v_uv; void main(){ v_uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x), u.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return v; }
float ss(float x){ x=clamp(x,0.,1.); return x*x*(3.-2.*x); }`;

// ---------------------------------------------------------------- сфера души
const ORB_FRAG = `precision highp float;
varying vec2 v_uv;
uniform float u_time, u_p, u_t, u_seed, u_pulse, u_glow, u_side;
uniform vec3 u_pcol;
${NOISE}
void main(){
  vec2 uv = v_uv*2.-1.;
  float r = length(uv), R = .74;
  float inside = 1.-smoothstep(R-.015, R+.005, r);
  vec2 q = uv/R; float z = sqrt(max(0., 1.-dot(q,q)));
  vec3 n = vec3(q, z);
  float t = u_time*.12 + u_seed;
  vec2 w = q*1.5 + vec2(fbm(q*1.8+vec2(t,0.)), fbm(q*1.8+vec2(-t,3.1)))*.9;
  w += u_pulse*.55*vec2(sin(u_time*6.+q.y*4.), cos(u_time*5.+q.x*4.));   // импульс: фактура вздрагивает
  float turb = fbm(w*2.1 + vec2(t*.6, -t*.4));
  float edge = mix(-1.2, 1.2, u_p);                     // граница: доля Света
  float d = q.x - edge + (turb-.5)*.75;
  float lightSide = 1.-smoothstep(-.13, .13, d);
  vec3 gold = mix(vec3(.92,.58,.16), vec3(1.,.97,.82), turb*turb);
  vec3 crim = mix(vec3(.04,0.,0.), vec3(.66,.08,.05), pow(turb, 1.4));
  vec3 col = mix(crim, gold, lightSide);
  col += vec3(1.,.38,.1)*exp(-d*d*55.)*.4*u_t;           // жар на стыке
  float sat = .22 + .78*u_t;
  col = mix(vec3(dot(col, vec3(.3,.59,.11))), col, sat) * (.38 + .7*u_t);
  vec3 L = normalize(vec3(-.5,.6,.8));
  col *= .42 + .78*clamp(dot(n,L),0.,1.);
  col += vec3(1.,.95,.85)*pow(max(dot(reflect(-L,n), vec3(0.,0.,1.)),0.), 22.)*.3;
  col *= 1.-pow(1.-z, 2.)*.55;
  float own = mix(1.-lightSide, lightSide, u_side);       // своя половина: золотая после отказа, багровая после согласия
  col += u_pcol*u_pulse*(.28 + .5*pow(1.-r/R, 2.))*(.35 + .65*own);   // импульс: вспышка изнутри
  col += u_pcol*u_glow*own*(.22 + .45*(1.-r/R));         // свечение половины, дышит минуты
  float glow = (1.-smoothstep(R, 1., r))*(1.-inside);
  vec3 gcol = mix(vec3(.85,.16,.1), vec3(1.,.74,.3), u_p);
  float ga = glow*glow*(.18+.55*u_t)*(.85+.15*sin(u_time*1.6));
  float outL = 1.-smoothstep(-.25, .25, uv.x/R - edge);   // снаружи: с какой стороны своя половина
  float hm = mix(1.-outL, outL, u_side);
  float ring = exp(-pow((r - (R + (1.-u_pulse)*.22))/.04, 2.))*u_pulse*(1.-inside)*(.35 + .65*hm);   // импульс: кольцо уходит наружу
  float halo = exp(-pow((r - (R + .05))/.08, 2.))*u_glow*hm*(1.-inside);                              // ореол своей половины
  vec3 outc = gcol*ga + u_pcol*(ring*1.1 + halo*1.25);
  gl_FragColor = vec4(col*inside + outc, max(inside, max(ga, max(ring, halo))));
}`;

function makeGL(canvas, frag) {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {}; const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(prog, i); U[u.name] = gl.getUniformLocation(prog, u.name); }
  return { gl, prog, U };
}

/** Один WebGL-холст рисует все сферы и копирует их в 2D-канвасы. */
class OrbHub {
  constructor() { this.items = new Set(); this.raf = 0; this.t0 = performance.now(); this.last = 0; this.ctx = null; this.failed = false; }
  init() {
    if (this.ctx || this.failed) return !!this.ctx;
    try { this.canvas = document.createElement("canvas"); this.canvas.width = this.canvas.height = 256; this.ctx = makeGL(this.canvas, ORB_FRAG); }
    catch (e) { console.warn("nepreklonny-40k | сфера: WebGL недоступен", e); this.ctx = null; }
    if (!this.ctx) this.failed = true;
    return !!this.ctx;
  }
  add(item) { this.items.add(item); if (!this.raf) this.raf = requestAnimationFrame(t => this.frame(t)); }
  remove(item) { this.items.delete(item); }
  frame(now) {
    this.raf = 0;
    for (const it of [...this.items]) if (!it.canvas.isConnected) this.items.delete(it);
    if (!this.items.size) return;
    this.raf = requestAnimationFrame(t => this.frame(t));
    if (now - this.last < 33) return;   // ~30 кадров в секунду хватает
    this.last = now;
    const time = (now - this.t0) / 1000;
    for (const it of this.items) this.draw(it, time);
  }
  draw(it, time) {
    const c2 = it.canvas.getContext("2d");
    if (!this.init()) return fallback(it, c2);
    const { gl, U } = this.ctx;
    gl.viewport(0, 0, 256, 256); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.u_time, time); gl.uniform1f(U.u_p, it.p); gl.uniform1f(U.u_t, it.t); gl.uniform1f(U.u_seed, it.seed);
    const pk = pulseAt(it, Date.now());
    gl.uniform1f(U.u_pulse, pk.beat); gl.uniform1f(U.u_glow, pk.glow); gl.uniform1f(U.u_side, it.pulse?.side ?? 1);
    gl.uniform3fv(U.u_pcol, it.pulse?.col ?? [0, 0, 0]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    c2.clearRect(0, 0, it.canvas.width, it.canvas.height);
    c2.drawImage(this.canvas, 0, 0, it.canvas.width, it.canvas.height);
  }
}
function fallback(it, c2) {   // без WebGL — плоский круг с градиентом
  const w = it.canvas.width, r = w * 0.37;
  c2.clearRect(0, 0, w, w);
  const gr = c2.createLinearGradient(w / 2 - r, 0, w / 2 + r, 0);
  const x = Math.max(0.02, Math.min(0.98, it.p));
  gr.addColorStop(0, "#f6d58a"); gr.addColorStop(x, "#c0392b"); gr.addColorStop(1, "#1a0303");
  c2.fillStyle = gr; c2.beginPath(); c2.arc(w / 2, w / 2, r, 0, Math.PI * 2); c2.fill();
}
const hub = new OrbHub();

/** После выбора сфера горит PULSE_MS: сначала двойной удар «тук-тук», потом своя половина медленно дышит светом и под конец гаснет. */
const PULSE_MS = 5 * 60 * 1000;
function pulseAt(it, now) {
  if (!it.pulse) return { beat: 0, glow: 0 };
  const ms = now - it.pulse.t0;
  if (ms > PULSE_MS || ms < 0) { it.pulse = null; return { beat: 0, glow: 0 }; }
  const k = ms / 1800, hit = x => (x < 0 ? 0 : x < 0.06 ? x / 0.06 : Math.pow(Math.max(0, 1 - (x - 0.06) / 0.6), 2));
  const beat = k > 1 ? 0 : Math.min(1, hit(k) + 0.65 * hit(k - 0.2));
  const env = Math.min(1, ms / 1200) * Math.min(1, (PULSE_MS - ms) / 20000);
  const breath = 0.5 + 0.5 * Math.sin((ms / 2600) * Math.PI * 2);
  return { beat, glow: env * (0.35 + 0.5 * breath) };
}
/** Привязать сферу к герою: свечение после выбора переживёт перерисовку и F5. */
export function orbKey(canvas, key) {
  const it = canvas?._orb; if (!it) return;
  it.key = key;
  try { const p = JSON.parse(localStorage.getItem(key) || "null"); if (p && Date.now() - p.t0 < PULSE_MS) it.pulse = p; } catch { /* нет хранилища */ }
}

/** Канвас со сферой. l, h — очки Света и Ереси. */
export function orbCanvas(size, l, h) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.round(size * Math.min(2, window.devicePixelRatio || 1));
  canvas.style.width = canvas.style.height = `${size}px`;
  canvas.className = "nk-orb";
  const item = { canvas, p: 0.5, t: 0, seed: Math.random() * 50 };
  canvas._orb = item;
  setOrb(canvas, l, h);
  delete item.l; delete item.h;            // стартовые значения — не выбор: импульс только на изменение после первой отрисовки
  hub.add(item);
  return canvas;
}
export function setOrb(canvas, l, h) {
  const it = canvas?._orb; if (!it) return;
  if (it.l !== undefined && (l !== it.l || h !== it.h)) {           // выбор записан: сфера вздрагивает своим цветом, без чисел
    const up = l > it.l, down = h > it.h;
    it.pulse = { t0: Date.now(), side: up && down ? 0.5 : up ? 1 : down ? 0 : 0.5,
      col: up && down ? [1, .55, .3] : up ? [1, .88, .5] : down ? [.95, .14, .07] : [.7, .6, .5] };
    if (it.key) try { localStorage.setItem(it.key, JSON.stringify(it.pulse)); } catch { /* нет хранилища */ }
    it.seed += 0.8 + Math.random() * 0.6;                            // и меняет рисунок
  }
  it.l = l; it.h = h;
  const T = l + h;
  it.p = T ? l / T : 0.5;
  it.t = Math.min(1, T / 4);
  hub.add(it);
}

// ---------------------------------------------------------------- арт «рисуется на глазах»
const ART_FRAG = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_img; uniform vec2 u_texel; uniform float u_t; uniform vec3 u_paper; uniform vec2 u_scale;
${NOISE}
float lum(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
float reveal(float t, float t0, float t1, float f){ float p=(t-t0)/(t1-t0); return ss((p*1.2-f)/.2); }
void main(){
  vec2 uv = (v_uv-.5)*u_scale+.5;                      // обрезка под рамку, как object-fit: cover
  vec2 tuv = vec2(uv.x, 1.-uv.y);
  vec3 c = texture2D(u_img, tuv).rgb;
  float pl = lum(u_paper);
  float D = clamp(1.-lum(c)/pl, 0., 1.);
  float m = 0.;
  for (int i=-2;i<=2;i++) for (int j=-2;j<=2;j++) {
    vec3 s = texture2D(u_img, tuv + vec2(float(i),float(j))*u_texel*2.5).rgb; m += clamp(1.-lum(s)/pl, 0., 1.); }
  m /= 25.;
  float lines = clamp(clamp((D-m-.04)/.11,0.,1.)*clamp((D-.1)/.25,0.,1.)*1.35, 0., 1.);
  float red = clamp(((c.r-c.g)-.10)/.12,0.,1.)*clamp(((c.r-c.b)-.10)/.12,0.,1.);
  vec3 nored = mix(c, vec3(lum(c))*(u_paper/pl), red);
  float cen = clamp(length((uv-vec2(.5,.55))*vec2(2.,2.)), 0., 1.);
  float fA = .5*fbm(uv*3.+1.3) + .5*cen;
  float fB = .5*fbm(uv*3.+7.1) + .5*cen;
  float a = reveal(u_t, 0., 1.8, fA);
  float b = reveal(u_t, 1.2, 3.6, fB);
  float depth = ss((clamp((u_t-1.2)/2.4,0.,1.)*1.4 - D)/.4);
  vec3 col = mix(u_paper, mix(u_paper, nored, lines), a);
  vec3 full = mix(nored, c, ss((u_t-4.)/.7));
  col = mix(col, full, b*depth);
  col = mix(col, c, ss((u_t-4.)/.9));
  gl_FragColor = vec4(col, 1.);
}`;

/** Холст, на котором арт рисуется: show(url) начинает заново. */
export class ArtReveal {
  constructor(width, height) {
    this.canvas = document.createElement("canvas");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`;
    this.canvas.className = "nk-art";
    this.cache = new Map(); this.raf = 0; this.ok = false;
    try { this.ctx = makeGL(this.canvas, ART_FRAG); this.ok = !!this.ctx; } catch (e) { console.warn("nepreklonny-40k | арт: WebGL недоступен", e); }
    if (this.ok) { const { gl } = this.ctx; this.tex = gl.createTexture(); }
  }
  preload(urls) { for (const u of urls) this.load(u); }
  load(url) {
    if (!this.cache.has(url)) this.cache.set(url, new Promise((res, rej) => {
      const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => res(img); img.onerror = rej; img.src = url;
    }));
    return this.cache.get(url);
  }
  async show(url) {
    const img = await this.load(url).catch(() => null);
    this.stop();
    if (!img) return;
    if (!this.ok) return this.plain(img);
    const { gl, U } = this.ctx;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform2f(U.u_texel, 1 / img.naturalWidth, 1 / img.naturalHeight);
    gl.uniform3fv(U.u_paper, paperOf(img));
    const ca = this.canvas.width / this.canvas.height, ia = img.naturalWidth / img.naturalHeight;
    gl.uniform2f(U.u_scale, ca > ia ? 1 : ca / ia, ca > ia ? ia / ca : 1);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const t0 = performance.now();
    const step = now => {
      const t = (now - t0) / 1000;
      gl.uniform1f(U.u_t, t);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.raf = t < 5.2 && this.canvas.isConnected ? requestAnimationFrame(step) : 0;
    };
    this.raf = requestAnimationFrame(step);
  }
  plain(img) {
    const c = this.canvas.getContext("2d");
    const cw = this.canvas.width, ch = this.canvas.height, s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    c.drawImage(img, (cw - img.naturalWidth * s) / 2, (ch - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
}

function paperOf(img) {   // цвет бумаги: среднее самых светлых пикселей
  const c = document.createElement("canvas"); c.width = 64; c.height = 36;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, 64, 36);
  const d = x.getImageData(0, 0, 64, 36).data, px = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2], 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]]);
  px.sort((a, b) => b[3] - a[3]);
  const top = px.slice(0, Math.max(1, Math.round(px.length * 0.15)));
  return [0, 1, 2].map(k => top.reduce((s, p) => s + p[k], 0) / top.length / 255);
}
