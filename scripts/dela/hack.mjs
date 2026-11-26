// Мини-игра «Терминал замка» у восьмой камеры. Поле 9×9, ядро замка в центре.
// Каждый игрок ведёт свой зонд к ядру; мусорный код ползёт туда же, не всегда по лучшему пути.
// На ход 5 секунд. Цифра на узле — сколько заражённых узлов рядом. Заражённый узел и встреча с кодом
// отбрасывают зонд, и он пропускает ход. Печать чистоты на пути — код замирает на ход.
// Проверка взломщика больше 12 — код просыпается на ход позже. Хоть один зонд в ядре раньше кода — победа.
// Мастер ведёт игру: хранит состояние в настройке мира, считает ходы; игроки шлют выбор по сокету.
// Проба мастера — та же игра только у него в памяти: он ведёт первый зонд, остальные — боты; мир не меняется.
import * as S from "./state.mjs";
import { h } from "./ui.mjs";
import { g } from "./texts.mjs";

export const TURN_MS = 5000;
export const CHECK_DC = 13;                 // «больше 12»
const WORM_ERR = 0.2, MINES = 12, SEALS = 2, MAX_TURNS = 40, COUNT_MS = 3200;
const N = 9, CORE = [4, 4];
const STARTS = [[2, 0], [6, 0], [0, 2], [8, 2], [0, 6], [8, 6], [2, 8], [6, 8]];
const COLORS = ["#4fd1ff", "#ffd36b", "#c59bff", "#7dff8a", "#ff9e5a"];
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const K = (x, y) => `${x},${y}`;
const eq = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

// ---------------------------------------------------------------- поле
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function sample(r, arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
const inside = ([x, y]) => x >= 0 && y >= 0 && x < N && y < N;
function nbrs(walls, p) { return D4.map(([dx, dy]) => [p[0] + dx, p[1] + dy]).filter(q => inside(q) && !walls.has(K(...q))); }
function bfs(walls, src, block = null) {
  const d = new Map([[K(...src), 0]]), q = [src];
  while (q.length) {
    const p = q.shift();
    for (const n of nbrs(walls, p)) { const k = K(...n); if (!d.has(k) && !(block && block.has(k))) { d.set(k, d.get(K(...p)) + 1); q.push(n); } }
  }
  return d;
}
const rot = ([x, y]) => [N - 1 - y, x];

/** Поле на nPlayers зондов: стены с поворотной симметрией, заражённые узлы, печати, старты. */
export function generate(nPlayers, seed = Date.now()) {
  const r = rng(seed);
  for (let t = 0; t < 2000; t++) {
    const walls = new Set();
    const cand = [];
    for (let x = 1; x <= 3; x++) for (let y = 0; y <= 3; y++)
      if (!STARTS.some(s => s[0] === x && s[1] === y) && Math.abs(x - 4) + Math.abs(y - 4) > 1) cand.push([x, y]);
    for (let p of sample(r, cand, 4)) for (let i = 0; i < 4; i++) { walls.add(K(...p)); p = rot(p); }
    const dc = bfs(walls, CORE);
    if (dc.size !== N * N - walls.size) continue;
    if (STARTS.some(s => !dc.has(K(...s)) || dc.get(K(...s)) > 8)) continue;
    const wi = Math.floor(r() * STARTS.length), worm = STARTS[wi];
    const starts = sample(r, STARTS.filter((_, i) => i !== wi), nPlayers);
    const forbid = new Set([K(...CORE), K(...worm), ...starts.map(s => K(...s)), ...starts.flatMap(s => nbrs(walls, s).map(q => K(...q)))]);
    const free = [...dc.keys()].filter(k => !forbid.has(k));
    let mines = null;
    for (let m = 0; m < 300 && !mines; m++) {
      const ms = new Set(sample(r, free, MINES));
      if (starts.every(s => (bfs(walls, s, ms).get(K(...CORE)) ?? 99) <= dc.get(K(...s)) + 2)) mines = ms;
    }
    if (!mines) continue;
    const sc = free.filter(k => !mines.has(k) && dc.get(k) >= 2 && dc.get(k) <= 3);
    if (sc.length < SEALS) continue;
    return { walls: [...walls], mines: [...mines], seals: sample(r, sc, SEALS), starts, worm };
  }
  throw new Error("поле не собралось");
}

// ---------------------------------------------------------------- где живёт партия
const isActiveGM = () => game.user.isGM && (!game.users.activeGM || game.users.activeGM.id === game.user.id);
const ME = "__gm";

/** Настоящая игра: состояние в настройке мира, ходы считает активный мастер, игроки шлют выбор по сокету. */
const WORLD = {
  trial: false, t: {},
  get: () => S.get().hack,
  update: fn => S.update(s => fn(s)),
  director: () => isActiveGM(),
  gmView: () => game.user.isGM,
  mine: () => { const st = S.get(), aid = st.roster?.[game.user.id]; return aid && st.hack?.probes?.[aid] ? aid : null; },
  ready: hk => S.send({ t: "hack.ready", id: hk.id }),
  pick: (hk, c) => S.send({ t: "hack.pick", id: hk.id, turn: hk.turn, x: c[0], y: c[1] }),
};

/** Проба мастера: всё в памяти его браузера, никому не видно, мир и броски не трогаются. */
const TRIAL = {
  trial: true, t: {}, st: { hack: null }, n: 1,
  get() { return this.st.hack; },
  update(fn) { const r = fn(this.st); if (r !== false) trialUI.sync(this.st, ME); return Promise.resolve(); },
  director: () => true,
  gmView: () => false,
  mine() { return this.st.hack?.probes?.[ME] ? ME : null; },
  ready(hk) { onReady(this, ME, hk.id); },
  pick(hk, c) { onPick(this, ME, hk.id, hk.turn, c); },
  bots(hk) { botTurn(this, hk); },
};

// ---------------------------------------------------------------- у мастера
const wallsOf = hk => new Set(hk.board.walls);
const minesOf = hk => new Set(hk.board.mines);
const countAround = (hk, p) => { const w = wallsOf(hk), m = minesOf(hk); return nbrs(w, p).filter(q => m.has(K(...q))).length; };

function reveal(hk, p) {
  const n = countAround(hk, p);
  hk.rev[K(...p)] = n;
  if (n === 0) for (const q of nbrs(wallsOf(hk), p)) if (!hk.safe.includes(K(...q))) hk.safe.push(K(...q));
}

/** Проверка взломщика: Интеллект, у Техножреца с преимуществом. Больше 12 — код просыпается на ход позже. */
export async function rollHacker(aid) {
  const actor = game.actors.get(aid); if (!actor) return;
  const st = S.get(), cls = st.heroes?.[aid]?.cls;
  let r;
  try {
    r = await actor.rollAbilityCheck({ ability: "int", advantage: cls === "tehnozhrec" }, { configure: false });
  } catch (e) { console.error(e); return ui.notifications.error("Проверка не прошла, подробности в консоли."); }
  r = Array.isArray(r) ? r[0] : r;
  if (!r) return;
  await S.update(s => { s.hackPrep = { aid, total: r.total, lag: r.total >= CHECK_DC ? 1 : 0, name: actor.name }; });
}
export const clearHacker = () => S.update(s => { delete s.hackPrep; });

/** Открыть игру у всех игроков, чьи герои назначены и кто в сети. */
export async function openGame() {
  if (!game.user.isGM) return;
  const st = S.get();
  const list = Object.entries(st.roster || {}).filter(([uid, aid]) => game.users.get(uid)?.active && game.actors.get(aid) && st.heroes?.[aid]).slice(0, 5);
  if (!list.length) return ui.notifications.warn("Играть некому: нет игроков в сети с назначенными героями.");
  if (TRIAL.get()) abortGame(TRIAL);
  const seed = Math.floor(Math.random() * 2 ** 31), b = generate(list.length, seed);
  const lag = st.hackPrep?.lag ?? 0;
  await S.update(s => {
    const hk = { id: Date.now(), phase: "intro", seed, lag, board: { walls: b.walls, mines: b.mines }, seals: b.seals.slice(),
      order: [], probes: {}, worm: { p: b.worm, prev: null, sleep: lag, stun: 0, trail: [] },
      rev: {}, safe: [], boom: [], turn: 0, choice: {}, ready: {}, events: [], result: null, hacker: s.hackPrep || null };
    list.forEach(([uid, aid], i) => {
      const hero = s.heroes[aid];
      hk.order.push(aid);
      hk.probes[aid] = { uid, p: b.starts[i], prev: b.starts[i], start: b.starts[i], stun: 0, moves: 0, color: COLORS[i], name: hero.name, gender: hero.gender };
      reveal(hk, b.starts[i]);
    });
    s.hack = hk;
  });
}
export const abortGame = (ctx = WORLD) => { clearTimers(ctx); return ctx.update(s => { delete s.hack; }); };
export const forceStart = (ctx = WORLD) => ctx.update(s => { if (s.hack?.phase !== "intro") return false; s.hack.phase = "count"; s.hack.countAt = Date.now(); });

function clearTimers(ctx) {
  const T = ctx.t; clearTimeout(T.turn); clearTimeout(T.count); (T.bots || []).forEach(clearTimeout);
  ctx.t = {};
}

/** Таймеры ведущего: отсчёт перед стартом и ход по 5 секунд. */
function gmTick(ctx, hk) {
  if (!ctx.director()) return;
  if (!hk) { clearTimers(ctx); return; }
  const T = ctx.t;
  if (hk.phase === "count" && T.countFor !== hk.id) {
    T.countFor = hk.id;
    T.count = setTimeout(() => ctx.update(s => { if (s.hack?.id !== hk.id || s.hack.phase !== "count") return false; s.hack.phase = "play"; s.hack.turn = 1; }), COUNT_MS);
  }
  if (hk.phase === "play" && T.turnFor !== `${hk.id}:${hk.turn}`) {
    T.turnFor = `${hk.id}:${hk.turn}`; clearTimeout(T.turn);
    const active = hk.order.filter(a => !hk.probes[a].stun);
    T.turn = setTimeout(() => resolve(ctx, hk.id, hk.turn), active.length ? TURN_MS : 1200);
    ctx.bots?.(hk);
  }
}

function resolve(ctx, id, turn) {
  clearTimeout(ctx.t.turn);
  return ctx.update(s => {
    const hk = s.hack;
    if (!hk || hk.id !== id || hk.phase !== "play" || hk.turn !== turn) return false;
    const walls = wallsOf(hk), mines = minesOf(hk);
    hk.events = [];
    const winners = [];
    for (const aid of hk.order) {
      const pr = hk.probes[aid];
      if (pr.stun > 0) { pr.stun--; continue; }
      const c = hk.choice[aid];
      if (!c || !nbrs(walls, pr.p).some(q => eq(q, c))) continue;
      const k = K(...c);
      if (mines.has(k)) {
        if (!hk.boom.includes(k)) hk.boom.push(k);
        pr.stun = 1; hk.events.push({ k: "boom", x: c[0], y: c[1], aid });
        continue;
      }
      pr.prev = pr.p; pr.p = c; pr.moves++;
      reveal(hk, c);
      const si = hk.seals.indexOf(k);
      if (si >= 0) { hk.seals.splice(si, 1); hk.worm.stun++; hk.events.push({ k: "seal", x: c[0], y: c[1], aid }); }
      if (eq(c, CORE)) winners.push(aid);
    }
    if (winners.length) {
      hk.phase = "end"; hk.result = { win: true, by: winners, turns: hk.turn };
      hk.choice = {}; return;
    }
    // код
    const w = hk.worm;
    if (w.sleep > 0) { w.sleep--; hk.events.push({ k: "sleep" }); }
    else if (w.stun > 0) { w.stun--; hk.events.push({ k: "wstun" }); }
    else {
      const dist = bfs(walls, CORE), steps = nbrs(walls, w.p);
      const best = steps.reduce((a, b) => (dist.get(K(...b)) < dist.get(K(...a)) ? b : a));
      let next = best;
      if (Math.random() < WORM_ERR) {
        const alt = steps.filter(q => !eq(q, best) && !eq(q, w.prev));
        const alt2 = alt.length ? alt : steps.filter(q => !eq(q, best));
        if (alt2.length) next = alt2[Math.floor(Math.random() * alt2.length)];
      }
      w.trail = [...w.trail, w.p].slice(-4);
      w.prev = w.p; w.p = next;
      for (const aid of hk.order) {
        const pr = hk.probes[aid];
        if (eq(pr.p, next) && !eq(next, CORE)) { pr.p = pr.prev; pr.stun = Math.max(pr.stun, 1); hk.events.push({ k: "eat", x: next[0], y: next[1], aid }); }
      }
      if (eq(next, CORE)) { hk.phase = "end"; hk.result = { win: false, turns: hk.turn }; hk.choice = {}; return; }
    }
    if (hk.turn >= MAX_TURNS) { hk.phase = "end"; hk.result = { win: false, turns: hk.turn }; hk.choice = {}; return; }
    hk.turn++; hk.choice = {};
  });
}

export function onSocket(msg, senderId) {
  if (!msg || typeof msg.t !== "string" || !msg.t.startsWith("hack.") || !isActiveGM()) return;
  const uid = msg.userId || senderId;
  const hk = S.get().hack; if (!hk || hk.id !== msg.id) return;
  const aid = Object.keys(hk.probes).find(a => hk.probes[a].uid === uid);
  if (!aid) return;
  if (msg.t === "hack.ready") onReady(WORLD, aid, msg.id);
  else if (msg.t === "hack.pick") onPick(WORLD, aid, msg.id, msg.turn, [Number(msg.x), Number(msg.y)]);
}

function onReady(ctx, aid, id) {
  return ctx.update(s => {
    const x = s.hack; if (!x || x.id !== id || x.phase !== "intro") return false;
    x.ready[aid] = true;
    if (x.order.every(a => x.ready[a])) { x.phase = "count"; x.countAt = Date.now(); }
  });
}
function onPick(ctx, aid, id, turn, c) {
  return ctx.update(s => {
    const x = s.hack; if (!x || x.id !== id || x.phase !== "play" || x.turn !== turn) return false;
    const pr = x.probes[aid]; if (!pr || pr.stun) return false;
    if (!nbrs(wallsOf(x), pr.p).some(q => eq(q, c))) return false;
    x.choice[aid] = c;
    const active = x.order.filter(a => !x.probes[a].stun);
    if (active.every(a => x.choice[a])) { const T = ctx.t; clearTimeout(T.turn); T.turnFor = `${id}:${turn}`; T.turn = setTimeout(() => resolve(ctx, id, turn), 350); }
  });
}

// ---------------------------------------------------------------- проба мастера
/** Ход бота: ближе к ядру, по разведанным узлам охотнее, назад неохотно; иногда медлит и не успевает. */
function botMove(hk, aid) {
  const walls = wallsOf(hk), pr = hk.probes[aid], boom = new Set(hk.boom), known = new Set([...Object.keys(hk.rev), ...hk.safe]);
  const opts = nbrs(walls, pr.p).filter(q => !boom.has(K(...q)));
  if (!opts.length) return null;
  const dist = bfs(walls, CORE);
  const score = q => dist.get(K(...q)) + (known.has(K(...q)) ? 0 : 0.8) + (eq(q, pr.prev) ? 0.6 : 0) + Math.random() * 0.9;
  return opts.map(q => [score(q), q]).sort((a, b) => a[0] - b[0])[0][1];
}
function botTurn(ctx, hk) {
  ctx.t.bots = [];
  for (const aid of hk.order) {
    if (aid === ME || hk.probes[aid].stun || Math.random() < 0.08) continue;
    ctx.t.bots.push(setTimeout(() => {
      const cur = ctx.get(); if (!cur || cur.id !== hk.id || cur.phase !== "play" || cur.turn !== hk.turn) return;
      const c = botMove(cur, aid); if (c) onPick(ctx, aid, cur.id, cur.turn, c);
    }, 900 + Math.random() * 2900));
  }
}

/** Проба: мастер ведёт первый зонд, остальные — боты. Никто, кроме мастера, игру не видит. */
export function openTrial(n = 1) {
  if (!game.user.isGM) return;
  if (S.get().hack) return ui.notifications.warn("У игроков сейчас идёт игра — проба после неё.");
  if (TRIAL.get()) abortGame(TRIAL);
  n = Math.max(1, Math.min(5, Number(n) || 1)); TRIAL.n = n;
  const st = S.get(), names = Object.values(st.roster || {}).map(a => st.heroes?.[a]).filter(Boolean);
  const seed = Math.floor(Math.random() * 2 ** 31), b = generate(n, seed);
  const lag = st.hackPrep?.lag ?? 0;
  const hk = { id: Date.now(), trial: true, phase: "intro", seed, lag, board: { walls: b.walls, mines: b.mines }, seals: b.seals.slice(),
    order: [], probes: {}, worm: { p: b.worm, prev: null, sleep: lag, stun: 0, trail: [] },
    rev: {}, safe: [], boom: [], turn: 0, choice: {}, ready: {}, events: [], result: null, hacker: null };
  for (let i = 0; i < n; i++) {
    const aid = i ? `__bot${i}` : ME, hero = names[i] ?? null;
    hk.order.push(aid);
    hk.probes[aid] = { uid: i ? null : game.user.id, p: b.starts[i], prev: b.starts[i], start: b.starts[i], stun: 0, moves: 0, color: COLORS[i],
      name: i ? (hero?.name ? `${hero.name} · бот` : `Зонд ${i + 1} · бот`) : "Мастер", gender: i ? hero?.gender : "m" };
    if (i) hk.ready[aid] = true;
    reveal(hk, b.starts[i]);
  }
  return TRIAL.update(s => { s.hack = hk; });
}
export const closeTrial = () => abortGame(TRIAL);

// ---------------------------------------------------------------- звук
let AC = null;
function ac() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); } catch { AC = null; } return AC; }
function beep(kind) {
  const ctx = ac(); if (!ctx) return;
  let vol = 0.5;
  try { const iv = Number(game.settings.get("core", "globalInterfaceVolume")); if (Number.isFinite(iv)) vol *= iv; } catch { /* нет */ }
  const t0 = ctx.currentTime + 0.01, out = ctx.createGain(); out.gain.value = vol; out.connect(ctx.destination);
  const tone = (f, type, a, d, at = 0, f2 = null) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0 + at); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + at + d);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t0 + at); gn.gain.exponentialRampToValueAtTime(a, t0 + at + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + at + d);
    o.connect(gn); gn.connect(out); o.start(t0 + at); o.stop(t0 + at + d + 0.05);
  };
  const noise = (d, f, a, at = 0) => {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * d), ctx.sampleRate), x = b.getChannelData(0);
    for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = b; const fl = ctx.createBiquadFilter(); fl.type = "bandpass"; fl.frequency.value = f; fl.Q.value = 0.8;
    const gn = ctx.createGain(); gn.gain.setValueAtTime(a, t0 + at); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + at + d);
    s.connect(fl); fl.connect(gn); gn.connect(out); s.start(t0 + at);
  };
  if (kind === "pick") tone(1320, "square", 0.08, 0.06);
  else if (kind === "tick") tone(880, "sine", 0.12, 0.05);
  else if (kind === "step") { tone(520, "triangle", 0.15, 0.08); tone(780, "triangle", 0.1, 0.08, 0.05); }
  else if (kind === "worm") { tone(70, "sawtooth", 0.25, 0.25, 0, 45); noise(0.18, 1800, 0.12); }
  else if (kind === "boom") { noise(0.5, 900, 0.6); tone(140, "sawtooth", 0.4, 0.4, 0, 40); }
  else if (kind === "seal") { [523, 659, 784].forEach((f, i) => tone(f, "sine", 0.18, 1.2, i * 0.06)); }
  else if (kind === "win") { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, "triangle", 0.2, 1.8 - i * 0.2, i * 0.12)); }
  else if (kind === "lose") { tone(220, "sawtooth", 0.4, 1.8, 0, 30); noise(1.2, 600, 0.4); }
  else if (kind === "go") { tone(440, "square", 0.12, 0.12); tone(660, "square", 0.12, 0.18, 0.12); }
}

// ---------------------------------------------------------------- экран
const GLYPHS = "▓▒░█▚▞◢◣◤◥⌬⍜⏃⏚⎔⟁⧖⧗ЖЩФЪЫ#%&@";
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };

function starSvg(size = 100, color = "#ff2a2a") {
  // звезда из восьми стрелок из одной точки
  const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "-50 -50 100 100"); svg.setAttribute("width", size); svg.setAttribute("height", size);
  for (let i = 0; i < 8; i++) {
    const gr = document.createElementNS(ns, "g"); gr.setAttribute("transform", `rotate(${i * 45})`);
    const l = document.createElementNS(ns, "path"); l.setAttribute("d", "M0 0 L0 -36"); l.setAttribute("stroke", color); l.setAttribute("stroke-width", "5"); l.setAttribute("stroke-linecap", "round");
    const a = document.createElementNS(ns, "path"); a.setAttribute("d", "M0 -47 L-8 -32 L8 -32 Z"); a.setAttribute("fill", color);
    gr.append(l, a); svg.append(gr);
  }
  const c = document.createElementNS(ns, "circle"); c.setAttribute("r", "7"); c.setAttribute("fill", color); svg.append(c);
  return svg;
}
function gearSvg(size, color) {
  const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "-50 -50 100 100"); svg.setAttribute("width", size); svg.setAttribute("height", size);
  let d = "";
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2, a1 = a0 + Math.PI / 12 * 0.55, a2 = a0 + Math.PI / 12 * 1.45, a3 = a0 + Math.PI / 6;
    const P = (r, a) => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
    d += `${i ? "L" : "M"}${P(38, a0)} L${P(47, a1)} L${P(47, a2)} L${P(38, a3)} `;
  }
  const p = document.createElementNS(ns, "path"); p.setAttribute("d", d + "Z M0 -17 A17 17 0 1 0 0.01 -17 Z"); p.setAttribute("fill", color); p.setAttribute("fill-rule", "evenodd");
  svg.append(p);
  return svg;
}

export class HackUI {
  constructor(ctx = WORLD) { this.ctx = ctx; this.el = null; this.step = "title"; this.gid = null; this.gmHidden = false; this.pieces = new Map(); this.lastTurn = 0; this.pick = null; this.timers = []; }
  get isOpen() { return !!this.el?.isConnected; }
  close() {
    this.timers.forEach(clearInterval); this.timers = [];
    if (this.keys) window.removeEventListener("keydown", this.keys);
    this.el?.remove(); this.el = null; this.pieces.clear();
  }

  /** Вызывается при любом изменении состояния. aid — герой этого игрока (у мастера null). */
  sync(st, aid) {
    const hk = st.hack, gmv = this.ctx.gmView();
    gmTick(this.ctx, hk);
    if (!hk) { this.close(); this.gid = null; return; }
    if (hk.id !== this.gid) { this.close(); this.gid = hk.id; this.step = "title"; this.gmHidden = false; this.lastTurn = 0; this.pick = null; this.closedEnd = false; }
    const mine = aid && hk.probes[aid] ? aid : null;
    if (gmv && this.gmHidden) { if (this.isOpen) this.close(); return; }
    if (!gmv && !mine && hk.phase === "intro") return;     // не участник: смотрит с начала гонки
    if (this.closedEnd && hk.phase === "end") return;
    this.render(hk, mine);
  }
  showGM() { this.gmHidden = false; const st = S.get(); this.sync(st, null); }

  shell(cls) {
    if (!this.el) { this.el = h("div", { id: "nk-hack", class: "nk-ui" }); document.body.append(this.el); }
    this.el.className = `nk-ui ${cls}`;
    return this.el;
  }
  topBtns() {
    if (this.ctx.trial) return h("button.nk-x.nk-hk-hide", { title: "Закрыть пробу", onclick: () => abortGame(this.ctx) }, "✕");
    if (!this.ctx.gmView()) return null;
    return h("button.nk-x.nk-hk-hide", { title: "Спрятать у себя (игра идёт дальше; вернуть — «Показать игру» в пульте)", onclick: () => { this.gmHidden = true; this.close(); } }, "✕");
  }

  render(hk, mine) {
    const gm = this.ctx.gmView();
    if (hk.phase === "intro") {
      if (gm) return this.renderWait(hk, true);
      if (hk.ready[mine]) return this.renderWait(hk, false);
      return this.step === "rules" ? this.renderRules(hk, mine) : this.renderTitle();
    }
    if (hk.phase === "count") return this.renderCount(hk);
    if (hk.phase === "play") return this.renderPlay(hk, mine);
    if (hk.phase === "end") return this.renderEnd(hk, mine);
  }

  renderTitle() {
    const el = this.shell("nk-hk-full nk-hk-title");
    if (el.dataset.view === "title") return;
    el.dataset.view = "title";
    const word = "ТЕРМИНАЛ ЗАМКА";
    const spans = [];
    const title = h("div.nk-hk-big", {}, word.split(" ").map(wd => h("span.w", {}, [...wd].map(ch => { const sp = h("span", { "data-c": ch }, ch); spans.push(sp); return sp; }))));
    const star = h("div.nk-hk-star"); star.append(starSvg(420, "rgba(170,0,20,.16)"));
    el.replaceChildren(star, h("div.nk-hk-center", {}, title,
      h("button.nk-btn.nk-hk-go", { onclick: () => { this.step = "rules"; beep("pick"); this.render(this.ctx.get(), this.mineId()); } }, "НАЧАТЬ")), h("div.nk-hk-scan"),
      this.ctx.trial ? h("div.nk-hk-trial", {}, "проба мастера · видите только вы") : "");
    const iv = setInterval(() => {
      if (!title.isConnected) return clearInterval(iv);
      for (const s of spans) {
        const c = s.dataset.c; if (c === " ") continue;
        s.textContent = Math.random() < 0.12 ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : c;
        s.classList.toggle("bad", s.textContent !== c);
      }
    }, 90);
    this.timers.push(iv);
  }
  mineId() { return this.ctx.mine(); }

  renderRules(hk, mine) {
    const el = this.shell("nk-hk-full");
    if (el.dataset.view === "rules") return;
    el.dataset.view = "rules";
    const rules = [
      "Терминал замка заражён мусорным кодом. Код ползёт к ядру — и вы тоже.",
      "Каждый ведёт свой зонд к ядру в центре. На ход — пять секунд: нажмите на соседний узел.",
      "Цифра на узле — сколько заражённых узлов рядом с ним.",
      "Шагнёте на заражённый узел или встретите код — зонд отбросит, и он пропустит ход.",
      "Печать чистоты на пути — код замрёт на ход.",
      "Хоть один зонд в ядре раньше кода — замок ваш.",
    ];
    el.replaceChildren(h("div.nk-hk-center", {},
      h("div.nk-hk-rules", {}, rules.map(t => h("p", {}, t))),
      h("button.nk-btn.nk-hk-go", { onclick: e => { e.currentTarget.disabled = true; beep("pick"); this.ctx.ready(hk); } }, "ГОТОВ")), h("div.nk-hk-scan"));
  }

  renderWait(hk, gm) {
    const el = this.shell(gm ? "nk-hk-full nk-hk-gm" : "nk-hk-full");
    el.dataset.view = "wait";
    const ready = hk.order.filter(a => hk.ready[a]).length;
    el.replaceChildren(this.topBtns() || "", h("div.nk-hk-center", {},
      h("div.nk-hk-mid", {}, gm ? "ИГРОКИ ЧИТАЮТ ПРАВИЛА" : "ЖДЁМ ОСТАЛЬНЫХ"),
      h("div.nk-hk-list", {}, hk.order.map(a => h("div", { class: hk.ready[a] ? "ok" : "" },
        h("i", { style: `background:${hk.probes[a].color}` }), hk.probes[a].name, h("span", {}, hk.ready[a] ? "ГОТОВ" : "…")))),
      gm ? h("div.nk-hk-row", {},
        h("button.nk-btn", { onclick: () => forceStart(this.ctx) }, `НАЧАТЬ СЕЙЧАС · ${ready} ИЗ ${hk.order.length}`),
        h("button.nk-btn", { onclick: () => abortGame(this.ctx) }, "ОТМЕНИТЬ")) : null), h("div.nk-hk-scan"));
  }

  renderCount(hk) {
    const el = this.shell("nk-hk-full");
    if (el.dataset.view === "count") return;
    el.dataset.view = "count";
    const num = h("div.nk-hk-count", {}, "3");
    el.replaceChildren(this.topBtns() || "", h("div.nk-hk-center", {}, h("div.nk-hk-mid", {}, "ЗОНДЫ В СЕТИ"), num), h("div.nk-hk-scan"));
    let n = 3; beep("tick");
    const iv = setInterval(() => { n--; if (n <= 0 || !num.isConnected) return clearInterval(iv); num.textContent = String(n); beep("tick"); }, 1000);
    this.timers.push(iv);
  }

  // ---------------------------------------------------------------- поле
  renderPlay(hk, mine) {
    const el = this.shell(`nk-hk-full nk-hk-play${this.ctx.gmView() ? " nk-hk-gm" : ""}`);
    const newTurn = hk.turn !== this.lastTurn;
    if (el.dataset.view !== "play") {
      el.dataset.view = "play"; this.pieces.clear();
      this.bar = h("div.nk-hk-bar", {}, h("i"));
      this.secs = h("b.nk-hk-secs", {}, "5");
      this.turnEl = h("b", {}, "ХОД 1");
      this.wormEl = h("span.nk-hk-wst", {}, "");
      this.cellsEl = h("div.nk-hk-cells"); this.piecesEl = h("div.nk-hk-pieces");
      this.board = h("div.nk-hk-board", {}, this.cellsEl, this.piecesEl);
      this.side = h("div.nk-hk-side");
      this.banner = h("div.nk-hk-banner");
      el.replaceChildren(this.topBtns() || "",
        h("div.nk-hk-top", {}, this.turnEl, this.bar, this.secs, this.wormEl),
        h("div.nk-hk-mainrow", {}, this.board, this.side),
        h("div.nk-hk-hint", {}, mine ? "Нажмите на соседний узел или стрелки на клавиатуре" : "Вы смотрите со стороны"),
        this.banner, h("div.nk-hk-scan"));
      this.keys = e => this.onKey(e);
      window.addEventListener("keydown", this.keys);
      const iv = setInterval(() => {
        if (!this.board?.isConnected) { clearInterval(iv); window.removeEventListener("keydown", this.keys); return; }
        const left = Math.max(0, TURN_MS - (performance.now() - this.turnStart));
        const s = Math.ceil(left / 1000); if (this.secs.textContent !== String(s)) { this.secs.textContent = String(s); if (s <= 2 && s > 0 && this.mineActive) beep("tick"); }
      }, 100);
      this.timers.push(iv);
    }
    if (newTurn) {
      this.lastTurn = hk.turn; this.pick = null; this.turnStart = performance.now();
      const bi = this.bar.firstChild; bi.style.animation = "none"; void bi.offsetWidth; bi.style.animation = `nk-hk-bar ${TURN_MS}ms linear forwards`;
      this.playEvents(hk, mine);
    }
    this.turnEl.textContent = `ХОД ${hk.turn}`;
    const w = hk.worm;
    this.wormEl.textContent = w.sleep > 0 ? "КОД ЕЩЁ СПИТ" : w.stun > 0 ? "КОД ЗАМЕР" : "КОД ПОЛЗЁТ";
    this.wormEl.className = `nk-hk-wst ${w.sleep > 0 || w.stun > 0 ? "calm" : ""}`;
    this.mineActive = !!(mine && !hk.probes[mine].stun);
    this.drawBoard(hk, mine);
    this.drawSide(hk, mine);
  }

  drawBoard(hk, mine) {
    const size = Math.floor(Math.min(window.innerHeight * 0.72, window.innerWidth * 0.58)), cs = size / N;
    const B = this.board; B.style.width = B.style.height = `${size}px`;
    if (this.cs && Math.abs(this.cs - cs) > 0.5) { this.piecesEl.replaceChildren(); this.pieces.clear(); }
    this.cs = cs;
    const walls = wallsOf(hk), boom = new Set(hk.boom), safe = new Set(hk.safe), seals = new Set(hk.seals);
    const gmMines = this.ctx.gmView() ? minesOf(hk) : null;
    const me = mine ? hk.probes[mine] : null;
    const can = new Set(me && !me.stun ? nbrs(walls, me.p).filter(q => !boom.has(K(...q))).map(q => K(...q)) : []);
    if (!this.pick && hk.choice?.[mine]) this.pick = hk.choice[mine];
    const pick = this.pick ? K(...this.pick) : null;
    const trail = new Set(hk.worm.trail.map(p => K(...p)));
    // дорожки
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "nk-hk-tr"); svg.setAttribute("viewBox", `0 0 ${N} ${N}`); svg.setAttribute("preserveAspectRatio", "none");
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
      if (walls.has(K(x, y))) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const q = [x + dx, y + dy]; if (!inside(q) || walls.has(K(...q))) continue;
        const l = document.createElementNS(ns, "line");
        l.setAttribute("x1", x + 0.5); l.setAttribute("y1", y + 0.5); l.setAttribute("x2", q[0] + 0.5); l.setAttribute("y2", q[1] + 0.5);
        svg.append(l);
      }
    }
    const cells = [svg];
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
      const k = K(x, y), st = `left:${x * cs}px;top:${y * cs}px;width:${cs}px;height:${cs}px`;
      if (walls.has(k)) { cells.push(h("div.nk-hk-wall", { style: st })); continue; }
      const cls = ["nk-hk-n"];
      if (eq([x, y], CORE)) cls.push("core");
      if (k in hk.rev) cls.push("rev", `n${Math.min(hk.rev[k], 3)}`);
      else if (safe.has(k)) cls.push("safe");
      if (boom.has(k)) cls.push("boom");
      if (trail.has(k)) cls.push("trail");
      if (gmMines?.has(k) && !boom.has(k)) cls.push("gmmine");
      if (can.has(k)) cls.push("can");
      if (pick === k) cls.push("pick");
      const kids = [h("i.dot")];
      if (eq([x, y], CORE)) kids.push(gearSvg(cs * 1.25, hk.phase === "end" && hk.result && !hk.result.win ? "#ff2a2a" : "#8dffa8"));
      else if (boom.has(k)) kids.push(starSvg(cs * 0.62, "#ff3b2a"));
      else if (k in hk.rev && hk.rev[k] > 0) kids.push(h("b", {}, String(hk.rev[k])));
      if (seals.has(k)) kids.push(h("i.seal"));
      cells.push(h("div", { class: cls.join(" "), style: st, "data-x": x, "data-y": y, onclick: can.has(k) ? () => this.choose([x, y]) : null }, kids));
    }
    this.cellsEl.replaceChildren(...cells);
    // зонды и код: свои элементы, чтобы двигались плавно
    const place = (key, p, mk, ox = 0) => {
      let e = this.pieces.get(key);
      if (!e) { e = mk(); this.pieces.set(key, e); this.piecesEl.append(e); }
      e.style.width = e.style.height = `${cs}px`;
      e.style.transform = `translate(${p[0] * cs + ox}px, ${p[1] * cs}px)`;
      return e;
    };
    const atCell = new Map();
    for (const aid of hk.order) { const k = K(...hk.probes[aid].p); atCell.set(k, (atCell.get(k) || 0) + 1); }
    const seen = new Map();
    for (const aid of hk.order) {
      const pr = hk.probes[aid], k = K(...pr.p), i = seen.get(k) || 0, n = atCell.get(k); seen.set(k, i + 1);
      const e = place(aid, pr.p, () => h("div.nk-hk-pr", { style: `--c:${pr.color}` }, h("i"), h("b")), n > 1 ? (i - (n - 1) / 2) * cs * 0.22 : 0);
      e.classList.toggle("me", aid === mine); e.classList.toggle("stun", pr.stun > 0);
      e.lastChild.textContent = String(hk.rev[k] ?? "");             // цифра узла, на котором стоит зонд
      e.title = pr.name;
    }
    const we = place("__worm", hk.worm.p, () => { const d = h("div.nk-hk-worm"); d.append(starSvg(100, "#ff2a2a")); return d; });
    we.classList.toggle("sleep", hk.worm.sleep > 0 || hk.worm.stun > 0);
  }

  drawSide(hk, mine) {
    this.side.replaceChildren(
      h("div.nk-hk-sh", {}, "ЗОНДЫ"),
      ...hk.order.map(a => {
        const pr = hk.probes[a], chose = !!hk.choice?.[a];
        return h("div", { class: `nk-hk-it ${a === mine ? "me" : ""}` }, h("i", { style: `background:${pr.color}` }), h("span", {}, pr.name),
          h("em", {}, pr.stun ? "СБИТ" : chose ? "✓" : ""));
      }),
      h("div.nk-hk-legend", {},
        h("div", {}, h("i.lg-n"), "цифра — заражённых рядом"),
        h("div", {}, h("i.lg-s"), "рядом с нулём — чисто"),
        h("div", {}, h("i.lg-seal"), "печать чистоты"),
        h("div", {}, h("i.lg-core"), "ядро замка")));
  }

  choose(c) {
    const hk = this.ctx.get(), mine = this.mineId();
    if (!hk || hk.phase !== "play" || !mine) return;
    this.pick = c; beep("pick");
    this.ctx.pick(hk, c);
    if (this.board?.isConnected && this.ctx.get() === hk && hk.phase === "play") this.drawBoard(hk, mine);
  }
  onKey(e) {
    const hk = this.ctx.get(), mine = this.mineId();
    if (!hk || hk.phase !== "play" || !mine || e.target?.closest?.("input,textarea,[contenteditable]")) return;
    const d = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] }[e.code];
    if (!d) return;
    const pr = hk.probes[mine]; if (pr.stun) return;
    const c = [pr.p[0] + d[0], pr.p[1] + d[1]];
    if (!inside(c) || wallsOf(hk).has(K(...c)) || hk.boom.includes(K(...c))) return;
    e.preventDefault(); e.stopPropagation();
    this.choose(c);
  }

  playEvents(hk, mine) {
    let msg = "";
    for (const ev of hk.events || []) {
      if (ev.k === "boom") { beep("boom"); if (ev.aid === mine) msg = "ЗАРАЖЁННЫЙ УЗЕЛ · ЗОНД СБИТ"; this.flash(ev.x, ev.y, "boom"); }
      else if (ev.k === "eat") { beep("boom"); if (ev.aid === mine) msg = "КОД НАСТИГ ЗОНД"; this.flash(ev.x, ev.y, "boom"); }
      else if (ev.k === "seal") { beep("seal"); msg = "ПЕЧАТЬ ЧИСТОТЫ · КОД ЗАМЕР"; }
      else if (ev.k === "sleep" && !msg) msg = "КОД ЕЩЁ СПИТ";
    }
    if (hk.turn > 1 && !(hk.events || []).some(e => e.k === "sleep" || e.k === "wstun")) beep("worm");
    if (hk.turn === 1) beep("go");
    if (msg && this.banner) { this.banner.textContent = msg; this.banner.classList.remove("on"); void this.banner.offsetWidth; this.banner.classList.add("on"); }
  }
  flash(x, y, kind) {
    const cs = this.cs || parseFloat(this.board.style.width) / N;
    const f = h("div", { class: `nk-hk-fx ${kind}`, style: `left:${x * cs}px;top:${y * cs}px;width:${cs}px;height:${cs}px` });
    this.board.append(f); setTimeout(() => f.remove(), 900);
  }

  renderEnd(hk, mine) {
    const el = this.shell(`nk-hk-full nk-hk-end ${hk.result?.win ? "win" : "lose"}`);
    if (el.dataset.view === `end-${hk.id}`) return;
    el.dataset.view = `end-${hk.id}`;
    if (this.board) window.removeEventListener("keydown", this.keys);
    const r = hk.result || {};
    beep(r.win ? "win" : "lose");
    let title, text;
    if (r.win) {
      const pr = hk.probes[r.by[0]], n = pr.moves;
      title = "НАПРЯЖЕНИЕ СНЯТО";
      text = `${pr.name} ${g("{довела|довёл}", pr.gender)} зонд до ядра за ${n} ${plural(n, "ход", "хода", "ходов")}. Разряды на раме восьмой камеры гаснут один за другим. В темноте за дверью что-то блестит.`;
    } else {
      title = "КОД ЗАБРАЛ ЯДРО";
      text = "Экран заливает красным. Сквозь помехи проступает звезда из восьми стрелок, и терминал гаснет с треском. Разряды на двери бьют сильнее прежнего.";
    }
    const kids = [h("div.nk-hk-big.res", {}, title), h("div.nk-hk-text", {}, text)];
    if (!r.win) { const s = h("div.nk-hk-star end"); s.append(starSvg(360, "rgba(255,30,20,.28)")); el.replaceChildren(s); } else el.replaceChildren();
    if (this.ctx.trial) {
      const n = Object.values(hk.probes).reduce((a, p) => a + (p.uid ? 0 : 1), 0);
      kids.push(h("div.nk-hk-trial in", {}, `проба · ходов ${r.turns ?? hk.turn}${n ? ` · ботов ${n}` : ""}${hk.lag ? " · код отставал на ход" : ""}`));
    }
    el.append(this.topBtns() || "", h("div.nk-hk-center", {}, ...kids,
      this.ctx.trial
        ? h("div.nk-hk-row", {}, h("button.nk-btn", { onclick: () => openTrial(TRIAL.n) }, "ЕЩЁ РАЗ"), h("button.nk-btn", { onclick: () => abortGame(this.ctx) }, "ЗАКРЫТЬ"))
        : this.ctx.gmView()
        ? h("div.nk-hk-row", {}, h("button.nk-btn", { onclick: () => abortGame() }, "ЗАКРЫТЬ У ВСЕХ"))
        : h("button.nk-btn.nk-hk-go", { onclick: () => { this.closedEnd = true; this.close(); } }, "ЗАКРЫТЬ")), h("div.nk-hk-scan"));
  }
}

export const hackUI = new HackUI(WORLD);
const trialUI = new HackUI(TRIAL);

// ---------------------------------------------------------------- кнопки для пульта
export function hackTools(rerender) {
  const st = S.get(), hk = st.hack, prep = st.hackPrep;
  const heroes = Object.entries(st.roster || {}).map(([uid, aid]) => ({ uid, aid, hero: st.heroes?.[aid], actor: game.actors.get(aid), user: game.users.get(uid) })).filter(x => x.hero && x.actor);
  const rows = [h("div.nk-g-th", {}, "ТЕРМИНАЛ КАМЕРЫ 8 · МИНИ-ИГРА")];
  if (!hk) {
    rows.push(h("div.nk-g-row", {},
      h("div.nk-g-lab", {}, "ВЗЛАМЫВАЕТ"),
      heroes.length ? heroes.map(x => h("button", { class: `nk-chip ${prep?.aid === x.aid ? "scared" : ""}`, "data-hacker": x.aid, title: `Проверка Интеллекта${x.hero.cls === "tehnozhrec" ? " с преимуществом" : ""}`,
        onclick: async () => { await rollHacker(x.aid); rerender(); } }, h("b", {}, x.hero.name || x.actor.name), x.hero.cls === "tehnozhrec" ? h("span", {}, "ПРЕИМ.") : null))
        : h("span.nk-g-hint", {}, "Сначала назначьте героев во вкладке «Герои и вера».")));
    rows.push(h("div.nk-g-row", {},
      prep ? h("span.nk-g-res", {}, `${prep.name}: ${prep.total} — ${prep.lag ? "код проснётся на ход позже" : "код стартует сразу"}`) : h("span.nk-g-hint", {}, "Без проверки код стартует сразу."),
      prep ? h("button.nk-btn.small", { onclick: async () => { await clearHacker(); rerender(); } }, "СБРОСИТЬ") : null,
      h("div", { style: "flex:1" }),
      h("button.nk-btn", { "data-hack-open": "1", onclick: async () => { await openGame(); setTimeout(rerender, 300); } }, "ОТКРЫТЬ ИГРУ У ИГРОКОВ")));
    const bots = Math.min(5, Math.max(heroes.length, 5)) - 1;
    rows.push(h("div.nk-g-row", {},
      h("div.nk-g-lab", {}, "ПРОБА"),
      h("button.nk-btn.small", { "data-hack-trial": "1", title: "Только у вас: ведёте один зонд против кода", onclick: () => openTrial(1) }, "ОДИН ЗОНД"),
      h("button.nk-btn.small", { "data-hack-trial": String(bots + 1), title: `Только у вас: ваш зонд и ${bots} бота, как в игре на пятерых`, onclick: () => openTrial(bots + 1) }, `ВЫ И ${bots} БОТА`),
      h("span.nk-g-hint", {}, prep ? `Код ${prep.lag ? "отстаёт на ход" : "без отставания"}, как по проверке выше.` : "Игроки ничего не видят, мир не меняется.")));
  } else {
    const phase = { intro: "игроки читают правила", count: "отсчёт", play: `идёт ход ${hk.turn}`, end: hk.result?.win ? `победа: ${hk.probes[hk.result.by[0]]?.name}, ${hk.probes[hk.result.by[0]]?.moves} ход.` : "код забрал ядро" }[hk.phase];
    rows.push(h("div.nk-g-row", {},
      h("span.nk-g-res", {}, `Игра: ${phase}. Зондов ${hk.order.length}. ${hk.lag ? "Код отстаёт на ход." : "Код без отставания."}`),
      h("div", { style: "flex:1" }),
      hk.phase === "intro" ? h("button.nk-btn", { onclick: () => forceStart() }, "НАЧАТЬ СЕЙЧАС") : null,
      h("button.nk-btn", { "data-hack-show": "1", onclick: () => hackUI.showGM() }, "ПОКАЗАТЬ ИГРУ"),
      h("button.nk-btn", { "data-hack-abort": "1", onclick: async () => { await abortGame(); rerender(); } }, hk.phase === "end" ? "ЗАКРЫТЬ У ВСЕХ" : "ПРЕРВАТЬ")));
  }
  rows.push(h("div.nk-g-small", {}, `Проверка Интеллекта больше 12 — код просыпается на ход позже. Техножрец бросает с преимуществом. Играют все игроки в сети, по зонду на героя.`));
  return h("div.nk-g-tools", {}, rows);
}
