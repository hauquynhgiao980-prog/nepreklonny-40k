// «Дело»: расстановка героев, анкета на старте, инфопланшет со сферой души и летописью, пульт мастера.
import * as S from "./dela/state.mjs";
import { Anketa, Pad, Panel } from "./dela/ui.mjs";

const anketa = new Anketa();
const panel = new Panel();
let myPad = null;

function sync(st = S.get()) {
  if (game.user.isGM) { panel.render(st); return; }
  const aid = st.roster?.[game.user.id];
  const hero = aid ? st.heroes?.[aid] : null;
  if (hero && st.anketaOpen?.[game.user.id] && !hero.anketa?.done && !anketa.isOpen) anketa.open({ ...hero });
  if (anketa.isOpen && (!hero || !st.anketaOpen?.[game.user.id]) && !(hero?.anketa?.done)) anketa.close();
  const showPad = hero?.anketa?.done && !anketa.isOpen;
  if (showPad) {
    if (myPad && myPad.actorId !== aid) { myPad.destroy(); myPad = null; }
    if (!myPad) myPad = new Pad(aid);
    myPad.render(st);
  } else if (myPad) { myPad.destroy(); myPad = null; }
}

Hooks.once("init", () => {
  S.registerSettings();
  game.keybindings.register(S.MOD, "delaPanel", {
    name: "Пульт мастера", hint: "Открыть или закрыть пульт мастера «Непреклонного».",
    editable: [{ key: "F8" }], restricted: true,
    onDown: () => { if (game.user.isGM) panel.toggle(); return true; },
  });
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM) return;
  const tool = { name: "nkDela", title: "Пульт мастера (F8)", icon: "fa-solid fa-scroll", button: true, visible: true, order: 99,
    onChange: () => panel.toggle(), onClick: () => panel.toggle() };
  if (Array.isArray(controls)) controls.find(c => c.name === "token")?.tools.push(tool);
  else { const tc = controls.tokens || controls.token; if (tc?.tools) tc.tools.nkDela = tool; }
});

Hooks.once("ready", () => {
  game.socket.on(S.SOCKET, (msg, senderId) => S.handleSocket(msg, senderId));
  S.onChange(st => sync(st));
  Hooks.on("nkDelaAnketaClosed", () => sync());
  Hooks.on("userConnected", () => { if (game.user.isGM) panel.render(); });
  Hooks.on("createActor", () => { if (game.user.isGM) panel.render(); });
  sync();
  const mod = game.modules.get(S.MOD);
  if (mod) mod.api = Object.assign(mod.api || {}, { dela: { panel, state: S.get, update: S.update, openAnketa: S.openAnketa, assign: S.assign } });
});
