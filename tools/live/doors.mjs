/* «Непреклонный» 3.5.0 — две запертые гермодвери, как в тексте: восточная в блоке камер («Разгерметизация»)
   и восточная в коридоре поста охраны («дальше в корабль»). Меняет по одной стене-двери на двух сценах. Ничего не удаляет. */
export default async function ({ log }) {
  const MOD = "nepreklonny-40k", LOCKED = CONST.WALL_DOOR_STATES.LOCKED, out = {};
  const lock = async (key, name, x) => {
    const scene = game.scenes.find(s => s.flags?.[MOD]?.scene === key) ?? game.scenes.find(s => s.name === name);
    if (!scene) { log(`сцены «${name}» в мире нет`); return; }
    const door = scene.walls.find(w => w.door && Math.abs(w.c[0] - x) < 40 && Math.abs(w.c[2] - x) < 40 && Math.min(w.c[1], w.c[3]) < 1500 && Math.max(w.c[1], w.c[3]) > 1500);
    if (!door) { log(`${name}: восточной двери не нашлось`); return; }
    if (door.ds !== LOCKED) await door.update({ ds: LOCKED });
    log(`${name}: восточная гермодверь заперта`); out[key] = door.id;
  };
  await lock("cells", "0. Тюремный блок", 4513);
  await lock("post", "1. Пост охраны", 2150);
  ui.notifications.info("Восточные гермодвери блока камер и поста охраны заперты.");
  return out;
}
