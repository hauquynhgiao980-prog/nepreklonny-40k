/* Непреклонный: эффекты стрелкового оружия. Подключение к модулю: настройки, сокет, хук атаки.
   В макросе: NepreklonnyFX.shoot(стрелок, цель, { kind: "laser" | "slug" | "bolt", shots: 3, hit: true }). */
import { createWeaponFX } from "./weaponfx-foundry.mjs";

const MOD = "nepreklonny-40k";

Hooks.once("init", () => {
  game.settings.register(MOD, "weaponFx", {
    name: "Эффекты стрельбы", hint: "Лазерные очереди, трассеры, вспышки и попадания при атаке стрелковым оружием.",
    scope: "client", config: true, type: Boolean, default: true,
  });
  game.settings.register(MOD, "weaponFxBlood", {
    name: "Кровь при попадании", hint: "Брызги и пятна крови на полу. Пятна тают через несколько секунд.",
    scope: "client", config: true, type: Boolean, default: true,
  });
  game.settings.register(MOD, "weaponFxVolume", {
    name: "Громкость выстрелов", hint: "0 — без звука.",
    scope: "client", config: true, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.5,
  });
});

Hooks.once("ready", () => {
  const api = createWeaponFX({
    broadcast: p => game.socket.emit(`module.${MOD}`, p),
    settings: {
      enabled: () => game.settings.get(MOD, "weaponFx"),
      blood: () => game.settings.get(MOD, "weaponFxBlood"),
      volume: () => game.settings.get(MOD, "weaponFxVolume"),
    },
  });
  game.socket.on(`module.${MOD}`, p => { if (p?.t === "wfx") api.play(p); });
  Hooks.on("dnd5e.rollAttackV2", (rolls, data) => {
    try { api.onAttack(rolls, data); } catch (e) { console.error(`${MOD} | эффекты стрельбы`, e); }
  });
  Hooks.on("canvasTearDown", () => api.teardown());
  const mod = game.modules.get(MOD);
  mod.api = { ...(mod.api ?? {}), weaponFx: api };
  globalThis.NepreklonnyFX = api;
});
