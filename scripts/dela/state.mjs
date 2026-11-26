// Состояние «Дела»: настройка мира, запись только у мастера, сокеты от игроков.
import { CLASS_BY_ID, heroNames, ANKETA, points, rewardsOf } from "./texts.mjs";

export const MOD = "nepreklonny-40k";
export const SOCKET = `module.${MOD}`;
const KEY = "dela";

const listeners = new Set();
export const progress = {};          // у мастера: userId → { step, at } — кто на каком слайде анкеты

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emitChange() { for (const fn of listeners) try { fn(get()); } catch (e) { console.error(e); } }

export function registerSettings() {
  game.settings.register(MOD, KEY, { scope: "world", config: false, type: Object, default: {}, onChange: () => emitChange() });
  game.settings.register(MOD, "delaPad", { scope: "client", config: false, type: Object, default: {} });
}

export function blank() {
  return { v: 1, hullAdj: 0, roster: {}, heroes: {}, anketaOpen: {}, outcomes: {} };
}

export function get() {
  const s = game.settings.get(MOD, KEY);
  return s && s.v ? s : blank();
}

const clone = o => (typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

// очередь записей, чтобы быстрые клики не затирали друг друга
let chain = Promise.resolve();
export function update(fn) {
  if (!game.user.isGM) return Promise.resolve();
  chain = chain.then(async () => {
    const s = clone(get());
    const r = await fn(s);
    if (r === false) return;
    await game.settings.set(MOD, KEY, s);
  }).catch(e => { console.error(`${MOD} | dela`, e); ui.notifications?.error("Дело: не удалось сохранить, подробности в консоли."); });
  return chain;
}

export function hull(s = get()) {
  const fails = Object.values(s.outcomes || {}).filter(o => o === "fail").length;
  return Math.max(0, Math.min(8, 8 + (s.hullAdj || 0) - fails));
}

export function heroOfUser(userId, s = get()) {
  const aid = s.roster?.[userId];
  return aid ? s.heroes?.[aid] || null : null;
}

export function heroPoints(hero) { return points(hero, 3, true); }
export function heroRewards(hero) { const p = heroPoints(hero); return rewardsOf(p.l, p.h); }

/** Пригодные герои мира: персонажи с классом из наших пяти. */
export function pregens() {
  const out = [];
  for (const a of game.actors ?? []) {
    if (a.type !== "character") continue;
    const cls = a.items?.find?.(i => i.type === "class" && CLASS_BY_ID[i.system?.identifier]);
    if (!cls) continue;
    out.push({ id: a.id, name: a.name, cls: CLASS_BY_ID[cls.system.identifier], img: a.img });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, "ru"));
}

function heroRecord(actor, cls, prev) {
  const n = heroNames(actor.name);
  return Object.assign({ cls, gender: n.gender, name: n.name, head: n.head, actorName: actor.name,
    anketa: { done: false, answers: [], side: null }, trials: {}, adj: { l: 0, h: 0 }, used: {} }, prev || {},
    { cls, name: n.name, head: n.head, actorName: actor.name });
}

/** Назначить игроку героя (или снять, если actorId пуст). */
export async function assign(userId, actorId) {
  const user = game.users.get(userId);
  const actor = actorId ? game.actors.get(actorId) : null;
  await update(s => {
    for (const [u, a] of Object.entries(s.roster)) if (a === actorId && u !== userId) delete s.roster[u];
    if (!actor) { delete s.roster[userId]; delete s.anketaOpen[userId]; return; }
    const p = pregens().find(x => x.id === actorId);
    s.roster[userId] = actorId;
    s.heroes[actorId] = heroRecord(actor, p?.cls, s.heroes[actorId]);
  });
  if (user && actor) {
    try { await user.update({ character: actor.id }); } catch (e) { console.warn(e); }
    try { await actor.update({ [`ownership.${userId}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }); } catch (e) { console.warn(e); }
  } else if (user && !actor) {
    try { await user.update({ character: null }); } catch (e) { console.warn(e); }
  }
}

/** Раздать анкету: всем назначенным (userIds не задан) или выбранным. */
export function openAnketa(userIds) {
  return update(s => {
    const ids = userIds ?? Object.keys(s.roster);
    for (const u of ids) {
      const h = heroOfUser(u, s);
      if (h && !h.anketa?.done) s.anketaOpen[u] = true;
    }
  });
}

export function resetAnketa(userId) {
  return update(s => {
    const h = heroOfUser(userId, s);
    if (!h) return false;
    h.anketa = { done: false, answers: [], side: null };
    s.anketaOpen[userId] = true;
  });
}

// ---------------------------------------------------------------- сокет
export function send(msg) { game.socket.emit(SOCKET, Object.assign({ t: "", userId: game.user.id }, msg)); }

const isActiveGM = () => game.user.isGM && (!game.users.activeGM || game.users.activeGM.id === game.user.id);

export function handleSocket(msg, senderId) {
  if (!msg || typeof msg.t !== "string" || !msg.t.startsWith("dela.")) return;
  if (!isActiveGM()) return;
  const uid = msg.userId || senderId;
  if (!game.users.get(uid)) return;
  if (msg.t === "dela.progress") {
    progress[uid] = { step: msg.step, at: Date.now() };
    emitChange();
  } else if (msg.t === "dela.answer") {
    const A = msg.answers;
    update(s => {
      const h = heroOfUser(uid, s);
      if (!h || !Array.isArray(A) || A.length !== 4) return false;
      const S = ANKETA[h.cls];
      if (!S || A.some((a, i) => !Number.isInteger(a) || !S[i].opts[a])) return false;
      h.anketa = { done: true, answers: A, side: S[3].opts[A[3]].side, at: Date.now() };
      delete s.anketaOpen[uid];
    });
    delete progress[uid];
  } else if (msg.t === "dela.use") {
    update(s => {
      const h = heroOfUser(uid, s);
      if (!h || !heroRewards(h).includes(msg.key)) return false;
      h.used = h.used || {};
      h.used[msg.key] = !h.used[msg.key];
    });
  }
}
