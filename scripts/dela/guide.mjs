// Вкладка «Сценарий» пульта мастера: коротко о модуле, шпаргалка по миру, потом локации по порядку вечера.
// В каждой локации сначала кнопки (макросы), потом текст. Тексты лежат в guide/*.html и подгружаются при раскрытии раздела.
import * as S from "./state.mjs";
import { h } from "./ui.mjs";
import { servitorTools } from "./servitor.mjs";
import { hackTools } from "./hack.mjs";
import { sceneEvents } from "./director.mjs";
import { nudgeTools, showPic, hidePic, picSrc } from "./nudge.mjs";

/** Кнопки событий сцены (те же, что на вкладке «Сцены»): горят, если событие включено. */
function eventsTool(key, title) {
  return rerender => {
    const { scene, list } = sceneEvents(key);
    return h("div.nk-g-tools", {},
      h("div.nk-g-th", {}, title),
      scene ? h("div.nk-g-row", {}, list.map(e => h("button", { class: `nk-btn ${e.on ? "on" : ""}`, title: e.hint, "data-ev": e.id,
        onclick: async ev => { const b = ev.currentTarget; b.disabled = true; try { await e.fire(); } catch (err) { console.error(err); ui.notifications.error(err.message); } rerender(); } },
        e.on ? `${e.label} ✓` : e.label)))
        : h("div.nk-g-hint", {}, "Этой сцены нет в мире: импортируйте акт I."),
      scene ? h("div.nk-g-small", {}, list.map(e => `${e.label} — ${e.hint}`).join(" · ")) : null);
  };
}

/** Нерождённый: эффекты для того, что не бросается кнопкой листа (логово, шаг сквозь дымку, уход в разлом).
 *  Коготь и «Слово» играют сами — по броску атаки и по использованию способности. */
function unbornTools() {
  const FT = 5;
  const ctx = () => {
    const fx = game.modules.get(S.MOD)?.api?.spellFx, scene = canvas?.scene;
    if (!fx?.emit || !scene) { ui.notifications.warn("Эффекты недоступны: откройте сцену галереи."); return null; }
    if (scene.flags?.[S.MOD]?.scene !== "gallery") { ui.notifications.warn("Откройте у себя сцену смотровой галереи."); return null; }
    const g = canvas.grid.size, pt = t => ({ x: t.center.x, y: t.center.y, r: Math.min(t.w, t.h) / 2, id: t.id });
    const tok = canvas.tokens.placeables.find(t => t.actor?.name === "Нерождённый" || /^Нерождённый/.test(t.document.name));
    const riftL = scene.lights.find(l => l.flags?.[S.MOD]?.role === "rift");
    const rift = riftL ? { x: riftL.x, y: riftL.y - g * 0.45, r: g * 0.6 } : tok ? pt(tok) : { x: scene.width * 0.72, y: scene.height * 0.56, r: g * 0.6 };
    const targets = [...game.user.targets].filter(t => t.document?.parent === scene && t !== tok).map(pt);
    const send = (fx, o, extra) => fx && game.modules.get(S.MOD).api.spellFx.emit({ t: "sfx", scene: scene.id, fx, pal: "warp", o, seed: Math.floor(Math.random() * 1e9), ...extra });
    return { g, tok, pt, rift, targets, send };
  };
  const acts = [
    ["ЛОГОВО: МОЛНИЯ", "Молния с неба в отмеченные цели (клавиша T над токеном). Ловкость Сл 14, 3к8 электричеством, половина при успехе.", () => {
      const c = ctx(); if (!c) return;
      if (!c.targets.length) return ui.notifications.warn("Отметьте цели молнии: наведите на токен и нажмите T.");
      c.send("strike", {}, { from: c.rift, tos: c.targets });
    }],
    ["ЛОГОВО: ДЫМКА", "Лиловая дымка сгущается вокруг разлома: сфера 15 футов, сильно заслонена до следующего хода логова.", () => {
      const c = ctx(); if (!c) return;
      c.send("area", { kind: "void" }, { from: c.rift, tos: [], at: c.rift, radius: (15 / FT) * c.g });
    }],
    ["ШАГ СКВОЗЬ ДЫМКУ", "Легендарное действие: вспышка на месте твари. Потом перетащите токен — до 30 футов, внутри дымки у разлома.", () => {
      const c = ctx(); if (!c) return;
      if (!c.tok) return ui.notifications.warn("Токена Нерождённого на сцене нет.");
      c.send("self", { kind: "blink" }, { from: c.pt(c.tok), tos: [] });
    }],
    ["УХОД В РАЗЛОМ", "Хиты на нуле или разбиты оба сердца и оборван канал: разлом утягивает тварь. Токен спрячется сам.", async () => {
      const c = ctx(); if (!c) return;
      if (!c.tok) return ui.notifications.warn("Токена Нерождённого на сцене нет.");
      const p = c.pt(c.tok);
      c.send("area", { kind: "grasp" }, { from: p, tos: [], at: p, radius: p.r * 1.6 });
      setTimeout(() => c.send("area", { kind: "void" }, { from: p, tos: [], at: p, radius: p.r * 1.3 }), 500);
      setTimeout(() => c.tok.document.update({ hidden: true }), 1600);
    }],
  ];
  return () => h("div.nk-g-tools", {},
    h("div.nk-g-th", {}, "НЕРОЖДЁННЫЙ · ЭФФЕКТЫ ЛОГОВА И ЛЕГЕНДАРНЫХ ДЕЙСТВИЙ"),
    h("div.nk-g-row", {}, acts.map(([label, hint, fn]) => h("button.nk-btn", { title: hint, onclick: () => { try { fn(); } catch (err) { console.error(err); ui.notifications.error(err.message); } } }, label))),
    h("div.nk-g-small", {}, "Коготь и «Слово» играют сами: коготь — по броску атаки с отмеченной целью, «Слово» — при использовании (шаблон конуса или отмеченные цели). " +
      acts.map(([l, hint]) => `${l} — ${hint}`).join(" · ")));
}

export const LOCATIONS = [
  { key: "intro", title: "О МОДУЛЕ · КТО, ЧТО, ЗАЧЕМ", file: "intro" },
  { key: "prep", title: "ПЕРЕД ИГРОЙ · БЕЗОПАСНОСТЬ · ЕСЛИ ЧТО-ТО ПОШЛО НЕ ТАК", file: "prep" },
  { key: "lore", title: "ШПАРГАЛКА ПО МИРУ · НЕУДОБНЫЕ ВОПРОСЫ", file: "lore" },
  { key: "drama", title: "ДРАМАТИЧЕСКИЕ ЗАЧИТКИ · СОБЫТИЯ И ВЫБОРЫ", file: "drama" },
  { key: "cells", title: "0. ТЮРЕМНЫЙ БЛОК", scene: "cells", tools: [nudgeTools, servitorTools, hackTools], file: "cells" },
  { key: "post", title: "1. ПОСТ ОХРАНЫ", scene: "post", file: "post" },
  { key: "hall", title: "2. ЗАЛ ЭТАПА", scene: "hall", tools: [eventsTool("hall", "ЗАЛ ЭТАПА · СОБЫТИЯ")], file: "hall" },
  { key: "route", title: "ПЕРЕХОД · АВАРИЙНЫЙ ТРАП · ПРОМЕЖУТОЧНЫЕ МЕСТА", file: "route" },
  { key: "boats", title: "3. ШЛЮПОЧНАЯ ПАЛУБА", scene: "lifeboats", tools: [eventsTool("lifeboats", "ШЛЮПОЧНАЯ ПАЛУБА · СОБЫТИЯ")], file: "boats" },
  { key: "gallery", title: "4. СМОТРОВАЯ ГАЛЕРЕЯ", scene: "gallery", tools: [eventsTool("gallery", "СМОТРОВАЯ ГАЛЕРЕЯ · СОБЫТИЯ"), unbornTools()], file: "gallery" },
  { key: "finale", title: "ФИНАЛ И ЭПИЛОГ", file: "finale" },
];

const open = { intro: true, cells: true };
const html = new Map();                 // файл → текст
const loading = new Map();              // файл → промис
const details = new Map();              // «раздел:номер» → раскрыт ли блок персонажа

function load(file) {
  if (html.has(file)) return Promise.resolve(html.get(file));
  if (!loading.has(file)) {
    const v = game.modules?.get?.(S.MOD)?.version ?? "0";
    loading.set(file, fetch(`modules/${S.MOD}/guide/${file}.html?v=${v}`, { cache: "no-cache" }).then(r => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
      .then(t => { html.set(file, t); return t; })
      .catch(e => { loading.delete(file); return `<p class="nk-g-hint">Не удалось загрузить текст раздела (${e.message}). Обновите страницу.</p>`; }));
  }
  return loading.get(file);
}

/** Зачитки: кнопка события над текстом, подсветка сработавшего события, идущего испытания и его итога. */
function dramaState(root, rerender) {
  const st = S.get();
  for (const el of root.querySelectorAll(".nk-g-drama[data-ev]")) {
    const { scene, list } = sceneEvents(el.dataset.scene);
    const e = list.find(x => x.id === el.dataset.ev);
    el.classList.toggle("on", !!e?.on);
    let bar = el.querySelector(":scope > .nk-g-dbar");
    if (!bar) { bar = h("div.nk-g-dbar"); el.prepend(bar); }
    bar.replaceChildren(scene && e
      ? h("button", { class: `nk-btn small ${e.on ? "on" : ""}`, title: e.hint, "data-dev": e.id, onclick: async ev => {
          const b = ev.currentTarget; b.disabled = true;
          try { await e.fire(); } catch (err) { console.error(err); ui.notifications.error(err.message); }
          if (rerender) rerender(); else dramaState(root);
        } }, e.on ? `${e.label} ✓` : e.label)
      : h("span.nk-g-hint", {}, "сцены нет в мире"));
  }
  for (const el of root.querySelectorAll(".nk-g-drama[data-trial]")) {
    const n = Number(el.dataset.trial), live = st.trial?.n === n;
    el.classList.toggle("on", live);
    let oc = st.outcomes?.[n] || null;
    if (live) { try { oc = S.trialSum(st.trial).outcome || oc; } catch { /* нет бросков */ } }
    el.querySelectorAll("[data-oc]").forEach(x => x.classList.toggle("on", x.dataset.oc === oc));
  }
}

/** Картинки промежуточных мест: превью и кнопки «Показать игрокам», «Убрать у всех». */
function decorate(root, key, rerender) {
  for (const el of root.querySelectorAll(".nk-g-pic[data-pic]")) {
    const pic = el.dataset.pic, title = el.dataset.title || pic;
    const img = h("img", { src: picSrc(pic), alt: title, loading: "lazy" });
    img.addEventListener("error", () => el.classList.add("none"), { once: true });
    el.replaceChildren(img,
      h("div.nk-g-pic-none", {}, "Картинки пока нет · промпт для Krea — в файле «Промпты мест»"),
      h("div.nk-g-pic-btns", {},
        h("button.nk-btn.small", { "data-pic-show": pic, onclick: () => showPic(pic, title) }, "ПОКАЗАТЬ ИГРОКАМ"),
        h("button.nk-btn.small", { onclick: () => hidePic() }, "УБРАТЬ У ВСЕХ")));
  }
  if (root.querySelector(".nk-g-drama")) dramaState(root, rerender);
  root.querySelectorAll("details").forEach((d, i) => {
    const k = `${key}:${i}`;
    if (details.has(k)) d.open = details.get(k);
    d.addEventListener("toggle", () => details.set(k, d.open));
  });
}

function textBlock(L, rerender) {
  const d = h("div.nk-g-text");
  const fill = t => { d.innerHTML = t; decorate(d, L.key, rerender); };
  if (html.has(L.file)) fill(html.get(L.file));
  else { d.append(h("div.nk-g-hint", {}, "Загружаю…")); load(L.file).then(fill); }
  return d;
}

function section(L, rerender, extra) {
  const on = !!open[L.key];
  const body = h("div.nk-g-body");
  const fill = () => { if (!body.childElementCount) body.append(...(L.tools || []).map(t => t(rerender)), textBlock(L, rerender)); };
  if (on) fill();
  return h("section", { class: `nk-g-sec ${on ? "on" : ""}`, "data-sec": L.key },
    h("div.nk-g-head", {},
      h("button.nk-g-tog", { onclick: e => {
        open[L.key] = !open[L.key];
        const b = e.currentTarget; b.closest(".nk-g-sec").classList.toggle("on", open[L.key]); b.textContent = `${open[L.key] ? "▾" : "▸"} ${L.title}`;
        if (open[L.key]) fill();
      } }, `${on ? "▾" : "▸"} ${L.title}`),
      h("div", { style: "flex:1" }), extra),
    body);
}

/** Вкладка «Сценарий». */
export function guideTab(rerender) {
  const top = h("div.nk-g-top", {},
    h("button.nk-btn.small", { title: "Свернуть все разделы", onclick: () => {
      for (const k of Object.keys(open)) open[k] = false;
      rerender();
      const body = document.querySelector("#nk-panel .nk-body"); if (body) body.scrollTop = 0;
    } }, "▴ СВЕРНУТЬ ВСЕ"));
  return [top, ...LOCATIONS.map(L => {
    const sc = L.scene && game.scenes?.find?.(s => s.flags?.[S.MOD]?.scene === L.scene);
    const view = sc ? h("button.nk-btn.small", { title: "Открыть сцену у себя", onclick: e => { e.stopPropagation(); sc.view(); } }, "СМОТРЕТЬ СЦЕНУ") : null;
    return section(L, rerender, view);
  })];
}
