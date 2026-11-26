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

export const LOCATIONS = [
  { key: "intro", title: "О МОДУЛЕ · КТО, ЧТО, ЗАЧЕМ", file: "intro" },
  { key: "lore", title: "ШПАРГАЛКА ПО МИРУ · НЕУДОБНЫЕ ВОПРОСЫ", file: "lore" },
  { key: "prologue", title: "ПРОЛОГ · МОСТИК", scene: "bridge", file: "prologue" },
  { key: "cells", title: "0. ТЮРЕМНЫЙ БЛОК", scene: "cells", tools: [nudgeTools, servitorTools, hackTools], file: "cells" },
  { key: "post", title: "1. ПОСТ ОХРАНЫ", scene: "post", file: "post" },
  { key: "hall", title: "2. ЗАЛ ЭТАПА", scene: "hall", tools: [eventsTool("hall", "ЗАЛ ЭТАПА · СОБЫТИЯ")], file: "hall" },
  { key: "route", title: "ПЕРЕХОД · АВАРИЙНЫЙ ТРАП · ПРОМЕЖУТОЧНЫЕ МЕСТА", file: "route" },
  { key: "boats", title: "3. ШЛЮПОЧНАЯ ПАЛУБА", scene: "lifeboats", tools: [eventsTool("lifeboats", "ШЛЮПОЧНАЯ ПАЛУБА · СОБЫТИЯ")], file: "boats" },
  { key: "gallery", title: "4. СМОТРОВАЯ ГАЛЕРЕЯ", scene: "gallery", tools: [eventsTool("gallery", "СМОТРОВАЯ ГАЛЕРЕЯ · СОБЫТИЯ")], file: "gallery" },
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
    loading.set(file, fetch(`modules/${S.MOD}/guide/${file}.html?v=${v}`).then(r => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
      .then(t => { html.set(file, t); return t; })
      .catch(e => { loading.delete(file); return `<p class="nk-g-hint">Не удалось загрузить текст раздела (${e.message}). Обновите страницу.</p>`; }));
  }
  return loading.get(file);
}

/** Картинки промежуточных мест: превью и кнопки «Показать игрокам», «Убрать у всех». */
function decorate(root, key) {
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
  root.querySelectorAll("details").forEach((d, i) => {
    const k = `${key}:${i}`;
    if (details.has(k)) d.open = details.get(k);
    d.addEventListener("toggle", () => details.set(k, d.open));
  });
}

function textBlock(L) {
  const d = h("div.nk-g-text");
  const fill = t => { d.innerHTML = t; decorate(d, L.key); };
  if (html.has(L.file)) fill(html.get(L.file));
  else { d.append(h("div.nk-g-hint", {}, "Загружаю…")); load(L.file).then(fill); }
  return d;
}

function section(L, rerender, extra) {
  const on = !!open[L.key];
  const body = h("div.nk-g-body");
  const fill = () => { if (!body.childElementCount) body.append(...(L.tools || []).map(t => t(rerender)), textBlock(L)); };
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
  return LOCATIONS.map(L => {
    const sc = L.scene && game.scenes?.find?.(s => s.flags?.[S.MOD]?.scene === L.scene);
    const view = sc ? h("button.nk-btn.small", { title: "Открыть сцену у себя", onclick: e => { e.stopPropagation(); sc.view(); } }, "СМОТРЕТЬ СЦЕНУ") : null;
    return section(L, rerender, view);
  });
}
