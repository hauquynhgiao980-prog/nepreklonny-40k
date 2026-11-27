/* «Непреклонный» 3.6.3 — Нерождённый в мире: медальоны способностей вместо заглушек, размер «огромный» (3×3).
   Меняет только актёра «Нерождённый» и картинки его способностей. Ничего не удаляет. */
export default async function ({ log }) {
  const A1 = "modules/nepreklonny-40k/icons/gen/act1/";
  const ICON = { "Мультиатака": "multiattack", "Коготь": "claw", "Слово (перезарядка 5–6)": "word", "Якоря": "anchors",
    "Легендарные действия (2 за раунд)": "legendary", "Логово: разлом": "lair", "Тактика": "tactics" };
  const a = game.actors.find(x => x.name === "Нерождённый");
  if (!a) { log("Нерождённого в мире ещё нет — при первом показе он выйдет из компендиума с иконками"); return { actors: 0 }; }
  const upd = a.items.filter(i => ICON[i.name] && i.img !== `${A1}unborn_${ICON[i.name]}.webp`).map(i => ({ _id: i.id, img: `${A1}unborn_${ICON[i.name]}.webp` }));
  if (upd.length) await a.updateEmbeddedDocuments("Item", upd);
  log(`способностей с новыми иконками: ${upd.length}`);
  if (a.system.traits?.size !== "huge") { await a.update({ "system.traits.size": "huge" }); log("размер: огромный"); }
  for (const scene of game.scenes) for (const t of scene.tokens) {
    if (t.actorLink || t.actor?.name !== "Нерождённый" || !t.delta?.items?.size) continue;
    const u = t.actor.items.filter(i => ICON[i.name] && i.img !== `${A1}unborn_${ICON[i.name]}.webp`).map(i => ({ _id: i.id, img: `${A1}unborn_${ICON[i.name]}.webp` }));
    if (u.length) { await t.actor.updateEmbeddedDocuments("Item", u); log(`${scene.name}: токен — ${u.length}`); }
  }
  ui.notifications.info(`Нерождённый: иконки способностей — ${upd.length}.`);
  return { items: upd.length };
}
