// Драматические зачитки испытаний: тексты берутся из guide/drama.html (тот же файл, что раздел «Сценария»).
import * as S from "./state.mjs";

let doc = null, pending = null;

/** Загрузить и разобрать guide/drama.html один раз. */
export function dramaDoc() {
  if (doc) return Promise.resolve(doc);
  if (!pending) {
    const v = game.modules?.get?.(S.MOD)?.version ?? "0";
    pending = fetch(`modules/${S.MOD}/guide/drama.html?v=${v}`)
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
      .then(t => (doc = new DOMParser().parseFromString(`<body>${t}</body>`, "text/html")))
      .catch(e => { pending = null; throw e; });
  }
  return pending;
}
export const dramaReady = () => doc;

/** Цитаты (blockquote) части испытания n по селектору внутри блока испытания. */
export function dramaPart(n, sel) {
  const el = doc?.querySelector(`[data-trial="${n}"]`)?.querySelector(sel);
  return el ? [...el.querySelectorAll("blockquote")].map(b => b.outerHTML).join("") : "";
}
