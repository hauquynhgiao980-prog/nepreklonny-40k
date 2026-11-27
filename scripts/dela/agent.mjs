/* Агент боя «2. Зал этапа». Кнопка «Агент боя» в событиях зала: запустить / остановить. Работает в браузере мастера.
   Выделяет все видимые токены сцены, создаёт бой (или подхватывает открытый), бросает инициативу и начинает его; дальше
   сам ведёт врагов и героев, чьих игроков нет в сети. Ходы героев живых игроков и нейтральных (Крюк, Сол) ждёт.
   Средняя сложность: честные броски без подкруток; враги не добивают упавших; культисты по «Толпе» — втроём на одного
   и с преимуществом, когда рядом с целью ещё двое культистов; стрелки сидят в люках торпеды (¾ укрытия, +5 КД, пока
   не сошли с места) и бьют очередью из двух выстрелов в одного, выбранного наугад; вожак идёт на комиссара, а без неё —
   на ближнего, и в свой ход швыряет гранату, если герои стоят кучей (двое и больше под взрывом); с лазганами бьют туда,
   где толпа; герои без игроков стреляют, вплотную рубят и добивают раненых, ячеек, гранат и умений не тратят.
   Перед каждым ходом пауза 2 с. После второго раунда останавливается сам (дальше по сценарию — декомпрессия).
   F5 у мастера останавливает агента; кнопка запускает его снова и подхватывает открытый бой. */
import * as HF from "./hallfight.mjs";

const MOD = "nepreklonny-40k";
const MAX_ROUNDS = 2, DELAY = 2000;
const LOUDEST = /Комиссар/;   // «кто громче всех отказался встать на колени» — на него идёт вожак; нет такого на ногах — на ближнего
const CRIES = ["На колени!", "Агнцы, агнцы!", "Слово! Слово!", "Звезда горит!", "Он смотрит на вас!", "Не бойтесь, это недолго!", "Мы были как вы!"];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const E = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export const agentRunning = () => !!globalThis.ClaudeAgent?.running;
export function stopAgent(reason = "остановлен кнопкой") { globalThis.ClaudeAgent?.stop?.(reason); }

export async function startAgent({ log = () => {} } = {}) {
  if (!game.user.isGM) throw new Error("агент боя работает только у мастера");
  globalThis.ClaudeAgent?.stop?.("перезапуск агента");
  const scene = canvas.scene;
  if (!scene) throw new Error("нет открытой сцены");
  const G = scene.grid.size;
  const W = Math.ceil(scene.dimensions.width / G), H = Math.ceil(scene.dimensions.height / G);
  const LOG = [], START = {}, HOME = new Map(), hooks = [];
  let running = true, busy = false, pending = false, lastKey = "", lastCry = "", combat = null;

  /* ── мелочи ── */
  const note = s => { LOG.push(s); try { log(s); } catch {} console.log("Агент боя |", s); };
  const key = c => `${c.x},${c.y}`;
  const cellOf = t => ({ x: Math.round(t.document.x / G), y: Math.round(t.document.y / G) });
  const center = c => ({ x: (c.x + 0.5) * G, y: (c.y + 0.5) * G });
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const far = (a, b) => cheb(cellOf(a), cellOf(b));
  const hp = t => Number(t.actor?.system?.attributes?.hp?.value ?? 0);
  const alive = t => hp(t) > 0;
  const side = t => t.document.disposition;
  const isCultist = t => /^Культист/i.test(t.actor?.name ?? "");
  const isShooter = t => /^Предатель-стрелок/i.test(t.actor?.name ?? "");
  const blocked = (a, b, type = "move") => {
    try { return CONFIG.Canvas.polygonBackends[type].testCollision(center(a), center(b), { type, mode: "any" }); }
    catch { return false; }
  };
  const fighters = () => (combat?.combatants ?? []).map(c => c.token?.object).filter(t => t?.actor);
  const foesOf = t => fighters().filter(o => side(o) === -side(t) && side(o) !== 0 && alive(o));
  const isAIActor = a => !a || a.type === "npc" || !game.users.some(u => !u.isGM && u.active && a.testUserPermission(u, "OWNER"));
  const isAI = t => side(t) !== 0 && isAIActor(t?.actor);                  // нейтральные (Крюк, Сол) — за мастером
  const nameOf = t => t.name;
  const nearest = (me, list) => [...list].sort((a, b) => far(me, a) - far(me, b) || hp(a) - hp(b));

  async function flush() {
    const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
    const now = {};
    for (const t of fighters()) now[t.name] = hp(t);
    const body = JSON.stringify({ at: new Date().toISOString(), running, combat: combat?.id, round: combat?.round, turn: combat?.turn,
      now: combat?.combatant?.name, hp: now, start: START, log: LOG.slice(-200) }, null, 1);
    try { await FP.upload("data", "claude-live", new File([body], "agent-log.json", { type: "application/json" }), {}, { notify: false }); }
    catch (e) { console.warn("Агент боя | журнал", e); }
  }

  /* ── чем бить: атаки нужного вида (оружие и заговоры), лучшая первой ── */
  const partAvg = p => {
    let s = 0;
    if (p?.number && p?.denomination) s += p.number * (p.denomination + 1) / 2;
    const b = Number(p?.bonus); if (p?.bonus && Number.isFinite(b)) s += b;
    if (p?.custom?.enabled) { const n = Number(p.custom.formula); if (Number.isFinite(n)) s += n; }
    return s;
  };
  const avg = (it, a) => {
    const parts = [...(a.damage?.parts ?? [])];
    if (!parts.length && a.damage?.includeBase && it.system?.damage?.base) parts.push(it.system.damage.base);
    return parts.reduce((s, p) => s + partAvg(p), 0);
  };
  function pick(actor, kind) {
    const list = [];
    for (const it of actor.items) {
      if (!["weapon", "spell"].includes(it.type)) continue;
      if (it.type === "spell" && Number(it.system.level) !== 0) continue;          // заговоры — да, ячейки не тратим
      for (const a of it.system.activities ?? []) {
        if (a.type !== "attack" || a.attack?.type?.value !== kind) continue;
        const cells = kind === "melee" ? Math.max(1, Math.floor((Number(a.range?.reach) || 5) / 5))
          : Math.max(1, Math.floor((Number(a.range?.value) || 30) / 5));
        const unarmed = a.attack?.type?.classification === "unarmed";
        list.push({ it, a, cells, score: avg(it, a) - (unarmed ? 10 : 0) });
      }
    }
    list.sort((x, y) => y.score - x.score);
    return list.length ? { ...list[0], alts: list.slice(1) } : null;
  }

  /* ── ходьба: поиск по клеткам со стенами; сквозь врагов нельзя, сквозь своих можно; встать — только на свободную ── */
  function reach(mover, steps) {
    const start = cellOf(mover), sk = key(start);
    const occ = new Map(), corpse = new Set();
    for (const t of canvas.tokens.placeables) {
      if (t === mover || !t.actor || t.document.hidden) continue;
      if (alive(t)) occ.set(key(cellOf(t)), t); else corpse.add(key(cellOf(t)));
    }
    const seen = new Map([[sk, 0]]), prev = new Map(), q = [start];
    while (q.length) {
      const c = q.shift(), d = seen.get(key(c));
      if (d >= steps) continue;
      for (const [dx, dy] of DIRS) {
        const n = { x: c.x + dx, y: c.y + dy }, k = key(n);
        if (n.x < 0 || n.y < 0 || n.x >= W || n.y >= H || seen.has(k)) continue;
        const o = occ.get(k);
        if (o && side(o) !== side(mover)) continue;
        if (blocked(c, n)) continue;
        seen.set(k, d + 1); prev.set(k, c); q.push(n);
      }
    }
    const free = [];
    for (const [k, d] of seen) {
      if (k !== sk && (occ.has(k) || corpse.has(k))) continue;
      const [x, y] = k.split(",").map(Number);
      free.push({ x, y, d });
    }
    return { start, prev, free };
  }
  function pathTo(R, dest) {
    const path = []; let c = dest;
    while (c && key(c) !== key(R.start)) { path.unshift({ x: c.x, y: c.y }); c = R.prev.get(key(c)); }
    return path;
  }
  /* Один вызов move() на весь путь. В Foundry v13 move() возвращается раньше, чем документ встал в конец пути, поэтому
     ждём, пока токен дойдёт; путь заново по клеткам не проводим — иначе токен прыгал к первой клетке и шёл второй раз. */
  async function moveAlong(t, path) {
    if (!path.length) return;
    const wps = path.map(c => ({ x: c.x * G, y: c.y * G }));
    const last = path[path.length - 1], there = () => key(cellOf(t)) === key(last);
    if (typeof t.document.move !== "function") {
      for (const w of wps) { await t.document.update(w); await sleep(150); }
    } else {
      let ok = null;
      try { ok = await t.document.move(wps, { method: "api" }); } catch (e) { console.warn("Агент боя | move", e); ok = false; }
      if (ok === false) note(`  ${nameOf(t)}: Foundry не дал пройти`);
      const until = Date.now() + 8000;
      while (ok !== false && !there() && Date.now() < until) await sleep(100);
      if (!there()) note(`  ${nameOf(t)}: остановился на ${key(cellOf(t))}, а шёл на ${key(last)}`);
    }
    await sleep(140 * path.length + 300);
  }
  /* клетка, откуда можно ударить вплотную, ближайшая по ходьбе */
  const meleeSpot = (R, tgt, cells) => R.free.filter(c => cheb(c, cellOf(tgt)) <= cells && !blocked(c, cellOf(tgt))).sort((a, b) => a.d - b.d)[0] ?? null;
  /* клетка, откуда цель видно и достаёт; стрелок не лезет вплотную к врагам, если есть выбор */
  const fireSpot = (R, tgt, cells, me) => R.free
    .filter(c => cheb(c, cellOf(tgt)) <= cells && !blocked(c, cellOf(tgt), "sight"))
    .map(c => ({ ...c, crowd: foesOf(me).filter(f => cheb(c, cellOf(f)) <= 1).length }))
    .sort((a, b) => a.crowd - b.crowd || a.d - b.d)[0] ?? null;
  /* подойти как можно ближе, если в этот ход не достать */
  const closer = (R, tgt) => R.free.filter(c => c.d > 0).sort((a, b) => cheb(a, cellOf(tgt)) - cheb(b, cellOf(tgt)) || a.d - b.d)[0] ?? null;

  /* ── удар: бросок атаки против КД (с укрытием), при попадании урон с учётом крита снимается с цели ── */
  const coverAC = (att, tgt) => (side(att) === 1 && isShooter(tgt) && far(att, tgt) > 1 && HOME.get(tgt.id) === key(cellOf(tgt))) ? 5 : 0;
  async function strike(att, tgt, opt, how = {}) {
    try {
      if (typeof canvas.tokens.setTargets === "function") canvas.tokens.setTargets([tgt.id]);
      else await game.user.updateTokenTargets([tgt.id]);
    } catch {}
    const d = far(att, tgt);
    let r = null, used = null;
    for (const o of [opt, ...(opt.alts ?? [])].filter(o => o.cells >= d)) {
      try { r = (await o.a.rollAttack({ advantage: !!how.adv, disadvantage: !!how.dis }, { configure: false }, { create: true }))?.[0] ?? null; }
      catch (e) { console.warn("Агент боя | атака", e); r = null; }
      if (r) { used = o; break; }
      note(`  ${nameOf(att)}: «${o.it.name}» не бросилось — беру другое`);
    }
    if (!r) { note(`  ${nameOf(att)}: атаковать нечем`); return false; }
    const base = Number(tgt.actor.system.attributes.ac.value) || 10, cover = coverAC(att, tgt), ac = base + cover;
    const crit = !!r.isCritical, hit = !r.isFumble && (crit || r.total >= ac);
    const tag = how.adv ? " с преимуществом" : how.dis ? " с помехой" : "";
    const acTxt = cover ? `КД ${base}+${cover} за укрытием` : `КД ${base}`;
    if (!hit) { note(`  ${nameOf(att)} → ${nameOf(tgt)}: ${used.it.name}${tag} ${r.total} против ${acTxt} — промах`); return false; }
    const before = hp(tgt);
    let drs = null;
    try { drs = await used.a.rollDamage({ isCritical: crit }, { configure: false }, { create: true }); }
    catch (e) { console.warn("Агент боя | урон", e); }
    if (drs?.length) {
      try { await tgt.actor.applyDamage(drs.map(x => ({ value: x.total, type: x.options?.type, properties: new Set(x.options?.properties ?? []) }))); }
      catch (e) { console.warn("Агент боя | применить урон", e); }
    }
    note(`  ${nameOf(att)} → ${nameOf(tgt)}: ${used.it.name}${tag} ${r.total} против ${acTxt} — ${crit ? "КРИТ, " : ""}попал, ${before - hp(tgt)} урона (${before}→${hp(tgt)})`);
    if (before > 0 && !alive(tgt)) await fallen(tgt);
    return true;
  }
  /* упавшему — статус и «выбыл» в трекере (повторно ничего не ставит) */
  async function markDown(t) {
    const cb = combat.combatants.find(c => c.tokenId === t.id);
    if (t.actor.type === "npc") {
      try { if (!t.actor.statuses?.has?.("dead")) await t.actor.toggleStatusEffect("dead", { active: true, overlay: true }); } catch {}
      try { if (cb && !cb.defeated) await cb.update({ defeated: true }); } catch {}
    } else {
      try { if (!t.actor.statuses?.has?.("unconscious")) await t.actor.toggleStatusEffect("unconscious", { active: true }); } catch {}
    }
  }
  async function fallen(t) {
    await markDown(t);
    if (t.actor.type !== "npc") return note(`  ✚ ${nameOf(t)} падает без сознания`);
    note(`  ✝ ${nameOf(t)} выбывает`);
    if (isCultist(t) && Math.random() < 0.6) {
      if (Math.random() < 0.5) await say(t, "…до часа…");
      else await say(t, "смеётся", CONST.CHAT_MESSAGE_STYLES.EMOTE);
    }
  }
  async function say(t, text, style = CONST.CHAT_MESSAGE_STYLES.IC) {
    try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ token: t.document }), content: text, style }); } catch {}
  }
  async function cry(t) {
    if (Math.random() >= 0.5) return;
    const pool = CRIES.filter(c => c !== lastCry);
    lastCry = pool[Math.floor(Math.random() * pool.length)];
    await say(t, lastCry);
  }

  /* ── выбор цели ── */
  const crowdAt = h => fighters().filter(c => isCultist(c) && alive(c) && far(c, h) <= 1).length;
  function cultistTarget(me, foes, R) {
    /* «втроём на одного»: к герою, у которого уже один-два своих, — третьим; где трое, туда не лезем */
    const scored = foes.map(h => {
      const n = crowdAt(h) - (far(me, h) <= 1 ? 1 : 0);
      const spot = meleeSpot(R, h, 1);
      return { h, s: (n >= 3 ? 100 : 0) + (spot ? spot.d : 30 + far(me, h)) - (n >= 1 && n <= 2 ? 4 : 0) };
    }).sort((a, b) => a.s - b.s);
    return scored[0]?.h;
  }

  /* ── ходы по ролям ── */
  const steps = t => Math.floor((Number(t.actor.system.attributes.movement?.walk) || 30) / 5);
  async function meleeTurn(me, opt, choose) {
    const foes = foesOf(me);
    if (!foes.length) return note(`  ${nameOf(me)}: врагов не осталось`);
    const R = reach(me, steps(me));
    let tgt = choose(me, foes, R);
    if (!tgt) return note(`  ${nameOf(me)}: цели нет`);
    if (far(me, tgt) > opt.cells) {
      const spot = meleeSpot(R, tgt, opt.cells) ?? closer(R, tgt);
      if (spot) await moveAlong(me, pathTo(R, spot));
    }
    if (far(me, tgt) > opt.cells) {                                      // не дошёл — бьёт того, кто оказался рядом
      tgt = nearest(me, foesOf(me)).find(f => far(me, f) <= opt.cells);
      if (!tgt) return note(`  ${nameOf(me)} идёт вперёд, до цели не достал`);
    }
    await strike(me, tgt, opt, { adv: isCultist(me) && crowdAt(tgt) - 1 >= 2 });
  }
  async function rangedTurn(me, opt, choose, shots = 1, melee = null) {
    for (let i = 0; i < shots; i++) {
      if (i) await sleep(600);
      const foes = foesOf(me);
      if (!foes.length) return note(`  ${nameOf(me)}: врагов не осталось`);
      const adj = nearest(me, foes).filter(f => far(me, f) <= 1);
      if (adj.length && melee) {                                         // вплотную — ножом, а не стрелять с помехой
        const t = adj.sort((a, b) => hp(a) - hp(b))[0];
        await strike(me, t, melee, { adv: isCultist(me) && crowdAt(t) - 1 >= 2 });
        continue;
      }
      const canSee = f => far(me, f) <= opt.cells && !blocked(cellOf(me), cellOf(f), "sight");
      let tgt = foes.some(canSee) ? choose(me, foes.filter(canSee)) : null;
      if (!tgt && i === 0) {                                             // никого не видно — перейти туда, откуда видно
        const R = reach(me, steps(me)), goal = nearest(me, foes)[0];
        const spot = fireSpot(R, goal, opt.cells, me) ?? closer(R, goal);
        if (spot) await moveAlong(me, pathTo(R, spot));
        const seen = foesOf(me).filter(canSee);
        tgt = seen.length ? choose(me, seen) : null;
      }
      if (!tgt) return note(`  ${nameOf(me)}: цели не видно`);
      const dis = foesOf(me).some(f => far(me, f) <= 1);
      const adv = isCultist(me) && crowdAt(tgt) >= 2;
      await strike(me, tgt, opt, { adv: adv && !dis, dis: dis && !adv });
    }
  }
  /* граната вожака: одна за бой, если под взрыв попадают двое и больше героев */
  async function tryGrenade(me) {
    const item = me.actor.items.find(i => i.flags?.[MOD]?.autoGrenade);
    if (!item || item.system.uses?.spent >= 1) return false;
    const cfg = { ...HF.GRENADE, ...(typeof item.flags[MOD].autoGrenade === "object" ? item.flags[MOD].autoGrenade : {}) };
    const aim = HF.aim(scene, me.center, cfg);
    if (!aim || aim.n < 2) return false;
    note(`  ${nameOf(me)} швыряет фраг-гранату: под взрывом героев ${aim.n}`);
    await say(me, "Ловите, агнцы!");
    await HF.throwGrenade(scene, me.document, cfg);
    return true;
  }

  async function takeTurn(me) {
    const a = me.actor;
    if (!alive(me)) {
      if (a.type === "npc") { await markDown(me); return note(`${nameOf(me)}: выбыл, ход пропущен`); }
      note(`${nameOf(me)}: без сознания — спасбросок от смерти`);
      try { await a.rollDeathSave({}, { configure: false }, {}); } catch (e) { note(`  спасбросок не вышел: ${e?.message ?? e}`); }
      return;
    }
    const melee = pick(a, "melee"), ranged = pick(a, "ranged"), nm = a.name;
    note(`Раунд ${combat.round}: ход ${nameOf(me)} (${hp(me)} хитов)`);
    if (side(me) === -1) {
      if (/^Культист с лазганом/i.test(nm) && ranged) {
        await cry(me);
        return rangedTurn(me, ranged, (m, seen) => [...seen].sort((x, y) => crowdAt(y) - crowdAt(x) || far(m, x) - far(m, y))[0], 1, melee);
      }
      if (isCultist(me) && melee) { await cry(me); return meleeTurn(me, melee, cultistTarget); }
      if (isShooter(me) && ranged) {                                     // подавляющий огонь: очередь в одного, кого — наугад из видимых
        let burst = null;
        return rangedTurn(me, ranged, (m, seen) => (burst && seen.includes(burst)) ? burst : (burst = seen[Math.floor(Math.random() * seen.length)]), 2, melee);
      }
      if (await tryGrenade(me)) return;
      if (melee && (!ranged || foesOf(me).some(f => far(me, f) <= 6))) {
        await cry(me);                                                   // вожак идёт на того, кто громче всех отказался встать на колени
        return meleeTurn(me, melee, (m, foes) => foes.find(f => LOUDEST.test(f.name)) ?? nearest(m, foes)[0]);
      }
      if (ranged) return rangedTurn(me, ranged, (m, seen) => nearest(m, seen)[0], 1, melee);
      return note(`  ${nameOf(me)}: нечем бить`);
    }
    /* герой без игрока: вплотную и есть настоящее оружие ближнего боя — рубит; иначе стреляет, добивая раненых */
    const m = melee && melee.score > 0 ? melee : null;
    const adj = foesOf(me).filter(f => far(me, f) <= 1);
    if (adj.length && m) return meleeTurn(me, m, () => [...adj].sort((x, y) => hp(x) - hp(y))[0]);
    if (ranged) return rangedTurn(me, ranged, (mm, seen) => nearest(mm, seen).slice(0, 3).sort((x, y) => hp(x) - hp(y))[0], 1, m);
    if (melee) return meleeTurn(me, melee, (mm, foes) => nearest(mm, foes)[0]);
    note(`  ${nameOf(me)}: нечем бить`);
  }

  /* ── ход за ходом ── */
  async function onTurn(cmb) {
    if (!running || !combat || cmb.id !== combat.id || !cmb.started) return;
    if (busy) { pending = true; return; }
    if (cmb.round > MAX_ROUNDS) return stop(`прошло ${MAX_ROUNDS} раунда`);
    const k = `${cmb.round}:${cmb.turn}`;
    if (k === lastKey) return;
    lastKey = k;
    const all = fighters();
    if (!all.some(t => side(t) === -1 && alive(t))) return stop("врагов не осталось");
    if (!all.some(t => side(t) === 1 && alive(t))) return stop("все герои пали");
    const cb = cmb.combatant, me = cb?.token?.object;
    if (!me?.actor) return;
    if (!isAI(me)) { note(`Раунд ${cmb.round}: ход ${nameOf(me)} — ${side(me) === 0 ? "за мастером" : "за игроком"}, жду`); return flush(); }
    busy = true; pending = false;
    try {
      if (!(me.actor.type === "npc" && !alive(me))) await sleep(DELAY);  // выбывших пропускаем без паузы
      if (running && cmb.combatant?.id === cb.id) await takeTurn(me);
    } catch (e) { note(`  ошибка в ходе ${nameOf(me)}: ${e?.message ?? e}`); console.error(e); }
    finally { busy = false; await flush(); }
    if (!running) return;
    if (cmb.combatant?.id === cb.id && `${cmb.round}:${cmb.turn}` === k) {
      await sleep(800);
      if (running && cmb.combatant?.id === cb.id) await cmb.nextTurn();
    } else if (pending) { pending = false; onTurn(cmb); }                // ход переключили руками, пока агент думал
  }

  async function summary(reason) {
    const all = fighters();
    const down = all.filter(t => !alive(t)).map(nameOf);
    const heroes = all.filter(t => side(t) === 1).map(t => `${nameOf(t)} ${hp(t)}/${t.actor.system.attributes.hp.max}`);
    const foes = all.filter(t => side(t) === -1 && alive(t)).map(t => `${nameOf(t)} ${hp(t)}`);
    const html = `<p><b>Агент боя остановлен</b>: ${E(reason)}.</p><p><b>Выбыли:</b> ${E(down.join(", ") || "никто")}.</p>`
      + `<p><b>Герои:</b> ${E(heroes.join("; "))}.</p><p><b>Враги на ногах:</b> ${E(foes.join("; ") || "никого")}.</p>`;
    try { await ChatMessage.create({ content: html, speaker: { alias: "Агент боя" }, whisper: game.users.filter(u => u.isGM).map(u => u.id) }); } catch {}
  }
  function stop(reason) {
    if (!running) return;
    running = false;
    for (const [name, id] of hooks) Hooks.off(name, id);
    note(`Агент остановлен: ${reason}`);
    ui.notifications.info(`Агент боя остановлен: ${reason}.`);
    if (combat) summary(reason);
    flush();
    try { game.modules.get(MOD)?.api?.dela?.panel?.render?.(); } catch {}
  }
  globalThis.ClaudeAgent = { stop, get running() { return running; }, get log() { return LOG; }, get combat() { return combat; } };

  /* ── начало: выделить всех, бой, инициатива ── */
  const toks = canvas.tokens.placeables.filter(t => t.actor && !t.document.hidden);
  canvas.tokens.releaseAll();
  for (const t of toks) {
    t.control({ releaseOthers: false });
    START[t.id] = { name: t.name, hp: hp(t), linked: !!t.document.actorLink };
    HOME.set(t.id, key(cellOf(t)));
  }
  combat = game.combats.find(c => c.scene?.id === scene.id) ?? null;
  const fresh = !combat;
  if (!combat) combat = await Combat.implementation.create({ scene: scene.id, active: true });
  else if (!combat.active) await combat.update({ active: true });
  const have = new Set(combat.combatants.map(c => c.tokenId));
  const add = toks.filter(t => !have.has(t.id)).map(t => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actor.id, hidden: false }));
  if (add.length) await combat.createEmbeddedDocuments("Combatant", add);
  if (fresh || combat.combatants.some(c => c.initiative == null)) await combat.rollAll();
  hooks.push(["updateCombat", Hooks.on("updateCombat", (cmb, ch) => { if ("turn" in ch || "round" in ch) onTurn(cmb); })]);
  hooks.push(["deleteCombat", Hooks.on("deleteCombat", cmb => { if (cmb.id === combat?.id) stop("бой удалён"); })]);
  const order = combat.turns.map(c => `${c.initiative ?? "—"} ${c.name}${isAIActor(c.actor) ? "" : " (игрок)"}`);
  note(`Бой ${fresh ? "создан" : "подхвачен"}: ${combat.combatants.size} участников. Порядок: ${order.join(", ")}`);
  await flush();
  if (!combat.started) await combat.startCombat();
  else onTurn(combat);
  ui.notifications.info(`Агент боя: веду врагов и героев без игроков, пауза ${DELAY / 1000} с, ${MAX_ROUNDS} раунда.`);
  return { combat: combat.id, order };
}
