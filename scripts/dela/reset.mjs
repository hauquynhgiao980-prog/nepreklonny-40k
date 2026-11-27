// Сброс игры к началу акта I: «Дело», сцены, двери, враги и NPC, шаблоны, бой, герои, чат.
// Кнопка «СБРОС ИГРЫ» на вкладке «Сцены»; api.dela.reset({ keepRoster, chat }).
import * as S from "./state.mjs";

const MOD = S.MOD, M = `modules/${MOD}/maps/`;
const lite = s => /1152x1536|1536x1152|1152x1664/.test(String(s ?? ""));
// двери по разметке сцен: [роль, отрезок, состояние] — 0 закрыта, 1 открыта, 2 заперта
const DOORS = {"cells":[["cell1",[387,1184,751,1184],1],["cell2",[1534,1184,1886,1184],1],["cell3",[2726,1184,3086,1184],1],["cell4",[3854,1184,4218,1184],1],["cell5",[384,1900,764,1900],1],["cell6",[1537,1900,1909,1900],1],["cell7",[2698,1900,3070,1900],1],["cell8",[3844,1900,4222,1900],2],["exitL",[95,1370,95,1833],0],["exitR",[4513,1370,4513,1833],2]],"gallery":[["lift",[1960,2050,2460,2050],0]],"hall":[["airlock",[840,235,1410,235],0],["bottom",[832,2938,1415,2938],0]],"lifeboats":[["room1",[772,344,772,590],0],["room2",[772,982,772,1148],0],["room3",[772,1580,772,1742],0],["room4",[772,2215,772,2405],0],["room5",[772,2825,772,3021],0],["hatch5",[1760,390,1760,570],0],["hatch6",[1760,996,1760,1176],2],["hatch7",[1760,1607,1760,1787],0],["hatch8",[1760,2218,1760,2398],2],["hatch9",[1760,2832,1760,3012],0],["lockTop",[1123,222,1432,222],0],["lockBottom",[1123,3214,1432,3214],0]],"post":[["office",[500,1140,727,1140],0],["interrogation",[1560,1140,1787,1140],2],["storageL",[440,2000,746,2000],0],["storageR",[1551,2000,1857,2000],0],["exitL",[112,1390,112,1670],0],["exitR",[2150,1390,2150,1670],2],["toHall",[2150,2330,2150,2590],0]]};
// предметы прегенов по обеим версиям компендиума: «тип|название». Всё прочее у героев — добыча с прошлой игры.
const HERO_ITEMS = {"Псайкер Илья Сорн":["background|Маркитант","class|Псайкер","consumable|Люмен-фонарь","consumable|Медпакет","consumable|Сухпаёк","consumable|Трос","container|Вещмешок","container|Набор схоласта","container|Фляга","feat|Везучий","feat|Восстановление сил","feat|Врождённый дар","feat|Гибкий","feat|Источник варпа","feat|Крепкий","feat|Мгновенная психосила","feat|Находчивый","feat|Психосилы","feat|Психосилы телепата","feat|Телепат","feat|Телепатическая речь","feat|Точная психосила","feat|Фокусировка силы","loot|Психофокус","race|Человек","spell|Астропатическое послание","spell|Внушение","spell|Вспышка варпа","spell|Гипнотический узор","spell|Диссонирующий шёпот","spell|Кинетический щит","spell|Контрсила","spell|Луч стужи","spell|Малый морок","spell|Пасть варпа","spell|Пронзание разума","spell|Психические стрелы","spell|Расщепление разума","spell|Силовой покров","spell|Телекинетическая хватка","spell|Удержание","spell|Умиротворение","spell|Хватка Имматериума","spell|Чтение мыслей","spell|Шаг через варп","spell|Шёпот по воксу","subclass|Дисциплина Телепатии","weapon|Безоружный удар","weapon|Боевой нож","weapon|Посох псайкера"],"Исповедница Агата Мирр":["background|Послушник Экклезиархии","class|Исповедник","consumable|Люмен-фонарь","consumable|Медкомплект","consumable|Медпакет","consumable|Святая вода","consumable|Сухпаёк","consumable|Трос","container|Вещмешок","container|Набор проповедника","container|Фляга","equipment|Тяжёлая флак-броня","equipment|Штурмовой щит","feat|Гибкий","feat|Крепкий","feat|Литании Догмата Милосердия","feat|Литании веры","feat|Находчивый","feat|Орден Министорума","feat|Очищение нечестивых","feat|Посвящённый в литании","feat|Сила под огнём","feat|Слово Императора (Исповедник)","feat|Служитель милосердия","feat|Сохранение жизни","loot|Аквила","race|Человек","spell|Благословение Императора","spell|Клинок веры","spell|Лечение ран","spell|Люмен","spell|Молебен исцеления","spell|Направляющий разряд","spell|Наставление Императора","spell|Отвержение варпа","spell|Погребальный звон","spell|Подмога","spell|Святые стражи","spell|Священное пламя","spell|Слово исцеления","spell|Слово исцеления для многих","spell|Снятие недуга","spell|Убежище","spell|Чудо возвращения","spell|Щит веры","subclass|Догмат Милосердия","weapon|Безоружный удар","weapon|Булава"],"Исповедник Тобиас Гренн":["background|Послушник Экклезиархии","class|Исповедник","consumable|Люмен-фонарь","consumable|Медкомплект","consumable|Медпакет","consumable|Святая вода","consumable|Сухпаёк","consumable|Трос","container|Вещмешок","container|Набор проповедника","container|Фляга","equipment|Тяжёлая флак-броня","equipment|Штурмовой щит","feat|Гибкий","feat|Крепкий","feat|Литании Догмата Милосердия","feat|Литании веры","feat|Находчивый","feat|Орден Министорума","feat|Очищение нечестивых","feat|Посвящённый в литании","feat|Сила под огнём","feat|Слово Императора (Исповедник)","feat|Служитель милосердия","feat|Сохранение жизни","loot|Аквила","race|Человек","spell|Благословение Императора","spell|Клинок веры","spell|Лечение ран","spell|Люмен","spell|Молебен исцеления","spell|Направляющий разряд","spell|Наставление Императора","spell|Отвержение варпа","spell|Погребальный звон","spell|Подмога","spell|Святые стражи","spell|Священное пламя","spell|Слово исцеления","spell|Слово исцеления для многих","spell|Снятие недуга","spell|Убежище","spell|Чудо возвращения","spell|Щит веры","subclass|Догмат Милосердия","weapon|Безоружный удар","weapon|Булава"],"Сержант Дагор Ранн":["background|Гвардеец","class|Штурмовик","consumable|Люмен-фонарь","consumable|Медпакет","consumable|Осколочная граната","consumable|Сухпаёк","consumable|Трос","consumable|Энергоячейка","container|Вещмешок","container|Фляга","equipment|Карапас","feat|Бдительный","feat|Боевая доктрина","feat|Боевой стимулятор","feat|Выдающийся атлет","feat|Гибкий","feat|Дополнительная атака","feat|Меткий стрелок","feat|Находчивый","feat|Неистово атакующий","feat|Оружейное мастерство","feat|Сверхусилие","feat|Смертоносная меткость","feat|Стрельба","feat|Тактический манёвр","feat|Тактический расчёт","race|Человек","subclass|Чемпион полка","weapon|Безоружный удар","weapon|Боевой нож","weapon|Лазган","weapon|Лазпистолет"],"Сержант Мара Векс":["background|Гвардеец","class|Штурмовик","consumable|Люмен-фонарь","consumable|Медпакет","consumable|Осколочная граната","consumable|Сухпаёк","consumable|Трос","consumable|Энергоячейка","container|Вещмешок","container|Фляга","equipment|Карапас","feat|Бдительный","feat|Боевая доктрина","feat|Боевой стимулятор","feat|Выдающийся атлет","feat|Гибкий","feat|Дополнительная атака","feat|Меткий стрелок","feat|Находчивый","feat|Неистово атакующий","feat|Оружейное мастерство","feat|Сверхусилие","feat|Смертоносная меткость","feat|Стрельба","feat|Тактический манёвр","feat|Тактический расчёт","race|Человек","subclass|Чемпион полка","weapon|Безоружный удар","weapon|Боевой нож","weapon|Лазган","weapon|Лазпистолет"],"Псайкер Вера Колл":["background|Маркитант","class|Псайкер","consumable|Люмен-фонарь","consumable|Медпакет","consumable|Сухпаёк","consumable|Трос","container|Вещмешок","container|Набор схоласта","container|Фляга","feat|Везучий","feat|Восстановление сил","feat|Врождённый дар","feat|Гибкий","feat|Источник варпа","feat|Крепкий","feat|Мгновенная психосила","feat|Находчивый","feat|Психосилы","feat|Психосилы телепата","feat|Телепат","feat|Телепатическая речь","feat|Точная психосила","feat|Фокусировка силы","loot|Психофокус","race|Человек","spell|Астропатическое послание","spell|Внушение","spell|Вспышка варпа","spell|Гипнотический узор","spell|Диссонирующий шёпот","spell|Кинетический щит","spell|Контрсила","spell|Луч стужи","spell|Малый морок","spell|Пасть варпа","spell|Пронзание разума","spell|Психические стрелы","spell|Расщепление разума","spell|Силовой покров","spell|Телекинетическая хватка","spell|Удержание","spell|Умиротворение","spell|Хватка Имматериума","spell|Чтение мыслей","spell|Шаг через варп","spell|Шёпот по воксу","subclass|Дисциплина Телепатии","weapon|Безоружный удар","weapon|Боевой нож","weapon|Посох псайкера"],"Техножрица Магос Сета-Ксин":["background|Подмастерье мануфакторума","class|Техножрец","consumable|Люмен-фонарь","consumable|Медпакет","consumable|Сухпаёк","consumable|Трос","container|Вещмешок","container|Стазис-ранец","container|Фляга","equipment|Жезл Механикус","equipment|Карапас","equipment|Окуляры ночного видения","equipment|Штурмовой щит","feat|Воссоздание по СШК","feat|Гибкий","feat|Инструменты специализации","feat|Крепкий","feat|Малые обряды Механикус","feat|Мастеровой","feat|Находчивый","feat|Освящённый ствол","feat|Острый ум","feat|Ритуалы баллистария","feat|СШК: Окуляры ночного видения","feat|СШК: Парные вокс-бусины","feat|СШК: Синтезатор жидкостей","feat|СШК: Стазис-ранец","feat|Сервотурель","feat|Техно-ритуалы","race|Человек","spell|Ауспик варпа","spell|Волна грома","spell|Кинетический щит","spell|Лечение ран","spell|Метка ауспика","spell|Огненный разряд","spell|Освящение оружия","spell|Палящие лучи","spell|Перегрев","spell|Резонанс","spell|Ритуал починки","spell|Снятие недуга","subclass|Баллистарий","tool|Набор взломщика","tool|Освящённые инструменты","weapon|Безоружный удар","weapon|Лазпистолет"],"Комиссар Елена Штраль":["background|Воспитанник Схолы Прогениум","class|Комиссар","consumable|Люмен-фонарь","consumable|Медпакет","consumable|Сухпаёк","consumable|Трос","container|Вещмешок","container|Фляга","equipment|Тяжёлая флак-броня","equipment|Штурмовой щит","feat|Боевая доктрина","feat|Гибкий","feat|Длань Императора","feat|Дополнительная атака","feat|Дуэлянт","feat|Кара Императора","feat|Крепкий","feat|Литании Обета Долга","feat|Литании долга","feat|Находчивый","feat|Одарённый","feat|Оружейное мастерство","feat|Освящённое оружие","feat|Полковой кибер-конь","feat|Слово Императора (Комиссар)","feat|Страж","race|Человек","spell|Благословение Императора","spell|Боевой кибер-конь","spell|Гексаграммный оберег","spell|Гневная кара","spell|Допросная","spell|Кара Императора","spell|Лечение ран","spell|Подмога","spell|Приказ","spell|Сияющая кара","spell|Щит веры","subclass|Обет Долга","weapon|Автопистолет","weapon|Безоружный удар","weapon|Боевой нож","weapon|Цепной меч"],"Комиссар Вальдор Крэйн":["background|Воспитанник Схолы Прогениум","class|Комиссар","consumable|Люмен-фонарь","consumable|Медпакет","consumable|Сухпаёк","consumable|Трос","container|Вещмешок","container|Фляга","equipment|Тяжёлая флак-броня","equipment|Штурмовой щит","feat|Боевая доктрина","feat|Гибкий","feat|Длань Императора","feat|Дополнительная атака","feat|Дуэлянт","feat|Кара Императора","feat|Крепкий","feat|Литании Обета Долга","feat|Литании долга","feat|Находчивый","feat|Одарённый","feat|Оружейное мастерство","feat|Освящённое оружие","feat|Полковой кибер-конь","feat|Слово Императора (Комиссар)","feat|Страж","race|Человек","spell|Благословение Императора","spell|Боевой кибер-конь","spell|Гексаграммный оберег","spell|Гневная кара","spell|Допросная","spell|Кара Императора","spell|Лечение ран","spell|Подмога","spell|Приказ","spell|Сияющая кара","spell|Щит веры","subclass|Обет Долга","weapon|Автопистолет","weapon|Безоружный удар","weapon|Боевой нож","weapon|Цепной меч"],"Техножрец Магос Ферр-7":["background|Подмастерье мануфакторума","class|Техножрец","consumable|Люмен-фонарь","consumable|Медпакет","consumable|Сухпаёк","consumable|Трос","container|Вещмешок","container|Стазис-ранец","container|Фляга","equipment|Жезл Механикус","equipment|Карапас","equipment|Окуляры ночного видения","equipment|Штурмовой щит","feat|Воссоздание по СШК","feat|Гибкий","feat|Инструменты специализации","feat|Крепкий","feat|Малые обряды Механикус","feat|Мастеровой","feat|Находчивый","feat|Освящённый ствол","feat|Острый ум","feat|Ритуалы баллистария","feat|СШК: Окуляры ночного видения","feat|СШК: Парные вокс-бусины","feat|СШК: Синтезатор жидкостей","feat|СШК: Стазис-ранец","feat|Сервотурель","feat|Техно-ритуалы","race|Человек","spell|Ауспик варпа","spell|Волна грома","spell|Кинетический щит","spell|Лечение ран","spell|Метка ауспика","spell|Огненный разряд","spell|Освящение оружия","spell|Палящие лучи","spell|Перегрев","spell|Резонанс","spell|Ритуал починки","spell|Снятие недуга","subclass|Баллистарий","tool|Набор взломщика","tool|Освящённые инструменты","weapon|Безоружный удар","weapon|Лазпистолет"]};

const roleIs = (d, ...r) => r.includes(d.flags?.[MOD]?.role);
const near = (a, b) => { const d = (p, q) => Math.max(...p.map((v, i) => Math.abs(v - q[i]))); return d(a, b) <= 40 || d(a, [b[2], b[3], b[0], b[1]]) <= 40; };
const isHero = actor => !!(actor && HERO_ITEMS[actor.name]);

async function resetScene(scene, log) {
  const key = scene.flags?.[MOD]?.scene, n0 = log.length;
  const cast = scene.tokens.filter(t => t.flags?.[MOD]?.cast).map(t => t.id);
  const heroes = scene.tokens.filter(t => !t.flags?.[MOD]?.cast && isHero(t.actor ?? game.actors.get(t.actorId))).map(t => t.id);
  if (cast.length + heroes.length) {
    await scene.deleteEmbeddedDocuments("Token", [...cast, ...heroes]);
    log.push(`${scene.name}: сняты фишки — враги и NPC ${cast.length}, герои ${heroes.length}`);
  }
  const tpl = scene.templates.map(t => t.id);
  if (tpl.length) { await scene.deleteEmbeddedDocuments("MeasuredTemplate", tpl); log.push(`${scene.name}: шаблоны убраны (${tpl.length})`); }
  const want = DOORS[key] || [], dupd = [];
  for (const w of scene.walls) {
    if (!w.door) continue;
    const role = w.flags?.[MOD]?.role;
    const m = (role && want.find(x => x[0] === role)) || want.find(x => near(w.c, x[1]));
    if (m && w.ds !== m[2]) dupd.push({ _id: w.id, ds: m[2] });
  }
  if (dupd.length) { await scene.updateEmbeddedDocuments("Wall", dupd); log.push(`${scene.name}: двери как в начале (${dupd.length})`); }
  const tiles = (pred, data) => scene.tiles.filter(pred).map(t => ({ _id: t.id, ...data }));
  const lights = (roles, hidden) => scene.lights.filter(l => roles.includes(l.flags?.[MOD]?.role) && l.hidden !== hidden).map(l => ({ _id: l.id, hidden }));
  const sounds = (roles, hidden) => scene.sounds.filter(l => roles.includes(l.flags?.[MOD]?.role) && l.hidden !== hidden).map(l => ({ _id: l.id, hidden }));
  const apply = async (type, upd, opt = {}) => { if (upd.length) await scene.updateEmbeddedDocuments(type, upd, { diff: false, ...opt }); };
  if (key === "hall") {
    if (String(scene.background.src).includes("hall_dark")) {
      const dir = `${M}03_transit_hall/`;
      await scene.update({ "background.src": dir + (lite(scene.background.src) ? "hall_etap_anim_1152x1536.webm" : "hall_etap_anim_2304x3072.webm"), "environment.darknessLevel": 0.35 });
    }
    await apply("Tile", tiles(t => roleIs(t, "zone", "breach", "rip") && (!t.hidden || t.video?.autoplay), { hidden: true, "video.autoplay": false }), { playVideo: false, offset: 0 });
    await apply("AmbientLight", [...lights(["hall-light"], false), ...lights(["lock-alarm", "torpedo"], true)]);
    await apply("AmbientSound", sounds(["wind", "torpedo"], true));
    const wu = scene.walls.filter(w => w.flags?.[MOD]?.states).map(w => {
      const f = w.flags[MOD], on = f.states.includes("intact"), r = f.on || {};
      return { _id: w.id, move: on ? r.move ?? 20 : 0, sight: on ? r.sight ?? 20 : 0, light: on ? r.light ?? 20 : 0, sound: on ? r.sound ?? 20 : 0 };
    });
    if (wu.length) await scene.updateEmbeddedDocuments("Wall", wu);
    log.push(`${scene.name}: целый зал, до пролома`);
  }
  if (key === "lifeboats") {
    await apply("Tile", tiles(t => roleIs(t, "turret-fire") && t.hidden, { hidden: false, "video.autoplay": true }), { playVideo: true, offset: 0 });
    await apply("Tile", [...tiles(t => roleIs(t, "capsule7") && t.hidden, { hidden: false }), ...tiles(t => roleIs(t, "valve") && !t.hidden, { hidden: true })]);
    log.push(`${scene.name}: турель стреляет, капсула 7 на месте, вентиль дёргается`);
  }
  if (key === "gallery") {
    if (String(scene.background.src).includes("desecrated")) {
      const dir = `${M}05_gallery/`;
      await scene.update({ "background.src": dir + (lite(scene.background.src) ? "gallery_clean_anim_1536x1152.webm" : "gallery_clean_anim_3072x2304.webm") });
    }
    await apply("AmbientLight", lights(["rift"], true)); await apply("AmbientSound", sounds(["rift"], true));
    log.push(`${scene.name}: чистая галерея`);
  }
  return log.length > n0;
}

async function resetHero(actor, pack, log) {
  const legit = new Set(HERO_ITEMS[actor.name] || []), what = [];
  try { await actor.longRest?.({ dialog: false, chat: false, newDay: true }); what.push("отдых"); } catch (e) { console.warn(e); }
  const fx = actor.effects.filter(e => e.statuses?.size || e.isTemporary).map(e => e.id);
  if (fx.length) { await actor.deleteEmbeddedDocuments("ActiveEffect", fx); what.push(`состояния −${fx.length}`); }
  const A = actor.system.attributes ?? {};
  await actor.update({ "system.attributes.hp.value": A.hp?.max ?? A.hp?.value, "system.attributes.hp.temp": 0, "system.attributes.hp.tempmax": 0,
    "system.attributes.death.success": 0, "system.attributes.death.failure": 0, "system.attributes.exhaustion": 0, "system.attributes.inspiration": false });
  // добыча: предмета нет в прегене и он появился у героя позже, чем сам герой (взят в игре)
  const born = actor._stats?.createdTime ?? 0;
  const loot = actor.items.filter(i => legit.size && !legit.has(`${i.type}|${i.name}`) && (i._stats?.createdTime ?? 0) > born + 60000).map(i => i.id);
  if (loot.length) { what.push(`добыча −${loot.length}: ${loot.map(id => actor.items.get(id).name).join(", ")}`); await actor.deleteEmbeddedDocuments("Item", loot); }
  const slots = {};
  for (const [k, v] of Object.entries(actor.system.spells ?? {})) if (v?.max != null && v.value !== v.max) slots[`system.spells.${k}.value`] = v.max;
  if (Object.keys(slots).length) { await actor.update(slots); what.push("ячейки"); }
  const hd = actor.items.filter(i => i.type === "class" && i.system.hd?.spent).map(i => ({ _id: i.id, "system.hd.spent": 0 }));
  if (hd.length) await actor.updateEmbeddedDocuments("Item", hd);
  const entry = pack && (await pack.getIndex()).find(e => e.name === actor.name);
  const src = entry && (await pack.getDocument(entry._id));
  if (src) {
    if (src.system.currency) await actor.update({ "system.currency": src.system.currency });
    const upd = [], add = [];
    for (const it of src.items) {
      const mine = actor.items.find(i => i.type === it.type && i.name === it.name);
      if (!mine) { add.push(it.toObject()); continue; }
      const u = { _id: mine.id };
      const q = it.system.quantity; if (q != null && (mine.system.quantity ?? 0) < q) u["system.quantity"] = q;
      if ((mine.system.uses?.spent ?? 0) > (it.system.uses?.spent ?? 0)) u["system.uses.spent"] = it.system.uses?.spent ?? 0;
      if (Object.keys(u).length > 1) upd.push(u);
    }
    if (upd.length) { await actor.updateEmbeddedDocuments("Item", upd); what.push(`запасы ${upd.length}`); }
    if (add.length) { await actor.createEmbeddedDocuments("Item", add); what.push(`вернулось ${add.length}: ${add.map(x => x.name).join(", ")}`); }
  }
  log.push(`${actor.name}: ${what.join(", ") || "хиты"}`);
}

/** Вернуть всё к началу акта. keepRoster — оставить раздачу героев игрокам; chat — очистить чат. */
export async function resetGame({ keepRoster = false, chat = true } = {}) {
  if (!game.user.isGM) return;
  const log = [], step = async (name, fn) => { try { await fn(); } catch (e) { console.error(`${MOD} | сброс: ${name}`, e); log.push(`${name}: ошибка — ${e.message}`); } };
  await step("Дело", () => S.update(s => {
    const roster = s.roster, heroes = s.heroes;
    for (const k of Object.keys(s)) delete s[k];
    Object.assign(s, S.blank());
    if (keepRoster) {
      s.roster = roster;
      for (const aid of Object.values(roster)) {
        const h = heroes?.[aid]; if (!h) continue;
        s.heroes[aid] = { ...h, anketa: { done: false, answers: [], side: null }, trials: {}, adj: { l: 0, h: 0 }, used: {} };
      }
    }
    log.push(keepRoster ? "Дело: анкеты, испытания, шкалы, корпус и награды обнулены, раздача героев оставлена" : "Дело: всё обнулено, героев нужно раздать заново");
  }));
  if (!keepRoster) await step("Раздача", async () => {
    for (const u of game.users.filter(u => !u.isGM)) {
      if (isHero(u.character)) await u.update({ character: null });
      for (const a of game.actors.filter(isHero)) if (a.ownership?.[u.id] != null) await a.update({ [`ownership.-=${u.id}`]: null });
    }
    log.push("герои сняты с игроков");
  });
  for (const scene of game.scenes.filter(s => s.flags?.[MOD]?.scene && s.flags[MOD].scene !== "bridge")) await step(scene.name, () => resetScene(scene, log));
  await step("Бой", async () => { const ids = game.combats.map(c => c.id); if (ids.length) { await Combat.deleteDocuments(ids); log.push(`бои убраны (${ids.length})`); } });
  const pack = game.packs.get(`${MOD}.heroes40k`);
  for (const a of game.actors.filter(a => HERO_ITEMS[a.name])) await step(a.name, () => resetHero(a, pack, log));
  if (chat) await step("Чат", async () => { await ChatMessage.deleteDocuments([], { deleteAll: true }); log.push("чат очищен"); });
  await step("Заставка", async () => {                                     // все снова на стартовом экране
    const intro = game.scenes.find(s => s.flags?.[MOD]?.scene === "intro");
    if (intro && !intro.active) { await intro.activate(); log.push("все на заставке"); }
  });
  for (const k of Object.keys(localStorage)) if (k.startsWith("nk-orb:")) localStorage.removeItem(k);
  console.log(`${MOD} | сброс игры\n` + log.join("\n"));
  ui.notifications.info("Игра сброшена к началу акта I. Подробности — в консоли (F12).");
  return log;
}

/** Окно подтверждения с выбором: оставить раздачу героев, очистить чат. */
export async function resetDialog() {
  const D = foundry.applications.api.DialogV2;
  const content = `<p><b>Всё вернётся к началу акта I.</b></p>
<ul style="margin:0 0 8px 18px;line-height:1.45">
<li>«Дело»: анкеты, выборы и испытания, шкалы, награды, счётчик корпуса, взлом.</li>
<li>Сцены: целый зал до пролома, турель стреляет, капсула 7 на месте, вентиль дёргается, чистая галерея.</li>
<li>Двери — как в начале: камеры открыты, камера 8 и выходы заперты.</li>
<li>Фишки врагов и NPC убираются со сцен и при показе выйдут заново, целыми. Фишки героев тоже снимаются: «Начать акт» расставит их по камерам. Шаблоны и бои удаляются.</li>
<li>Герои: полные хиты, ячейки и умения, без состояний; израсходованное возвращается, подобранная добыча убирается.</li>
<li>Все игроки возвращаются на заставку с горящим крейсером.</li>
</ul>
<label style="display:block"><input type="checkbox" name="keepRoster"> Оставить раздачу героев игрокам</label>
<label style="display:block"><input type="checkbox" name="chat" checked> Очистить чат</label>`;
  const res = await D.wait({ window: { title: "Сброс игры" }, content, rejectClose: false, buttons: [
    { action: "go", label: "Сбросить всё", icon: "fa-solid fa-rotate-left",
      callback: (ev, btn) => ({ keepRoster: !!btn.form?.elements?.keepRoster?.checked, chat: !!btn.form?.elements?.chat?.checked }) },
    { action: "no", label: "Отмена", default: true }] });
  if (!res || typeof res !== "object") return null;
  return resetGame(res);
}
