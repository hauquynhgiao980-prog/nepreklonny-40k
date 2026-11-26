/* «Непреклонный» 3.4.3 — для уже импортированного мира:
   1) портреты и токены NPC и врагов акта I: Крюк, Тихий Сол, Варро, культисты, стрелок, Отмеченный Хаосом, Нерождённый,
      турель (только портрет); у культистов на сцене лица чередуются;
   2) макросы сервиторов в папке «Акт I» (создаёт, если их нет; иначе обновляет код);
   3) подсказки мастеру у выходов со сцен: убирает лишний знак «$» перед текстом.
   Ничего не удаляет. */
export default async function ({ log }) {
  const T = "modules/nepreklonny-40k/icons/gen/act1/";
  const FACES = ["kultist_a", "kultist_b", "kultist_c", "kultist_d", "kultist_e", "kultist_f", "kultist_g"].map(k => `${T}token_${k}.webp`);
  const SET = [
    { name: "Крюк", img: "kryuk", tok: "token_kryuk", size: 1, disp: 0 },
    { name: "Тихий Сол", img: "sol", tok: "token_sol", size: 1, disp: 0 },
    { name: "Варро, матрос пусковой команды", img: "varro", tok: "token_varro", size: 1, disp: 0 },
    { name: "Культист-ренегат", img: "kultist_a", tok: "token_kultist_a", size: 1 },
    { name: "Предатель-стрелок", img: "strelok", tok: "token_strelok", size: 1 },
    { name: "Отмеченный Хаосом", img: "otmechenny", tok: "token_otmechenny", size: 1 },
    { name: "Нерождённый", img: "nerozhdenny", tok: "token_nerozhdenny", size: 2 },
    { name: "Сторожевая турель палубы", img: "turret", tok: null, size: 2 },
  ];
  const report = [];
  for (const s of SET) {
    const tex = { src: `${T}${s.tok}.webp`, scaleX: 1, scaleY: 1, fit: "contain" };
    for (const a of game.actors.filter(x => x.name === s.name)) {
      if (!s.tok) { await a.update({ img: `${T}${s.img}.webp` }); report.push({ actor: a.name }); continue; }   // турель: на карте остаётся вид сверху
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

  // макросы сервиторов
  const MACROS = [
 {
  "name": "Сервитор смотрит",
  "img": "icons/svg/eye.svg",
  "command": "const api = game.modules.get(\"nepreklonny-40k\")?.api?.dela?.servitor;\nif (!api) return ui.notifications.warn(\"Модуль «Непреклонный» не загружен.\");\nif (!game.user.isGM) return ui.notifications.warn(\"Этот макрос запускает мастер.\");\n// Сервитор смотрит на выделенных героев: экран «Я ТЕБЯ ВИЖУ» (или «ПРОСНИСЬ»), потом спасбросок Мудрости, Сл 12.\nconst ids = (canvas.tokens?.controlled ?? []).map(t => t.actor?.id).filter(Boolean);\nif (!ids.length) return ui.notifications.warn(\"Выделите токен героя, который подошёл к сервитору.\");\nawait api.look(ids);\n"
 },
 {
  "name": "Все сервиторы оборачиваются",
  "img": "icons/svg/terror.svg",
  "command": "const api = game.modules.get(\"nepreklonny-40k\")?.api?.dela?.servitor;\nif (!api) return ui.notifications.warn(\"Модуль «Непреклонный» не загружен.\");\nif (!game.user.isGM) return ui.notifications.warn(\"Этот макрос запускает мастер.\");\n// Все сервиторы блока разом поворачиваются к героям: экран и спасбросок у каждого.\nawait api.look();\n"
 },
 {
  "name": "Снять испуг",
  "img": "icons/svg/sun.svg",
  "command": "const api = game.modules.get(\"nepreklonny-40k\")?.api?.dela?.servitor;\nif (!api) return ui.notifications.warn(\"Модуль «Непреклонный» не загружен.\");\nif (!game.user.isGM) return ui.notifications.warn(\"Этот макрос запускает мастер.\");\n// Снять испуг со всех героев.\nawait api.calm();\n"
 }
];
  let folder = game.folders.find(f => f.type === "Macro" && f.name === "Акт I");
  for (const m of MACROS) {
    const w = game.macros.find(x => x.name === m.name);
    if (w) { await w.update({ command: m.command, img: m.img }); report.push({ macro: m.name, updated: true }); continue; }
    folder ??= await Folder.create({ name: "Акт I", type: "Macro" });
    await Macro.create({ name: m.name, type: "script", img: m.img, command: m.command, folder: folder.id });
    report.push({ macro: m.name, created: true });
  }
  log(`макросы: ${MACROS.map(m => m.name).join(", ")}`);

  // подсказки у выходов: «Имя $у выхода» → «Имя у выхода»
  let fixed = 0;
  for (const scene of game.scenes.filter(x => x.flags?.["nepreklonny-40k"]?.scene)) {
    for (const region of scene.regions ?? []) {
      for (const b of region.behaviors ?? []) {
        const src = b.system?.source;
        if (b.type === "executeScript" && typeof src === "string" && src.includes("</b> $")) {
          await b.update({ "system.source": src.replaceAll("</b> $", "</b> ") }); fixed++;
        }
      }
    }
  }
  report.push({ hintsFixed: fixed });
  log(`подсказок у выходов исправлено: ${fixed}`);
  ui.notifications.info("Портреты обновлены, макросы сервиторов в папке «Акт I».");
  return report;
}
