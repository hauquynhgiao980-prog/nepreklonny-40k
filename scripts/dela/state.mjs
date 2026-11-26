// Состояние «Дела»: настройка мира, запись только у мастера, сокеты от игроков.
import { CLASS_BY_ID, heroNames, ANKETA, points, rewardsOf, TRIAL_META, trialResult } from "./texts.mjs";

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

// ---------------------------------------------------------------- испытания
/** Мастер запускает испытание n для всех назначенных героев. */
export function startTrial(n) {
  return update(s => {
    const M = TRIAL_META[n - 1]; if (!M) return false;
    s.trial = { n, id: Date.now(), phase: s.trialMode === "manual" ? "choose" : "roll", heroes: Object.values(s.roster || {}).filter(a => s.heroes?.[a]), picks: {}, rolls: {} };
  });
}
/** Режим испытаний: auto — броски сразу после выбора, manual — броски открывает мастер. */
export const setTrialMode = mode => update(s => { s.trialMode = mode; if (mode === "auto" && s.trial?.phase === "choose") s.trial.phase = "roll"; });
export const openRolls = () => update(s => { if (!s.trial) return false; s.trial.phase = "roll"; });
export const cancelTrial = () => update(s => { if (!s.trial) return false; delete s.trial; });
export function setPick(aid, c, shot = false) {
  return update(s => {
    const T = s.trial; if (!T || !T.heroes.includes(aid)) return false;
    if (!c) delete T.picks[aid]; else T.picks[aid] = { c, shot: !!(shot && c === "w" && TRIAL_META[T.n - 1]?.shot), at: Date.now() };
  });
}
export function setRoll(aid, r) {
  return update(s => {
    const T = s.trial; if (!T || !T.heroes.includes(aid)) return false;
    if (!r) { delete T.rolls[aid]; return; }
    const total = Number(r.total); if (!Number.isFinite(total)) return false;
    T.rolls[aid] = { total, ability: String(r.ability || ""), d20: r.d20 ?? null, mode: r.mode || "", dar: !!r.dar, by: r.by || "" };
  });
}
export function trialSum(T) { return trialResult(T.n, Object.values(T.rolls || {}).map(r => r.total)); }
/** Применить: выборы в шкалы героев, итог в летопись и корпус. */
export function applyTrial(outcome) {
  return update(s => {
    const T = s.trial; if (!T) return false;
    const oc = outcome || trialSum(T).outcome; if (!oc) return false;
    for (const [aid, p] of Object.entries(T.picks)) { const h = s.heroes[aid]; if (h) { h.trials = h.trials || {}; h.trials[T.n] = p.c; } }
    s.outcomes = s.outcomes || {}; s.outcomes[T.n] = oc;
    s.lastTrial = { id: T.id, n: T.n, outcome: oc };
    delete s.trial;
  });
}
/** Спасбросок героя: у игрока — его рукой, у мастера — за отсутствующего. */
export async function rollSave(actorId, ability, mode) {
  const actor = game.actors.get(actorId);
  if (!actor?.rollSavingThrow) throw new Error("нет персонажа для броска");
  const rolls = await actor.rollSavingThrow({ ability, advantage: mode === "adv", disadvantage: mode === "dis" },
    { configure: false }, { rollMode: "gmroll" });
  const r = Array.isArray(rolls) ? rolls[0] : rolls;
  if (!r) return null;
  const d20 = r.d20?.total ?? r.dice?.[0]?.total ?? null;
  return { total: r.total, d20 };
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
  } else if (msg.t === "dela.pick") {
    const aid = get().roster?.[uid];
    if (!aid || get().trial?.n !== msg.n || !["w", "o", "n"].includes(msg.c) || get().trial?.picks?.[aid]) return;
    setPick(aid, msg.c, msg.shot);
  } else if (msg.t === "dela.roll") {
    const aid = get().roster?.[uid], T = get().trial;
    if (!aid || T?.n !== msg.n || !T.picks?.[aid] || T.phase !== "roll") return;
    setRoll(aid, { total: msg.total, ability: msg.ability, d20: msg.d20, mode: msg.mode, dar: msg.dar, by: "player" });
  } else if (msg.t === "dela.use") {
    update(s => {
      const h = heroOfUser(uid, s);
      if (!h || !heroRewards(h).includes(msg.key)) return false;
      h.used = h.used || {};
      h.used[msg.key] = !h.used[msg.key];
    });
  }
}
