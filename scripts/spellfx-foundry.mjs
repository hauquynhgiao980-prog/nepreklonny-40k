/* Непреклонный: связка эффектов заклинаний с Foundry v13 и dnd5e 5.x.
   Заклинание сработало (dnd5e.postUseActivity) — эффект по таблице SPELLS; для заклинаний с атакой —
   по броску атаки (dnd5e.rollAttackV2), чтобы знать, кто попал. Рассылка всем клиентам — снаружи. */
import { SpellFX, PALETTES } from "./spellfx-core.mjs";
import { rng } from "./weaponfx-core.mjs";

const MOD = "nepreklonny-40k";
const FT = 5;   // футов в клетке

/* Таблица: имя → вид эффекта, палитра и настройки. pal "auto" — по классу заклинателя
   (псайкер — варп, техножрец — машина, остальные — свет Императора). r — радиус области в футах. */
export const SPELLS = {
  // псайкер
  "Вспышка варпа": { fx: "bolt", pal: "warp", wob: 1, size: 0.34 },
  "Луч стужи": { fx: "rays", pal: "frost", width: 0.26 },
  "Психические стрелы": { fx: "bolt", pal: "psychic", darts: 3, speed: 9, size: 0.2 },
  "Расщепление разума": { fx: "mind", pal: "psychic" },
  "Диссонирующий шёпот": { fx: "mind", pal: "psychic", whisper: true },
  "Пронзание разума": { fx: "mind", pal: "psychic", spike: true },
  "Удержание": { fx: "mind", pal: "warp", bind: true },
  "Внушение": { fx: "mind", pal: "psychic" },
  "Умиротворение": { fx: "mind", pal: "frost" },
  "Гипнотический узор": { fx: "area", kind: "spiral", pal: "warp", r: 15 },
  "Пасть варпа": { fx: "area", kind: "void", pal: "warp", r: 20 },
  "Хватка Имматериума": { fx: "area", kind: "grasp", pal: "warp", r: 10, center: "self" },
  "Чтение мыслей": { fx: "self", kind: "glyph", pal: "psychic" },
  "Астропатическое послание": { fx: "self", kind: "glyph", pal: "warp" },
  "Шёпот по воксу": { fx: "self", kind: "glyph", pal: "warp" },
  "Малый морок": { fx: "summon", pal: "psychic", style: "warp" },
  "Телекинетическая хватка": { fx: "summon", pal: "warp", style: "warp" },
  "Кинетический щит": { fx: "ward", pal: "auto", self: true },
  "Силовой покров": { fx: "ward", pal: "warp", style: "warp" },
  "Шаг через варп": { fx: "self", kind: "blink", pal: "warp" },
  "Контрсила": { fx: "mark", kind: "shatter", pal: "warp" },
  // исповедник и комиссар
  "Священное пламя": { fx: "pillar", pal: "holy" },
  "Направляющий разряд": { fx: "bolt", pal: "holy", size: 0.34, speed: 16, big: true },
  "Погребальный звон": { fx: "pillar", pal: "death", toll: true },
  "Лечение ран": { fx: "heal", pal: "auto" },
  "Слово исцеления": { fx: "heal", pal: "heal" },
  "Подмога": { fx: "heal", pal: "heal" },
  "Молебен исцеления": { fx: "heal", pal: "heal" },
  "Слово исцеления для многих": { fx: "heal", pal: "heal" },
  "Чудо возвращения": { fx: "heal", pal: "heal", big: true },
  "Сохранение жизни": { fx: "heal", pal: "heal", big: true },
  "Боевой стимулятор": { fx: "heal", pal: "heal", self: true, quiet: true },
  "Благословение Императора": { fx: "ward", pal: "holy" },
  "Щит веры": { fx: "ward", pal: "holy" },
  "Убежище": { fx: "ward", pal: "holy" },
  "Гексаграммный оберег": { fx: "ward", pal: "holy" },
  "Наставление Императора": { fx: "ward", pal: "holy" },
  "Люмен": { fx: "ward", pal: "holy" },
  "Отвержение варпа": { fx: "ward", pal: "holy" },
  "Снятие недуга": { fx: "ward", pal: "auto" },
  "Клинок веры": { fx: "summon", pal: "holy", style: "holy" },
  "Святые стражи": { fx: "area", kind: "guardians", pal: "holy", r: 15, center: "self" },
  "Слово Императора (Исповедник)": { fx: "area", kind: "radiant", pal: "holy", r: 20, center: "self" },
  "Очищение нечестивых": { fx: "area", kind: "radiant", pal: "holy", r: 20, center: "self" },
  "Длань Императора": { fx: "mark", kind: "smite", pal: "smite" },
  "Кара Императора": { fx: "mark", kind: "smite", pal: "smite" },
  "Сияющая кара": { fx: "mark", kind: "smite", pal: "holy" },
  "Гневная кара": { fx: "mark", kind: "smite", pal: "death" },
  "Приказ": { fx: "mind", pal: "smite" },
  "Допросная": { fx: "summon", pal: "holy", style: "holy" },
  "Боевой кибер-конь": { fx: "summon", pal: "mech", style: "mech" },
  // техножрец
  "Огненный разряд": { fx: "bolt", pal: "plasma", size: 0.3, speed: 18 },
  "Палящие лучи": { fx: "rays", pal: "plasma", rays: 3, width: 0.24 },
  "Волна грома": { fx: "area", kind: "wave", pal: "thunder", r: 15, center: "self" },
  "Резонанс": { fx: "area", kind: "shatter", pal: "thunder", r: 10 },
  "Перегрев": { fx: "mark", kind: "heat", pal: "plasma" },
  "Метка ауспика": { fx: "mark", kind: "reticle", pal: "mech" },
  "Ауспик варпа": { fx: "self", kind: "sweep", pal: "volt" },
  "Ритуал починки": { fx: "self", kind: "glyph", pal: "volt" },
  "Освящение оружия": { fx: "ward", pal: "mech", style: "mech" },
  // враги: способности-«умения»; «Предмет · Действие» — эффект для одного действия способности
  "Слово (перезарядка 5–6)": { fx: "mind", pal: "warp", spike: true },
  "Логово: разлом · Молния вдоль ветки": { fx: "rays", pal: "warp", width: 0.22, origin: "rift" },
  "Логово: разлом · Дымка сгущается": { fx: "area", kind: "void", pal: "warp", r: 15, origin: "rift", at: "rift" },
  "Легендарные действия (2 за раунд) · Шаг сквозь дымку": { fx: "self", kind: "blink", pal: "warp", self: true },
  "Якоря · Восстановление · 10 хитов": { fx: "heal", pal: "warp", self: true },
  "Якоря · Восстановление · 15 (испытание 3 провалено)": { fx: "heal", pal: "warp", self: true },
};
/** Запись таблицы для действия способности: сначала «Предмет · Действие», потом сам предмет. */
const entryOf = (item, activity) => SPELLS[`${item?.name} · ${activity?.name}`] ?? SPELLS[item?.name];

/** Демон или тварь варпа: когти светятся варпом, а не кровью. */
const demonic = actor => { const t = actor?.system?.details?.type ?? {}; return /fiend|aberration/.test(t.value ?? "") || /демон|daemon|demon|варп/i.test(t.subtype ?? ""); };

/** Вид удара в ближнем бою по названию оружия. */
export function meleeKind(item, activity = null) {
  const n = `${item?.name ?? ""} ${activity?.name ?? ""}`.toLowerCase(), nat = item?.system?.type?.value === "natural";
  if (/цепн/.test(n)) return /топор|секир/.test(n) ? "chainaxe" : "chain";
  if (/силов|энерг|power/.test(n)) return "power";
  if (/когт|клешн|лап|коготь|claw/.test(n)) return demonic(item?.actor) ? "warpclaw" : "claw";
  if (/укус|пасть|челюст|зуб|bite/.test(n)) return "bite";
  if (/безоруж|кулак|удар|unarmed/.test(n)) return "fist";
  if (/нож|кинжал|штык|стилет|knife|dagger/.test(n)) return "knife";
  if (/копь|пика|трезуб|spear/.test(n)) return "spear";
  if (/топор|секир|алебард|глеф|коса|axe/.test(n)) return "axe";
  if (/булав|молот|дубин|палиц|посох|моргенштерн|цеп|клевец|hammer|mace|staff/.test(n)) return "blunt";
  return nat ? "claw" : "sword";
}
/** Граната по названию: frag | smoke | melta, иначе null. */
export function grenadeKind(item) {
  const n = String(item?.name ?? "").toLowerCase();
  if (/мелта/.test(n)) return "melta";
  if (/гранат/.test(n) && /дым/.test(n)) return "smoke";
  if (/гранат|grenade/.test(n)) return "frag";
  return null;
}

const DMG_PAL = { fire: "plasma", cold: "frost", lightning: "volt", radiant: "holy", necrotic: "death", psychic: "psychic", force: "warp", thunder: "thunder", acid: "plasma", poison: "death" };

function styleOf(actor) {
  const cls = actor?.items?.find?.(i => i.type === "class")?.system?.identifier;
  return cls === "psyker" ? "warp" : cls === "techpriest" ? "mech" : "holy";
}
function damageTypes(activity) {
  const parts = activity?.damage?.parts ?? [];
  return [...new Set(parts.flatMap(p => [...(p.types ?? [])]))];
}

/** Что показать: запись таблицы или догадка по виду действия и типу урона. Возвращает null, если ничего. */
export function pick(item, activity) {
  const e = entryOf(item, activity);
  if (e) return { ...e };
  if (item?.type !== "spell") return null;
  const t = activity?.type, dt = damageTypes(activity), pal = DMG_PAL[dt[0]] ?? "warp";
  if (t === "attack") return { fx: "bolt", pal };
  if (t === "damage") return { fx: "bolt", pal };
  if (t === "heal") return { fx: "heal", pal: "auto" };
  if (t === "summon") return { fx: "summon", pal: "auto" };
  if (t === "save") {
    if (dt.includes("psychic") || !dt.length) return { fx: "mind", pal: dt.length ? "psychic" : "warp" };
    if (dt.includes("thunder")) return { fx: "area", kind: "wave", pal: "thunder", r: 10 };
    if (dt.includes("necrotic")) return { fx: "pillar", pal: "death", toll: true };
    return { fx: "pillar", pal };
  }
  return { fx: "ward", pal: "auto" };
}

/**
 * @param {object} o
 * @param {function} o.broadcast — разослать эффект остальным клиентам
 * @param {{enabled:function, volume:function}} o.settings
 */
export function createSpellFX({ broadcast, settings }) {
  let eng = null, layer = null, under = null, decals = null, sceneId = null, manual = false;
  const tick = () => { if (eng && !manual) eng.update(canvas.app.ticker.deltaMS); };

  function teardown() {
    canvas?.app?.ticker?.remove(tick);
    eng?.destroy(); eng = null;
    for (const c of [layer, under, decals]) if (c && !c.destroyed) { c.parent?.removeChild(c); c.destroy({ children: true }); }
    layer = under = decals = null; sceneId = null;
  }
  function ensure() {
    if (!canvas?.ready || !canvas.scene) return null;
    if (eng && sceneId === canvas.scene.id && !layer.destroyed) return eng;
    teardown();
    layer = new PIXI.Container(); layer.name = "nk-spellfx"; layer.eventMode = "none";
    under = new PIXI.Container(); under.name = "nk-spellfx-under"; under.eventMode = "none";
    canvas.interface.addChild(under, layer);
    decals = new PIXI.Container(); decals.name = "nk-spellfx-decals"; decals.eventMode = "none";
    try { Object.assign(decals, { elevation: 0, sortLayer: 690, sort: 1, zIndex: 0 }); canvas.primary.addChild(decals); canvas.primary.sortDirty = true; }
    catch (e) { under.addChildAt(decals, 0); }
    eng = new SpellFX({ fxLayer: layer, underLayer: under, decalLayer: decals, grid: canvas.grid.size, onHit: tintToken, blood: settings.blood?.() ?? true,
      audio: { get volume() { return settings.volume(); } } });
    canvas.app.ticker.add(tick);
    sceneId = canvas.scene.id;
    return eng;
  }

  /** Короткий отсвет на токене цели: меняется только картинка у клиента. */
  function tintToken(id, color) {
    const t = canvas.tokens?.get(id), m = t?.mesh; if (!m) return;
    const old = m.tint; m.tint = color ?? 0xffffff;
    setTimeout(() => { if (!t.destroyed && t.mesh) t.mesh.tint = old; }, 160);
  }
  function visibleHere(p) {
    if (game.user.isGM || p.fx === "breach") return true;
    return [p.from?.id, ...(p.tos ?? []).map(t => t.id)].filter(Boolean).some(id => canvas.tokens?.get(id)?.visible);
  }

  /** Вспышка на весь экран: закрывает смену фона, гаснет, когда сцена перерисуется. */
  /** Тайтл прорыва: буквы проступают с дрожью поверх карты и держатся через вспышку до новой сцены. */
  function breachTitle(p) {
    const dur = p.duration ?? 10000, title = p.title ?? "ЗАВЕСА РАЗОРВАНА", sub = p.sub ?? "";
    setTimeout(() => {
      document.getElementById("nk-breach-title")?.remove();
      const box = document.createElement("div"); box.id = "nk-breach-title";
      box.style.cssText = "position:fixed;inset:0;z-index:99910;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.2vh;" +
        "opacity:1;transition:opacity 1.4s ease-out;font-family:'Cinzel','Modesto Condensed','Signika',serif;text-align:center";
      const h = document.createElement("div");
      h.style.cssText = "font-size:min(6.4vw,92px);letter-spacing:.1em;white-space:nowrap;font-weight:700;color:#f3e2ff;transition:color .5s,text-shadow .5s;" +
        "text-shadow:0 0 18px #b04dff,0 0 42px #7a1fd0,0 0 90px #3d006b,3px 0 0 rgba(255,40,120,.55),-3px 0 0 rgba(60,220,255,.45)";
      [...title].forEach((ch, i) => {
        const sp = document.createElement("span"); sp.textContent = ch === " " ? "\u00a0" : ch;
        sp.style.cssText = `display:inline-block;opacity:0;filter:blur(14px);transform:translateY(${(i % 2 ? -1 : 1) * 18}px) scale(1.6);` +
          `transition:opacity .5s ${120 + i * 70}ms,filter .9s ${120 + i * 70}ms,transform .9s ${120 + i * 70}ms cubic-bezier(.2,.9,.2,1)`;
        h.append(sp);
      });
      box.append(h);
      if (sub) { const s2 = document.createElement("div"); s2.textContent = sub;
        s2.style.cssText = "font-size:min(2.2vw,26px);letter-spacing:.5em;white-space:nowrap;color:#d9b8ff;opacity:0;transition:opacity 1.2s 1.6s,color .5s;text-shadow:0 0 12px #8a2be2"; box.append(s2); }
      setTimeout(() => {                                       // во вспышке буквы темнеют — читаются на белом
        h.style.color = "#1c0033"; h.style.textShadow = "0 0 8px #fff,0 0 26px #f0dcff,0 0 60px #c58bff";
        if (box.children[1]) { box.children[1].style.color = "#2a0050"; box.children[1].style.textShadow = "0 0 8px #fff"; }
      }, 2900);
      document.body.append(box);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        for (const sp of h.children) { sp.style.opacity = "1"; sp.style.filter = "blur(0)"; sp.style.transform = "none"; }
        if (box.children[1]) box.children[1].style.opacity = ".9";
      }));
      const shake = setInterval(() => {                        // мелкая дрожь отдельных букв
        const sp = h.children[Math.floor(Math.random() * h.children.length)]; if (!sp) return;
        sp.style.transition = "none"; sp.style.transform = `translate(${(Math.random() - .5) * 10}px,${(Math.random() - .5) * 8}px)`;
        setTimeout(() => { sp.style.transform = "none"; }, 90);
      }, 140);
      let done = false;
      const out = () => { if (done) return; done = true; box.style.opacity = "0"; setTimeout(() => { clearInterval(shake); box.remove(); }, 1500); };
      Hooks.once("canvasReady", () => setTimeout(out, 1600));
      setTimeout(out, 8000 + 3600);
    }, Math.max(0, dur - 3600));
  }
  function flashLater(p) {
    const at = Math.max(0, (p.duration ?? 10000) - 700);
    setTimeout(() => {
      const el = document.createElement("div");
      el.style.cssText = "position:fixed;inset:0;z-index:99900;pointer-events:none;opacity:0;transition:opacity .35s ease-in;" +
        "background:radial-gradient(ellipse at 50% 50%, #fff6ff 0%, #e2b8ff 30%, #7a22c0 70%, #14001f 100%)";
      document.body.append(el);
      requestAnimationFrame(() => { el.style.opacity = "1"; });
      let done = false;
      const out = () => { if (done) return; done = true; el.style.transition = "opacity 1.2s ease-out"; el.style.opacity = "0"; setTimeout(() => el.remove(), 1300); };
      Hooks.once("canvasReady", () => setTimeout(out, 350));
      setTimeout(out, 6500);
    }, at);
  }
  function preload(src) {
    if (!src) return;
    try { (foundry.canvas?.TextureLoader ?? globalThis.TextureLoader)?.loader?.load?.([src], { displayProgress: false }); } catch (e) { /* не страшно */ }
  }

  function play(p) {
    if (!p || p.t !== "sfx" || !settings.enabled()) return false;
    if (p.scene !== canvas?.scene?.id || !visibleHere(p)) return false;
    const e = ensure(); if (!e) return false;
    const R = rng(p.seed), P = PALETTES[p.pal] ?? PALETTES.warp, o = p.o ?? {}, g = canvas.grid.size;
    const from = p.from, tos = p.tos?.length ? p.tos : [from];
    const center = p.at ?? (o.center === "self" || !p.tos?.length ? (from ?? p.at) : { x: tos.reduce((a, t) => a + t.x, 0) / tos.length, y: tos.reduce((a, t) => a + t.y, 0) / tos.length });
    const radius = p.radius ?? ((o.r ?? 10) / FT) * g;
    switch (p.fx) {
      case "bolt": {
        if (o.darts) {                               // стрелы: всего N, раскладываем по целям
          const per = tos.map(() => 0); for (let i = 0; i < o.darts; i++) per[i % tos.length]++;
          tos.forEach((to, i) => e.bolt({ from, tos: [to], P, count: per[i], speed: o.speed ?? 9, size: o.size ?? 0.2, R }));
        } else e.bolt({ from, tos, P, speed: o.speed ?? 14, size: o.size ?? 0.3, wob: o.wob ?? 0, big: !!o.big, R });
        break;
      }
      case "rays": {
        if (o.rays) { const per = tos.map(() => 0); for (let i = 0; i < o.rays; i++) per[i % tos.length]++; e.rays({ from, tos: tos.flatMap((t, i) => Array(per[i]).fill(t)), P, width: o.width ?? 0.26, R }); }
        else e.rays({ from, tos, P, width: o.width ?? 0.28, R });
        break;
      }
      case "mind": e.mind({ from, tos, P, spike: !!o.spike, bind: !!o.bind, whisper: !!o.whisper, R }); break;
      case "pillar": e.pillar({ tos, P, toll: !!o.toll, R }); break;
      case "heal": e.heal({ from, tos, P, mech: p.style === "mech", big: !!o.big, R }); break;
      case "ward": e.ward({ from, tos, P, style: o.style ?? p.style ?? "holy", R }); break;
      case "mark": e.mark({ from, tos, P, kind: o.kind ?? "reticle", R }); break;
      case "area": e.area({ at: center, from, P, kind: o.kind ?? "wave", radius, R }); break;
      case "summon": e.summon({ at: p.at ?? (p.tos?.length ? center : { x: from.x + g, y: from.y }), P, style: o.style ?? p.style ?? "holy", R }); break;
      case "self": e.self({ from, P, kind: o.kind ?? "glyph", R }); break;
      case "melee": e.blood = settings.blood?.() ?? true; p.tos.forEach((to, i) => e.at(i * 90, () => e.melee({ from, to, kind: p.kind, hit: to.hit !== false, crit: p.crit, R }))); break;
      case "throw": e.blood = settings.blood?.() ?? true; p.tos.forEach(to => e.knifeThrow({ from, to, hit: to.hit !== false, R })); break;
      case "grenade": e.explode({ from, at: center, radius: p.radius ?? (20 / FT) * g, kind: p.kind, R }); break;
      case "breach": e.breach({ at: p.at, duration: p.duration ?? 10000, R }); flashLater(p); if (p.title !== false) breachTitle(p); preload(p.preload); break;
      default: return false;
    }
    return true;
  }

  /** Разлом галереи: свет с ролью rift на сцене (центр расщелины), иначе null. */
  const riftPoint = () => { const l = canvas.scene?.lights?.find(x => x.flags?.[MOD]?.role === "rift"), g = canvas.grid.size;
    return l ? { x: l.x, y: l.y - g * 0.45, r: g * 0.6 } : null; };
  const tokOf = actor => actor?.token?.object ?? canvas.tokens?.controlled.find(t => t.actor === actor) ?? actor?.getActiveTokens?.()[0] ?? null;
  const pt = (t, hit) => ({ x: t.center.x, y: t.center.y, r: Math.min(t.w, t.h) / 2, id: t.id, ...(hit === undefined ? {} : { hit }) });

  /** Собрать посылку: кто, в кого, где, чем. */
  /** Шаблон области: центр, радиус и кто внутри (по центрам токенов). */
  function area(tplDoc) {
    const d = tplDoc?.document ?? tplDoc, obj = d?.object; if (!d) return null;
    let x = d.x, y = d.y, radius = ((Number(d.distance) || 0) / (canvas.scene.grid?.distance || FT)) * canvas.grid.size, inside = [];
    let shape = obj?.shape;
    if (!shape) try {                                   // шаблон ещё не нарисован — считаем форму сами
      const MT = foundry.canvas?.placeables?.MeasuredTemplate ?? globalThis.MeasuredTemplate;
      const dp = canvas.dimensions?.distancePixels ?? canvas.grid.size / (canvas.scene.grid?.distance || FT), dist = (Number(d.distance) || 0) * dp;
      shape = d.t === "circle" ? MT?.getCircleShape?.(dist) : d.t === "rect" ? MT?.getRectShape?.(dist, d.direction)
        : d.t === "cone" ? MT?.getConeShape?.(dist, d.direction, d.angle) : d.t === "ray" ? MT?.getRayShape?.(dist, d.direction, (Number(d.width) || FT) * dp) : null;
    } catch (err) { shape = null; }
    if (shape) {
      const b = shape.getBounds?.();
      if (b && d.t !== "circle") { x = d.x + b.x + b.width / 2; y = d.y + b.y + b.height / 2; radius = Math.max(b.width, b.height) / 2; }
      inside = (canvas.tokens?.placeables ?? []).filter(t => shape.contains(t.center.x - d.x, t.center.y - d.y));
    }
    return { at: { x, y }, radius, inside };
  }

  function build(item, activity, { hitFor = null, templates = [] } = {}) {
    const e = pick(item, activity); if (!e) return null;
    const src = tokOf(activity?.actor ?? item.actor); if (!src) return null;
    const style = styleOf(activity?.actor ?? item.actor);
    const zone = templates?.length ? area(templates[0]) : null;
    let targets = [...(game.user.targets ?? [])].filter(t => t.document?.parent === canvas.scene);
    if (!targets.length && zone?.inside.length) targets = zone.inside.filter(t => t !== src || e.fx !== "area");   // шаблон без целей — кто под ним
    if (!targets.length && (e.self || ["heal", "ward"].includes(e.fx))) targets = [src];
    if (e.self) targets = [src];
    if (["bolt", "rays", "mind", "pillar", "mark"].includes(e.fx) && !targets.filter(t => t !== src).length && e.fx !== "mark") return null;
    const pal = e.pal === "auto" ? (style === "warp" ? (e.fx === "heal" ? "heal" : "warp") : style === "mech" ? (e.fx === "heal" ? "volt" : "mech") : e.fx === "heal" ? "heal" : "holy") : e.pal;
    const rift = (e.origin === "rift" || e.at === "rift") ? riftPoint() : null;
    const p = { t: "sfx", scene: canvas.scene.id, fx: e.fx, pal, style: e.style ?? style, o: e, seed: Math.floor(Math.random() * 1e9), from: e.origin === "rift" && rift ? rift : pt(src),
      tos: targets.filter(t => !(t === src && ["bolt", "rays", "mind", "pillar"].includes(e.fx))).map(t => pt(t, hitFor ? hitFor(t) : undefined)) };
    if (zone) { p.at = zone.at; if (zone.radius) p.radius = zone.radius; }
    if (e.at === "rift" && rift) p.at = { x: rift.x, y: rift.y };
    return p;
  }

  function send(p) { if (!p) return null; broadcast(p); play(p); return p; }

  /** Граната: из рук бросающего в центр шаблона (или в выделенную цель, или на две клетки вперёд). */
  function buildGrenade(item, activity, kind, templates) {
    const src = tokOf(activity?.actor ?? item.actor); if (!src) return null;
    const zone = templates?.length ? area(templates[0]) : null;
    const tgt = [...(game.user.targets ?? [])].find(t => t !== src && t.document?.parent === canvas.scene);
    const at = zone?.at ?? (tgt ? { x: tgt.center.x, y: tgt.center.y } : { x: src.center.x + canvas.grid.size * 2, y: src.center.y });
    const radius = zone?.radius || ((Number(activity?.target?.template?.size) || 20) / (canvas.scene.grid?.distance || FT)) * canvas.grid.size;
    return { t: "sfx", scene: canvas.scene.id, fx: "grenade", kind, pal: "frag", o: {}, seed: Math.floor(Math.random() * 1e9), from: pt(src), tos: [], at, radius };
  }

  /** dnd5e.postUseActivity — всё, кроме атак (они — по броску). */
  function onUse(activity, usageConfig, results) {
    const item = activity?.item; if (!item) return null;
    const gk = grenadeKind(item);
    if (gk) { const templates = results?.templates ?? []; setTimeout(() => send(buildGrenade(item, activity, gk, templates)), templates.length ? 80 : 0); return true; }
    if (item.type === "weapon") return null;
    if (activity.type === "attack") return null;
    if (item.type !== "spell" && !entryOf(item, activity)) return null;
    const templates = results?.templates ?? [];
    if (templates.length) { setTimeout(() => send(build(item, activity, { templates })), 80); return true; }   // дать шаблону дорисоваться
    return send(build(item, activity, { templates }));
  }
  /** dnd5e.rollAttackV2 — заклинания с атакой: попадание по КД каждой цели. */
  function onAttack(rolls, data) {
    const activity = data?.subject, item = activity?.item, roll = rolls?.[0];
    if (!item || !roll) return null;
    if (item.type === "weapon") return onWeapon(activity, item, roll, data);
    // когти, укусы и прочие атаки-«умения» существ — как ближний бой
    if (item.type !== "spell" && !entryOf(item, activity) && activity?.attack?.type?.value === "melee") return onWeapon(activity, item, roll, data);
    if (item.type !== "spell" && !entryOf(item, activity)) return null;
    const crit = !!roll.isCritical, fumble = !!roll.isFumble;
    const hitFor = t => crit || (!fumble && roll.total >= (t.actor?.system?.attributes?.ac?.value ?? 10));
    return send(build(item, activity, { hitFor }));
  }
  /** Ближний бой и метание: росчерк по цели или брошенный нож. Стрельба — у эффектов стрельбы. */
  function onWeapon(activity, item, roll, data) {
    const wt = item.system?.type?.value ?? "", thrown = /thrown/i.test(roll.options?.attackMode ?? data?.attackMode ?? "");
    const atype = activity.attack?.type?.value || (wt.endsWith("M") || wt === "natural" ? "melee" : "ranged");
    if (atype !== "melee" && !thrown) return null;
    const src = tokOf(activity.actor); if (!src) return null;
    const targets = [...(game.user.targets ?? [])].filter(t => t !== src && t.document?.parent === canvas.scene);
    if (!targets.length) return null;
    const crit = !!roll.isCritical, fumble = !!roll.isFumble;
    const hitFor = t => crit || (!fumble && roll.total >= (t.actor?.system?.attributes?.ac?.value ?? 10));
    return send({ t: "sfx", scene: canvas.scene.id, fx: thrown ? "throw" : "melee", kind: meleeKind(item, activity), crit, pal: "steel", o: {}, seed: Math.floor(Math.random() * 1e9),
      from: pt(src), tos: targets.map(t => pt(t, hitFor(t))) });
  }

  /** Прорыв варпа на сцене: расщелина и молнии duration мс, вспышка у всех. Промис — когда пора менять фон. */
  function breach(scene, at, { duration = 10000, preload: src = null, title = "ЗАВЕСА РАЗОРВАНА", sub = "" } = {}) {
    const p = { t: "sfx", fx: "breach", scene: scene.id, at, duration, preload: src, title, sub, pal: "warp", o: {}, seed: Math.floor(Math.random() * 1e9), from: { ...at, r: 64 }, tos: [] };
    send(p);
    return new Promise(r => setTimeout(r, Math.max(0, duration - 420)));
  }

  /** Ручной вызов: NepreklonnyFX.spell("Священное пламя", заклинатель, цели). */
  function cast(name, src, targets = [], extra = {}) {
    const e = SPELLS[name] ?? extra; if (!e?.fx || !src) return null;
    const style = styleOf(src.actor);
    const pal = e.pal === "auto" || !e.pal ? (style === "mech" ? "mech" : style === "warp" ? "warp" : "holy") : e.pal;
    targets = [targets].flat().filter(Boolean);
    return send({ t: "sfx", scene: canvas.scene.id, fx: e.fx, pal, style: e.style ?? style, o: e, seed: Math.floor(Math.random() * 1e9), from: pt(src),
      tos: (targets.length ? targets : [src]).map(t => pt(t, extra.hit)) });
  }

  return { play, emit: send, onUse, onAttack, cast, breach, teardown, ensure, get engine() { return eng; }, manual(on) { manual = !!on; }, step(ms) { eng?.update(ms); } };
}
