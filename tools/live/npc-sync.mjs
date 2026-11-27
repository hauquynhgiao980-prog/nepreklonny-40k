/* «Непреклонный» 3.6.2 — персонажи акта I в мире: картинка, токен, масштаб и размер как в компендиуме модуля.
   Нужен, если актёр был импортирован раньше (например, Нерождённый со звездой вместо ауры).
   Меняет прототипы актёров и уже стоящие токены этих актёров на всех сценах. Ничего не удаляет. */
export default async function ({ log }) {
  const MOD = "nepreklonny-40k", G = `modules/${MOD}/icons/gen/act1/`, M = `modules/${MOD}/maps/`;
  const NPC = {
    "Нерождённый": { img: `${G}nerozhdenny.webp`, src: `${G}token_nerozhdenny_aura.webm`, scale: 1.5, size: 3, rotate: true },
    "Сторожевая турель палубы": { img: `${G}turret.webp`, src: `${M}04_lifeboat_deck/turret/lifeboats_turret_off_1024.png`, scale: 1.6, size: 2, rotate: true },
    "Крюк": { img: `${G}kryuk.webp`, src: `${G}token_kryuk.webp`, scale: 0.96, size: 1 },
    "Тихий Сол": { img: `${G}sol.webp`, src: `${G}token_sol.webp`, scale: 0.96, size: 1 },
    "Варро, матрос пусковой команды": { img: `${G}varro.webp`, src: `${G}token_varro.webp`, scale: 0.96, size: 1 },
    "Череп-протоколист": { img: `${M}02_guard_post/servo_skull_token.webp`, src: `${M}02_guard_post/servo_skull.webm`, scale: 2, size: 1 },
  };
  const out = { actors: 0, tokens: 0 };
  for (const [name, n] of Object.entries(NPC)) {
    const a = game.actors.find(x => x.name === name);
    if (!a) { log(`«${name}»: в мире ещё нет — модуль поставит правильно при первом показе`); continue; }
    const t = a.prototypeToken, data = {};
    if (a.img !== n.img) data.img = n.img;
    if (t.texture.src !== n.src) data["prototypeToken.texture.src"] = n.src;
    if (t.texture.scaleX !== n.scale || t.texture.scaleY !== n.scale) { data["prototypeToken.texture.scaleX"] = n.scale; data["prototypeToken.texture.scaleY"] = n.scale; }
    if (t.width !== n.size || t.height !== n.size) { data["prototypeToken.width"] = n.size; data["prototypeToken.height"] = n.size; }
    if (n.rotate && t.lockRotation !== false) data["prototypeToken.lockRotation"] = false;
    const what = Object.keys(data).map(k => k.split(".").pop()).join(", ");
    if (what) { await a.update(data); out.actors++; log(`актёр «${name}»: ${what}`); }
  }
  for (const scene of game.scenes) {
    const upd = [];
    for (const tok of scene.tokens) {
      const n = NPC[tok.actor?.name] ?? NPC[String(tok.name ?? "").replace(/\s+\d+$/, "")];
      if (!n) continue;
      const u = { _id: tok.id };
      if (tok.texture.src !== n.src) u["texture.src"] = n.src;
      if (tok.texture.scaleX !== n.scale || tok.texture.scaleY !== n.scale) { u["texture.scaleX"] = n.scale; u["texture.scaleY"] = n.scale; }
      if (tok.width !== n.size || tok.height !== n.size) {
        const gs = scene.grid?.size || 128, d = (n.size - tok.width) * gs / 2;
        Object.assign(u, { width: n.size, height: n.size, x: Math.round((tok.x - d) / gs) * gs, y: Math.round((tok.y - d) / gs) * gs });
      }
      if (n.rotate && tok.lockRotation !== false) u.lockRotation = false;
      if (Object.keys(u).length > 1) upd.push(u);
    }
    if (upd.length) { await scene.updateEmbeddedDocuments("Token", upd); out.tokens += upd.length; log(`${scene.name}: поправлено токенов — ${upd.length}`); }
  }
  ui.notifications.info(`Персонажи акта I: актёров ${out.actors}, токенов ${out.tokens}.`);
  return out;
}
