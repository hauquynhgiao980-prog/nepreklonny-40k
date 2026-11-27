// «Дело»: расстановка героев, анкета на старте, инфопланшет со сферой души и летописью, пульт мастера.
import * as S from "./dela/state.mjs";
import { resetGame, resetDialog } from "./dela/reset.mjs";
import { Anketa, Pad, Panel } from "./dela/ui.mjs";
import { TrialUI } from "./dela/trial.mjs";
import * as Servitor from "./dela/servitor.mjs";
import * as Hack from "./dela/hack.mjs";
import * as Nudge from "./dela/nudge.mjs";

const anketa = new Anketa();
const trial = new TrialUI();
const panel = new Panel();
let myPad = null;

function sync(st = S.get()) {
  if (game.user.isGM) { panel.render(st); Hack.hackUI.sync(st, null); return; }
  const aid = st.roster?.[game.user.id];
  const hero = aid ? st.heroes?.[aid] : null;
  if (hero && st.anketaOpen?.[game.user.id] && !hero.anketa?.done && !anketa.isOpen) anketa.open({ ...hero });
  if (anketa.isOpen && (!hero || !st.anketaOpen?.[game.user.id]) && !(hero?.anketa?.done)) anketa.close();
  const showPad = hero?.anketa?.done && !anketa.isOpen && !game.settings.get(S.MOD, "delaPad")?.hidden;
  if (showPad) {
    if (myPad && myPad.actorId !== aid) { myPad.destroy(); myPad = null; }
    if (!myPad) myPad = new Pad(aid);
    myPad.render(st);
  } else if (myPad) { myPad.destroy(); myPad = null; }
  if (!anketa.isOpen) { trial.sync(st, hero ? aid : null); Hack.hackUI.sync(st, hero ? aid : null); }
}

/** Игрок прячет и вызывает свой инфопланшет. */
async function togglePad() {
  if (game.user.isGM) return panel.toggle();
  const st = S.get(), aid = st.roster?.[game.user.id], hero = aid ? st.heroes?.[aid] : null;
  if (!hero) return ui.notifications.info("Мастер ещё не выдал вам героя.");
  if (!hero.anketa?.done) return ui.notifications.info("Дело ещё не заведено: сначала анкета.");
  const pref = game.settings.get(S.MOD, "delaPad") || {};
  await game.settings.set(S.MOD, "delaPad", { ...pref, hidden: !!myPad });   // планшет на экране — спрятать, нет — показать
  sync();
}

Hooks.once("init", () => {
  S.registerSettings();
  game.keybindings.register(S.MOD, "delaPad", {
    name: "Инфопланшет", hint: "Показать или спрятать свой инфопланшет «Непреклонного».",
    editable: [{ key: "F9" }],
    onDown: () => { togglePad(); return true; },
  });
  game.keybindings.register(S.MOD, "delaPanel", {
    name: "Пульт мастера", hint: "Открыть или закрыть пульт мастера «Непреклонного».",
    editable: [{ key: "F8" }], restricted: true,
    onDown: () => { if (game.user.isGM) panel.toggle(); return true; },
  });
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user) return;
  const tool = game.user.isGM
    ? { name: "nkDela", title: "Пульт мастера (F8)", icon: "fa-solid fa-scroll", button: true, visible: true, order: 99,
        onChange: () => panel.toggle(), onClick: () => panel.toggle() }
    : { name: "nkDela", title: "Инфопланшет (F9)", icon: "fa-solid fa-tablet-screen-button", button: true, visible: true, order: 99,
        onChange: () => togglePad(), onClick: () => togglePad() };
  if (Array.isArray(controls)) controls.find(c => c.name === "token")?.tools.push(tool);
  else { const tc = controls.tokens || controls.token; if (tc?.tools) tc.tools.nkDela = tool; }
});

Hooks.once("ready", () => {
  game.socket.on(S.SOCKET, (msg, senderId) => S.handleSocket(msg, senderId));
  game.socket.on(S.SOCKET, (msg, senderId) => Servitor.onSocket(msg, senderId));
  game.socket.on(S.SOCKET, (msg, senderId) => Hack.onSocket(msg, senderId));
  game.socket.on(S.SOCKET, (msg, senderId) => Nudge.onSocket(msg, senderId));
  S.onChange(st => sync(st));
  Hooks.on("nkDelaAnketaClosed", () => sync());
  Hooks.on("userConnected", () => { if (game.user.isGM) panel.render(); });
  Hooks.on("createActor", () => { if (game.user.isGM) panel.render(); });
  // режиссёрский пульт следит за сценами, тайлами и звуками
  let rt = null;
  const reScenes = () => { if (!game.user.isGM || !panel.isOpen || panel.tab !== "scenes") return; clearTimeout(rt); rt = setTimeout(() => panel.render(), 120); };
  // вкладка «Сценарий» показывает испуг героев
  let gt = null;
  const reGuide = () => { if (!game.user.isGM || !panel.isOpen || panel.tab !== "guide") return; clearTimeout(gt); gt = setTimeout(() => panel.render(), 150); };
  for (const hk of ["createActiveEffect", "deleteActiveEffect", "updateActor"]) Hooks.on(hk, reGuide);
  for (const hk of ["createScene", "updateScene", "deleteScene", "createTile", "updateTile", "deleteTile", "createAmbientSound", "updateAmbientSound", "deleteAmbientSound", "createToken", "updateToken", "deleteToken", "canvasReady"]) Hooks.on(hk, reScenes);
  sync();
  const mod = game.modules.get(S.MOD);
  if (mod) mod.api = Object.assign(mod.api || {}, { dela: { panel, state: S.get, update: S.update, reset: resetGame, resetDialog, openAnketa: S.openAnketa, assign: S.assign, startTrial: S.startTrial, trial, togglePad,
    servitor: { look: Servitor.look, calm: Servitor.calm, scare: Servitor.scare },
    hack: { open: Hack.openGame, start: () => Hack.forceStart(), abort: () => Hack.abortGame(), roll: Hack.rollHacker, show: () => Hack.hackUI.showGM(), trial: n => Hack.openTrial(n) },
    nudge: { notes: Nudge.sendNotes, rumors: Nudge.sendRumors, whisper: Nudge.whisper, voice: Nudge.voice } } });
});
