// Сервиторы тюремного блока: сервитор рывком приближается, красные слова на весь экран,
// потом спасбросок Мудрости; при провале герой испуган.
// Мастер решает, на кого смотрит сервитор; экран и бросок — у игрока этого героя.
import * as S from "./state.mjs";
import { h } from "./ui.mjs";
import { g, points } from "./texts.mjs";
import { saveMod } from "./trial.mjs";

export const SAVE_DC = 12;
const IMG = `modules/${S.MOD}/icons/gen/act1/servitor.webp`;
// камера летит в лицо: точка 48.8% × 30.9% картинки, задана в styles/dela.css (.nk-sc-fig)
const EYE = [51.8, 30.6];           // красный окуляр
export const WORDS = { see: "Я ТЕБЯ ВИЖУ", wake: "ПРОСНИСЬ" };

/** Кто на суде выбрал Хаос (или к этому часу ушёл в Ересь), тому сервитор говорит «Проснись». */
export function variantOf(hero) {
  if (!hero) return "see";
  const p = points(hero, 3, true);
  return p.h > p.l ? "wake" : "see";
}

const userOf = (aid, st = S.get()) => Object.entries(st.roster || {}).find(([, a]) => a === aid)?.[0] || null;
const scared = actor => !!actor?.statuses?.has?.("frightened");

// ---------------------------------------------------------------- у мастера
/** Сервитор смотрит на героев (по id актёров; пусто — на всех назначенных). */
export async function look(aids) {
  if (!game.user.isGM) return;
  const st = S.get();
  const list = (aids?.length ? aids : Object.values(st.roster || {})).filter(a => game.actors.get(a));
  if (!list.length) return ui.notifications.warn("Некому смотреть: назначьте игрокам героев во вкладке «Герои и вера» или выделите токены героев.");
  const id = Date.now(), sent = [];
  for (const aid of list) {
    if (id - (lastLook.get(aid) || 0) < 6000) continue;        // повторный клик, пока идёт экран
    lastLook.set(aid, id);
    const v = variantOf(st.heroes?.[aid]), name = st.heroes?.[aid]?.name || game.actors.get(aid)?.name;
    const uid = userOf(aid, st), user = uid && game.users.get(uid);
    if (user?.active) { game.socket.emit(S.SOCKET, { t: "nk.scare", to: uid, aid, v, id }); sent.push(`${name} — «${WORDS[v]}»`); }
    else gmSave(aid);                     // игрока нет в сети — бросает мастер
  }
  if (sent.length) ui.notifications.info(`Сервитор смотрит: ${sent.join(", ")}. Спасбросок игрок бросит сам, итог придёт в чат.`);
}
const lastLook = new Map();

/** Снять испуг со всех героев (или с указанных). */
export async function calm(aids) {
  if (!game.user.isGM) return;
  const st = S.get();
  const list = aids?.length ? aids : [...new Set([...Object.values(st.roster || {}), ...game.actors.filter(a => scared(a) && a.type === "character").map(a => a.id)])];
  let n = 0;
  for (const aid of list) {
    const a = game.actors.get(aid);
    if (scared(a)) { await a.toggleStatusEffect("frightened", { active: false }); n++; }
  }
  ui.notifications.info(n ? `Испуг снят: ${n}.` : "Испуганных нет.");
}

async function gmSave(aid) {
  const a = game.actors.get(aid); if (!a) return;
  const r = await S.rollSave(aid, "wis", "");
  if (!r) return;
  const ok = r.total >= SAVE_DC;
  if (!ok && !scared(a)) await a.toggleStatusEffect?.("frightened", { active: true });
  ui.notifications.info(`${a.name}: игрока нет в сети, спасбросок Мудрости за него — ${r.total}, ${ok ? "выдержал" : "испуган"}.`);
}

// ---------------------------------------------------------------- у игрока
export function onSocket(msg, senderId) {
  if (msg?.t !== "nk.scare" || msg.to !== game.user.id) return;
  const from = game.users.get(senderId || msg.userId);
  if (from && !from.isGM) return;
  const aid = msg.aid, v = WORDS[msg.v] ? msg.v : "see";
  scare(v).then(() => askSave(aid));
}

let busy = null;
/** Сам экран. preview — мастер смотрит на себе, без броска. */
export function scare(v = "see") {
  if (busy) return busy;
  busy = play(v).finally(() => { busy = null; });
  return busy;
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function play(v) {
  document.getElementById("nk-scare")?.remove();
  const img = h("img", { src: IMG, alt: "", draggable: "false" });
  const eye = h("i.nk-sc-eye", { style: `left:${EYE[0]}%;top:${EYE[1]}%` });
  const fig = h("div.nk-sc-fig", {}, img, eye);
  const stage = h("div.nk-sc-stage", {}, fig);
  const word = WORDS[v];
  const echo = v === "wake" ? [1, 2, 3].map(i => h("div.nk-sc-echo", { style: `--i:${i}` }, word)) : [];
  const text = h("div.nk-sc-word", { "data-t": word }, word);
  const noise = h("canvas.nk-sc-noise", { width: 192, height: 108 });
  const flash = h("div.nk-sc-flash");
  const root = h("div", { id: "nk-scare", class: `v-${v}` }, stage, ...echo, text, flash, noise, h("div.nk-sc-scan"));
  document.body.append(root);
  await img.decode().catch(() => {});

  // помехи: грубый шум, мерцает каждый кадр
  const c = noise.getContext("2d"), id = c.createImageData(192, 108); let raf, run = true;
  const tick = () => {
    if (!run) return;
    for (let i = 0; i < id.data.length; i += 4) { const x = Math.random() * 255; id.data[i] = x; id.data[i + 1] = x * 0.55; id.data[i + 2] = x * 0.5; id.data[i + 3] = 255; }
    c.putImageData(id, 0, 0); raf = requestAnimationFrame(tick);
  };
  tick();

  const A = (el, kf, o) => el.animate(kf, Object.assign({ fill: "forwards" }, o));
  sound(v, "far");
  root.classList.add("in");
  // далеко в темноте: стоит, голова чуть дёргается
  A(fig, [{ transform: "scale(.3)", filter: "brightness(.15) contrast(1.2) blur(1.5px)" },
          { transform: "scale(.31)", filter: "brightness(.5) contrast(1.2) blur(.3px)", offset: .7 },
          { transform: "scale(.335) rotate(-1.2deg)", filter: "brightness(.55) contrast(1.25) blur(0px)" }], { duration: 950, easing: "ease-in" });
  A(eye, [{ opacity: 0 }, { opacity: .2, offset: .5 }, { opacity: 1 }], { duration: 950 });
  await wait(950);

  // рывок
  sound(v, "hit");
  A(fig, [{ transform: "scale(.335) rotate(-1.2deg)", filter: "brightness(.55) contrast(1.25) blur(0px)" },
          { transform: "scale(5.2) rotate(0deg)", filter: "brightness(1) contrast(1.3) blur(5px)" }], { duration: 170, easing: "cubic-bezier(.8,0,1,.6)" });
  await wait(170);

  root.classList.add("hit");
  A(flash, [{ opacity: v === "wake" ? .55 : .9 }, { opacity: 0 }], { duration: 260, easing: "ease-out" });
  A(fig, [{ transform: "scale(5.2)", filter: "brightness(1.05) contrast(1.3) blur(3px)" },
          { transform: "scale(5.45)", filter: "brightness(.95) contrast(1.3) blur(.6px)", offset: .15 },
          { transform: "scale(5.8)", filter: "brightness(.85) contrast(1.35) blur(.8px)" }], { duration: 1500, easing: "linear" });
  const shake = [];
  for (let i = 0; i <= 24; i++) { const k = 1 - i / 24, a = (v === "wake" ? 10 : 22) * k * k; shake.push({ transform: `translate(${(Math.random() - .5) * a}px,${(Math.random() - .5) * a}px)` }); }
  A(stage, shake, { duration: 1500, easing: "linear" });
  A(text, v === "wake"
    ? [{ opacity: 0, transform: "translate(-50%,-50%) scale(1.25)", filter: "blur(14px)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", filter: "blur(0px)" }]
    : [{ opacity: 0, transform: "translate(-50%,-50%) scale(1.7)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)" }],
    { duration: v === "wake" ? 520 : 110, easing: "ease-out" });
  echo.forEach((e, i) => A(e, [{ opacity: 0, transform: "translate(-50%,-50%) scale(1)" }, { opacity: .32 - i * .08, offset: .25 }, { opacity: 0, transform: `translate(-50%,-50%) scale(${1.25 + i * .22})` }], { duration: 1500, delay: 120 + i * 140, easing: "ease-out" }));
  await wait(1480);

  // обрыв: картинка гаснет, слова держатся миг
  fig.style.visibility = "hidden";
  root.classList.add("cut");
  sound(v, "cut");
  await wait(320);
  A(root, [{ opacity: 1 }, { opacity: 0 }], { duration: 480, easing: "ease-in" });
  await wait(500);
  run = false; cancelAnimationFrame(raf);
  root.remove();
}

/** Спасбросок после экрана: кнопка у игрока, итог в чат мастеру. */
function askSave(aid) {
  const actor = game.actors.get(aid);
  if (!actor) return;
  const hero = S.get().heroes?.[aid], gd = hero?.gender;
  const mod = saveMod(actor, "wis") ?? 0;
  document.getElementById("nk-scare-roll")?.remove();
  const btn = h("button.nk-btn", {}, `МУДРОСТЬ ${mod >= 0 ? "+" : ""}${mod}`);
  const box = h("div", { id: "nk-scare-roll", class: "nk-ui" }, h("div.nk-sr-h", {}, "СПАСБРОСОК"), btn);
  document.body.append(box);
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    let r;
    try { r = await actor.rollSavingThrow({ ability: "wis" }, { configure: false }); } catch (e) { console.error(e); btn.disabled = false; return; }
    r = Array.isArray(r) ? r[0] : r;
    if (!r) { btn.disabled = false; return; }
    const ok = r.total >= SAVE_DC;
    if (!ok && !scared(actor)) await actor.toggleStatusEffect?.("frightened", { active: true });
    box.replaceChildren(
      h("div", { class: `nk-sr-res ${ok ? "ok" : "bad"}` }, ok ? g("{ВЫДЕРЖАЛА|ВЫДЕРЖАЛ}", gd) : "СТРАХ"),
      h("div.nk-sr-sub", {}, ok ? "Он отвернулся и пошёл дальше. Будто ничего не было." : "Пока видишь сервиторов — помеха на проверки и атаки. Ближе к ним не подойти."));
    try {
      await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), speaker: { alias: "Сервитор" },
        content: `<b>${actor.name}</b>: спасбросок Мудрости ${r.total} — ${ok ? "выдержал" : "<b>испуган</b>"}.` });
    } catch (e) { console.warn(e); }
    setTimeout(() => box.classList.add("out"), 4200);
    setTimeout(() => box.remove(), 5000);
  });
}

// ---------------------------------------------------------------- звук (синтез в браузере)
let AC = null;
function ac() {
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); } catch { AC = null; }
  return AC;
}
const noiseBuf = (ctx, sec) => {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
};
const distCurve = k => { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } return c; };

function sound(v, part) {
  const ctx = ac(); if (!ctx) return;
  let vol = 0.8;
  try { const iv = Number(game.settings.get("core", "globalInterfaceVolume")); if (Number.isFinite(iv)) vol *= iv; } catch { /* нет такой настройки */ }
  const t0 = ctx.currentTime + 0.01, out = ctx.createGain(); out.gain.value = vol; out.connect(ctx.destination);
  const src = (sec, f, q, type = "bandpass") => {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf(ctx, sec);
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; s.connect(fl); return [s, fl];
  };
  if (part === "far") {
    // треск вокса рывками
    const [s, fl] = src(1, 2600, 0.9), gn = ctx.createGain(); gn.gain.setValueAtTime(0, t0);
    for (let t = 0; t < 0.95; t += 0.035) gn.gain.setValueAtTime(Math.random() < 0.45 ? 0.05 + Math.random() * (v === "wake" ? 0.12 : 0.3) : 0, t0 + t);
    gn.gain.setValueAtTime(0, t0 + 0.95); fl.connect(gn); gn.connect(out); s.start(t0);
    if (v === "wake") {                     // шёпот нарастает
      const [w, wf] = src(1, 1400, 2.5), gw = ctx.createGain(); gw.gain.setValueAtTime(0, t0); gw.gain.linearRampToValueAtTime(0.5, t0 + 0.9);
      const lfo = ctx.createOscillator(), la = ctx.createGain(); lfo.frequency.value = 7; la.gain.value = 0.25; lfo.connect(la); la.connect(gw.gain); lfo.start(t0); lfo.stop(t0 + 1);
      wf.connect(gw); gw.connect(out); w.start(t0);
    } else {                                // сервопривод поворачивает голову
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(95, t0 + 0.35); o.frequency.linearRampToValueAtTime(160, t0 + 0.8);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 700; bp.Q.value = 4;
      const go = ctx.createGain(); go.gain.setValueAtTime(0, t0 + 0.35); go.gain.linearRampToValueAtTime(0.22, t0 + 0.45); go.gain.linearRampToValueAtTime(0, t0 + 0.85);
      o.connect(bp); bp.connect(go); go.connect(out); o.start(t0 + 0.35); o.stop(t0 + 0.9);
    }
  } else if (part === "hit") {
    const sh = ctx.createWaveShaper(); sh.curve = distCurve(v === "wake" ? 8 : 40); const gh = ctx.createGain();
    gh.gain.setValueAtTime(0.0001, t0); gh.gain.exponentialRampToValueAtTime(v === "wake" ? 0.6 : 0.85, t0 + 0.03); gh.gain.exponentialRampToValueAtTime(0.001, t0 + 1.7);
    sh.connect(gh); gh.connect(out);
    // гул: расстроенные пилы
    for (const f of v === "wake" ? [41.2, 41.9, 61.7] : [55, 58.3, 82.4, 116.5]) {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(f * 1.5, t0); o.frequency.exponentialRampToValueAtTime(f, t0 + 0.25);
      o.connect(sh); o.start(t0); o.stop(t0 + 1.8);
    }
    // удар
    const k = ctx.createOscillator(); k.frequency.setValueAtTime(120, t0); k.frequency.exponentialRampToValueAtTime(32, t0 + 0.35);
    const gk = ctx.createGain(); gk.gain.setValueAtTime(1, t0); gk.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5); k.connect(gk); gk.connect(out); k.start(t0); k.stop(t0 + 0.55);
    // шумовой взрыв, фильтр закрывается
    const [n, nf] = src(1.6, 9000, 0.7, "lowpass"); nf.frequency.setValueAtTime(9000, t0); nf.frequency.exponentialRampToValueAtTime(260, t0 + 1.2);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(v === "wake" ? 0.35 : 0.7, t0); gn.gain.exponentialRampToValueAtTime(0.001, t0 + 1.5); nf.connect(gn); gn.connect(out); n.start(t0);
    if (v === "see") {                      // металлический визг
      const o = ctx.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(2300, t0); o.frequency.exponentialRampToValueAtTime(700, t0 + 0.6);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1500; bp.Q.value = 6;
      const go = ctx.createGain(); go.gain.setValueAtTime(0.25, t0); go.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7); o.connect(bp); bp.connect(go); go.connect(out); o.start(t0); o.stop(t0 + 0.75);
    } else {                                // сердце
      for (const b of [0.35, 0.6, 1.25, 1.5]) {
        const o = ctx.createOscillator(); o.frequency.value = 46; const gb = ctx.createGain();
        gb.gain.setValueAtTime(0, t0 + b); gb.gain.linearRampToValueAtTime(b % 1 > 0.5 ? 0.6 : 0.85, t0 + b + 0.02); gb.gain.exponentialRampToValueAtTime(0.001, t0 + b + 0.3);
        o.connect(gb); gb.connect(out); o.start(t0 + b); o.stop(t0 + b + 0.32);
      }
    }
  } else if (part === "cut") {
    const [s, fl] = src(0.12, 3000, 0.6), gn = ctx.createGain(); gn.gain.setValueAtTime(0.35, t0); gn.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
    fl.connect(gn); gn.connect(out); s.start(t0);
  }
}

// ---------------------------------------------------------------- кнопки для пульта
/** Ряд кнопок «Сервиторы» для вкладки «Сценарий». */
export function servitorTools(rerender) {
  const st = S.get();
  const heroes = Object.entries(st.roster || {}).map(([uid, aid]) => ({ uid, aid, hero: st.heroes?.[aid], actor: game.actors.get(aid), user: game.users.get(uid) }))
    .filter(x => x.hero && x.actor);
  const chip = x => {
    const v = variantOf(x.hero);
    return h("button", { class: `nk-chip ${scared(x.actor) ? "scared" : ""}`, "data-look": x.aid,
      title: `${x.actor.name}: ${WORDS[v]}${x.user?.active ? "" : " · игрока нет в сети, бросит мастер"}`, onclick: async () => { await look([x.aid]); setTimeout(rerender, 400); } },
      h("b", {}, x.hero.name || x.actor.name),
      h("span", { class: v === "wake" ? "w" : "" }, v === "wake" ? "ПРОСНИСЬ" : "ВИЖУ"),
      scared(x.actor) ? h("em", {}, "ИСПУГ") : null,
      x.user?.active ? null : h("em.off", {}, "НЕ В СЕТИ"));
  };
  return h("div.nk-g-tools", {},
    h("div.nk-g-th", {}, "СЕРВИТОРЫ · МАКРОСЫ"),
    h("div.nk-g-row", {},
      h("div.nk-g-lab", {}, "СЕРВИТОР СМОТРИТ НА"),
      heroes.length ? heroes.map(chip) : h("span.nk-g-hint", {}, "Сначала назначьте героев во вкладке «Герои и вера».")),
    h("div.nk-g-row", {},
      h("button.nk-btn", { "data-look-all": "1", title: "Все семь голов разом поворачиваются к героям: экран и спасбросок у каждого", onclick: async () => { await look(); setTimeout(rerender, 400); } }, "ВСЕ СЕРВИТОРЫ ОБОРАЧИВАЮТСЯ"),
      h("button.nk-btn", { "data-calm": "1", onclick: async () => { await calm(); setTimeout(rerender, 300); } }, "СНЯТЬ ИСПУГ"),
      h("div", { style: "flex:1" }),
      h("span.nk-g-lab", {}, "ПРОВЕРИТЬ НА СЕБЕ"),
      h("button.nk-btn.small", { "data-preview": "see", onclick: () => scare("see") }, "ВИЖУ"),
      h("button.nk-btn.small", { "data-preview": "wake", onclick: () => scare("wake") }, "ПРОСНИСЬ")),
    h("div.nk-g-small", {}, `После экрана игрок бросает спасбросок Мудрости, Сл ${SAVE_DC}. Провал — испуган. Если игрока нет в сети, бросок делает мастер, без экрана.`));
}
