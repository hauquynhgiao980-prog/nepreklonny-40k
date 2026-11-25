/* Непреклонный: связка эффектов стрельбы с Foundry v13 и dnd5e 5.x.
   Ловит бросок атаки стрелковым оружием, решает, кто куда попал, и раздаёт очередь всем клиентам.
   Сама рассылка передаётся снаружи (сокет модуля или канал Claude Live), чтобы связку можно было
   проверять без перезапуска сервера. */
import { WeaponFX, classify, burstHits, rng } from "./weaponfx-core.mjs";

const MOD = "nepreklonny-40k";

/**
 * @param {object} o
 * @param {function} o.broadcast — разослать очередь остальным клиентам
 * @param {{enabled:function, blood:function, volume:function}} o.settings
 */
export function createWeaponFX({ broadcast, settings }) {
  let eng = null, layers = null, manual = false;
  const tick = () => { if (eng && !manual) eng.update(canvas.app.ticker.deltaMS); };

  function teardown() {
    canvas?.app?.ticker?.remove(tick);
    eng?.destroy(); eng = null;
    if (layers) for (const c of [layers.fx, layers.decals]) if (!c.destroyed) { c.parent?.removeChild(c); c.destroy({ children: true }); }
    layers = null;
  }

  /** Слои на текущей сцене: вспышки и лучи — над токенами и освещением, пятна — на полу под токенами. */
  function ensure() {
    if (!canvas?.ready || !canvas.scene) return null;
    if (eng && layers?.scene === canvas.scene.id && !layers.fx.destroyed) return eng;
    teardown();
    const fx = new PIXI.Container(); fx.name = "nk-weaponfx"; fx.eventMode = "none";
    canvas.interface.addChild(fx);
    const decals = new PIXI.Container(); decals.name = "nk-weaponfx-decals"; decals.eventMode = "none";
    let decalsWhere = "primary";
    try {
      Object.assign(decals, { elevation: 0, sortLayer: 690, sort: 0, zIndex: 0 });
      canvas.primary.addChild(decals);
      canvas.primary.sortDirty = true;
    } catch (e) {
      console.warn(`${MOD} | пятна не встали под токены, кладу их в слой эффектов`, e);
      fx.addChildAt(decals, 0); decalsWhere = "interface";
    }
    eng = new WeaponFX({
      fxLayer: fx, decalLayer: decals, grid: canvas.grid.size, onHit: flashToken, blood: settings.blood(),
      audio: { get volume() { return settings.volume(); } },
    });
    canvas.app.ticker.add(tick);
    layers = { fx, decals, scene: canvas.scene.id, decalsWhere };
    return eng;
  }

  /** Короткая красная вспышка на токене цели: меняется только картинка у клиента, документ не трогается. */
  function flashToken(id, strength = 1) {
    const t = canvas.tokens?.get(id), m = t?.mesh;
    if (!m) return;
    const old = m.tint;
    m.tint = strength > 1 ? 0xff3030 : 0xff6a6a;
    setTimeout(() => { if (!t.destroyed && t.mesh) t.mesh.tint = old; }, 110 * strength);
  }

  /** Видит ли этот клиент перестрелку: мастер — всегда, игрок — если виден стрелок или хоть одна цель. */
  function visibleHere(p) {
    if (game.user.isGM) return true;
    const ids = [p.fromId, ...p.tos.map(t => t.id)];
    return ids.some(id => canvas.tokens?.get(id)?.visible);
  }

  function play(p) {
    if (!p || p.t !== "wfx" || !settings.enabled()) return false;
    if (p.scene !== canvas?.scene?.id || !visibleHere(p)) return false;
    const e = ensure(); if (!e) return false;
    e.blood = settings.blood();
    p.tos.forEach((to, i) => e.shoot({ from: p.from, to, kind: p.kind, shots: p.shots, hits: to.hits, crit: p.crit, seed: p.seed + i * 7919 }));
    return true;
  }

  function payloadFor(src, targets, kind, shots, hitFor, crit, seed = Math.floor(Math.random() * 1e9)) {
    const R = rng(seed);
    const r = t => Math.min(t.w, t.h) / 2;
    return {
      t: "wfx", scene: canvas.scene.id, fromId: src.id, kind, shots, crit, seed,
      from: { x: src.center.x, y: src.center.y, r: r(src) },
      tos: targets.map(t => ({ x: t.center.x, y: t.center.y, r: r(t), id: t.id, hits: burstHits(shots, hitFor(t), crit, R) })),
    };
  }

  /** Хук dnd5e.rollAttackV2: срабатывает только у того, кто бросал, и рассылает очередь остальным. */
  function onAttack(rolls, data) {
    const activity = data?.subject, item = activity?.item, roll = rolls?.[0];
    if (!item || !roll || item.type !== "weapon") return null;
    if (activity.attack?.type?.value !== "ranged") return null;                 // только стрелковое
    if (/thrown/i.test(roll.options?.attackMode ?? data?.attackMode ?? "")) return null;   // метание — потом
    const actor = activity.actor;
    const src = actor?.token?.object ?? canvas.tokens.controlled.find(t => t.actor === actor) ?? actor?.getActiveTokens?.()[0];
    if (!src) return null;
    const targets = [...game.user.targets].filter(t => t !== src && t.document?.parent === canvas.scene);
    if (!targets.length) return null;
    const { kind, shots } = classify(item.name, item.getFlag?.(MOD, "fx"));
    const crit = !!roll.isCritical, fumble = !!roll.isFumble;
    const hitFor = t => crit || (!fumble && roll.total >= (t.actor?.system?.attributes?.ac?.value ?? roll.options?.target ?? 10));
    const p = payloadFor(src, targets, kind, shots, hitFor, crit);
    broadcast(p); play(p);
    return p;
  }

  /** Ручной выстрел: из макроса или для проверки. hit — true/false или «по КД» (undefined + roll). */
  function shoot(src, targets, { kind = "laser", shots = 3, hit = true, crit = false, seed } = {}) {
    targets = [targets].flat().filter(Boolean);
    if (!src || !targets.length) return null;
    const p = payloadFor(src, targets, kind, shots, () => hit, crit, seed);
    broadcast(p); play(p);
    return p;
  }

  return {
    play, onAttack, shoot, teardown, ensure,
    get engine() { return eng; }, get layers() { return layers; },
    /** Ручной шаг времени — чтобы снимать кадры в фоновой вкладке, где кадры сами не рисуются. */
    manual(on) { manual = !!on; }, step(ms) { eng?.update(ms); },
  };
}
