/* «Непреклонный» 3.6.5 — Нерождённого и турель можно крутить: снять «Запретить вращение» у актёров и токенов.
   Это вид сверху, у них есть «перед». Ничего не удаляет. */
export default async function ({ log }) {
  const NAMES = ["Нерождённый", "Сторожевая турель палубы"];
  let n = 0;
  for (const name of NAMES) {
    const a = game.actors.find(x => x.name === name);
    if (a && a.prototypeToken.lockRotation !== false) { await a.update({ "prototypeToken.lockRotation": false }); n++; log(`актёр «${name}»: вращение разрешено`); }
  }
  for (const scene of game.scenes) {
    const upd = scene.tokens.filter(t => (NAMES.includes(t.actor?.name) || NAMES.some(x => t.name?.startsWith(x))) && t.lockRotation !== false).map(t => ({ _id: t.id, lockRotation: false }));
    if (upd.length) { await scene.updateEmbeddedDocuments("Token", upd); n += upd.length; log(`${scene.name}: токенов — ${upd.length}`); }
  }
  ui.notifications.info("Нерождённого и турель можно крутить: Shift + колесо мыши над токеном.");
  return { changed: n };
}
