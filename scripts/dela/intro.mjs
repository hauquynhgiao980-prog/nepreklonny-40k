// Стартовый экран: пока у клиента открыта сцена «Заставка», поверх холста — горящий крейсер во весь экран
// и надпись «Последний курс «Непреклонного»» как в промо: проявление из размытия с дрожью, дыхание алого свечения,
// редкие сбои-помехи и мигание, пепел снизу вверх. Интерфейс Foundry остаётся поверх и работает.
const MOD = "nepreklonny-40k";
const R = p => foundry.utils.getRoute(`modules/${MOD}/${p}`);
const VIDEO = "maps/00_intro/intro_cruiser_1920x1088.webm", FONT = "fonts/nk-serif/nk-serif-black.woff2", MONO = "fonts/ibm-plex-mono";

let root = null, raf = 0, timers = [];

function css() {
  if (document.getElementById("nk-intro-css")) return;
  const s = document.createElement("style");
  s.id = "nk-intro-css";
  s.textContent = `
@font-face { font-family: "NK Serif Black"; src: url("${R(FONT)}") format("woff2"); font-weight: 900; font-display: block; }
#nk-intro { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; background: #000; opacity: 0; transition: opacity 1.2s ease; }
#nk-intro.on { opacity: 1; }
#nk-intro video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(1.08) contrast(1.05); }
#nk-intro .vig { position: absolute; inset: 0; background:
  radial-gradient(ellipse 70% 55% at 50% 46%, rgba(0,0,0,0) 0%, rgba(0,0,0,.18) 55%, rgba(0,0,0,.78) 100%),
  linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 62%, rgba(20,0,0,.72) 100%); }
#nk-intro .scan { position: absolute; inset: 0; opacity: .13; mix-blend-mode: multiply;
  background: repeating-linear-gradient(180deg, rgba(0,0,0,.9) 0 1px, rgba(0,0,0,0) 1px 3px); }
#nk-intro canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
#nk-intro .ttl { position: absolute; left: 0; right: var(--nk-sb, 0px); top: 50%; transform: translateY(-58%); text-align: center; color: #fff1dc; }
#nk-intro .in { display: inline-block; animation: nk-in 2.4s cubic-bezier(.16,.8,.12,1) 1.3s both; }
#nk-intro .pre { font: 600 clamp(14px, 1.9vw, 34px)/1 "NK Plex Mono", monospace; letter-spacing: .55em; margin-right: -.55em; color: #f6dccb;
  text-shadow: 0 0 14px rgba(255,60,30,.55), 0 2px 2px rgba(0,0,0,.8); }
#nk-intro .pre span { opacity: 0; animation: nk-ch .9s steps(1) forwards; }
@keyframes nk-ch { 0% { opacity: 0 } 18% { opacity: 1 } 30% { opacity: .15 } 44% { opacity: 1 } 58% { opacity: .4 } 70%, 100% { opacity: 1 } }
#nk-intro .main { position: relative; display: inline-block; margin-top: .18em; font: 900 min(160px, calc((100vw - var(--nk-sb, 0px)) * .074))/1.05 "NK Serif Black", serif; letter-spacing: .04em;
  text-shadow: 0 0 .12em rgba(255,40,20,.9), 0 0 .45em rgba(255,20,0,.55), 0 .04em 0 rgba(0,0,0,.65);
  animation: nk-glow 5.2s ease-in-out 3.7s infinite; }
@keyframes nk-in {
  0% { opacity: 0; filter: blur(22px); transform: scale(1.18); letter-spacing: .35em; }
  8% { opacity: .5; transform: translate(-6px, 2px) scale(1.15); }
  12% { opacity: .2; transform: translate(7px, -3px) scale(1.14); }
  20% { opacity: .8; }
  60% { filter: blur(1px); }
  100% { opacity: 1; filter: blur(0); transform: none; letter-spacing: normal; } }
@keyframes nk-glow { 0%, 100% { text-shadow: 0 0 .12em rgba(255,40,20,.9), 0 0 .45em rgba(255,20,0,.5), 0 .04em 0 rgba(0,0,0,.65); }
  50% { text-shadow: 0 0 .16em rgba(255,60,30,1), 0 0 .8em rgba(255,20,0,.75), 0 0 1.6em rgba(160,0,0,.45), 0 .04em 0 rgba(0,0,0,.65); } }
#nk-intro .main::before, #nk-intro .main::after { content: attr(data-text); position: absolute; inset: 0; opacity: 0; pointer-events: none; }
#nk-intro .main::before { color: #ff2a14; text-shadow: none; }
#nk-intro .main::after { color: #ffe8d0; text-shadow: none; }
#nk-intro .main.glitch::before { animation: nk-g1 .32s steps(2) 1; }
#nk-intro .main.glitch::after { animation: nk-g2 .32s steps(2) 1; }
@keyframes nk-g1 { 0% { opacity: .9; clip-path: inset(12% 0 62% 0); transform: translate(-.06em, 0); } 50% { opacity: .9; clip-path: inset(58% 0 18% 0); transform: translate(.05em, 0); } 100% { opacity: 0; } }
@keyframes nk-g2 { 0% { opacity: .8; clip-path: inset(40% 0 38% 0); transform: translate(.08em, 0); } 50% { opacity: .8; clip-path: inset(4% 0 80% 0); transform: translate(-.04em, 0); } 100% { opacity: 0; } }
#nk-intro .main.flick { animation: nk-flick .7s steps(1) 1, nk-glow 5.2s ease-in-out infinite; }
@keyframes nk-flick { 0% { opacity: 1 } 10% { opacity: .25 } 22% { opacity: 1 } 34% { opacity: .55 } 46%, 100% { opacity: 1 } }
#nk-intro .sub { margin-top: 1.1em; font: 600 clamp(11px, 1.25vw, 24px)/1 "NK Plex Mono", monospace; letter-spacing: .34em; margin-right: -.34em; color: #e9d6c8;
  text-shadow: 0 2px 3px rgba(0,0,0,.9); opacity: 0; animation: nk-fade 1.4s ease 3.4s forwards; }
#nk-intro .wait { position: absolute; left: 0; right: var(--nk-sb, 0px); bottom: 9vh; text-align: center; font: 600 clamp(11px, 1.05vw, 19px)/1 "NK Plex Mono", monospace;
  letter-spacing: .4em; color: #ffb4a0; text-shadow: 0 0 12px rgba(255,30,10,.6); opacity: 0; animation: nk-fade 1.2s ease 4.6s forwards; }
#nk-intro .wait b { display: inline-block; width: .7em; height: 1em; margin-left: .3em; vertical-align: -.12em; background: #ff5a3c; box-shadow: 0 0 10px rgba(255,40,20,.8); animation: nk-blink 1.1s steps(1) infinite; }
@keyframes nk-blink { 0%, 55% { opacity: 1 } 56%, 100% { opacity: 0 } }
@keyframes nk-fade { to { opacity: 1 } }
`;
  document.head.append(s);
}

function embers(cv) {
  const ctx = cv.getContext("2d");
  const fit = () => { const d = Math.min(2, window.devicePixelRatio || 1); cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  fit();
  const W = () => cv.clientWidth, H = () => cv.clientHeight;
  const P = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), s: .8 + Math.random() * 2.4, v: 12 + Math.random() * 46, p: Math.random() * 6.3, w: 8 + Math.random() * 22 }));
  let last = performance.now();
  const tick = now => {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (cv.width !== Math.round(cv.clientWidth * Math.min(2, window.devicePixelRatio || 1))) fit();
    ctx.clearRect(0, 0, W(), H());
    ctx.globalCompositeOperation = "lighter";
    for (const a of P) {
      a.y -= a.v * dt / H(); if (a.y < -0.02) { a.y = 1.02; a.x = Math.random(); }
      const x = a.x * W() + Math.sin(now / 900 + a.p) * a.w, y = a.y * H();
      const k = .35 + .45 * Math.sin(now / 260 + a.p) ** 2, fade = Math.min(1, (1 - a.y) * 4, a.y * 3);
      ctx.fillStyle = `rgba(255,${110 + a.s * 35 | 0},60,${(k * fade).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, a.s, 0, 6.283); ctx.fill();
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

function show() {
  if (root) return;
  css();
  root = document.createElement("div");
  root.id = "nk-intro";
  const pre = "ПОСЛЕДНИЙ КУРС";
  root.innerHTML = `<video src="${R(VIDEO)}" autoplay loop muted playsinline></video><div class="vig"></div><canvas></canvas><div class="scan"></div>
<div class="ttl"><div class="pre">${[...pre].map((c, i) => `<span style="animation-delay:${(.25 + i * .07).toFixed(2)}s">${c === " " ? "&nbsp;" : c}</span>`).join("")}</div>
<div class="in"><div class="main" data-text="«НЕПРЕКЛОННОГО»">«НЕПРЕКЛОННОГО»</div></div>
<div class="sub">ВАНШОТ · WARHAMMER 40 000 · АКТ I</div></div>
<div class="wait">ПРИЁМ ГРУЗА НА БОРТ<b></b></div>`;
  // сразу над холстом и под интерфейсом: тот же z-index, что у холста, и следующий за ним в разметке
  const board = document.getElementById("board");
  const bz = board ? getComputedStyle(board).zIndex : "0";
  root.style.zIndex = /^-?\d+$/.test(bz) ? bz : "0";
  if (board) board.after(root); else document.body.prepend(root);
  root.querySelector("video").play?.().catch(() => {});
  requestAnimationFrame(() => root?.classList.add("on"));
  embers(root.querySelector("canvas"));
  // надпись — по центру видимой части холста: правую боковую панель Foundry вычитаем
  const sb = document.getElementById("sidebar");
  const fitSb = () => { if (!root) return; const r = sb?.getBoundingClientRect(); root.style.setProperty("--nk-sb", r && r.width && r.left > innerWidth / 2 ? `${Math.round(innerWidth - r.left)}px` : "0px"); };
  fitSb();
  if (sb && window.ResizeObserver) { const ro = new ResizeObserver(fitSb); ro.observe(sb); timers.push({ ro }); }
  window.addEventListener("resize", fitSb); timers.push({ off: () => window.removeEventListener("resize", fitSb) });
  // сбои: то помеха-срез, то лампа мигнула; не чаще раза в 3–8 с
  const main = root.querySelector(".main");
  const glitch = () => {
    if (!root) return;
    const cls = Math.random() < .6 ? "glitch" : "flick";
    main.classList.remove("glitch", "flick"); void main.offsetWidth; main.classList.add(cls);
    timers.push(setTimeout(() => main.classList.remove(cls), 800));
    timers.push(setTimeout(glitch, 3000 + Math.random() * 5000));
  };
  timers.push(setTimeout(glitch, 4800));
  timers.push(setTimeout(boom, 1550));                                    // надпись встаёт на место
}

/** Удар, когда надпись встаёт на место: низкий провал частоты и хруст шума (звук синтезируется в браузере). */
function boom() {
  let ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); } catch { return; }
  let vol = 0.55;
  try { const iv = Number(game.settings.get("core", "globalInterfaceVolume")); if (Number.isFinite(iv)) vol *= iv; } catch {}
  const t0 = ctx.currentTime + 0.02, out = ctx.createGain(); out.gain.value = vol; out.connect(ctx.destination);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(95, t0); o.frequency.exponentialRampToValueAtTime(28, t0 + 1.6);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(1, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
  o.connect(g).connect(out); o.start(t0); o.stop(t0 + 2.5);
  const n = ctx.createBufferSource(), b = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const f = ctx.createBiquadFilter(), ng = ctx.createGain(); f.type = "lowpass"; f.frequency.value = 900; ng.gain.value = 0.5;
  n.buffer = b; n.connect(f).connect(ng).connect(out); n.start(t0);
  setTimeout(() => ctx.close().catch(() => {}), 3200);
}

function hide() {
  if (!root) return;
  cancelAnimationFrame(raf); raf = 0;
  for (const t of timers) { if (t?.ro) t.ro.disconnect(); else if (t?.off) t.off(); else clearTimeout(t); } timers = [];
  const el = root; root = null;
  el.classList.remove("on");
  setTimeout(() => { el.querySelector("video")?.pause(); el.remove(); }, 1300);
}

/** Заставка видна, пока у клиента открыта сцена с флагом scene: "intro". */
export function syncIntro() {
  const on = canvas?.scene?.flags?.[MOD]?.scene === "intro";
  if (on) show(); else hide();
}
