/* Непреклонный: урон по попаданию — мастеру в чат.
   Атака попала, игрок бросил урон — мастер получает скрытую карточку с кнопками «Применить», «½», «×2», «Нет».
   Урон вычитает dnd5e (actor.applyDamage) с учётом сопротивлений, иммунитетов и временных хитов. */
import { createDamageProposals, injectDamageCss } from "./damage-core.mjs";

const MOD = "nepreklonny-40k";

Hooks.once("init", () => {
  game.settings.register(MOD, "damageProposals", {
    name: "Урон мастеру в чат", hint: "После попадания и броска урона мастер получает скрытую карточку: кому сколько и кнопки применить.",
    scope: "world", config: true, type: Boolean, default: true,
  });
  game.settings.register(MOD, "damageAutoApply", {
    name: "Вычитать урон сразу", hint: "Не ждать кнопки мастера: урон вычитается сразу, в карточке остаётся «Отменить».",
    scope: "world", config: true, type: Boolean, default: false,
  });
});

Hooks.once("ready", () => {
  injectDamageCss();
  const api = createDamageProposals({
    toGM: p => game.socket.emit(`module.${MOD}`, p),
    autoApply: () => game.settings.get(MOD, "damageAutoApply"),
  });
  game.socket.on(`module.${MOD}`, p => { if (p?.t === "dmg") api.handle(p); });
  Hooks.on("dnd5e.rollAttackV2", (rolls, data) => { try { api.onAttack(rolls, data); } catch (e) { console.error(`${MOD} | урон`, e); } });
  Hooks.on("dnd5e.rollDamageV2", (rolls, data) => {
    if (!game.settings.get(MOD, "damageProposals")) return;
    try { api.onDamage(rolls, data); } catch (e) { console.error(`${MOD} | урон`, e); }
  });
  Hooks.on("renderChatMessageHTML", (message, html) => api.onRender(message, html));
  const mod = game.modules.get(MOD);
  mod.api = { ...(mod.api ?? {}), damage: api };
});
