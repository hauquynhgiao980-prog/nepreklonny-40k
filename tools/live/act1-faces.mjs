/* «Непреклонный» 3.4.2 — портреты и токены NPC и врагов акта I в уже импортированном мире:
   Крюк, Тихий Сол, Варро, Культист-ренегат. Обновляет актёров мира и их токены на сценах;
   у культистов на сцене лица чередуются. Ничего не создаёт и не удаляет. */
export default async function ({ log }) {
  const T = "modules/nepreklonny-40k/icons/gen/act1/";
  const FACES = ["kultist_a", "kultist_b"].map(k => `${T}token_${k}.webp`);
  const SET = [
    { name: "Крюк", img: "kryuk", tok: "token_kryuk", size: 1, disp: 0 },
    { name: "Тихий Сол", img: "sol", tok: "token_sol", size: 1, disp: 0 },
    { name: "Варро, матрос пусковой команды", img: "varro", tok: "token_varro", size: 1, disp: 0 },
    { name: "Культист-ренегат", img: "kultist_a", tok: "token_kultist_a", size: 1 },
  ];
  const report = [];
  for (const s of SET) {
    const tex = { src: `${T}${s.tok}.webp`, scaleX: 1, scaleY: 1, fit: "contain" };
    for (const a of game.actors.filter(x => x.name === s.name)) {
      const upd = { img: `${T}${s.img}.webp`, "prototypeToken.texture": tex, "prototypeToken.width": s.size, "prototypeToken.height": s.size };
      if (s.disp !== undefined) upd["prototypeToken.disposition"] = s.disp;
      await a.update(upd);
      report.push({ actor: a.name });
      for (const scene of game.scenes) {
        const toks = scene.tokens.filter(t => t.actorId === a.id).sort((p, q) => p.name.localeCompare(q.name, "ru", { numeric: true }));
        if (!toks.length) continue;
        const tu = toks.map((t, i) => ({ _id: t.id, width: s.size, height: s.size,
          texture: { ...tex, src: s.name === "Культист-ренегат" ? FACES[i % FACES.length] : tex.src } }));
        await scene.updateEmbeddedDocuments("Token", tu);
        report.push({ scene: scene.name, actor: a.name, tokens: tu.length });
      }
    }
  }
  log(report.map(r => r.scene ? `${r.scene}: ${r.actor} ×${r.tokens}` : `актёр ${r.actor}`).join("; ") || "в мире нет этих актёров");
  ui.notifications.info("Портреты NPC и культистов обновлены.");
  return report;
}
