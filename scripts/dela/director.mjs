// Режиссёрский пульт: сцены акта I, события (макросы), тайлы, звуки и темнота — всё с одного места.
import { h } from "./ui.mjs";
import * as S from "./state.mjs";
import { resetDialog } from "./reset.mjs";
import * as HF from "./hallfight.mjs";
import * as AG from "./agent.mjs";

const MOD = "nepreklonny-40k";
const M = `modules/${MOD}/maps/`;

const TILE_LABEL = {
  zone: "Торпеда в борту — петля", breach: "Видео: торпеда влетает", rip: "Видео: торпеду вырывает",
  "turret-fire": "Турель стреляет", capsule7: "Капсула 7 в отсеке", valve: "Вентиль замер", "servo-skull": "Череп-протоколист",
};
const SOUND_GROUPS = [
  ["hum", "Гул корабля"], ["siren", "Сирена"], ["sparks", "Искры"], ["steam", "Пар"], ["candles", "Свечи"],
  ["cogitator", "Когитатор"], ["wind", "Рёв пробоины"], ["rift", "Разлом варпа"], ["vox", "Вокс"], ["turret", "Сервопривод турели"],
  ["torpedo", "Искры торпеды"], ["collar-slow", "Ошейники: медленный писк"], ["collar-fast", "Ошейники: быстрый писк"],
];
const groupOf = role => SOUND_GROUPS.find(([p]) => role === p || role.startsWith(p + "-"))?.[0] ?? role;

// события сцены: макросы акта I и свои переключатели
const EVENTS = {
  bridge: [{ id: "bridge", label: "МОСТИК РАЗБИТ", hint: "Фон мостика: целый ↔ разбитый",
             on: s => String(s.background.src).includes("bridge_broken"),
             run: async s => {
               const broken = String(s.background.src).includes("bridge_broken");
               await s.update({ "background.src": M + `00_bridge/bridge_${broken ? "intact" : "broken"}_2176x3840.mp4` });
             } }],
  hall: [
    { macro: "Пролом", label: "ПРОЛОМ", hint: "Видео: торпеда влетает в борт, дальше петля с торпедой. Врагов пока нет — их выводит «Высадка». Повтор — вернуть целый зал.",
      on: s => s.tiles.some(t => t.flags?.[MOD]?.role === "zone" && !t.hidden) },
    { id: "Высадка", label: "ВЫСАДКА", hint: "Культисты, стрелки и вожак выскакивают из люков торпеды и разбегаются по залу. Стрелки остаются в люках. Повтор — спрятать врагов.",
      on: s => HALL_FOES.some(gid => castTokens(s, gid).some(t => !t.hidden)), run: s => landing(s) },
    { id: "Агент", label: "АГЕНТ БОЯ", hint: "Агент сам ведёт врагов два раунда: создаёт бой, бросает инициативу, ходит, бьёт, вожак бросает гранату в кучу героев. Ходы игроков и нейтральных ждёт. Повтор — остановить.",
      on: () => AG.agentRunning(), run: s => toggleAgent(s) },
    { id: "Граната", label: "ГРАНАТА ВОЖАКА", hint: "Вожак швыряет фраг-гранату в скопление героев: игрокам приходит спасбросок Ловкости Сл 13, урон 3к6 вычитается сам. Одна за бой.",
      on: s => castTokens(s, "leader").some(t => t.actor?.items.some(i => i.flags?.[MOD]?.autoGrenade && i.system.uses?.spent >= 1)), run: s => leaderGrenade(s) },
    { macro: "Декомпрессия", label: "ДЕКОМПРЕССИЯ", hint: "Видео: торпеду вырывает, зал темнеет, рёв пробоины. Стрелки в люках улетают вместе с торпедой. Повтор — вернуть целый зал.",
      on: s => String(s.background.src).includes("hall_dark") },
    { id: "Унесло", label: "ВРАГОВ УНОСИТ", hint: "После декомпрессии: половину оставшихся врагов, наугад, тянет к пробоине — «Нееет!» — и выносит в пустоту.",
      on: () => false, run: s => sweepFoes(s) },
  ],
  lifeboats: [
    { macro: "Турель", label: "ТУРЕЛЬ СТРЕЛЯЕТ", hint: "Включить огонь турели или обезвредить её",
      on: s => s.tiles.some(t => t.flags?.[MOD]?.role === "turret-fire" && !t.hidden) },
    { macro: "Капсула 7", label: "КАПСУЛА 7 УЛЕТЕЛА", hint: "Варро улетел: отсек за люком 7 пуст",
      on: s => s.tiles.some(t => t.flags?.[MOD]?.role === "capsule7" && t.hidden) },
    { macro: "Вентиль", label: "ВЕНТИЛЬ ОТКРЫТ", hint: "Колесо вентиля замирает",
      on: s => s.tiles.some(t => t.flags?.[MOD]?.role === "valve" && !t.hidden) },
  ],
  gallery: [
    { macro: "Прорыв варпа", label: "ПРОРЫВ ВАРПА", hint: "Галерея осквернена, разлом над когитатором. Повтор — вернуть чистую галерею.",
      on: s => String(s.background.src).includes("desecrated") },
  ],
};
const STATE = {
  hall: s => String(s.background.src).includes("hall_dark") ? "тёмный зал, декомпрессия"
    : s.tiles.some(t => t.flags?.[MOD]?.role === "zone" && !t.hidden) ? "торпеда в борту" : "целый зал",
  gallery: s => String(s.background.src).includes("desecrated") ? "осквернена" : "чистая",
  bridge: s => String(s.background.src).includes("bridge_broken") ? "разбит" : "целый",
  lifeboats: s => s.tiles.some(t => t.flags?.[MOD]?.role === "turret-fire" && !t.hidden) ? "турель стреляет" : "турель молчит",
};

// Где появляются герои на каждой сцене: центры клеток, по порядку игроков.
// Блок камер — стазис-ниши камер 1–5 (по тексту модуля), дальше — коридор; остальные — у входа, откуда приходят.
const SPAWN = {
  cells: [[570, 300], [1691, 300], [2915, 300], [4028, 300], [598, 2740], [1100, 1550], [1300, 1550]],
  post: [[300, 1460], [300, 1590], [430, 1460], [430, 1590], [560, 1525], [560, 1400], [560, 1650]],
  hall: [[1000, 2780], [1130, 2780], [1260, 2780], [1065, 2660], [1195, 2660], [1130, 2540], [1000, 2540]],
  lifeboats: [[1210, 420], [1340, 420], [1210, 550], [1340, 550], [1080, 480], [1470, 480], [1275, 680]],
  gallery: [[2080, 1900], [2210, 1900], [2340, 1900], [2145, 1770], [2275, 1770], [2210, 1640], [2080, 1640]],
};

// Персонажи мастера и враги по сценам. Токены создаются скрытыми при первом показе, дальше — показать/спрятать.
// from: компендиум, откуда взять актёра, если в мире его нет; at: центры токенов; neutral — без красной рамки (не выдать заранее).
const T1 = `modules/${MOD}/icons/gen/act1/`;
const LAS_CULTIST = "Культист с лазганом";
// разные лица рядовых: токены группы берут портреты по кругу (сюда добавляются новые варианты)
const CULTIST_FACES = ["kultist_a", "kultist_b", "kultist_c", "kultist_d", "kultist_e", "kultist_f", "kultist_g"].map(k => `${T1}token_${k}.webp`);
// масштаб портрета в клетке: кольцо врагов и NPC совпадает по размеру с кольцом героев (у героев масштаб 1)
const FIT = { kryuk: 0.96, sol: 0.96, varro: 0.96, turret: 0.96, strelok: 0.9, otmechenny: 0.9, nerozhdenny: 0.9 };
const fitOf = src => { const m = String(src ?? "").match(/icons\/gen\/act1\/token_([a-z_]+)\.webp$/); return m ? (m[1].startsWith("kultist") ? 0.9 : FIT[m[1]]) : null; };
const CAST = {
  post: [
    { id: "kryuk", label: "Крюк", actor: "Крюк", from: "act1-actors", faces: [`${T1}token_kryuk.webp`], at: [[560, 430]], neutral: true },
    { id: "sol", label: "Тихий Сол", actor: "Тихий Сол", from: "act1-actors", faces: [`${T1}token_sol.webp`], at: [[430, 880]], neutral: true },
  ],
  hall: [
    // места — где враги выскакивают у торпеды; «Высадка» разгоняет их по залу
    { id: "cultists", label: "Культисты", actor: "Культист-ренегат", from: "enemies40k", faces: CULTIST_FACES,
      at: [[1344, 1216], [1344, 1856], [1216, 1344], [1216, 1728], [1472, 1344]] },
    // трое с лазганами; актёр собирается в мире из культиста-ренегата и лазгана из «Снаряжения»
    { id: "cultists-las", label: "Культисты с лазганами", actor: LAS_CULTIST, from: "enemies40k", base: "Культист-ренегат",
      faces: [`${T1}token_kultist_g.webp`, `${T1}token_kultist_e.webp`, `${T1}token_kultist_f.webp`], at: [[1472, 1728], [1472, 1088], [1472, 1984]] },
    { id: "shooters", label: "Стрелки в люках", actor: "Предатель-стрелок", from: "enemies40k", faces: [`${T1}token_strelok.webp`], at: [[1728, 1472], [1728, 1600]] },
    { id: "leader", label: "Отмеченный Хаосом", actor: "Отмеченный Хаосом", from: "enemies40k", faces: [`${T1}token_otmechenny.webp`], at: [[1216, 1472]] },
  ],
  lifeboats: [
    { id: "turret", label: "Турель", actor: "Сторожевая турель палубы", from: "act1-actors", faces: [`${M}04_lifeboat_deck/turret/lifeboats_turret_off_1024.png`], scale: 1.6, size: 2, rotate: true, at: [[1288, 2900]] },
    { id: "varro", label: "Варро", actor: "Варро, матрос пусковой команды", from: "act1-actors", faces: [`${T1}token_varro.webp`], at: [[330, 1250]], neutral: true },
  ],
  gallery: [
    { id: "unborn", label: "Нерождённый", actor: "Нерождённый", from: "act1-actors", faces: [`${T1}token_nerozhdenny_aura.webm`], scale: 1.5, size: 3, rotate: true, at: [[2215, 1430]] },
  ],
};
// какие персонажи выходят вместе с событием (и прячутся, если событие откатили)
const EVENT_CAST = { "Прорыв варпа": ["unborn"] };
const HALL_FOES = ["cultists", "cultists-las", "shooters", "leader"];

/** Стены зала под то, что сейчас на карте: целый зал, торпеда в борту или тёмный зал после декомпрессии.
 *  Ящики и торпеда — стены только там, где они нарисованы, иначе на пустом полу лежат тени. */
export async function syncHallWalls(scene) {
  if (scene?.flags?.[MOD]?.scene !== "hall") return 0;
  const dark = String(scene.background.src).includes("hall_dark");
  const torpedo = !dark && scene.tiles.some(t => t.flags?.[MOD]?.role === "zone" && !t.hidden);
  const st = dark ? "dark" : torpedo ? "torpedo" : "intact";
  const upd = [];
  for (const w of scene.walls ?? []) {
    const f = w.flags?.[MOD]; if (!f?.states) continue;
    const on = f.states.includes(st), o = f.on || {};
    const want = { move: on ? o.move ?? 20 : 0, sight: on ? o.sight ?? 20 : 0, light: on ? o.light ?? 20 : 0, sound: on ? o.sound ?? 20 : 0 };
    if (Object.entries(want).some(([k, v]) => w[k] !== v)) upd.push({ _id: w.id, ...want });
  }
  if (upd.length) await scene.updateEmbeddedDocuments("Wall", upd);
  return upd.length;
}

async function viewScene(scene) {
  if (canvas.scene?.id === scene.id) return;
  const ready = new Promise(r => Hooks.once("canvasReady", r));
  await scene.view(); await ready;
}

/** «Высадка»: враги появляются у люков торпеды и разбегаются по залу. Повтор — спрятать их. */
async function landing(scene) {
  await viewScene(scene);
  const shown = HALL_FOES.some(gid => castTokens(scene, gid).some(t => !t.hidden));
  if (shown) { for (const gid of HALL_FOES) await setCast(scene, gid, false); return; }
  await syncHallWalls(scene);
  for (const gid of HALL_FOES) await setCast(scene, gid, true);
  await new Promise(r => setTimeout(r, 400));                            // токены дорисовываются на холсте
  const role = d => { const gid = d.flags?.[MOD]?.cast; return gid === "cultists" ? "knife" : gid === "cultists-las" ? "gun" : gid === "leader" ? "leader" : null; };
  const docs = ["cultists", "cultists-las", "leader"].flatMap(gid => castTokens(scene, gid)).filter(t => !t.hidden);
  const n = await HF.scatter(scene, docs, role);
  ui.notifications.info(`Высадка: врагов на ногах — ${HALL_FOES.flatMap(gid => castTokens(scene, gid)).filter(t => !t.hidden).length}, разбежались ${n ?? 0}.`);
}

/** Агент боя: запустить на зале или остановить. */
async function toggleAgent(scene) {
  if (AG.agentRunning()) return AG.stopAgent();
  await viewScene(scene);
  if (!HALL_FOES.some(gid => castTokens(scene, gid).some(t => !t.hidden))) return ui.notifications.warn("Агент боя: врагов на карте нет — сначала «Высадка».");
  await AG.startAgent();
}

/** Граната вожака: сам выбирает скопление героев, игрокам — спасбросок Ловкости. */
async function leaderGrenade(scene) {
  await viewScene(scene);
  const lead = castTokens(scene, "leader").find(t => !t.hidden && (t.actor?.system?.attributes?.hp?.value ?? 0) > 0);
  if (!lead) return ui.notifications.warn("Граната: вожака на карте нет — сначала «Высадка».");
  const item = lead.actor?.items.find(i => i.flags?.[MOD]?.autoGrenade);
  if (item?.system.uses?.spent >= 1) return ui.notifications.warn("У вожака одна граната, и она уже брошена.");
  const cfg = item?.flags?.[MOD]?.autoGrenade;
  return HF.throwGrenade(scene, lead, typeof cfg === "object" ? cfg : {});
}

/** «Врагов уносит»: половину оставшихся врагов — в пробоину. */
async function sweepFoes(scene) {
  await viewScene(scene);
  if (!String(scene.background.src).includes("hall_dark")) return ui.notifications.warn("Сначала «Декомпрессия»: пробоины ещё нет.");
  const docs = HALL_FOES.flatMap(gid => castTokens(scene, gid));
  const names = await HF.sweep(scene, docs);
  ui.notifications.info(names.length ? `Унесло в пустоту: ${names.join(", ")}.` : "Уносить некого: врагов на ногах нет.");
}

/** Декомпрессия: стрелки, что ещё сидят в люках, улетают вместе с торпедой. */
async function shootersGo(scene) {
  const g = (CAST.hall || []).find(x => x.id === "shooters"), G = scene.grid?.size || 128;
  const home = new Set(g.at.map(([cx, cy]) => `${Math.round((cx - G / 2) / G)},${Math.round((cy - G / 2) / G)}`));
  const docs = castTokens(scene, "shooters").filter(t => !t.hidden && (t.actor?.system?.attributes?.hp?.value ?? 0) > 0 && home.has(`${Math.round(t.x / G)},${Math.round(t.y / G)}`));
  if (docs.length) await HF.sweep(scene, docs, { half: false });
}

/** Прорыв варпа силами модуля (тот же, что в макросе): 10 с лиловая расщелина с молниями, тайтл и вспышка у всех,
 *  под вспышкой — осквернённая галерея. Повтор возвращает чистую галерею без эффекта. */
export async function warpToggle(scene) {
  const dir = M + "05_gallery/", src = String(scene.background.src ?? "");
  if (!src.includes("gallery_")) return ui.notifications.warn("Это не смотровая галерея: фон не узнан.");
  const lite = src.includes("1536x1152");
  const CLEAN = dir + (lite ? "gallery_clean_anim_1536x1152.webm" : "gallery_clean_anim_3072x2304.webm");
  const DES = dir + (lite ? "gallery_desecrated_anim_1536x1152.webm" : "gallery_desecrated_anim_3072x2304.webm");
  const toDes = !src.includes("desecrated");
  if (toDes) {
    const fx = game.modules.get(MOD)?.api?.spellFx;
    const rift = scene.lights.find(l => l.flags?.[MOD]?.role === "rift");
    const at = rift ? { x: rift.x, y: rift.y - (scene.grid?.size ?? 128) * 0.45 } : { x: scene.width * 0.72, y: scene.height * 0.56 };
    let on = true; try { on = game.settings.get(MOD, "spellFx"); } catch { /* нет настройки */ }
    if (fx?.breach && on) { ui.notifications.info("Прорыв варпа: разлом открывается…"); await fx.breach(scene, at, { duration: 10000, preload: DES, title: "ЗАВЕСА РАЗОРВАНА", sub: "ВАРП ВХОДИТ В ГАЛЕРЕЮ" }); }
  }
  await scene.update({ "background.src": toDes ? DES : CLEAN });
  for (const type of ["AmbientLight", "AmbientSound"]) {
    const coll = type === "AmbientLight" ? scene.lights : scene.sounds;
    const upd = coll.filter(d => d.flags?.[MOD]?.role === "rift").map(d => ({ _id: d.id, hidden: !toDes }));
    if (upd.length) await scene.updateEmbeddedDocuments(type, upd);
  }
  ui.notifications.info(toDes ? "Прорыв варпа. Из разлома поднимается Нерождённый." : "Галерея снова чистая.");
}
// события, которые модуль делает сам, не дожидаясь макроса в мире
const OWN = { "Прорыв варпа": warpToggle };

/** События сцены для вкладки «Сценарий»: подпись, подсказка, включено ли, запуск. */
export function sceneEvents(key) {
  const scene = game.scenes.find(s => s.flags?.[MOD]?.scene === key);
  return { scene, list: (EVENTS[key] || []).map(e => ({ id: e.macro || e.id, label: e.label, hint: e.hint, on: scene ? !!e.on?.(scene) : false,
    fire: () => (e.macro ? runMacro(e.macro, scene) : e.run(scene)) })) };
}

/** Запустить событие сцены по имени (для вкладки «Сценарий»). */
export async function fireEvent(key, name) {
  const scene = game.scenes.find(s => s.flags?.[MOD]?.scene === key);
  if (!scene) return ui.notifications.warn("Этой сцены нет в мире: импортируйте акт I.");
  return runMacro(name, scene);
}

/** Культист с лазганом: культист-ренегат, у которого есть ещё и лазган убитого гвардейца (стреляет, нож при нём). */
export async function lasCultist(base, folder) {
  const gear = game.packs.get(`${MOD}.gear40k`);
  const gid = gear && (await gear.getIndex()).find(e => e.name === "Лазган")?._id;
  const gun = gid ? (await gear.getDocument(gid)).toObject() : null;
  if (!gun) throw new Error("В компендиуме «Снаряжение» нет лазгана.");
  delete gun._id; delete gun.folder;
  gun.system.properties = ["two"];                             // без батарей и перезарядки: у врага патроны не считаем
  gun.system.uses = { spent: 0, max: "", recovery: [] }; gun.system.equipped = true; gun.system.proficient = 1;
  for (const [k, v] of Object.entries(gun.system.activities ?? {})) if (v.type !== "attack") delete gun.system.activities[k];
  gun.system.description.value = "<p>Лазган убитого гвардейца. Культист стреляет из него, а нож держит под рукой.</p>";
  const data = base.toObject(); delete data._id;
  data.name = LAS_CULTIST; data.folder = folder ?? base.folder?.id ?? null;
  data.img = `${T1}kultist_g.webp`;
  data.system.details.cr = 0.25;
  data.items = [...data.items.map(i => { delete i._id; return i; }), gun];
  if (data.prototypeToken) { data.prototypeToken.name = LAS_CULTIST; data.prototypeToken.texture.src = `${T1}token_kultist_g.webp`; }
  return Actor.create(data);
}
async function castActor(g) {
  let a = game.actors.find(x => x.name === g.actor);
  if (a) return a;
  if (g.base) {
    const base = await castActor({ actor: g.base, from: g.from });
    return lasCultist(base, base.folder?.id);
  }
  const pack = game.packs.get(`${MOD}.${g.from}`);
  const id = pack && (await pack.getIndex()).find(e => e.name === g.actor)?._id;
  if (!id) throw new Error(`Нет актёра «${g.actor}» ни в мире, ни в компендиуме.`);
  let folder = game.folders.find(f => f.type === "Actor" && f.name === "Акт I — персонажи мастера");
  folder ??= await Folder.create({ name: "Акт I — персонажи мастера", type: "Actor", color: "#3a0f3a" });
  a = await game.actors.importFromCompendium(pack, id, { folder: folder.id });
  return a;
}
const castTokens = (scene, gid) => scene.tokens.filter(t => t.flags?.[MOD]?.cast === gid);

/** Показать или спрятать группу. Если токенов ещё нет — создать на местах. */
export { CAST, CULTIST_FACES };
export async function setCast(scene, gid, show) {
  const g = (CAST[scene.flags?.[MOD]?.scene] || []).find(x => x.id === gid); if (!g) return;
  let toks = castTokens(scene, gid);
  if (!toks.length && show) {
    const actor = await castActor(g), gs = scene.grid?.size || 128, docs = [];
    for (const [i, [cx, cy]] of g.at.entries()) {
      const size = (g.size || actor.prototypeToken?.width || 1) * gs;
      const x = Math.round((cx - size / 2) / gs) * gs, y = Math.round((cy - size / 2) / gs) * gs;
      const td = (await actor.getTokenDocument({ x, y, hidden: true })).toObject();
      if (g.at.length > 1) td.name = `${td.name} ${i + 1}`;
      if (g.neutral) td.disposition = 0;
      if (g.faces?.length) td.texture = { ...(td.texture || {}), src: g.faces[i % g.faces.length] };
      if (g.size) { td.width = g.size; td.height = g.size; }
      if (g.rotate) td.lockRotation = false;   // вид сверху: токен можно крутить
      const fit = g.scale ?? fitOf(td.texture?.src);
      if (fit) td.texture = { ...(td.texture || {}), scaleX: fit, scaleY: fit };
      td.flags = { ...(td.flags || {}), [MOD]: { ...(td.flags?.[MOD] || {}), cast: gid } };
      docs.push(td);
    }
    await scene.createEmbeddedDocuments("Token", docs);
    toks = castTokens(scene, gid);
  }
  const upd = toks.filter(t => t.hidden === show).map(t => ({ _id: t.id, hidden: !show }));
  if (upd.length) await scene.updateEmbeddedDocuments("Token", upd);
}

/** Герои игроков — по порядку раздачи. Только назначенные игрокам и только существующие в мире. */
function rosterActors() {
  const st = S.get();
  return Object.entries(st.roster || {}).map(([uid, aid]) => ({ user: game.users.get(uid), actor: game.actors.get(aid) }))
    .filter(x => x.user && !x.user.isGM && x.actor);
}

/** Поставить героев игроков на сцену у входа: свои токены передвинуть, недостающие создать. Чужих прегенов — спрятать. */
export async function placeHeroes(scene) {
  const key = scene.flags?.[MOD]?.scene, pts = SPAWN[key];
  if (!pts) return ui.notifications.warn(`Для сцены «${scene.name}» точки появления не заданы.`);
  const list = rosterActors();
  if (!list.length) return ui.notifications.warn("Никому из игроков не выдан герой: раздайте героев во вкладке «Герои и вера».");
  const gs = scene.grid?.size || 128, snap = v => Math.round((v - gs / 2) / gs) * gs;
  const mine = new Set(list.map(x => x.actor.id));
  const create = [], move = [];
  // в блоке камер псайкер — единица 5 (так в манифесте): ему камера 5, остальным по порядку 1–4
  const slot = new Map();
  if (key === "cells") {
    const cls = a => S.get().heroes?.[a.id]?.cls, free = [0, 1, 2, 3, 4];
    const psy = list.filter(x => cls(x.actor) === "psyker");
    if (psy.length) { slot.set(psy[0].actor.id, 4); free.splice(4, 1); }
    for (const x of list) if (!slot.has(x.actor.id) && free.length) slot.set(x.actor.id, free.shift());
  }
  list.forEach(({ actor }, i) => {
    const [cx, cy] = pts[(slot.get(actor.id) ?? i) % pts.length], x = snap(cx), y = snap(cy);
    const tok = scene.tokens.find(t => t.actorId === actor.id);
    if (tok) move.push({ _id: tok.id, x, y, hidden: false });
    else create.push({ actor, x, y });
  });
  if (move.length) await scene.updateEmbeddedDocuments("Token", move, { animate: false });
  const docs = [];
  for (const { actor, x, y } of create) docs.push((await actor.getTokenDocument({ x, y, hidden: false })).toObject());
  if (docs.length) await scene.createEmbeddedDocuments("Token", docs);
  // прегены, которые сейчас никому не выданы, на карте не нужны — прячем (не удаляем)
  const pregenIds = new Set(S.pregens().map(a => a.id));
  const hide = scene.tokens.filter(t => pregenIds.has(t.actorId) && !mine.has(t.actorId) && !t.hidden).map(t => ({ _id: t.id, hidden: true }));
  if (hide.length) await scene.updateEmbeddedDocuments("Token", hide);
  ui.notifications.info(`«${scene.name}»: герои на местах — ${list.map(x => x.actor.name).join(", ")}.`);
}

/** Начало акта: герои просыпаются в стазис-нишах блока камер, все игроки переходят на эту сцену. */
async function startAct() {
  const scene = game.scenes.find(s => s.flags?.[MOD]?.scene === "cells");
  if (!scene) return ui.notifications.warn("В мире нет сцены «0. Тюремный блок».");
  const names = rosterActors().map(x => `${x.actor.name} — ${x.user.name}`);
  if (!names.length) return ui.notifications.warn("Никому из игроков не выдан герой: раздайте героев во вкладке «Герои и вера».");
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Начать акт I" },
    content: `<p>Все игроки перейдут на «${scene.name}», герои проснутся в своих камерах:</p><p>${names.join("<br>")}</p>`,
  });
  if (!ok) return;
  await placeHeroes(scene);
  await scene.activate();
}

async function runMacro(name, scene) {
  if (canvas.scene?.id !== scene.id) {               // макросы работают с открытой сценой
    const ready = new Promise(r => Hooks.once("canvasReady", r));
    await scene.view(); await ready;
  }
  let m = OWN[name] ? { execute: () => OWN[name](scene) } : game.macros.getName(name);
  if (!m) {
    const pack = game.packs.get(`${MOD}.act1-macros`);
    const id = pack && (await pack.getIndex()).find(e => e.name === name)?._id;
    m = id ? await pack.getDocument(id) : null;
  }
  if (!m) return ui.notifications.warn(`Нет макроса «${name}»: импортируйте акт I.`);
  const ev = Object.values(EVENTS).flat().find(e => e.macro === name);
  const before = ev?.on?.(scene);
  await m.execute();
  const cast = EVENT_CAST[name], hall = scene.flags?.[MOD]?.scene === "hall";
  if ((!cast && !hall) || !ev?.on) return;
  // макрос дожидается видео; ждём, пока состояние сцены сменится, не дольше 15 с
  for (let i = 0; i < 75 && ev.on(scene) === before; i++) await new Promise(r => setTimeout(r, 200));
  const now = ev.on(scene);
  if (hall) {
    await syncHallWalls(scene);
    if (name === "Пролом" && !now) for (const gid of HALL_FOES) await setCast(scene, gid, false);   // зал снова целый — врагов нет
    if (name === "Декомпрессия" && now && !before) await shootersGo(scene);
  }
  if (cast && now !== before) for (const gid of cast) await setCast(scene, gid, !!now);
}

const playTile = t => t.update({ hidden: false, "video.autoplay": true }, { diff: false, playVideo: true, offset: 0 });

export function directorTab(rerender) {
  const scenes = game.scenes.filter(s => s.flags?.[MOD]?.scene && s.flags[MOD].scene !== "bridge").sort((a, b) => (a.navOrder ?? 0) - (b.navOrder ?? 0) || a.name.localeCompare(b.name));
  if (!scenes.length) {
    return [h("div.nk-hint", {}, "В мире нет сцен акта I. Откройте компендиум «Акт I — всё одной кнопкой» и нажмите «Импортировать приключение».")];
  }
  const busy = fn => async ev => {
    const b = ev.currentTarget; b.disabled = true;
    try { await fn(); } catch (e) { console.error(e); ui.notifications.error(e.message); }
    finally { b.disabled = false; rerender(); }
  };
  const heroes = rosterActors();
  const out = [h("div.nk-act", {},
    h("div", {}, h("b", {}, "АКТ I"), h("span.nk-hint", {}, heroes.length
      ? ` · в игре: ${heroes.map(x => x.actor.name).join(", ")}`
      : " · героев ещё никому не выдали")),
    h("div", { style: "flex:1" }),
    h("button.nk-btn.ghost", { "data-reset": 1, title: "Вернуть всё к началу акта: «Дело», сцены, двери, враги, герои, чат", onclick: busy(() => resetDialog()) }, "⟲ СБРОС ИГРЫ"),
    h("button.nk-btn", { "data-start-act": 1, disabled: !heroes.length, onclick: busy(() => startAct()) }, "НАЧАТЬ АКТ")),
    h("div.nk-hint", { style: "margin-bottom:12px" },
    "Персонажи — враги и NPC сцены: появляются скрытыми на своих местах, глаз показывает их игрокам; с «Проломом» и «Прорывом варпа» выходят сами. «Начать акт» — герои игроков просыпаются в своих камерах блока, все переходят туда. «Герои сюда» — поставить героев игроков у входа на сцену; «Смотреть» — открыть сцену у себя, «Всем» — перевести на неё игроков. События запускают видео и меняют карту; повтор возвращает как было. Глаз у тайла и звука — показать или спрятать; ▶ — проиграть видео сначала.")];
  for (const s of scenes) {
    const key = s.flags[MOD].scene;
    const here = canvas.scene?.id === s.id;
    const head = h("h3", {}, s.name,
      s.active ? h("span.nk-tag.live", {}, "У ИГРОКОВ") : null,
      here ? h("span.nk-tag", {}, "ВЫ ЗДЕСЬ") : null,
      STATE[key] ? h("span", {}, STATE[key](s)) : null,
      h("div", { style: "flex:1" }),
      h("button.nk-btn.small.ghost", { onclick: busy(() => s.view()) }, "СМОТРЕТЬ"),
      SPAWN[key] ? h("button.nk-btn.small.ghost", { title: "Поставить героев игроков у входа на эту сцену", "data-place": key, onclick: busy(() => placeHeroes(s)) }, "ГЕРОИ СЮДА") : null,
      h("button.nk-btn.small", { disabled: s.active, onclick: busy(() => s.activate()) }, "ВСЕМ"));
    const rows = [];
    const ev = EVENTS[key] || [];
    if (ev.length) rows.push(h("div.nk-drow", {}, h("b", {}, "СОБЫТИЯ"), h("div.nk-chips", {}, ev.map(e =>
      h("button", { class: `nk-ev ${e.on?.(s) ? "on" : ""}`, title: e.hint, "data-ev": e.macro || e.id,
        onclick: busy(() => e.macro ? runMacro(e.macro, s) : e.run(s)) }, e.label)))));
    const tiles = s.tiles.contents.filter(t => t.flags?.[MOD]?.role || t.texture?.src);
    if (tiles.length) rows.push(h("div.nk-drow", {}, h("b", {}, "ТАЙЛЫ"), h("div.nk-chips", {}, tiles.map(t => {
      const role = t.flags?.[MOD]?.role, name = TILE_LABEL[role] || role || String(t.texture.src).split("/").pop();
      const video = /\.(webm|mp4|m4v|ogv)$/i.test(String(t.texture?.src));
      return h("span", { class: `nk-chip ${t.hidden ? "" : "on"}` },
        h("button", { title: t.hidden ? "Показать" : "Спрятать", "data-tile": role || t.id, onclick: busy(() => t.update({ hidden: !t.hidden })) }, t.hidden ? "◌" : "◉"),
        h("span", {}, name),
        video ? h("button", { title: "Проиграть видео сначала", onclick: busy(() => playTile(t)) }, "▶") : null);
    }))));
    const cast = CAST[key] || [];
    if (cast.length) rows.push(h("div.nk-drow", {}, h("b", {}, "ПЕРСОНАЖИ"), h("div.nk-chips", {}, cast.map(g => {
      const toks = castTokens(s, g.id), on = toks.some(t => !t.hidden);
      return h("span", { class: `nk-chip ${on ? "on" : ""}` },
        h("button", { title: on ? "Спрятать" : toks.length ? "Показать" : "Поставить на места и показать", "data-cast": g.id,
          onclick: busy(() => setCast(s, g.id, !on)) }, on ? "◉" : "◌"),
        h("span", {}, g.at.length > 1 ? `${g.label} ×${g.at.length}` : g.label));
    }))));
    const groups = new Map();
    for (const snd of s.sounds) { const role = snd.flags?.[MOD]?.role; if (!role) continue; const g = groupOf(role); (groups.get(g) || groups.set(g, []).get(g)).push(snd); }
    if (groups.size) rows.push(h("div.nk-drow", {}, h("b", {}, "ЗВУКИ"), h("div.nk-chips", {}, [...groups].map(([g, list]) => {
      const on = list.some(x => !x.hidden);
      const label = SOUND_GROUPS.find(([p]) => p === g)?.[1] || g;
      return h("span", { class: `nk-chip ${on ? "on" : ""}` },
        h("button", { title: on ? "Выключить" : "Включить", "data-sound": g,
          onclick: busy(() => s.updateEmbeddedDocuments("AmbientSound", list.map(x => ({ _id: x.id, hidden: on })))) }, on ? "◉" : "◌"),
        h("span", {}, list.length > 1 ? `${label} ×${list.length}` : label));
    }))));
    const dk = s.environment?.darknessLevel ?? 0;
    rows.push(h("div.nk-drow", {}, h("b", {}, "ТЕМНОТА"), h("span.nk-seg", {}, [[0, "СВЕТЛО"], [0.35, "ПОЛУМРАК"], [0.6, "ТЕМНО"], [0.9, "МРАК"]].map(([v, t]) =>
      h("button", { class: Math.abs(dk - v) < 0.05 ? "on" : "", onclick: busy(() => s.update({ "environment.darknessLevel": v })) }, t)))));
    out.push(h("div.nk-scene", { class: s.active ? "live" : "" }, head, rows));
  }
  return out;
}
