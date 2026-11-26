// Испытание у игрока: голос → тайный выбор → ответ голоса на весь экран → спасбросок → итог группы.
import * as S from "./state.mjs";
import { h } from "./ui.mjs";
import { TRIAL_META, LINES, reaction, g, OUTCOME_LABEL, OUTCOME_TEXT, ANSWER_NO, ANSWER_SILENT, points, rewardsOf } from "./texts.mjs";

const MODE_LABEL = { adv: "с преимуществом", dis: "с помехой", "": "обычный" };
export const modeOf = (pick, n) => !pick ? "" : pick.c === "w" ? (pick.shot ? "" : "adv") : pick.c === "o" ? "dis" : "";

/** Модификатор спасброска из листа dnd5e. */
export function saveMod(actor, ab) {
  const a = actor?.system?.abilities?.[ab];
  if (!a) return null;
  const v = typeof a.save === "object" ? a.save?.value : a.save;
  return Number.isFinite(v) ? v : (a.mod ?? 0);
}
const sign = v => (v == null ? "" : v >= 0 ? `+${v}` : `${v}`);

// ---------------------------------------------------------------- звук (синтез в браузере)
let AC = null;
function ac() {
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); } catch { AC = null; }
  return AC;
}
function noiseBuf(ctx, sec) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
export function sfx(kind) {
  const ctx = ac(); if (!ctx) return;
  const t0 = ctx.currentTime + 0.02, out = ctx.createGain(); out.gain.value = 0.55; out.connect(ctx.destination);
  const env = (g, pts) => { g.gain.setValueAtTime(0, t0); for (const [dt, v] of pts) g.gain.linearRampToValueAtTime(v, t0 + dt); };
  if (kind === "w") {                       // гул, шёпот, сердце
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320; lp.connect(out);
    const gd = ctx.createGain(); env(gd, [[1.2, 0.5], [4.0, 0.45], [5.0, 0]]); gd.connect(lp);
    for (const f of [55, 55.7, 82.4]) { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(gd); o.start(t0); o.stop(t0 + 5.1); }
    const ns = ctx.createBufferSource(); ns.buffer = noiseBuf(ctx, 5); const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 3;
    const gn = ctx.createGain(); env(gn, [[0.5, 0], [1.6, 0.35], [2.4, 0.08], [3.2, 0.3], [4.8, 0]]); ns.connect(bp); bp.connect(gn); gn.connect(out); ns.start(t0);
    for (const b of [0.7, 0.95, 2.1, 2.35, 3.5, 3.75]) {
      const o = ctx.createOscillator(); o.frequency.value = 48; const gb = ctx.createGain();
      gb.gain.setValueAtTime(0, t0 + b); gb.gain.linearRampToValueAtTime(b % 1 > 0.5 ? 0.6 : 0.9, t0 + b + 0.02); gb.gain.exponentialRampToValueAtTime(0.001, t0 + b + 0.28);
      o.connect(gb); gb.connect(out); o.start(t0 + b); o.stop(t0 + b + 0.3);
    }
  } else if (kind === "o") {                // колокол и удар
    const base = 174.6;
    [[1, 1], [2, 0.55], [2.4, 0.4], [3, 0.3], [4.2, 0.18], [5.4, 0.1]].forEach(([m, a]) => {
      const o = ctx.createOscillator(); o.frequency.value = base * m; const gb = ctx.createGain();
      gb.gain.setValueAtTime(0, t0); gb.gain.linearRampToValueAtTime(0.35 * a, t0 + 0.01); gb.gain.exponentialRampToValueAtTime(0.0005, t0 + 4.5 / (0.6 + m * 0.3));
      o.connect(gb); gb.connect(out); o.start(t0); o.stop(t0 + 5);
    });
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(40, t0 + 0.3);
    const gt = ctx.createGain(); gt.gain.setValueAtTime(0.9, t0); gt.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45); o.connect(gt); gt.connect(out); o.start(t0); o.stop(t0 + 0.5);
  } else if (kind === "n") {                // почти тишина: корабль гудит
    const ns = ctx.createBufferSource(); ns.buffer = noiseBuf(ctx, 4); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 140;
    const gn = ctx.createGain(); env(gn, [[1.5, 0.5], [3.9, 0]]); ns.connect(lp); lp.connect(gn); gn.connect(out); ns.start(t0);
  } else if (kind === "fail") {
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(70, t0); o.frequency.exponentialRampToValueAtTime(28, t0 + 1.6);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 200;
    const gt = ctx.createGain(); gt.gain.setValueAtTime(0.9, t0); gt.gain.exponentialRampToValueAtTime(0.001, t0 + 1.8); o.connect(lp); lp.connect(gt); gt.connect(out); o.start(t0); o.stop(t0 + 1.9);
  }
}

// ---------------------------------------------------------------- красная штриховка, наползающая с краёв
function redHatch(canvas, ms = 3600) {
  const W = canvas.width = window.innerWidth, H = canvas.height = window.innerHeight, c = canvas.getContext("2d");
  const t0 = performance.now(); let raf;
  const step = now => {
    const k = Math.min(1, (now - t0) / ms), depth = Math.min(W, H) * (0.06 + 0.42 * k * k);
    for (let i = 0; i < 70; i++) {
      const side = Math.floor(Math.random() * 4), d = Math.random() ** 1.7 * depth;
      let x, y;
      if (side === 0) { x = Math.random() * W; y = d; } else if (side === 1) { x = W - d; y = Math.random() * H; }
      else if (side === 2) { x = Math.random() * W; y = H - d; } else { x = d; y = Math.random() * H; }
      const L = 10 + Math.random() * 26, a = -0.62 + (Math.random() - 0.5) * 0.25;
      c.strokeStyle = `rgba(${150 + Math.random() * 70},${10 + Math.random() * 20},${10 + Math.random() * 15},${0.18 + Math.random() * 0.4})`;
      c.lineWidth = 0.8 + Math.random() * 1.6;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); c.stroke();
    }
    if (k < 1 && canvas.isConnected) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

// ---------------------------------------------------------------- экран испытания
export class TrialUI {
  constructor() { this.root = null; this.step = null; this.trialId = null; this.seen = new Set(); }
  get isOpen() { return !!this.root?.isConnected; }
  close() { this.stopFx?.(); clearInterval(this.typer); clearTimeout(this.timer); this.root?.remove(); this.root = null; this.step = null; }
  gg(s) { return g(s, this.hero?.gender, this.hero?.name); }

  /** Вызывается на каждое изменение «Дела». */
  sync(st, aid) {
    const T = st.trial, hero = aid ? st.heroes?.[aid] : null;
    this.aid = aid; this.hero = hero; this.st = st;
    if (T && hero && T.heroes?.includes(aid)) {
      this.T = T;
      if (this.trialId !== T.id) {
        this.close(); this.trialId = T.id; this.myRoll = T.rolls?.[aid] || null;
        const pick = T.picks?.[aid];
        this.pick = pick || null;
        this.go(!pick ? "voice" : T.rolls?.[aid] ? "rolled" : T.phase === "roll" ? "roll" : "wait");
        return;
      }
      if (this.step === "wait" && T.phase === "roll") return this.go("roll");
      if (this.step === "rolled" || this.step === "wait") this.render();
      return;
    }
    // испытание закрыто: показать итог тем, кто в нём был
    if (this.trialId && st.lastTrial?.id === this.trialId && !this.seen.has(this.trialId)) {
      this.seen.add(this.trialId); this.last = st.lastTrial; this.close(); this.go("outcome"); return;
    }
    if (this.step !== "outcome") { this.close(); if (!T) this.trialId = null; }
  }

  go(step) { this.step = step; this.render(); }

  frame(full = true) {
    if (!this.root) { this.root = h("div.nk-ui", { id: "nk-trial" }); document.body.append(this.root); }
    this.root.className = `nk-ui ${full ? "full" : "strip"}`;
    this.stopFx?.(); this.stopFx = null; clearInterval(this.typer); clearTimeout(this.timer);
    this.root.replaceChildren();
    return this.root;
  }

  render() {
    const M = TRIAL_META[(this.T?.n ?? this.last?.n) - 1];
    if (!M) return;
    const R = this.step;
    if (R === "voice") this.voice(M);
    else if (R === "choose") this.choose(M);
    else if (R === "react") this.react();
    else if (R === "wait") {
      const shot = this.pick?.shot;
      this.frame(false).append(h("div.nk-strip", {},
        h("b", {}, `ИСПЫТАНИЕ ${M.n} · ${M.title}`),
        h("span", {}, shot ? "Голос держит тебя. Стреляй, когда мастер скажет: одна атака с преимуществом по устоявшему врагу. Бросок испытания будет обычным."
          : "Держись. Мастер скажет, когда бросать.")));
    } else if (R === "roll") this.roll(M);
    else if (R === "rolled") this.rolled(M);
    else if (R === "outcome") this.outcome(M);
  }

  /** Голос крупно, по буквам; под ним — тихое «продолжить». */
  voice(M) {
    const L = LINES[this.hero.cls]?.[M.n - 1] || {}, w = this.gg(L.w || "");
    const typed = h("div.nk-whisper.big");
    const more = h("button.nk-btn.nk-quiet", { style: "visibility:hidden", onclick: () => this.go("choose") }, "ПРОДОЛЖИТЬ");
    this.frame().append(h("div.nk-voice", {}, typed, more));
    let i = 0;
    const done = () => { clearInterval(this.typer); typed.textContent = w; more.style.visibility = "visible"; };
    this.typer = setInterval(() => { i += 1; typed.textContent = w.slice(0, i); if (i >= w.length) done(); }, 45);
    typed.addEventListener("click", done);
  }

  /** Ответ голосу: «да» (в декомпрессии — два), «нет» словами героя, промолчать. */
  choose(M) {
    const L = LINES[this.hero.cls]?.[M.n - 1] || {}, o = this.gg(L.o || "");
    const pick = (c, shot = false) => {
      if (this.pick) return;
      this.pick = { c, shot }; sfx(c);
      S.send({ t: "dela.pick", n: M.n, c, shot });
      this.go("react");
    };
    const card = (cls, title, sub, onclick, quote) => h(`button.nk-choice.${cls}`, { onclick },
      h("b", {}, title), quote ? h("q", {}, quote) : null, sub ? h("span", {}, sub) : null);
    const yes = (M.yes || [{ t: "ДА.", s: "" }]).map(y => card("w", y.t, y.s, () => pick("w", !!y.shot)));
    this.frame().append(h("div.nk-voice", {}, h("div.nk-choices.in", {},
      h("div.nk-col", {}, yes),
      card("o", ANSWER_NO, null, () => pick("o"), o),
      card("n", ANSWER_SILENT.t, ANSWER_SILENT.s, () => pick("n")))));
  }

  react() {
    const c = this.pick?.c || "n", R = reaction(c, this.hero.gender, this.T?.heroes?.length || 5);
    const root = this.frame(); root.classList.add(`react-${c}`);
    const cv = h("canvas.nk-fx");
    root.append(cv, h("div.nk-react", {}, h("div.nk-rbig", {}, R.big), h("div.nk-rsmall", {}, R.small)));
    if (c === "w") this.stopFx = redHatch(cv);
    const next = () => this.go(this.T?.phase === "choose" ? "wait" : "roll");
    this.timer = setTimeout(next, c === "n" ? 4200 : 4800);
    setTimeout(() => root.addEventListener("click", () => { clearTimeout(this.timer); next(); }, { once: true }), 1800);
  }

  roll(M) {
    const actor = game.actors.get(this.aid), mode = modeOf(this.pick, M.n);
    const busy = { v: false };
    const btns = M.saves.map(([ab, label, how]) => h("button.nk-save", {
      onclick: async ev => {
        if (busy.v) return; busy.v = true; ev.currentTarget.classList.add("on");
        try {
          const r = await S.rollSave(this.aid, ab, mode);
          if (!r) { busy.v = false; return; }
          this.myRoll = { ...r, ability: ab, mode };
          S.send({ t: "dela.roll", n: M.n, total: r.total, d20: r.d20, ability: ab, mode });
          this.go("rolled");
        } catch (e) { console.error(e); ui.notifications?.error(`Бросок не удался: ${e.message}`); busy.v = false; }
      } }, h("b", {}, `${label} ${sign(saveMod(actor, ab))}`), h("span", {}, how)));
    const pickText = this.pick?.c === "w" ? "Ты {приняла|принял} силу"
      : this.pick?.c === "o" ? "Ты {отказала|отказал} голосу" : "Ты {промолчала|промолчал}";
    this.frame().append(h("div.nk-center", {}, h("div.nk-card", {},
      h("div.nk-tsub", {}, `ИСПЫТАНИЕ ${M.n} · ${M.title}`),
      h("div.nk-rhead", {}, `Спасбросок ${MODE_LABEL[mode]}`),
      h("div.nk-hint2", {}, `${this.gg(pickText)}. Выбери, как спасаешься:`),
      this.pick?.shot ? h("div.nk-hint2", { style: "color:#ff9a8a" }, "Голос держит твою руку: когда мастер скажет, сделай одну атаку с преимуществом по врагу.") : null,
      h("div.nk-saves", {}, btns))));
  }

  rolled(M) {
    const r = this.myRoll || this.T?.rolls?.[this.aid];
    const hero = this.st?.heroes?.[this.aid];
    const p = points(hero, 3, true), canDar = rewardsOf(p.l, p.h).includes("h2") && !hero?.used?.h2 && !r?.dar;
    const all = this.T?.heroes?.length || 0, got = Object.keys(this.T?.rolls || {}).length;
    const dar = canDar ? h("button.nk-btn.small.dar", { title: "Раз за игру перебросить к20 и взять лучший результат", onclick: async () => {
      const r2 = await S.rollSave(this.aid, r.ability, r.mode).catch(() => null); if (!r2) return;
      const best = r2.total > r.total ? r2 : r;
      this.myRoll = { ...r, ...best, dar: true };
      S.send({ t: "dela.use", key: "h2" });
      S.send({ t: "dela.roll", n: M.n, total: best.total, d20: best.d20, ability: r.ability, mode: r.mode, dar: true });
      ui.notifications?.info("Глаза чернеют.");
      this.render();
    } }, "ДАР · ПЕРЕБРОСИТЬ") : null;
    this.frame(false).append(h("div.nk-strip", {},
      h("b", {}, `ИСПЫТАНИЕ ${M.n} · ${M.title}`),
      h("span", {}, r ? `Твой бросок: ${r.total}${r.dar ? " (Дар)" : ""}.` : "Бросок отправлен."),
      h("span", { style: "opacity:.75" }, got < all ? `Бросили ${got} из ${all}. Ждём остальных.` : "Все бросили. Мастер подводит итог."),
      dar));
  }

  outcome(M) {
    const oc = this.last?.outcome; if (!oc) return this.close();
    if (oc === "fail") sfx("fail");
    this.frame().append(h("div.nk-center", {},
      h("div.nk-tsub", {}, `ИСПЫТАНИЕ ${M.n} · ${M.title}`),
      h("div", { class: `nk-title oc-${oc}` }, OUTCOME_LABEL[oc].toUpperCase()),
      h("div.nk-rules", {}, OUTCOME_TEXT[M.n - 1]?.[oc] || ""),
      h("button.nk-btn.nk-big", { onclick: () => { this.close(); this.trialId = null; } }, "ДАЛЕЕ")));
  }
}
