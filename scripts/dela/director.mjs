// Режиссёрский пульт: сцены акта I, события (макросы), тайлы, звуки и темнота — всё с одного места.
import { h } from "./ui.mjs";
import * as S from "./state.mjs";

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
    { macro: "Пролом", label: "ПРОЛОМ", hint: "Видео: торпеда влетает в борт, дальше петля с торпедой. Повтор — вернуть целый зал.",
      on: s => s.tiles.some(t => t.flags?.[MOD]?.role === "zone" && !t.hidden) },
    { macro: "Декомпрессия", label: "ДЕКОМПРЕССИЯ", hint: "Видео: торпеду вырывает, зал темнеет, рёв пробоины. Повтор — вернуть целый зал.",
      on: s => String(s.background.src).includes("hall_dark") },
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
const CAST = {
  post: [
    { id: "kryuk", label: "Крюк", actor: "Крюк", from: "act1-actors", at: [[560, 430]], neutral: true },
    { id: "sol", label: "Тихий Сол", actor: "Тихий Сол", from: "act1-actors", at: [[430, 880]], neutral: true },
  ],
  hall: [
    { id: "cultists", label: "Культисты", actor: "Культист-ренегат", from: "enemies40k",
      at: [[1344, 1216], [1344, 1856], [1216, 1344], [1216, 1728], [1472, 1344], [1472, 1728], [1472, 1088], [1472, 1984]] },
    { id: "shooters", label: "Стрелки в люках", actor: "Предатель-стрелок", from: "enemies40k", at: [[1728, 1472], [1728, 1600]] },
    { id: "leader", label: "Отмеченный Хаосом", actor: "Отмеченный Хаосом", from: "enemies40k", at: [[1216, 1472]] },
  ],
  lifeboats: [
    { id: "turret", label: "Турель", actor: "Сторожевая турель палубы", from: "act1-actors", at: [[1288, 2900]] },
    { id: "varro", label: "Варро", actor: "Варро, матрос пусковой команды", from: "act1-actors", at: [[330, 1250]], neutral: true },
  ],
  gallery: [
    { id: "unborn", label: "Нерождённый", actor: "Нерождённый", from: "act1-actors", at: [[2215, 1430]] },
  ],
};
// какие персонажи выходят вместе с событием (и прячутся, если событие откатили)
const EVENT_CAST = { "Пролом": ["cultists", "shooters", "leader"], "Прорыв варпа": ["unborn"] };

async function castActor(g) {
  let a = game.actors.find(x => x.name === g.actor);
  if (a) return a;
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
export async function setCast(scene, gid, show) {
  const g = (CAST[scene.flags?.[MOD]?.scene] || []).find(x => x.id === gid); if (!g) return;
  let toks = castTokens(scene, gid);
  if (!toks.length && show) {
    const actor = await castActor(g), gs = scene.grid?.size || 128, docs = [];
    for (const [i, [cx, cy]] of g.at.entries()) {
      const size = (actor.prototypeToken?.width || 1) * gs;
      const x = Math.round((cx - size / 2) / gs) * gs, y = Math.round((cy - size / 2) / gs) * gs;
      const td = (await actor.getTokenDocument({ x, y, hidden: true })).toObject();
      if (g.at.length > 1) td.name = `${td.name} ${i + 1}`;
      if (g.neutral) td.disposition = 0;
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
  list.forEach(({ actor }, i) => {
    const [cx, cy] = pts[i % pts.length], x = snap(cx), y = snap(cy);
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
  let m = game.macros.getName(name);
  if (!m) {
    const pack = game.packs.get(`${MOD}.act1-macros`);
    const id = pack && (await pack.getIndex()).find(e => e.name === name)?._id;
    m = id ? await pack.getDocument(id) : null;
  }
  if (!m) return ui.notifications.warn(`Нет макроса «${name}»: импортируйте акт I.`);
  const ev = Object.values(EVENTS).flat().find(e => e.macro === name);
  const before = ev?.on?.(scene);
  await m.execute();
  const cast = EVENT_CAST[name];
  if (!cast || !ev?.on) return;
  // макрос дожидается видео; ждём, пока состояние сцены сменится, не дольше 8 с
  for (let i = 0; i < 40 && ev.on(scene) === before; i++) await new Promise(r => setTimeout(r, 200));
  const now = ev.on(scene);
  if (now !== before) for (const gid of cast) await setCast(scene, gid, !!now);
}

const playTile = t => t.update({ hidden: false, "video.autoplay": true }, { diff: false, playVideo: true, offset: 0 });

export function directorTab(rerender) {
  const scenes = game.scenes.filter(s => s.flags?.[MOD]?.scene).sort((a, b) => (a.navOrder ?? 0) - (b.navOrder ?? 0) || a.name.localeCompare(b.name));
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
