/* «Непреклонный» 3.4.0 — разметка пяти сцен акта I: стены и двери, свет, звуки, зоны, миниатюры,
   недостающие тайлы (череп-протоколист в допросной) и макросы акта I в мире.
   Сцены ищутся в мире по флагу nepreklonny-40k.scene или по имени. Чего нет — создаётся целиком.
   Прежняя разметка (флаг markup) снимается и ставится заново; токены, тайлы и стены,
   нарисованные вручную, не трогаются. Если на сцене уже есть ручные стены, наши стены не ставятся. */
export default async function ({ log }) {
  const MOD = "nepreklonny-40k";
  const base = "claude-live/dl/act1-340/";
  const get = async f => (await fetch(`${foundry.utils.getRoute(base + f)}?v=${Date.now()}`, { cache: "no-store" })).json();
  const strip = d => {
    const o = foundry.utils.deepClone(d); delete o._key;
    if (Array.isArray(o.behaviors)) o.behaviors = o.behaviors.map(b => { const c = { ...b }; delete c._key; return c; });
    return o;
  };
  const isOurs = d => !!d.flags?.[MOD]?.markup;
  const report = [];
  for (const key of ["cells", "post", "hall", "lifeboats", "gallery"]) {
    const data = await get(`${key}.json`);
    let scene = game.scenes.find(s => s.flags?.[MOD]?.scene === key) ?? game.scenes.find(s => s.name === data.name);
    if (!scene) {
      const doc = strip(data);
      delete doc._stats;
      for (const k of ["walls", "lights", "sounds", "regions", "tiles", "tokens", "drawings", "notes", "templates"]) doc[k] = (doc[k] ?? []).map(strip);
      scene = await Scene.create(doc, { keepId: !game.scenes.has(doc._id) });
      log(`создана сцена «${scene.name}»`);
      report.push({ scene: scene.name, created: true, walls: scene.walls.size, lights: scene.lights.size, sounds: scene.sounds.size, regions: scene.regions.size });
    } else {
      for (const [type, coll] of [["Wall", "walls"], ["AmbientLight", "lights"], ["AmbientSound", "sounds"], ["Region", "regions"]]) {
        const ids = scene[coll].filter(isOurs).map(d => d.id);
        if (ids.length) await scene.deleteEmbeddedDocuments(type, ids);
      }
      const manual = scene.walls.size;
      const r = { scene: scene.name, created: false };
      if (!manual) r.walls = (await scene.createEmbeddedDocuments("Wall", data.walls.map(strip), { keepId: true })).length;
      else { r.walls = 0; r.skippedWalls = `на сцене уже ${manual} стен, нарисованных вручную`; }
      r.lights = (await scene.createEmbeddedDocuments("AmbientLight", data.lights.map(strip), { keepId: true })).length;
      r.sounds = (await scene.createEmbeddedDocuments("AmbientSound", data.sounds.filter(isOurs).map(strip), { keepId: true })).length;
      try { r.regions = (await scene.createEmbeddedDocuments("Region", data.regions.map(strip), { keepId: true })).length; }
      catch (e) { r.regions = 0; r.regionError = String(e?.message ?? e); }
      // тайлы пака, которых в мире ещё нет (по роли): череп-протоколист и т. п.
      const roles = new Set(scene.tiles.map(t => t.flags?.[MOD]?.role).filter(Boolean));
      const add = (data.tiles ?? []).filter(t => t.flags?.[MOD]?.role && !roles.has(t.flags[MOD].role)).map(strip);
      if (add.length) r.tilesAdded = (await scene.createEmbeddedDocuments("Tile", add, { keepId: true })).map(t => t.flags?.[MOD]?.role);
      const upd = { environment: data.environment };
      if (data.thumb) upd.thumb = data.thumb;
      await scene.update(upd);
      log(`«${scene.name}»: стен ${r.walls}, света ${r.lights}, звуков ${r.sounds}, зон ${r.regions}${r.tilesAdded ? `, тайлы: ${r.tilesAdded.join(", ")}` : ""}`);
      report.push(r);
    }
    // раздвижные двери: в паке их нет, ставим здесь, если версия Foundry принимает
    const doors = scene.walls.filter(w => w.door && isOurs(w));
    try {
      await scene.updateEmbeddedDocuments("Wall", doors.map(w => ({ _id: w.id,
        animation: { type: "slide", double: true, direction: 1, duration: 700, flip: false, strength: 1 } })));
      report.at(-1).doorAnim = doors.length;
    } catch (e) { report.at(-1).doorAnim = `не принято: ${e?.message ?? e}`; }
  }
  // миниатюра у остальных сцен модуля (пролог): снять с самой сцены
  for (const scene of game.scenes.filter(s => s.flags?.[MOD]?.scene && !s.thumb)) {
    try { const t = await scene.createThumbnail(); await scene.update({ thumb: t.thumb }); report.push({ scene: scene.name, thumb: "снята" }); }
    catch (e) { report.push({ scene: scene.name, thumb: `не вышло: ${e?.message ?? e}` }); }
  }
  // макросы акта I: обновить, а если их нет в мире — создать в папке «Акт I»
  const list = await get("macros.json");
  let folder = game.folders.find(f => f.type === "Macro" && f.name === "Акт I");
  for (const m of list) {
    const w = game.macros.find(x => x.name === m.name);
    if (w) { await w.update({ command: m.command }); report.push({ macro: m.name, updated: true }); continue; }
    folder ??= await Folder.create({ name: "Акт I", type: "Macro" });
    await Macro.create({ name: m.name, type: "script", img: m.img, command: m.command, folder: folder.id });
    report.push({ macro: m.name, created: true });
  }
  log(`макросы: ${list.map(m => m.name).join(", ")}`);
  ui.notifications.info("Разметка акта I поставлена: стены, двери, свет, звуки, зоны, миниатюры, макросы.");
  return report;
}
