// Тюремный блок: личные записки, слухи друг о друге и два толчка, если герои никак не соберутся.
// Записки и слухи приходят каждому игроку втайне (карточка на экране и копия шёпотом в чат).
// «Шёпот» — каждый слышит одно и то же и думает, что только он. «Голос с поста» — Крюк зовёт из западного проёма.
import * as S from "./state.mjs";
import { h } from "./ui.mjs";
import { g } from "./texts.mjs";

const TITLES = ["Сержант", "Комиссар", "Исповедница", "Исповедник", "Псайкер", "Техножрица", "Техножрец"];
const fullName = hero => String(hero?.actorName || hero?.name || "?").split(/\s+/).filter((w, i) => !(i === 0 && TITLES.includes(w))).join(" ");
/** Подставить два рода: {ж|м} — тот, кто читает; [ж|м] — тот, о ком речь; %N — имя того, о ком речь. */
const g2 = (str, me, them) => g(str, me?.gender).replace(/\[([^[\]|]*)\|([^[\]]*)\]/g, (_, f, m) => (them?.gender === "f" ? f : m)).replace(/%N/g, fullName(them));

export const NOTES = {
  komissar: "По уставу, если капитан и старшие офицеры погибли, командование принимает старший из живых. Ты больше не офицер. Но устав ты помнишь.",
  shturmovik: "Последнее, что ты помнишь перед стазисом: твой взвод уводят по другому коридору. Куда — ты не знаешь.",
  ispovednik: "Перед стазисом старый надзиратель исповедался тебе: на корме, в старом ангаре, стоит шлюпка, которую он годами чинил для себя. В ней шесть мест.",
  psyker: "Во сне кто-то звал тебя по имени. Голос был ласковый и очень терпеливый.",
  tehnozhrec: "Корабль стонет. Ты слышишь это не ушами: его машинный дух напуган.",
};

// откуда герой знает о другом (по тому, кто знает)
const SOURCE = {
  komissar: "Начальник конвоя знал тебя по прежней службе. На погрузке он сунул тебе манифест: «Полюбуйтесь, комиссар, с кем поедете».",
  shturmovik: "На этапе конвоиры болтали при смертниках, как при мебели.",
  tehnozhrec: "Перед погрузкой ты {успела|успел} заглянуть в ноосферу корабля и прочесть манифест груза.",
  psyker: "В стазисе ты не {спала|спал} по-настоящему. Сквозь лёд проходили чужие сны, и один был громче остальных.",
  ispovednik: "Старый надзиратель на исповеди рассказывал не только о шлюпке. Он говорил и о других из особого груза.",
};
// что о нём говорят (по тому, о ком)
const RUMOR = {
  komissar: "В одной из камер — %N, [бывшая|бывший] комиссар. Говорят, [застрелила|застрелил] своего полковника прямо у штабной карты и на трибунале не [просила|просил] пощады.",
  shturmovik: "В одной из камер — %N, гвардейский сержант. Говорят, [увела|увёл] свой взвод с позиции. Взвод жив, а [её|его] везут в сервиторы.",
  tehnozhrec: "В одной из камер — %N, [техножрица|техножрец]. Говорят, [писала|писал] машинным духам код без благословения. Механикус хотят [её|его] назад — уже сервитором.",
  psyker: "В одной из камер — %N, псайкер, на Чёрный корабль. Говорят, в [её|его] квартале нашли мёртвым проповедника. Ниша у [неё|него] экранирована втрое против остальных.",
  ispovednik: "В одной из камер — %N, [исповедница|исповедник] из нижнего улья. Говорят, на [неё|него] донёс собственный ученик, а [она|он] до сих пор за него молится.",
};
// по кругу: комиссар знает о сержанте, сержант — о техножреце, техножрец — о псайкере, псайкер — об исповеднике, исповедник — о комиссаре
const RING = ["komissar", "shturmovik", "tehnozhrec", "psyker", "ispovednik"];

const COUNT = ["", "один", "двое", "трое", "четверо", "пятеро", "шестеро", "семеро"];
const whisperLines = n => n > 1 ? [`…${COUNT[n] || "все"}…`, `…все ${COUNT[n] || ""} проснулись…`.replace("  ", " "), "…идите вместе. Я жду всех."]
  : ["…один…", "…ты не спишь…", "…иди. Я жду."];
const VOICE = ["Эй, особый груз! Живые есть?", "Ваши шмотки тут, на посту. Кто дойдёт первым — тот и выбирает!"];

/** Герои в игре: [{ uid, aid, hero, user }] в порядке круга. */
function cast() {
  const st = S.get();
  return Object.entries(st.roster || {}).map(([uid, aid]) => ({ uid, aid, hero: st.heroes?.[aid], user: game.users.get(uid) }))
    .filter(x => x.hero && game.actors.get(x.aid))
    .sort((a, b) => RING.indexOf(a.hero.cls) - RING.indexOf(b.hero.cls));
}
const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);
const sent = new Set();

function chatCopy(uid, title, text) {
  return ChatMessage.create({ content: `<div class="nk-note-chat"><b>${title}</b><p>${text}</p></div>`, whisper: [uid, ...gmIds()], speaker: { alias: "Непреклонный" } });
}

/** Раздать личные записки: каждому — своя, втайне. */
export async function sendNotes() {
  if (!game.user.isGM) return;
  const list = cast(); if (!list.length) return ui.notifications.warn("Некому: назначьте игрокам героев во вкладке «Герои и вера».");
  const out = [];
  for (const x of list) {
    const text = g(NOTES[x.hero.cls] || "", x.hero.gender); if (!text) continue;
    if (x.user?.active) game.socket.emit(S.SOCKET, { t: "nk.note", to: x.uid, kind: "note", title: "ЛИЧНОЕ · ТОЛЬКО ТЕБЕ", text });
    await chatCopy(x.uid, "Личная записка", text);
    out.push(x.hero.name);
  }
  sent.add("notes");
  ui.notifications.info(`Записки ушли: ${out.join(", ")}. Копия у каждого в чате шёпотом.`);
}

/** Пары «кто о ком слышал»: по кругу среди тех, кто в игре. */
export function rumorPairs() {
  const list = cast();
  if (list.length < 2) return [];
  return list.map((x, i) => ({ who: x, about: list[(i + 1) % list.length] }));
}

/** Слухи: каждый слышал что-то об одном из остальных, и о каждом кто-то слышал. */
export async function sendRumors() {
  if (!game.user.isGM) return;
  const pairs = rumorPairs(); if (!pairs.length) return ui.notifications.warn("Слухам нужно хотя бы двое героев в игре.");
  for (const { who, about } of pairs) {
    const text = `${g2(SOURCE[who.hero.cls] || "Ты кое-что {слышала|слышал} об остальных.", who.hero, about.hero)} ${g2(RUMOR[about.hero.cls] || "В одной из камер — %N.", who.hero, about.hero)}`;
    if (who.user?.active) game.socket.emit(S.SOCKET, { t: "nk.note", to: who.uid, kind: "rumor", title: `ТЫ ${who.hero.gender === "f" ? "СЛЫШАЛА" : "СЛЫШАЛ"} ${about.hero.gender === "f" ? "О НЕЙ" : "О НЁМ"}`, text });
    await chatCopy(who.uid, "Слух", text);
  }
  sent.add("rumors");
  ui.notifications.info(`Слухи ушли по кругу: ${pairs.map(p => `${p.who.hero.name} → ${p.about.hero.name}`).join(", ")}.`);
}

/** Шёпот: каждый герой слышит одно и то же и думает, что только он. */
export function whisper() {
  if (!game.user.isGM) return;
  const list = cast(); if (!list.length) return ui.notifications.warn("Некому: назначьте игрокам героев.");
  const lines = whisperLines(list.length);
  for (const x of list) if (x.user?.active) game.socket.emit(S.SOCKET, { t: "nk.say", to: x.uid, kind: "whisper", lines });
  show("whisper", lines, true);
  sent.add("whisper");
}

/** Крюк зовёт из западного проёма: слышат все в сети. */
export function voice() {
  if (!game.user.isGM) return;
  game.socket.emit(S.SOCKET, { t: "nk.say", to: null, kind: "voice", lines: VOICE });
  show("voice", VOICE, true);
  sent.add("voice");
}

// ---------------------------------------------------------------- у игрока
export function onSocket(msg, senderId) {
  if (!msg || (msg.t !== "nk.note" && msg.t !== "nk.say")) return;
  const from = game.users.get(senderId || msg.userId);
  if (from && !from.isGM) return;
  if (msg.to && msg.to !== game.user.id) return;
  if (msg.t === "nk.note") note(msg.title, msg.text, msg.kind);
  else show(msg.kind, msg.lines);
}

let AC = null;
function ctx() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); } catch { AC = null; } return AC; }
function vol() { let v = 0.6; try { const iv = Number(game.settings.get("core", "globalInterfaceVolume")); if (Number.isFinite(iv)) v *= iv; } catch { /* нет */ } return v; }
function sound(kind) {
  const c = ctx(); if (!c) return;
  const t0 = c.currentTime + 0.02, out = c.createGain(); out.gain.value = vol(); out.connect(c.destination);
  const noise = (d, f, q, a, at = 0, lfo = 0) => {
    const b = c.createBuffer(1, Math.floor(c.sampleRate * d), c.sampleRate), x = b.getChannelData(0);
    for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = b; const fl = c.createBiquadFilter(); fl.type = "bandpass"; fl.frequency.value = f; fl.Q.value = q;
    const gn = c.createGain(); gn.gain.setValueAtTime(0.0001, t0 + at); gn.gain.exponentialRampToValueAtTime(a, t0 + at + d * 0.3); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + at + d);
    if (lfo) { const o = c.createOscillator(), og = c.createGain(); o.frequency.value = lfo; og.gain.value = a * 0.8; o.connect(og); og.connect(gn.gain); o.start(t0 + at); o.stop(t0 + at + d); }
    s.connect(fl); fl.connect(gn); gn.connect(out); s.start(t0 + at);
  };
  const tone = (f, a, d, at = 0) => {
    const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f;
    const gn = c.createGain(); gn.gain.setValueAtTime(0.0001, t0 + at); gn.gain.exponentialRampToValueAtTime(a, t0 + at + 0.005); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + at + d);
    o.connect(gn); gn.connect(out); o.start(t0 + at); o.stop(t0 + at + d + 0.05);
  };
  if (kind === "whisper") { [0, 1.6, 3.4].forEach((at, i) => { noise(1.5, 3400 - i * 300, 1.6, 0.22, at, 7 + i * 2); noise(1.3, 1200, 3, 0.08, at + 0.1, 5); }); }
  else if (kind === "voice") { [0, 0.9, 1.7].forEach(at => { [523, 1187, 1913, 2731].forEach((f, j) => tone(f * (0.97 + Math.random() * 0.06), 0.12 / (j + 1), 1.4, at)); noise(0.25, 2500, 0.7, 0.3, at); }); }
  else if (kind === "note") { tone(880, 0.06, 0.25); tone(1320, 0.04, 0.3, 0.08); }
}

/** Карточка записки или слуха. Закрывается кликом. */
function note(title, text, kind = "note") {
  document.getElementById("nk-note")?.remove();
  const box = h("div", { id: "nk-note", class: `nk-ui k-${kind}` },
    h("div.nk-note-card", {}, h("div.nk-note-t", {}, title), h("div.nk-note-x", {}, text), h("div.nk-note-c", {}, "нажмите, чтобы закрыть · копия в чате")));
  box.addEventListener("click", () => { box.classList.remove("on"); setTimeout(() => box.remove(), 500); });
  document.body.append(box);
  requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add("on")));
  sound("note");
}

/** Шёпот или голос: строки по одной поверх карты. preview — у мастера, бледнее. */
function show(kind, lines, preview = false) {
  document.getElementById("nk-say")?.remove();
  const box = h("div", { id: "nk-say", class: `nk-ui k-${kind}${preview ? " preview" : ""}` });
  const step = kind === "whisper" ? 1800 : 900, hold = kind === "whisper" ? 3800 : 3400;
  document.body.append(box);
  lines.forEach((t, i) => setTimeout(() => {
    if (!box.isConnected) return;
    const ln = h("div.nk-say-l", {}, kind === "whisper" ? [...t].map((ch, j) => h("span", { style: `animation-delay:${j * 45}ms` }, ch === " " ? " " : ch)) : t);
    box.append(ln);
    requestAnimationFrame(() => ln.classList.add("on"));
  }, i * step));
  if (kind === "voice") box.append(h("div.nk-say-from", {}, preview ? "голос из западного проёма · слышат все" : "из западного проёма"));
  if (preview) box.append(h("div.nk-say-gm", {}, kind === "whisper" ? "мастеру: так это видит каждый герой" : "мастеру: так это видят все"));
  sound(kind);
  setTimeout(() => { box.classList.add("out"); setTimeout(() => box.remove(), 1600); }, (lines.length - 1) * step + hold);
}

// ---------------------------------------------------------------- кнопки для пульта
export function nudgeTools(rerender) {
  const list = cast(), pairs = rumorPairs();
  const mark = k => (sent.has(k) ? " ✓" : "");
  const btn = (k, label, title, fn) => h("button.nk-btn.small", { "data-nudge": k, title, onclick: async e => { const b = e.currentTarget; b.disabled = true; try { await fn(); } finally { rerender(); } } }, label + mark(k));
  return h("div.nk-g-tools", {},
    h("div.nk-g-th", {}, "ЗНАКОМСТВО · ЕСЛИ НЕ СОБИРАЮТСЯ"),
    list.length ? null : h("div.nk-g-hint", {}, "Сначала назначьте героев во вкладке «Герои и вера»."),
    h("div.nk-g-row", {},
      h("div.nk-g-lab", {}, "ВТАЙНЕ"),
      btn("notes", "ЛИЧНЫЕ ЗАПИСКИ", "Каждому — его записка (тексты ниже), карточкой на экране и шёпотом в чат", sendNotes),
      btn("rumors", "СЛУХИ ДРУГ О ДРУГЕ", "Каждый слышал об одном из остальных — по кругу", sendRumors),
      pairs.length ? h("span.nk-g-hint", {}, pairs.map(p => `${p.who.hero.name} → ${p.about.hero.name}`).join(" · ")) : null),
    h("div.nk-g-row", {},
      h("div.nk-g-lab", {}, "ТОЛЧОК"),
      btn("whisper", `ШЁПОТ «${(COUNT[list.length] || "ВСЕ").toUpperCase()}»`, "Каждый герой слышит один и тот же шёпот и думает, что только он", whisper),
      btn("voice", "КРЮК ЗОВЁТ С ПОСТА", "Хриплый голос из западного проёма — слышат все", voice)));
}
