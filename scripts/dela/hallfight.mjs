// Зал этапа: враги высаживаются из торпеды и разбегаются по залу, граната вожака со спасброском Ловкости у игроков,
// «Врагов уносит» — после декомпрессии половину оставшихся тянет в пробоину. Всё запускает мастер.
import * as S from "./state.mjs";
import { h } from "./ui.mjs";
import { saveMod } from "./trial.mjs";

const MOD = S.MOD;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const hpOf = t => Number(t.actor?.system?.attributes?.hp?.value ?? 0);
const isHero = t => t.actor?.type === "character";

/** Клетки сцены и стены (стены — с холста, поэтому сцена должна быть открыта у мастера). */
function grid(scene) {
  const G = scene.grid.size, dim = scene.dimensions;
  const W = Math.ceil(dim.width / G), H = Math.ceil(dim.height / G);
  const key = c => `${c.x},${c.y}`;
  const cellOf = d => ({ x: Math.round(d.x / G), y: Math.round(d.y / G) });
  const center = c => ({ x: (c.x + 0.5) * G, y: (c.y + 0.5) * G });
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const memo = new Map();                                                   // стены между соседними клетками — один раз на ребро
  const blocked = (a, b) => {
    const k = a.x < b.x || (a.x === b.x && a.y < b.y) ? `${key(a)}|${key(b)}` : `${key(b)}|${key(a)}`;
    if (memo.has(k)) return memo.get(k);
    let r = false;
    try { r = !!CONFIG.Canvas.polygonBackends.move.testCollision(center(a), center(b), { type: "move", mode: "any" }); } catch { r = false; }
    memo.set(k, r); return r;
  };
  /** Поиск в ширину: куда можно дойти за steps клеток. noPass — клетки, сквозь которые нельзя (чужие). */
  function reach(from, steps, noPass) {
    const seen = new Map([[key(from), 0]]), prev = new Map(), q = [from];
    while (q.length) {
      const c = q.shift(), d = seen.get(key(c));
      if (d >= steps) continue;
      for (const [dx, dy] of DIRS) {
        const n = { x: c.x + dx, y: c.y + dy }, k = key(n);
        if (n.x < 0 || n.y < 0 || n.x >= W || n.y >= H || seen.has(k) || noPass.has(k) || blocked(c, n)) continue;
        seen.set(k, d + 1); prev.set(k, c); q.push(n);
      }
    }
    const cells = [...seen].map(([k, d]) => { const [x, y] = k.split(",").map(Number); return { x, y, d }; });
    const path = dest => { const p = []; let c = dest; while (c && key(c) !== key(from)) { p.unshift({ x: c.x, y: c.y }); c = prev.get(key(c)); } return p; };
    return { cells, path };
  }
  const nearWall = c => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => blocked(c, { x: c.x + dx, y: c.y + dy }));
  return { G, key, cellOf, center, cheb, reach, nearWall };
}

/** Провести токен по клеткам одним move(); дождаться, пока документ встанет в конец (по клеткам заново не гнать). */
async function walk(doc, path, G) {
  if (!path.length) return;
  const wps = path.map(c => ({ x: c.x * G, y: c.y * G })), last = wps[wps.length - 1];
  const there = () => Math.round(doc.x / G) === Math.round(last.x / G) && Math.round(doc.y / G) === Math.round(last.y / G);
  if (typeof doc.move === "function") {
    let ok = null;
    try { ok = await doc.move(wps, { method: "api" }); } catch (e) { console.warn(`${MOD} | ход`, e); ok = false; }
    const until = Date.now() + 8000;
    while (ok !== false && !there() && Date.now() < until) await sleep(100);
  } else await doc.update(last);
}

/* ─────────────── высадка: враги разбегаются по залу ─────────────── */

/** Разогнать токены врагов по залу. role(t): "knife" | "gun" | "leader" | null (стоит на месте). */
export async function scatter(scene, docs, role) {
  if (canvas.scene?.id !== scene.id) return;
  const g = grid(scene), all = scene.tokens.filter(t => !t.hidden);
  const heroes = all.filter(isHero).map(t => g.cellOf(t));
  // героев на сцене нет — ориентир нижний шлюз, откуда они приходят
  const ref = heroes.length ? heroes : [g.cellOf({ x: 1130 - g.G / 2, y: 2660 - g.G / 2 })];
  const distHero = c => Math.min(...ref.map(r => g.cheb(c, r)));
  const mine = new Set(docs.map(d => d.id));
  const noPass = new Set(all.filter(t => isHero(t)).map(t => g.key(g.cellOf(t))));
  const taken = new Set(all.filter(t => !mine.has(t.id)).map(t => g.key(g.cellOf(t))));
  const claimed = [], plans = [];
  const WANT = { knife: [2, 4], gun: [6, 9], leader: [4, 6] }, STEPS = { knife: 12, gun: 12, leader: 8 }, GAP = { knife: 2, gun: 3, leader: 2 };
  for (const d of shuffle(docs)) {
    const r = role(d); if (!r) continue;
    const from = g.cellOf(d), R = g.reach(from, STEPS[r], noPass), [lo, hi] = WANT[r];
    let best = null;
    for (const c of R.cells) {
      if (c.d === 0 || taken.has(g.key(c))) continue;
      const dh = distHero(c);
      if (dh < 2) continue;                                               // не вплотную: бой ещё не начался
      const gap = claimed.length ? Math.min(...claimed.map(k => g.cheb(k, c))) : 9;
      if (gap < GAP[r]) continue;
      let s = dh < lo ? (lo - dh) * 3 : dh > hi ? (dh - hi) * 2 : 0;
      s -= Math.min(gap, 6) * 0.45;                                       // рассыпаться, а не кучей
      if (r === "gun" && g.nearWall(c)) s -= 2.5;                         // стрелку — к укрытию
      s += Math.random() * 1.6;
      if (!best || s < best.s) best = { c, s };
    }
    if (!best) continue;
    claimed.push(best.c); taken.add(g.key(best.c));
    plans.push({ d, path: R.path(best.c) });
  }
  await Promise.all(plans.map(({ d, path }, i) => sleep(i * 180 + Math.random() * 150).then(() => walk(d, path, g.G))));
  return plans.length;
}

/* ─────────────── «Врагов уносит»: половина оставшихся улетает в пробоину ─────────────── */

const CRIES = ["Нееет!", "Нееееет!", "Не-е-ет!", "Нет! Нет! Нееет!"];

/** Точка пробоины: звук ветра у дыры, иначе правый борт на уровне торпеды. */
export function holePoint(scene) {
  const s = scene.sounds.find(x => x.flags?.[MOD]?.role === "wind");
  return s ? { x: s.x - 40, y: s.y } : { x: scene.dimensions.sceneX + scene.dimensions.sceneWidth * 0.84, y: scene.dimensions.sceneY + scene.dimensions.sceneHeight / 2 };
}

/** Утащить в пустоту: все трупы на сцене (кроме героев) и половину живых из docs (или всех, half: false).
 *  Живые кричат, трупы молча; все кувырком летят к пробоине, токены удаляются. Возвращает { dead, alive } — имена. */
export async function sweep(scene, docs, { half = true, corpses = true } = {}) {
  const live = docs.filter(d => !d.hidden && hpOf(d) > 0);
  const picked = half ? shuffle(live).slice(0, Math.ceil(live.length / 2)) : live;
  const dead = corpses ? scene.tokens.filter(t => !t.hidden && t.actor && !isHero(t) && hpOf(t) <= 0) : [];
  const hole = holePoint(scene), G = scene.grid.size;
  const fly = async (d, i, shout) => {
    await sleep(i * 380);
    if (shout) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ token: d }), content: CRIES[Math.floor(Math.random() * CRIES.length)], style: CONST.CHAT_MESSAGE_STYLES.IC }); } catch {}
      await sleep(350);
    }
    const w = (d.width || 1) * G;
    try {
      await d.update({ x: Math.round(hole.x - w / 2), y: Math.round(hole.y - w / 2), rotation: (d.rotation || 0) + 540 },
        { animation: { duration: 1500, easing: "easeInCubic" }, animate: true });
    } catch (e) { console.warn(`${MOD} | унесло`, e); }
    await sleep(1550);
    try { await d.delete(); } catch (e) { console.warn(`${MOD} | унесло: токен`, e); try { await d.update({ hidden: true }); } catch {} }
  };
  const order = shuffle([...dead.map(d => [d, false]), ...picked.map(d => [d, true])]);
  await Promise.all(order.map(([d, shout], i) => fly(d, i, shout)));
  return { dead: dead.map(d => d.name), alive: picked.map(d => d.name) };
}

/* ─────────────── граната вожака ─────────────── */

export const GRENADE = { dc: 13, n: 3, d: 6, type: "piercing", radius: 10, range: 60 };
const pending = new Map();

/** Лучшая точка: больше всего героев в радиусе, в пределах броска. { at, R, n } или null. */
export function aim(scene, from, cfg = GRENADE) {
  const ft = scene.grid.distance || 5, G = scene.grid.size, R = cfg.radius / ft * G, range = cfg.range / ft * G;
  const heroes = scene.tokens.filter(t => !t.hidden && isHero(t) && hpOf(t) > 0).map(t => t.object).filter(Boolean);
  if (!heroes.length) return null;
  const pts = heroes.map(t => ({ ...t.center }));
  for (let i = 0; i < heroes.length; i++) for (let j = i + 1; j < heroes.length; j++)
    pts.push({ x: (heroes[i].center.x + heroes[j].center.x) / 2, y: (heroes[i].center.y + heroes[j].center.y) / 2 });
  pts.push({ x: pts.slice(0, heroes.length).reduce((s, p) => s + p.x, 0) / heroes.length, y: pts.slice(0, heroes.length).reduce((s, p) => s + p.y, 0) / heroes.length });
  const inR = p => heroes.filter(t => Math.hypot(t.center.x - p.x, t.center.y - p.y) <= R + G * 0.35).length;
  let best = null;
  for (const p of pts) {
    const dist = Math.hypot(p.x - from.x, p.y - from.y);
    if (dist > range) continue;
    const n = inR(p);
    if (!best || n > best.n || (n === best.n && dist < best.dist)) best = { p, n, dist };
  }
  return best ? { at: best.p, R, n: best.n } : null;
}

/** Вожак (или кто угодно) швыряет гранату в скопление героев: эффект, урон, спасброски у игроков, итог в чат. */
export async function throwGrenade(scene, thrower, opts = {}) {
  const cfg = { ...GRENADE, ...opts };
  const tok = thrower?.object;
  if (!tok || canvas.scene?.id !== scene.id) { ui.notifications.warn("Граната: откройте сцену зала этапа, вожак должен быть на карте."); return null; }
  const target = aim(scene, tok.center, cfg);
  if (!target) { ui.notifications.warn(`Граната: героев в пределах ${cfg.range} футов от вожака нет.`); return null; }
  const { at, R } = target, G = scene.grid.size;
  try {
    game.modules.get(MOD)?.api?.spellFx?.emit({ t: "sfx", scene: scene.id, fx: "grenade", kind: "frag", pal: "frag", o: {}, seed: Math.floor(Math.random() * 1e9),
      from: { x: tok.center.x, y: tok.center.y, r: Math.min(tok.w, tok.h) / 2, id: tok.id }, tos: [], at, radius: R });
  } catch (e) { console.warn(`${MOD} | граната: эффект`, e); }
  const victims = canvas.tokens.placeables.filter(t => t !== tok && t.actor && !t.document.hidden && hpOf(t.document) > 0
    && Math.hypot(t.center.x - at.x, t.center.y - at.y) <= R + G * 0.35);
  const roll = await new Roll(`${cfg.n}d${cfg.d}`).evaluate();
  const speaker = ChatMessage.getSpeaker({ token: thrower });
  await roll.toMessage({ speaker, flavor: `<b>Фраг-граната</b> · радиус ${cfg.radius} футов · спасбросок Ловкости Сл ${cfg.dc} · колющий урон, при успехе половина` });
  const full = roll.total, half = Math.floor(full / 2);
  await sleep(900);                                                       // граната долетает и рвётся
  const ask = victims.map(t => {
    const actor = t.actor;
    const user = game.users.find(u => !u.isGM && u.active && actor.testUserPermission(u, "OWNER"));
    if (!user || !isHero(t.document)) return gmSave(actor, cfg).then(total => ({ t, total, by: "мастер" }));
    const id = foundry.utils.randomID();
    const p = new Promise(res => {
      const timer = setTimeout(async () => { pending.delete(id); res({ t, total: await gmSave(actor, cfg), by: "мастер, игрок не ответил" }); }, 60000);
      pending.set(id, total => { clearTimeout(timer); pending.delete(id); res({ t, total, by: user.name }); });
    });
    game.socket.emit(S.SOCKET, { t: "nk.save", to: user.id, id, aid: actor.id, tid: t.id, scene: scene.id, ability: "dex", dc: cfg.dc, full, half });
    return p;
  });
  const results = await Promise.all(ask);
  const lines = [];
  for (const { t, total, by } of results) {
    const ok = total >= cfg.dc, dmg = ok ? half : full;
    try { await t.actor.applyDamage([{ value: dmg, type: cfg.type }]); } catch (e) { console.warn(`${MOD} | граната: урон`, e); }
    lines.push(`<li><b>${t.document.name}</b>: ${total} — ${ok ? "успел укрыться" : "не успел"}, −${dmg}${by === "мастер" ? "" : ` <span style="opacity:.6">(${by})</span>`}</li>`);
  }
  await ChatMessage.create({ speaker, content: `<p><b>Взрыв гранаты</b> · урон ${full}, при успехе ${half}</p>${lines.length ? `<ul>${lines.join("")}</ul>` : "<p>Никого не задело.</p>"}` });
  const item = thrower.actor?.items.find(i => i.flags?.[MOD]?.autoGrenade);
  if (item && !(item.system.uses?.spent >= 1)) try { await item.update({ "system.uses.spent": 1 }); } catch {}
  return results.length;
}

async function gmSave(actor, cfg) {
  try {
    let r = await actor.rollSavingThrow({ ability: "dex", target: cfg.dc }, { configure: false }, { create: true });
    r = Array.isArray(r) ? r[0] : r;
    return r?.total ?? 0;
  } catch (e) { console.warn(`${MOD} | граната: спасбросок`, e); return 0; }
}

/** У игрока: окно со спасброском Ловкости; у мастера: ответ игрока. */
export function onSocket(msg, senderId) {
  if (msg?.t === "nk.saveRes") { if (game.user.isGM) pending.get(msg.id)?.(Number(msg.total) || 0); return; }
  if (msg?.t !== "nk.save" || msg.to !== game.user.id) return;
  const from = game.users.get(senderId);
  if (from && !from.isGM) return;
  const actor = game.actors.get(msg.aid);
  if (!actor) return;
  const mod = saveMod(actor, "dex") ?? 0;
  document.getElementById("nk-scare-roll")?.remove();
  const btn = h("button.nk-btn", {}, `ЛОВКОСТЬ ${mod >= 0 ? "+" : ""}${mod}`);
  const box = h("div", { id: "nk-scare-roll", class: "nk-ui" },
    h("div.nk-sr-h", {}, `ГРАНАТА · СПАСБРОСОК ЛОВКОСТИ · Сл ${msg.dc}`),
    h("div.nk-sr-sub", {}, "Под ноги катится граната. Успеешь упасть за укрытие?"), btn);
  document.body.append(box);
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    let r;
    try { r = await actor.rollSavingThrow({ ability: "dex", target: msg.dc }, { configure: false }); } catch (e) { console.error(e); btn.disabled = false; return; }
    r = Array.isArray(r) ? r[0] : r;
    if (!r) { btn.disabled = false; return; }
    game.socket.emit(S.SOCKET, { t: "nk.saveRes", id: msg.id, total: r.total });
    const ok = r.total >= msg.dc;
    box.replaceChildren(
      h("div", { class: `nk-sr-res ${ok ? "ok" : "bad"}` }, ok ? "УКРЫЛСЯ" : "НЕ УСПЕЛ"),
      h("div.nk-sr-sub", {}, ok ? `Осколки свистят над головой. Урон вдвое меньше: −${msg.half}.` : `Взрыв бьёт в упор. Урон −${msg.full}.`));
    setTimeout(() => box.classList.add("out"), 4200);
    setTimeout(() => box.remove(), 5000);
  });
}

/** Использование гранаты из листа вожака: сами выбираем точку и запрашиваем спасброски. */
export function onUseActivity(activity) {
  const item = activity?.item, cfg = item?.flags?.[MOD]?.autoGrenade;
  if (!cfg || !game.user.isGM) return;
  const doc = activity.actor?.token ?? activity.actor?.getActiveTokens?.(false, true)?.[0];
  if (!doc) return ui.notifications.warn("Граната: вожака нет на открытой сцене.");
  throwGrenade(doc.parent, doc, typeof cfg === "object" ? cfg : {});
}
