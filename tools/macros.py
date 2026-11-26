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
// свет и звуки сцены по роли (flags.nepreklonny-40k.role)
const roleHide = async (type, roles, hidden) => {
  const coll = type === "AmbientLight" ? scene.lights : scene.sounds;
  const upd = coll.filter(d => roles.includes(d.flags?.[MOD]?.role)).map(d => ({ _id: d.id, hidden }));
  if (upd.length) await scene.updateEmbeddedDocuments(type, upd);
};
// стены, которые есть только в части состояний сцены (flags.states): в остальных — без ограничений
const wallState = async st => {
  const upd = scene.walls.filter(w => w.flags?.[MOD]?.states).map(w => {
    const f = w.flags[MOD], on = f.states.includes(st), r = f.on || {};
    return { _id: w.id, move: on ? r.move ?? 20 : 0, sight: on ? r.sight ?? 20 : 0, light: on ? r.light ?? 20 : 0, sound: on ? r.sound ?? 20 : 0 };
  });
  if (upd.length) await scene.updateEmbeddedDocuments("Wall", upd);
};
'''

BREACH = HEAD + r'''// ЗАЛ ЭТАПА — ПРОЛОМ.
// 1-й запуск: видео пролома (3,76 с, со звуком) поверх правой части карты, затем живой тайл зоны пролома.
// 2-й запуск: зал возвращается в состояние до пролома (для репетиции).
const breach = tileBy("breach"), zone = tileBy("zone");
if (!breach || !zone) return ui.notifications.warn("На этой сцене нет тайлов пролома. Откройте сцену «2. Зал этапа».");
if (!zone.hidden) {
  await stop(zone); await stop(breach);
  await wallState("intact"); await roleHide("AmbientLight", ["torpedo"], true); await roleHide("AmbientSound", ["torpedo"], true);
  return ui.notifications.info("Зал этапа: вернул состояние до пролома.");
}
await play(breach, 0);
await sleep(3760 + 300);
await play(zone, 0.5);          // последний кадр пролома совпадает с кадром 0,5 с петли зоны
await wallState("torpedo");     // корпус торпеды и разбросанные ящики — укрытия
await roleHide("AmbientLight", ["torpedo"], false); await roleHide("AmbientSound", ["torpedo"], false);
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
  await scene.update({ "background.src": BEFORE, "environment.darknessLevel": 0.35 });
  for (const t of [rip, zone, breach]) if (t) await stop(t);
  await roleHide("AmbientLight", ["hall-light"], false); await roleHide("AmbientLight", ["lock-alarm"], true);
  await roleHide("AmbientSound", ["wind"], true);
  await wallState("intact"); await roleHide("AmbientLight", ["torpedo"], true); await roleHide("AmbientSound", ["torpedo"], true);
  return ui.notifications.info("Зал этапа: вернул состояние до пролома.");
}
await play(rip, 0);
await sleep(3760 + 200);
scene.update({ "background.src": DARK, "environment.darknessLevel": 0.6 });   // сцена перерисуется — свет «мигает»
await roleHide("AmbientLight", ["hall-light"], true); await roleHide("AmbientLight", ["lock-alarm"], false);
await roleHide("AmbientSound", ["wind"], false);
await wallState("dark");        // торпеды и средних ящиков больше нет — их вынесло в пустоту
await roleHide("AmbientLight", ["torpedo"], true); await roleHide("AmbientSound", ["torpedo"], true);
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

WARP = HEAD + r'''// СМОТРОВАЯ ГАЛЕРЕЯ — ПРОРЫВ ВАРПА. Лиловая расщелина 10 с, вспышка, фон: чистая галерея ⇄ осквернённая. Стены у обеих версий одни.
const dir = "modules/nepreklonny-40k/maps/05_gallery/";
const src = String(scene.background.src ?? "");
if (!src.includes("gallery_")) return ui.notifications.warn("Откройте сцену «4. Смотровая галерея».");
const lite = light(src);
const CLEAN = dir + (lite ? "gallery_clean_anim_1536x1152.webm" : "gallery_clean_anim_3072x2304.webm");
const DES = dir + (lite ? "gallery_desecrated_anim_1536x1152.webm" : "gallery_desecrated_anim_3072x2304.webm");
const toDes = !src.includes("desecrated");
if (toDes) {                                               // сначала лиловая расщелина и молнии 10 с, потом вспышка и смена карты
  const fx = game.modules.get(MOD)?.api?.spellFx;
  const rift = scene.lights.find(l => l.flags?.[MOD]?.role === "rift");
  const at = rift ? { x: rift.x, y: rift.y - (scene.grid?.size ?? 128) * 0.45 } : { x: scene.width * 0.72, y: scene.height * 0.56 };
  if (fx?.breach && game.settings.get(MOD, "spellFx")) { ui.notifications.info("Прорыв варпа: разлом открывается…"); await fx.breach(scene, at, { duration: 10000, preload: DES, title: "ЗАВЕСА РАЗОРВАНА", sub: "ВАРП ВХОДИТ В ГАЛЕРЕЮ" }); }
}
await scene.update({ "background.src": toDes ? DES : CLEAN });
await roleHide("AmbientLight", ["rift"], !toDes); await roleHide("AmbientSound", ["rift"], !toDes);
ui.notifications.info(toDes ? "Прорыв варпа. Из разлома поднимается Нерождённый." : "Галерея снова чистая.");
'''

SERV_HEAD = '''const api = game.modules.get("nepreklonny-40k")?.api?.dela?.servitor;
if (!api) return ui.notifications.warn("Модуль «Непреклонный» не загружен.");
if (!game.user.isGM) return ui.notifications.warn("Этот макрос запускает мастер.");
'''
SERV_LOOK = SERV_HEAD + '''// Сервитор смотрит на выделенных героев: экран «Я ТЕБЯ ВИЖУ» (или «ПРОСНИСЬ»), потом спасбросок Мудрости, Сл 12.
const ids = (canvas.tokens?.controlled ?? []).map(t => t.actor?.id).filter(Boolean);
if (!ids.length) return ui.notifications.warn("Выделите токен героя, который подошёл к сервитору.");
await api.look(ids);
'''
SERV_ALL = SERV_HEAD + '''// Все сервиторы блока разом поворачиваются к героям: экран и спасбросок у каждого.
await api.look();
'''
SERV_CALM = SERV_HEAD + '''// Снять испуг со всех героев.
await api.calm();
'''

MACROS = [
    ("Пролом", "icons/svg/fire.svg", BREACH),
    ("Декомпрессия", "icons/svg/hazard.svg", DECOMP),
    ("Турель", "icons/svg/target.svg", TURRET),
    ("Капсула 7", "icons/svg/door-exit.svg", CAPSULE),
    ("Вентиль", "icons/svg/regen.svg", VALVE),
    ("Прорыв варпа", "icons/svg/lightning.svg", WARP),
    ("Сервитор смотрит", "icons/svg/eye.svg", SERV_LOOK),
    ("Все сервиторы оборачиваются", "icons/svg/terror.svg", SERV_ALL),
    ("Снять испуг", "icons/svg/sun.svg", SERV_CALM),
]
