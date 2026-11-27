/* «Непреклонный» 3.6.5 — Нерождённый в мире: «Тактика» — кого бьёт, если Шёпот приняли все. Меняет один текст. */
const HTML = "<p>Первой идёт на того, у кого больше Света. Тех, кто принял Шёпот в испытании 3, обходит, пока есть другие цели: «эти уже наши». Если Шёпот приняли все, бьёт ближайшего, с насмешкой: «Ты же мой… а голод не спрашивает».</p>";
export default async function ({ log }) {
  const a = game.actors.find(x => x.name === "Нерождённый");
  const it = a?.items.find(i => i.name === "Тактика");
  if (!it) { log("Нерождённого или его «Тактики» в мире нет"); return { items: 0 }; }
  if (it.system.description?.value !== HTML) { await it.update({ "system.description.value": HTML }); log("«Тактика» обновлена"); }
  else log("«Тактика» уже такая");
  ui.notifications.info("Нерождённый: «Тактика» обновлена.");
  return { items: 1 };
}
