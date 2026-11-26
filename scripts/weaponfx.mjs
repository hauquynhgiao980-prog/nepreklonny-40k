/* Непреклонный: эффекты стрелкового оружия. Подключение к модулю: настройки, сокет, хук атаки.
   В макросе: NepreklonnyFX.shoot(стрелок, цель, { kind: "laser" | "slug" | "bolt", shots: 3, hit: true }).
   Эффекты заклинаний — там же: NepreklonnyFX.spell("Священное пламя", заклинатель, [цели]). */
import { createWeaponFX } from "./weaponfx-foundry.mjs";
import { createSpellFX } from "./spellfx-foundry.mjs";

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
  game.settings.register(MOD, "spellFx", {
    name: "Эффекты заклинаний", hint: "Варп, свет Императора и плазма машин, когда кто-то читает заклинание или пользуется силой.",
    scope: "client", config: true, type: Boolean, default: true,
  });
  game.settings.register(MOD, "spellFxVolume", {
    name: "Громкость заклинаний", hint: "0 — без звука.",
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
  const spells = createSpellFX({
    broadcast: p => game.socket.emit(`module.${MOD}`, p),
    settings: { enabled: () => game.settings.get(MOD, "spellFx"), volume: () => game.settings.get(MOD, "spellFxVolume") },
  });
  game.socket.on(`module.${MOD}`, p => { if (p?.t === "wfx") api.play(p); else if (p?.t === "sfx") spells.play(p); });
  Hooks.on("dnd5e.postUseActivity", (activity, config, results) => {
    try { spells.onUse(activity, config, results); } catch (e) { console.error(`${MOD} | эффекты заклинаний`, e); }
  });
  Hooks.on("dnd5e.rollAttackV2", (rolls, data) => {
    try { spells.onAttack(rolls, data); } catch (e) { console.error(`${MOD} | эффекты заклинаний`, e); }
  });
  Hooks.on("dnd5e.rollAttackV2", (rolls, data) => {
    try { api.onAttack(rolls, data); } catch (e) { console.error(`${MOD} | эффекты стрельбы`, e); }
  });
  Hooks.on("canvasTearDown", () => { api.teardown(); spells.teardown(); });
  const mod = game.modules.get(MOD);
  mod.api = { ...(mod.api ?? {}), weaponFx: api, spellFx: spells };
  globalThis.NepreklonnyFX = Object.assign(api, { spell: spells.cast, spells });
});
