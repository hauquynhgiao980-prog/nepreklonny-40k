/* «Непреклонный» 3.5.0 — пост охраны: восточная гермодверь коридора («дальше в корабль») становится запертой, как в тексте.
   Меняет одну стену-дверь на сцене «1. Пост охраны». Ничего не удаляет. */
export default async function ({ log }) {
  const MOD = "nepreklonny-40k";
  const scene = game.scenes.find(s => s.flags?.[MOD]?.scene === "post") ?? game.scenes.find(s => s.name === "1. Пост охраны");
  if (!scene) { log("сцены «1. Пост охраны» в мире нет"); return { ok: false }; }
  // гермодверь в правом конце коридора: вертикальная стена у x ≈ 2150, по высоте коридора (y 1390–1670)
  const door = scene.walls.find(w => w.door && Math.abs(w.c[0] - 2150) < 40 && Math.abs(w.c[2] - 2150) < 40 && Math.min(w.c[1], w.c[3]) < 1500 && Math.max(w.c[1], w.c[3]) > 1500);
  if (!door) { log("восточной двери коридора не нашлось"); return { ok: false }; }
  const LOCKED = CONST.WALL_DOOR_STATES.LOCKED;
  if (door.ds !== LOCKED) await door.update({ ds: LOCKED });
  log(`восточная гермодверь поста заперта (стена ${door.id})`);
  ui.notifications.info("Пост охраны: восточная гермодверь заперта.");
  return { ok: true, wall: door.id };
}
