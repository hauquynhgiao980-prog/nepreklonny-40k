// Интерфейс «Дела»: анкета игрока, инфопланшет с летописью, пульт мастера.
import * as S from "./state.mjs";
import { ANKETA, TRIALS, LINES, REWARDS, OUTCOME_LABEL, CLASS_LABEL, g, anketaEntry, chronicle, mood, points } from "./texts.mjs";
import { orbCanvas, setOrb, ArtReveal } from "./gl.mjs";

const ART = (cls, n) => `modules/${S.MOD}/anketa/art/${cls}_${n}.webp`;

/** Короткий конструктор DOM: h("div.cls", {style, onclick, title}, ...дети). Текст — только через textContent. */
export function h(sel, attrs = {}, ...kids) {
  const [tag, ...cls] = sel.split(".");
  const el = document.createElement(tag || "div");
  if (cls.length) el.className = cls.join(" ");
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style") el.style.cssText = v;
    else if (k === "class") el.className += (el.className ? " " : "") + v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

function draggable(el, handle, onEnd) {
  handle.addEventListener("pointerdown", e => {
    if (e.button !== 0 || e.target.closest("button,select,input")) return;
    const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    el.style.transform = "none"; el.style.left = `${r.left}px`; el.style.top = `${r.top}px`; el.style.bottom = "auto"; el.style.right = "auto";
    const move = ev => {
      el.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - dx))}px`;
      el.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy))}px`;
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); onEnd?.(el.getBoundingClientRect()); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  });
}

// ---------------------------------------------------------------- анкета
export class Anketa {
  constructor() { this.root = null; }
  get isOpen() { return !!this.root?.isConnected; }

  open(hero) {
    if (this.isOpen) return;
    this.hero = hero; this.step = 0; this.answers = []; this.sent = false;
    this.root = h("div.nk-ui", { id: "nk-anketa" });
    document.body.append(this.root);
    this.size();
    this.art = new ArtReveal(this.aw, this.ah);
    this.art.preload([1, 2, 3, 4].map(n => ART(hero.cls, n)));
    this.render();
  }
  close() { this.art?.stop(); this.root?.remove(); this.root = null; }
  size() {
    const w = Math.min(1040, window.innerWidth - 80, (window.innerHeight - 270) * 16 / 9);
    this.aw = Math.max(480, Math.round(w)); this.ah = Math.round(this.aw * 9 / 16);
  }
  gg(s) { return g(s, this.hero.gender, this.hero.name); }
  next() { this.step++; S.send({ t: "dela.progress", step: this.step }); this.render(); }

  render() {
    const R = this.root; R.replaceChildren();
    if (this.step === 0) {
      R.append(h("div.nk-center", {}, h("div.nk-title", {}, "ДЕЛО 7714-В"),
        h("button.nk-btn.nk-big", { onclick: () => this.next() }, "НАЧАТЬ")));
    } else if (this.step === 1) {
      R.append(h("div.nk-center", {},
        h("div.nk-rules", {}, "Перед стазисом каждого из вас допросили. Четыре вопроса — от начала до суда. Отвечай так, как было. Что ответишь, то и запишут."),
        h("button.nk-btn.nk-big", { onclick: () => this.next() }, "ДАЛЕЕ")));
    } else if (this.step <= 5) {
      this.slide(this.step - 2);
    } else {
      this.final();
    }
  }

  slide(i) {
    const hero = this.hero, sl = ANKETA[hero.cls][i];
    const prog = h("div.nk-prog", {}, [0, 1, 2, 3].map(k => h("i", { class: k < i ? "done" : k === i ? "now" : "" })));
    const box = h("div.nk-artbox", { style: `width:${this.aw}px;height:${this.ah}px` }, this.art.canvas);
    const opts = h("div.nk-opts", {}, sl.opts.map((o, k) => h("button.nk-opt", {
      style: `animation-delay:${2.2 + k * 0.12}s`,
      onclick: () => { this.answers[i] = k; this.next(); },
    }, h("b", {}, this.gg(o.t)), h("span", {}, this.gg(o.line)))));
    this.root.append(h("div.nk-slide", { style: `width:${this.aw}px` },
      h("div.nk-top", {}, h("div", {}, `ДЕЛО 7714-В · ${hero.head} · ${this.gg(CLASS_LABEL[hero.cls]).toUpperCase()}`), prog),
      box,
      h("div.nk-q", {}, h("b", {}, `${sl.title.toUpperCase()} · ${i + 1} ИЗ 4`), h("span", {}, this.gg(sl.q))),
      opts));
    this.art.show(ART(hero.cls, i + 1));
  }

  final() {
    const hero = this.hero, A = this.answers.slice(0, 4);
    const side = ANKETA[hero.cls][3].opts[A[3]].side;
    const e = anketaEntry({ ...hero, anketa: { done: true, answers: A, side } });
    if (!this.sent) { S.send({ t: "dela.answer", answers: A }); this.sent = true; }
    const orb = orbCanvas(120, side === "l" ? 1 : 0, side === "h" ? 1 : 0);
    this.root.append(h("img.nk-bg", { src: ART(hero.cls, 4), alt: "" }));
    const done = h("button.nk-btn", { style: "height:38px;padding:0 22px;letter-spacing:.14em", onclick: () => {
      const st = S.heroOfUser(game.user.id);
      if (!st?.anketa?.done) S.send({ t: "dela.answer", answers: A });
      this.close(); Hooks.callAll("nkDelaAnketaClosed");
    } }, "В СТАЗИС");
    this.root.append(h("div.nk-final.nk-slate", {}, h("div.nk-screen", { style: "padding:22px 28px 24px" },
      h("div.nk-head", {}, h("div", {}, `ДЕЛО 7714-В · ЗАКРЫТО · ${hero.head}`), h("div", {}, "ЛЕТОПИСЬ · 1 ИЗ 4")),
      h("div", { style: "display:flex;gap:24px;align-items:flex-start;margin-top:18px" },
        h("div", { style: "display:flex;flex-direction:column;align-items:center;gap:10px;flex:none" }, orb,
          h("div", { class: `nk-mood ${side}`, style: "margin:0;font-size:12px" }, side === "l" ? "СВЕТ ТЕПЛИТСЯ" : "ТЕНЬ РЯДОМ")),
        h("div", { style: "flex:1;min-width:0" }, entryView(e, true))),
      h("div", { style: "display:flex;justify-content:flex-end;margin-top:20px" }, done),
      h("div.nk-scan"))));
  }
}

function entryView(e, big = false, pendingHead = "") {
  const fs = big ? "font-size:15px;line-height:1.6" : "";
  if (!e) return h("div.nk-entry", {}, h("div.nk-eh", {}, h("i.p"), pendingHead), h("p.pend", {}, "Запись ещё не сделана."));
  return h("div.nk-entry", { style: big ? "padding:0;border:0" : "" },
    h("div.nk-eh", {}, h("i", { class: e.k }), e.head),
    h("p", { style: fs }, e.text),
    e.q ? h("blockquote", { class: e.k === "l" ? "l" : "h", style: fs }, e.q) : null,
    e.after ? h("p", { style: fs }, e.after) : null);
}

// ---------------------------------------------------------------- планшет
export class Pad {
  /** actorId — чей планшет; gm — открыт у мастера. */
  constructor(actorId, { gm = false, userName = "" } = {}) {
    this.actorId = actorId; this.gm = gm; this.userName = userName;
    this.known = null;
    const saved = gm ? {} : game.settings.get(S.MOD, "delaPad") || {};
    this.mini = !!saved.mini; this.open = !!saved.open;
    this.el = h("div.nk-pad.nk-ui", { class: gm ? "gm" : "" });
    if (saved.left != null && !gm) { this.el.style.left = `${saved.left}px`; this.el.style.top = `${saved.top}px`; }
    else if (gm) { const k = Pad.count = (Pad.count || 0) + 1; this.el.style.left = `${80 + (k % 5) * 40}px`; this.el.style.top = `${90 + (k % 5) * 40}px`; }
    else { this.el.style.left = "110px"; this.el.style.top = "90px"; }
    this.orbBig = orbCanvas(104, 0, 0);
    this.orbMini = orbCanvas(28, 0, 0);
    document.body.append(this.el);
  }
  save() {
    if (this.gm) return;
    const r = this.el.getBoundingClientRect();
    game.settings.set(S.MOD, "delaPad", { mini: this.mini, open: this.open, left: Math.round(r.left), top: Math.round(r.top) });
  }
  destroy() { this.el.remove(); }

  render(st = S.get()) {
    const hero = st.heroes?.[this.actorId];
    if (!hero) { this.el.replaceChildren(); return; }
    const p = points(hero, 3, true), rew = S.heroRewards(hero);
    const newOnes = this.known ? rew.filter(k => !this.known.includes(k)) : [];
    this.known = rew;
    const md = mood(p.l, p.h), mk = p.l > p.h ? "l" : p.h > p.l ? "h" : "n";
    setOrb(this.orbBig, p.l, p.h); setOrb(this.orbMini, p.l, p.h);
    const hull = S.hull(st), hullBar = "█".repeat(hull) + "░".repeat(8 - hull);
    const toggleUse = key => {
      if (this.gm) S.update(s => { const x = s.heroes[this.actorId]; x.used = x.used || {}; x.used[key] = !x.used[key]; });
      else S.send({ t: "dela.use", key });
    };
    const cls = g(CLASS_LABEL[hero.cls] || "", hero.gender).toUpperCase();
    const verdict = hero.anketa?.done ? (hero.anketa.side === "h" ? "ВИНА ПРИЗНАНА" : "ВИНА НЕ ПРИЗНАНА") : "ДЕЛО НЕ ЗАКРЫТО";
    let body;
    if (this.mini) {
      body = h("div.nk-slate", { style: "padding:6px;border-radius:10px" }, h("div.nk-screen.nk-mini.nk-drag", {},
        h("div.nk-orbwrap", {}, this.orbMini),
        h("div.nk-name", {}, hero.name.toUpperCase()),
        h("div", { class: `nk-mood ${mk}` }, md),
        h("div.nk-dots", {}, rew.map(k => h("i", { class: `${REWARDS[k].side} ${hero.used?.[k] ? "used" : ""}`, title: REWARDS[k].name }))),
        h("div", { style: "flex:1" }),
        h("div", { style: "font-size:11px;letter-spacing:.04em" }, hullBar),
        h("button.nk-x", { title: "Развернуть планшет", onclick: () => { this.mini = false; this.save(); this.render(); } }, "▴"),
        this.gm ? h("button.nk-x", { title: "Закрыть", onclick: () => this.onClose?.() }, "✕") : null,
        h("div.nk-scan")));
    } else {
      body = h("div.nk-slate", {},
        h("div.nk-screen", {},
          h("div.nk-head.nk-drag", {}, h("div", {}, this.gm ? `ПЛАНШЕТ ИГРОКА · ${this.userName}` : "ИНФОПЛАНШЕТ · ДЕЛО 7714-В"), h("div", {}, "++ ИМПЕРИУМ ++")),
          h("div.nk-id", {},
            h("div.nk-orbwrap", {}, this.orbBig),
            h("div", { style: "flex:1;min-width:0" },
              h("div.nk-name", {}, hero.head),
              h("div.nk-sub", {}, `${cls} · ${verdict}`),
              h("div", { class: `nk-mood ${mk}` }, md))),
          h("div.nk-rewards", {}, rew.map(k => {
            const R = REWARDS[k], used = !!hero.used?.[k];
            return h("button", { class: `nk-rew ${R.side} ${used ? "used" : ""} ${newOnes.includes(k) ? "new" : ""}`,
              title: R.passive ? "" : (used ? "Отметить как неиспользованную" : "Отметить как использованную"),
              onclick: () => { if (!R.passive) toggleUse(k); } },
              h("b", {}, R.name.toUpperCase()), ` · ${R.short.toUpperCase()}`,
              h("em", {}, R.passive ? "[ДЕЙСТВУЕТ]" : used ? "[ИСПОЛЬЗОВАНО]" : "[ГОТОВО]"));
          })),
          h("div.nk-hull", {}, h("span", {}, "КОРПУС"), h("span", { style: "letter-spacing:.1em" }, hullBar)),
          h("div.nk-scan")),
        h("div.nk-bezel.nk-drag", {}, h("div.nk-leds", {}, h("i"), h("i")),
          h("div", { style: "display:flex;gap:6px" },
            h("button.nk-btn", { onclick: () => { this.open = !this.open; this.save(); this.render(); } }, this.open ? "СКРЫТЬ ЛЕТОПИСЬ" : "ЛЕТОПИСЬ"),
            h("button.nk-btn", { onclick: () => { this.mini = true; this.save(); this.render(); } }, "▾ В СТРОКУ"),
            this.gm ? h("button.nk-btn", { onclick: () => this.onClose?.() }, "✕") : null)));
    }
    const kids = [body];
    if (this.open && !this.mini) kids.push(this.chron(hero, st));
    this.el.replaceChildren(...kids);
    for (const d of this.el.querySelectorAll(".nk-drag")) draggable(this.el, d, () => { this.save(); this.place(); });
    this.place();
  }

  /** Летопись — со стороны, где хватает места. */
  place() {
    const ch = this.el.querySelector(".nk-chron"); if (!ch) return;
    const r = this.el.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    if (r.top < H * 0.45) { ch.style.top = "0"; ch.style.bottom = "auto"; ch.style.maxHeight = `${Math.max(240, H - r.top - 16)}px`; }
    else { ch.style.top = "auto"; ch.style.bottom = "0"; ch.style.maxHeight = `${Math.max(240, r.bottom - 16)}px`; }
    if (r.right + 560 > W && r.left > 560) { ch.style.left = "auto"; ch.style.right = "calc(100% + 12px)"; }
    else { ch.style.left = ""; ch.style.right = ""; }
  }

  chron(hero, st) {
    const list = chronicle(hero, st.outcomes || {});
    const heads = ["ДЕЛО · ДО СУДА", ...TRIALS.map(t => t.head)];
    const done = list.filter(Boolean).length;
    return h("div.nk-chron.nk-slate", {}, h("div.nk-screen", {},
      h("div.nk-head", {}, h("div", {}, `ЛЕТОПИСЬ · ${hero.head}`), h("div", {}, `${done} ИЗ 4`)),
      h("div.nk-list", {}, list.map((e, i) => entryView(e, false, heads[i]))),
      h("div.nk-scan")));
  }
}

// ---------------------------------------------------------------- пульт мастера
export class Panel {
  constructor() { this.el = null; this.tab = "heroes"; this.pads = new Map(); }
  get isOpen() { return !!this.el?.isConnected; }
  toggle() { this.isOpen ? this.close() : this.openPanel(); }
  openPanel() {
    if (!game.user.isGM) return;
    this.el = h("div.nk-ui.nk-slate", { id: "nk-panel" });
    document.body.append(this.el);
    this.render();
  }
  close() { this.el?.remove(); this.el = null; }

  openPad(actorId, userName) {
    if (this.pads.has(actorId)) { const p = this.pads.get(actorId); p.el.style.zIndex = 121; return; }
    const p = new Pad(actorId, { gm: true, userName });
    p.onClose = () => { p.destroy(); this.pads.delete(actorId); };
    this.pads.set(actorId, p); p.open = true; p.render();
  }
  renderPads(st) { for (const p of this.pads.values()) p.render(st); }

  render(st = S.get()) {
    this.renderPads(st);
    if (!this.isOpen) return;
    const hull = S.hull(st);
    const top = h("div.nk-ptop", {},
      h("div.nk-ptitle", {}, "ПУЛЬТ МАСТЕРА · ДЕЛО 7714-В"),
      h("div", { style: "flex:1" }),
      h("div", { style: "font-size:11px;letter-spacing:.14em;color:var(--gd)" }, "КОРПУС"),
      h("div.nk-plates", {}, [...Array(8)].map((_, i) => h("i", { class: i < hull ? "" : "off" }))),
      h("div", { style: "min-width:36px;font-size:14px" }, `${hull}/8`),
      h("button.nk-btn.small", { title: "Корпус −1", onclick: () => S.update(s => { s.hullAdj = (s.hullAdj || 0) - 1; }) }, "−"),
      h("button.nk-btn.small", { title: "Корпус +1", onclick: () => S.update(s => { s.hullAdj = (s.hullAdj || 0) + 1; }) }, "+"),
      h("button.nk-x", { title: "Закрыть пульт", style: "margin-left:6px", onclick: () => this.close() }, "✕"));
    const tabs = h("div.nk-tabs", {}, [["heroes", "ГЕРОИ И ВЕРА"], ["trials", "ИСПЫТАНИЯ"]].map(([id, label]) =>
      h("button", { class: `nk-tab ${this.tab === id ? "on" : ""}`, onclick: () => { this.tab = id; this.render(); } }, label)));
    const body = h("div.nk-body", {}, this.tab === "heroes" ? this.heroes(st) : this.trials(st));
    const scroll = this.el.querySelector(".nk-body")?.scrollTop || 0;
    this.el.replaceChildren(h("div.nk-screen", {}, top, tabs, body, h("div.nk-scan")));
    this.el.querySelector(".nk-body").scrollTop = scroll;
    draggable(this.el, top);
  }

  heroes(st) {
    const players = game.users.filter(u => !u.isGM);
    const pg = S.pregens();
    const taken = new Map(Object.entries(st.roster || {}).map(([u, a]) => [a, u]));
    const pack = game.packs.get(`${S.MOD}.heroes40k`);
    const bar = h("div.nk-bar", {},
      h("button.nk-btn", { onclick: () => S.openAnketa(), disabled: !Object.keys(st.roster || {}).length }, "РАЗДАТЬ АНКЕТУ ВСЕМ"),
      pack ? h("button.nk-btn.ghost", { onclick: () => this.importPregens(pack) }, pg.length ? "ДОБАВИТЬ ПРЕГЕНОВ ИЗ КОМПЕНДИУМА" : "ИМПОРТИРОВАТЬ ПРЕГЕНОВ") : null,
      h("div.nk-hint", { style: "flex:1;min-width:260px" }, "Сначала назначьте каждому игроку героя: он станет его персонажем. Потом раздайте анкету — каждый пройдёт свою, и у него появится планшет."));
    if (!players.length) return [bar, h("div.nk-hint", {}, "В мире пока нет игроков.")];
    const rows = players.map(u => {
      const aid = st.roster?.[u.id], hero = aid ? st.heroes?.[aid] : null;
      const sel = h("select", { onchange: ev => S.assign(u.id, ev.target.value || null) },
        h("option", { value: "" }, "— не назначен —"),
        pg.map(p => h("option", { value: p.id, selected: p.id === aid ? true : null }, `${p.name}${taken.has(p.id) && taken.get(p.id) !== u.id ? " (занят)" : ""}`)));
      let faith = "—", rewards = "", status = h("span.nk-hint", {}, "—"), actions = [];
      if (hero) {
        const p = points(hero, 3, true);
        const orb = orbCanvas(26, p.l, p.h);
        const adj = (k, d) => S.update(s => { const x = s.heroes[aid]; x.adj = x.adj || { l: 0, h: 0 }; x.adj[k] = (x.adj[k] || 0) + d; });
        faith = h("div.nk-faith", {}, orb,
          h("div.nk-num", {}, h("span.l", {}, `С ${p.l}`), " · ", h("span.h", {}, `Е ${p.h}`)),
          h("span.nk-seg", {}, h("button", { title: "Свет −1", onclick: () => adj("l", -1) }, "С−"), h("button", { title: "Свет +1", onclick: () => adj("l", 1) }, "С+"),
            h("button", { title: "Ересь −1", onclick: () => adj("h", -1) }, "Е−"), h("button", { title: "Ересь +1", onclick: () => adj("h", 1) }, "Е+")));
        rewards = h("div", {}, S.heroRewards(hero).map(k => h("span", { class: `nk-tag ${REWARDS[k].side} ${hero.used?.[k] ? "used" : ""}`,
          title: REWARDS[k].passive ? REWARDS[k].text : "Щелчок — отметить использование",
          onclick: () => { if (!REWARDS[k].passive) S.update(s => { const x = s.heroes[aid]; x.used = x.used || {}; x.used[k] = !x.used[k]; }); } }, REWARDS[k].name)));
        const pr = S.progress[u.id];
        if (hero.anketa?.done) {
          const side = hero.anketa.side;
          status = h("span", {}, h("span", { style: `color:${side === "h" ? "var(--hr)" : "var(--gl)"}` }, g(side === "h" ? "{Виновна|Виновен}: Ересь 1" : "{Не виновна|Не виновен}: Свет 1", hero.gender)),
            h("div.nk-hint", {}, side === "h" ? "в пакете — улика" : "в пакете — бумага, по которой осудили"));
          actions.push(h("button.nk-btn.small.ghost", { onclick: () => S.resetAnketa(u.id), title: "Стереть ответы и раздать заново" }, "ЗАНОВО"));
        } else if (st.anketaOpen?.[u.id]) {
          status = h("span", {}, pr ? (pr.step >= 6 ? "отвечает…" : pr.step >= 2 ? `проходит · ${pr.step - 1} из 4` : "открыл анкету") : "анкета роздана");
        } else {
          status = h("span.nk-hint", {}, "анкета не роздана");
          actions.push(h("button.nk-btn.small", { onclick: () => S.openAnketa([u.id]) }, "РАЗДАТЬ"));
        }
        actions.push(h("button.nk-btn.small", { "data-pad": aid, onclick: () => this.openPad(aid, u.name) }, "ПЛАНШЕТ"));
      }
      const gender = hero ? h("span.nk-seg", {}, [["f", "Ж"], ["m", "М"]].map(([k, t]) =>
        h("button", { class: hero.gender === k ? "on" : "", title: "Род в текстах", onclick: () => S.update(s => { s.heroes[aid].gender = k; }) }, t))) : "";
      return h("tr", {},
        h("td", { style: "white-space:nowrap" }, h("span", { class: `nk-on ${u.active ? "yes" : ""}` }), u.name),
        h("td", {}, sel), h("td", {}, gender), h("td", {}, status), h("td", {}, faith), h("td", {}, rewards),
        h("td", { style: "white-space:nowrap" }, actions));
    });
    return [bar, h("table", {}, h("thead", {}, h("tr", {}, ["ИГРОК", "ГЕРОЙ", "РОД", "АНКЕТА", "СВЕТ / ЕРЕСЬ", "НАГРАДЫ", ""].map(t => h("th", {}, t)))), h("tbody", {}, rows))];
  }

  trials(st) {
    const assigned = Object.entries(st.roster || {}).map(([u, a]) => ({ u, a, hero: st.heroes?.[a], user: game.users.get(u) })).filter(x => x.hero);
    const out = [h("div.nk-hint", { style: "margin-bottom:12px" }, "Отметьте, кто что выбрал в испытании, и итог группы. Шкалы, награды и запись в летописи считаются сами. Провал отнимает 1 от корпуса.")];
    for (const T of TRIALS) {
      const oc = st.outcomes?.[T.n] || "";
      const outSel = h("select", { onchange: ev => S.update(s => { s.outcomes = s.outcomes || {}; if (ev.target.value) s.outcomes[T.n] = ev.target.value; else delete s.outcomes[T.n]; }) },
        h("option", { value: "" }, "итог — не отмечен"),
        Object.entries(OUTCOME_LABEL).map(([k, t]) => h("option", { value: k, selected: oc === k ? true : null }, t)));
      const rows = assigned.map(({ a, hero, user }) => {
        const c = hero.trials?.[T.n] || "";
        const set = v => S.update(s => { const x = s.heroes[a]; x.trials = x.trials || {}; if (v) x.trials[T.n] = v; else delete x.trials[T.n]; });
        const L = LINES[hero.cls]?.[T.n - 1] || {};
        const hint = c === "w" ? g(L.w, hero.gender) : c === "o" ? g(L.o, hero.gender) : "";
        return h("div.nk-row", {},
          h("div", {}, h("b", { style: "font-weight:600" }, hero.name), h("span.nk-hint", {}, ` · ${user?.name || ""}`)),
          h("span.nk-seg", {}, [["", "—"], ["w", "ШЁПОТ"], ["o", "ОБЕТ"], ["n", "НИЧЕГО"]].map(([v, t]) =>
            h("button", { class: `${c === v ? "on" : ""} ${v}`, title: v === "w" ? g(L.w, hero.gender) : v === "o" ? g(L.o, hero.gender) : "", onclick: () => set(v) }, t))),
          h("div.nk-line", { title: hint }, hint));
      });
      out.push(h("div.nk-trial", {}, h("h3", {}, `${T.n}. ${T.title}`, h("span", {}, T.head), h("div", { style: "flex:1" }), outSel),
        rows.length ? rows : h("div.nk-hint", {}, "Сначала назначьте героев во вкладке «Герои и вера».")));
    }
    return out;
  }

  async importPregens(pack) {
    const have = new Set(S.pregens().map(p => p.name));
    const index = await pack.getIndex();
    const missing = index.filter(e => !have.has(e.name));
    if (!missing.length) return ui.notifications.info("Все прегены уже в мире.");
    let folder = game.folders.find(f => f.type === "Actor" && f.name === "Прегены «Непреклонного»");
    if (!folder) folder = await Folder.create({ name: "Прегены «Непреклонного»", type: "Actor" });
    for (const e of missing) {
      const doc = await pack.getDocument(e._id);
      await Actor.create({ ...doc.toObject(), folder: folder.id });
    }
    ui.notifications.info(`Импортировано прегенов: ${missing.length}.`);
    this.render();
  }
}
