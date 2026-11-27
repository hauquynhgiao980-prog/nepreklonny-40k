/* «Непреклонный» 3.6.1 — токены врагов и NPC акта I: портреты вместо звезды у стрелков и Отмеченного Хаосом,
   размер кольца как у героев (было ×2). Меняет токены на всех сценах и прототипы актёров в мире. Ничего не удаляет. */
export default async function ({ log }) {
  const MOD = "nepreklonny-40k", T1 = `modules/${MOD}/icons/gen/act1/`;
  const FIT = { kryuk: 0.96, sol: 0.96, varro: 0.96, turret: 0.96, strelok: 0.9, otmechenny: 0.9, nerozhdenny: 0.9 };
  const fitOf = src => { const m = String(src ?? "").match(/icons\/gen\/act1\/token_([a-z_]+)\.webp$/); return m ? (m[1].startsWith("kultist") ? 0.9 : FIT[m[1]]) : null; };
  const FACE = { "Предатель-стрелок": "strelok", "Отмеченный Хаосом": "otmechenny" };
  const PORTRAIT = { "Предатель-стрелок": "strelok", "Отмеченный Хаосом": "otmechenny", "Культист-ренегат": "kultist_a" };
  const baseName = n => String(n ?? "").replace(/\s+\d+$/, "");
  const out = { tokens: 0, actors: 0 };

  for (const scene of game.scenes) {
    const upd = [];
    for (const t of scene.tokens) {
      const face = FACE[baseName(t.name)] ?? FACE[t.actor?.name];
      let src = t.texture.src;
      if (face && !/token_/.test(src ?? "")) src = `${T1}token_${face}.webp`;
      const fit = fitOf(src);
      if (!fit) continue;
      if (src === t.texture.src && t.texture.scaleX === fit && t.texture.scaleY === fit) continue;
      upd.push({ _id: t.id, "texture.src": src, "texture.scaleX": fit, "texture.scaleY": fit });
    }
    if (upd.length) { await scene.updateEmbeddedDocuments("Token", upd); out.tokens += upd.length; log(`${scene.name}: поправлено токенов — ${upd.length}`); }
  }

  for (const a of game.actors) {
    const face = PORTRAIT[a.name];
    const data = {};
    let src = a.prototypeToken?.texture?.src;
    if (face && !/token_/.test(src ?? "")) { src = `${T1}token_${face}.webp`; data["prototypeToken.texture.src"] = src; }
    if (face && !/icons\/gen\/act1\//.test(a.img ?? "")) data.img = `${T1}${face}.webp`;
    const fit = fitOf(src);
    if (fit && (a.prototypeToken?.texture?.scaleX !== fit || a.prototypeToken?.texture?.scaleY !== fit)) {
      data["prototypeToken.texture.scaleX"] = fit; data["prototypeToken.texture.scaleY"] = fit;
    }
    if (Object.keys(data).length) { await a.update(data); out.actors++; log(`актёр «${a.name}»: ${Object.keys(data).map(k => k.split(".").pop()).join(", ")}`); }
  }
  ui.notifications.info(`Токены акта I: поправлено ${out.tokens}, актёров ${out.actors}.`);
  return out;
}
