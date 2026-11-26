// Режиссёрский пульт: сцены акта I, события (макросы), тайлы, звуки и темнота — всё с одного места.
import { h } from "./ui.mjs";

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
  return m.execute();
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
  const out = [h("div.nk-hint", { style: "margin-bottom:12px" },
    "Режиссёрский пульт. «Смотреть» — открыть сцену у себя, «Всем» — перевести на неё игроков. События запускают видео и меняют карту; повтор возвращает как было. Глаз у тайла и звука — показать или спрятать; ▶ — проиграть видео сначала.")];
  for (const s of scenes) {
    const key = s.flags[MOD].scene;
    const here = canvas.scene?.id === s.id;
    const head = h("h3", {}, s.name,
      s.active ? h("span.nk-tag.live", {}, "У ИГРОКОВ") : null,
      here ? h("span.nk-tag", {}, "ВЫ ЗДЕСЬ") : null,
      STATE[key] ? h("span", {}, STATE[key](s)) : null,
      h("div", { style: "flex:1" }),
      h("button.nk-btn.small.ghost", { onclick: busy(() => s.view()) }, "СМОТРЕТЬ"),
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
