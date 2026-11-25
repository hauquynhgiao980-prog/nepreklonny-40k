# -*- coding: utf-8 -*-
"""Тексты макросов акта I (Foundry v13). Тайлы ищутся по флагу flags["nepreklonny-40k"].role."""

HEAD = r'''const MOD = "nepreklonny-40k";
const scene = canvas.scene;
if (!game.user.isGM) return ui.notifications.warn("Этот макрос запускает мастер.");
if (!scene) return ui.notifications.warn("Нет открытой сцены.");
const tileBy = role => scene.tiles.find(t => t.flags?.[MOD]?.role === role);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const light = s => String(s ?? "").includes("1152x1536") || String(s ?? "").includes("1536x1152") || String(s ?? "").includes("1152x1664");
const play = (tile, offset = 0, extra = {}) => tile.update({ hidden: false, "video.autoplay": true, ...extra }, { diff: false, playVideo: true, offset });
const stop = (tile, extra = {}) => tile.update({ hidden: true, "video.autoplay": false, ...extra }, { diff: false, playVideo: false, offset: 0 });
'''

BREACH = HEAD + r'''// ЗАЛ ЭТАПА — ПРОЛОМ.
// 1-й запуск: видео пролома (3,76 с, со звуком) поверх правой части карты, затем живой тайл зоны пролома.
// 2-й запуск: зал возвращается в состояние до пролома (для репетиции).
const breach = tileBy("breach"), zone = tileBy("zone");
if (!breach || !zone) return ui.notifications.warn("На этой сцене нет тайлов пролома. Откройте сцену «2. Зал этапа».");
if (!zone.hidden) {
  await stop(zone); await stop(breach);
  return ui.notifications.info("Зал этапа: вернул состояние до пролома.");
}
await play(breach, 0);
await sleep(3760 + 300);
await play(zone, 0.5);          // последний кадр пролома совпадает с кадром 0,5 с петли зоны
await sleep(250);
await stop(breach);
ui.notifications.info("Пролом. На колени, агнцы!");
'''

DECOMP = HEAD + r'''// ЗАЛ ЭТАПА — ДЕКОМПРЕССИЯ (конец второго раунда).
// 1-й запуск: торпеду вырывает из пролома (видео 3,76 с со звуком), затем фон сцены — тёмная петля с дырой в пустоту.
// 2-й запуск: зал возвращается в состояние до пролома.
const rip = tileBy("rip"), zone = tileBy("zone"), breach = tileBy("breach");
const dir = "modules/nepreklonny-40k/maps/03_transit_hall/";
const lite = light(scene.background.src);
const DARK = dir + (lite ? "hall_dark_anim_1152x1536.webm" : "hall_dark_anim_2304x3072.webm");
const BEFORE = dir + (lite ? "hall_etap_anim_1152x1536.webm" : "hall_etap_anim_2304x3072.webm");
if (!rip) return ui.notifications.warn("На этой сцене нет тайла декомпрессии. Откройте сцену «2. Зал этапа».");
if (String(scene.background.src).includes("hall_dark_anim")) {
  await scene.update({ "background.src": BEFORE });
  for (const t of [rip, zone, breach]) if (t) await stop(t);
  return ui.notifications.info("Зал этапа: вернул состояние до пролома.");
}
await play(rip, 0);
await sleep(3760 + 200);
scene.update({ "background.src": DARK });            // сцена перерисуется — свет «мигает»
const hide = [rip, zone, breach].filter(Boolean).map(t => ({ _id: t.id, hidden: true, "video.autoplay": false }));
await scene.updateEmbeddedDocuments("Tile", hide);
ui.notifications.info("Декомпрессия. Испытание 1.");
'''

TURRET = HEAD + r'''// ШЛЮПОЧНАЯ ПАЛУБА — ТУРЕЛЬ. Показывает или прячет тайл зала со стреляющей турелью.
// Тайл виден — турель стреляет; скрыт — под ним петля с замершей (обезвреженной) турелью.
const fire = tileBy("turret-fire");
if (!fire) return ui.notifications.warn("На этой сцене нет тайла турели. Откройте сцену «3. Шлюпочная палуба».");
if (fire.hidden) { await play(fire, 0); ui.notifications.info("Турель снова стреляет."); }
else { await fire.update({ hidden: true }); ui.notifications.info("Турель обезврежена."); }
'''

CAPSULE = HEAD + r'''// ШЛЮПОЧНАЯ ПАЛУБА — КАПСУЛА 7. Если Варро улетел, капсулу прячут, и отсек за люком 7 пуст.
const cap = tileBy("capsule7");
if (!cap) return ui.notifications.warn("На этой сцене нет капсулы 7. Откройте сцену «3. Шлюпочная палуба».");
await cap.update({ hidden: !cap.hidden });
ui.notifications.info(cap.hidden ? "Капсула 7 улетела." : "Капсула 7 снова в отсеке.");
'''

VALVE = HEAD + r'''// ШЛЮПОЧНАЯ ПАЛУБА — ВЕНТИЛЬ. Тайл неподвижного вентиля поверх петли: колесо больше не дёргается.
const valve = tileBy("valve");
if (!valve) return ui.notifications.warn("На этой сцене нет тайла вентиля. Откройте сцену «3. Шлюпочная палуба».");
await valve.update({ hidden: !valve.hidden });
ui.notifications.info(valve.hidden ? "Вентиль снова дёргается." : "Вентиль открыт и замер.");
'''

WARP = HEAD + r'''// СМОТРОВАЯ ГАЛЕРЕЯ — ПРОРЫВ ВАРПА. Меняет фон: чистая галерея ⇄ осквернённая. Стены у обеих версий одни.
const dir = "modules/nepreklonny-40k/maps/05_gallery/";
const src = String(scene.background.src ?? "");
if (!src.includes("gallery_")) return ui.notifications.warn("Откройте сцену «4. Смотровая галерея».");
const lite = light(src);
const CLEAN = dir + (lite ? "gallery_clean_anim_1536x1152.webm" : "gallery_clean_anim_3072x2304.webm");
const DES = dir + (lite ? "gallery_desecrated_anim_1536x1152.webm" : "gallery_desecrated_anim_3072x2304.webm");
const toDes = !src.includes("desecrated");
await scene.update({ "background.src": toDes ? DES : CLEAN });
ui.notifications.info(toDes ? "Прорыв варпа. Из разлома поднимается Нерождённый." : "Галерея снова чистая.");
'''

MACROS = [
    ("Пролом", "icons/svg/fire.svg", BREACH),
    ("Декомпрессия", "icons/svg/hazard.svg", DECOMP),
    ("Турель", "icons/svg/target.svg", TURRET),
    ("Капсула 7", "icons/svg/door-exit.svg", CAPSULE),
    ("Вентиль", "icons/svg/regen.svg", VALVE),
    ("Прорыв варпа", "icons/svg/lightning.svg", WARP),
]
