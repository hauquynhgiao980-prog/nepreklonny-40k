/* Непреклонный: школы магии D&D подписаны как психические дисциплины 41-го тысячелетия.
   Меняются только подписи — внутренние коды школ (abj, con...) остаются прежними, поэтому
   заклинания, фильтры и другие модули работают как раньше. */
const SCHOOLS40K = {
  abj: "Санктика",     // ограждение: обереги, щиты, изгнание
  con: "Имматериум",   // вызов: призыв и перенос через варп
  div: "Дивинация",    // прорицание
  enc: "Телепатия",    // очарование
  evo: "Пиромантия",   // воплощение: огонь, молнии, разряды
  ill: "Морок",        // иллюзия
  nec: "Малефика",     // некромантия: запретное колдовство
  trs: "Биомантия"     // преобразование
};

function relabel() {
  const schools = CONFIG.DND5E?.spellSchools;
  if (!schools) return;
  for (const [key, label] of Object.entries(SCHOOLS40K)) {
    const s = schools[key];
    if (!s) continue;
    if (typeof s === "string") schools[key] = label;
    else s.label = label;
  }
}

Hooks.once("init", relabel);
Hooks.once("setup", relabel);   // на случай, если система допишет школы позже
