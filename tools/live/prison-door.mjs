/* «Непреклонный» 3.4.5 — тюремный блок: восточная гермодверь («Разгерметизация») становится запертой.
   Меняет одну стену-дверь на сцене «0. Тюремный блок». Ничего не удаляет. */
export default async function ({ log }) {
  const MOD = "nepreklonny-40k";
  const scene = game.scenes.find(s => s.flags?.[MOD]?.scene === "cells") ?? game.scenes.find(s => s.name === "0. Тюремный блок");
  if (!scene) { log("сцены «0. Тюремный блок» в мире нет"); return { ok: false }; }
  // дверь на восточном конце коридора: вертикальная стена у x ≈ 4513
  const door = scene.walls.find(w => w.door && Math.abs(w.c[0] - 4513) < 40 && Math.abs(w.c[2] - 4513) < 40);
  if (!door) { log("восточной двери не нашлось"); return { ok: false }; }
  const LOCKED = CONST.WALL_DOOR_STATES.LOCKED;
  if (door.ds !== LOCKED) await door.update({ ds: LOCKED });
  log(`восточная гермодверь заперта (стена ${door.id})`);
  ui.notifications.info("Тюремный блок: восточная гермодверь заперта.");
  return { ok: true, wall: door.id };
}
