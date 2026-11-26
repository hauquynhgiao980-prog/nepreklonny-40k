/* Непреклонный: предложение урона мастеру.
   Атака попала → игрок бросил урон → мастеру в чат приходит скрытая карточка: кому сколько, с учётом
   сопротивлений, и кнопки «Применить», «½», «×2», «Нет». Урон вычитает сам dnd5e (actor.applyDamage),
   поэтому временные хиты, сопротивления и иммунитеты считаются по правилам системы.
   Доставка до мастера передаётся снаружи (сокет модуля или канал Claude Live). */

const MOD = "nepreklonny-40k";
const FLAG = "damageProposal";
const KEEP_MS = 5 * 60 * 1000;          // сколько помним результат атаки, чтобы связать его с броском урона

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const typeLabel = t => CONFIG.DND5E.damageTypes?.[t]?.label ?? CONFIG.DND5E.healingTypes?.[t]?.label ?? (t || "без типа");
const toDamages = list => list.map(d => ({ value: d.value, type: d.type, properties: new Set(d.properties ?? []) }));

/**
 * @param {object} o
 * @param {function} o.toGM — доставить предложение активному мастеру (если бросал не мастер)
 * @param {function} [o.autoApply] — вычитать сразу (с кнопкой отмены) вместо предложения
 */
export function createDamageProposals({ toGM, autoApply = () => false }) {
  const attacks = new Map();     // uuid действия → { at, targets: [{ uuid, name, hit, crit }] }

  /** dnd5e.rollAttackV2 у бросавшего: запомнить, в кого попали. */
  function onAttack(rolls, data) {
    const activity = data?.subject, roll = rolls?.[0];
    if (!activity || !roll) return;
    const crit = !!roll.isCritical, fumble = !!roll.isFumble;
    const targets = [...game.user.targets].map(t => {
      const ac = t.actor?.system?.attributes?.ac?.value ?? roll.options?.target ?? 10;
      return { uuid: t.document.uuid, name: t.name, ac, hit: crit || (!fumble && roll.total >= ac), crit };
    });
    attacks.set(activity.uuid, { at: Date.now(), total: roll.total, targets });
  }

  /** dnd5e.rollDamageV2 у бросавшего: собрать урон и отправить мастеру. */
  function onDamage(rolls, data) {
    const activity = data?.subject;
    if (!activity || !rolls?.length || activity.type === "heal") return null;
    const rec = attacks.get(activity.uuid);
    const fresh = rec && Date.now() - rec.at < KEEP_MS;
    let targets;
    if (fresh) targets = rec.targets.filter(t => t.hit);
    else targets = [...game.user.targets].map(t => ({ uuid: t.document.uuid, name: t.name, hit: null }));
    if (!targets.length) return null;                                 // промах или нет целей — предлагать нечего
    const agg = (dnd5e.dice?.aggregateDamageRolls ?? (r => r))(rolls, { respectProperties: true });
    const damages = agg.map(r => ({ value: r.total, type: r.options?.type, properties: [...(r.options?.properties ?? [])] }))
      .filter(d => d.value);
    if (!damages.length) return null;
    const actor = activity.actor, item = activity.item;
    const p = {
      t: "dmg", id: foundry.utils.randomID(), user: game.user.id,
      source: { name: actor?.name ?? "?", item: item?.name ?? activity.name, img: item?.img ?? actor?.img },
      attack: fresh ? rec.total : null, crit: !!rolls[0]?.isCritical || targets.some(t => t.crit),
      damages, targets,
    };
    if (game.user === game.users.activeGM) handle(p); else toGM(p);
    return p;
  }

  /** У активного мастера: создать карточку (или сразу вычесть, если так настроено). */
  async function handle(p) {
    if (p?.t !== "dmg" || game.user !== game.users.activeGM) return;
    const state = {};
    if (autoApply()) for (const [i, t] of p.targets.entries()) state[i] = await applyTo(t.uuid, p.damages, 1);
    await ChatMessage.create({
      content: render(p, state), speaker: { alias: "Урон" },
      whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
      flags: { [MOD]: { [FLAG]: { ...p, state } } },
    });
  }

  async function applyTo(uuid, damages, multiplier) {
    const doc = fromUuidSync(uuid), actor = doc?.actor ?? doc;
    if (!actor?.system?.attributes?.hp) return { error: "цель не найдена" };
    const hp = actor.system.attributes.hp, before = { value: hp.value, temp: hp.temp ?? 0 };
    await actor.applyDamage(toDamages(damages), { multiplier, isDelta: true });
    const h2 = actor.system.attributes.hp;
    return { done: true, multiplier, before, after: { value: h2.value, temp: h2.temp ?? 0 }, max: h2.max };
  }

  async function undo(uuid, st) {
    const doc = fromUuidSync(uuid), actor = doc?.actor ?? doc;
    if (!actor || !st?.before) return;
    await actor.update({ "system.attributes.hp.value": st.before.value, "system.attributes.hp.temp": st.before.temp });
  }

  /** Сколько получит цель по правилам системы (сопротивления, иммунитеты) — для подсказки до применения. */
  function preview(uuid, damages, multiplier = 1) {
    const doc = fromUuidSync(uuid), actor = doc?.actor ?? doc;
    if (!actor?.calculateDamage) return null;
    const s = actor.calculateDamage(toDamages(damages), { multiplier });
    if (!s) return null;
    const notes = new Set();
    for (const d of s) for (const [k, on] of Object.entries(d.active ?? {})) if (on) notes.add(k);
    return { amount: s.amount, notes: [...notes] };
  }

  const NOTE = { resistance: "сопротивление", vulnerability: "уязвимость", immunity: "иммунитет", modification: "поправка" };

  function render(p, state = {}) {
    const total = p.damages.reduce((s, d) => s + d.value, 0);
    const parts = p.damages.map(d => `${d.value} ${esc(typeLabel(d.type).toLowerCase())}`).join(" + ");
    const rows = p.targets.map((t, i) => {
      const st = state[i];
      let right;
      if (st?.done) {
        const lost = (st.before.value + st.before.temp) - (st.after.value + st.after.temp);
        const mult = st.multiplier !== 1 ? ` (${st.multiplier === 0.5 ? "½" : "×" + st.multiplier})` : "";
        right = `<span class="nk-dmg-done">${lost >= 0 ? "−" : "+"}${Math.abs(lost)} хитов${mult}: ${st.before.value} → ${st.after.value}</span>
                 <button type="button" data-nk-dmg="undo" data-idx="${i}" title="Вернуть хиты как было">Отменить</button>`;
      } else if (st?.skipped) {
        right = `<span class="nk-dmg-skip">не применено</span>`;
      } else {
        const pv = preview(t.uuid, p.damages);
        const est = pv ? `<b>−${pv.amount}</b>${pv.notes.length ? ` <i>(${pv.notes.map(n => NOTE[n] ?? n).join(", ")})</i>` : ""}` : `<b>−${total}</b>`;
        right = `${est}
          <button type="button" data-nk-dmg="apply" data-mult="1" data-idx="${i}">Применить</button>
          <button type="button" data-nk-dmg="apply" data-mult="0.5" data-idx="${i}" title="Половина">½</button>
          <button type="button" data-nk-dmg="apply" data-mult="2" data-idx="${i}" title="Двойной">×2</button>
          <button type="button" data-nk-dmg="skip" data-idx="${i}" title="Не применять">Нет</button>`;
      }
      return `<li><span class="nk-dmg-name">${esc(t.name)}</span>${right}</li>`;
    }).join("");
    const pending = p.targets.filter((t, i) => !state[i]?.done && !state[i]?.skipped).length;
    const all = pending > 1 ? `<button type="button" class="nk-dmg-all" data-nk-dmg="all">Применить всем</button>` : "";
    return `<div class="nk-dmg">
      <header>${p.source.img ? `<img src="${esc(p.source.img)}">` : ""}<div><b>${esc(p.source.name)}</b> — ${esc(p.source.item)}
        ${p.crit ? `<span class="nk-dmg-crit">крит</span>` : ""}<div class="nk-dmg-sum">${total} урона: ${parts}${p.attack != null ? ` · атака ${p.attack}` : ""}</div></div></header>
      <ul>${rows}</ul>${all}</div>`;
  }

  /** renderChatMessageHTML у мастера: оживить кнопки карточки. */
  function onRender(message, html) {
    const data = message.getFlag?.(MOD, FLAG);
    if (!data || !game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    root?.querySelectorAll("[data-nk-dmg]").forEach(btn => btn.addEventListener("click", async ev => {
      ev.preventDefault();
      const p = message.getFlag(MOD, FLAG), state = foundry.utils.deepClone(p.state ?? {});
      const act = btn.dataset.nkDmg, idx = btn.dataset.idx, uuid = p.targets[idx]?.uuid;
      root.querySelectorAll("[data-nk-dmg]").forEach(b => (b.disabled = true));
      try {
        if (act === "apply") state[idx] = await applyTo(uuid, p.damages, Number(btn.dataset.mult) || 1);
        else if (act === "skip") state[idx] = { skipped: true };
        else if (act === "undo") { await undo(uuid, state[idx]); state[idx] = null; }
        else if (act === "all") for (const [i, t] of p.targets.entries()) if (!state[i]) state[i] = await applyTo(t.uuid, p.damages, 1);
        await message.update({ content: render(p, state), [`flags.${MOD}.${FLAG}.state`]: state });
      } catch (e) {
        console.error(`${MOD} | урон`, e); ui.notifications.error(`Урон не применён: ${e.message}`);
        root.querySelectorAll("[data-nk-dmg]").forEach(b => (b.disabled = false));
      }
    }));
  }

  return { onAttack, onDamage, handle, onRender, render, preview, applyTo, attacks };
}

/** Стиль карточки: один раз на страницу. */
export function injectDamageCss() {
  if (document.getElementById("nk-dmg-css")) return;
  const s = document.createElement("style"); s.id = "nk-dmg-css";
  s.textContent = `
  .nk-dmg header { display:flex; gap:8px; align-items:center; margin-bottom:4px; }
  .nk-dmg header img { width:36px; height:36px; border:none; border-radius:4px; flex:none; }
  .nk-dmg-sum { font-size:12px; opacity:.85; }
  .nk-dmg-crit { margin-left:6px; padding:0 5px; border-radius:3px; background:#8a1010; color:#fff; font-size:11px; }
  .nk-dmg ul { list-style:none; margin:0; padding:0; }
  .nk-dmg li { display:flex; flex-wrap:wrap; align-items:center; gap:4px; padding:3px 0; border-top:1px solid rgba(0,0,0,.12); }
  .nk-dmg-name { flex:1 1 100%; font-weight:600; }
  .nk-dmg li button { flex:0 0 auto; width:auto; line-height:20px; padding:0 6px; font-size:12px; }
  .nk-dmg li b { color:#9a1010; margin-right:4px; }
  .nk-dmg-done { color:#2f6b2f; font-weight:600; margin-right:4px; }
  .nk-dmg-skip { opacity:.6; font-style:italic; }
  .nk-dmg-all { margin-top:4px; }`;
  document.head.append(s);
}
