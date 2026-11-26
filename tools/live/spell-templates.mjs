/* «Непреклонный» 3.4.3 — шаблоны областей у заклинаний в уже импортированном мире.
   У «Пасти варпа» и ещё пяти заклинаний действия перекрывали цель и теряли шаблон области: при касте шаблон не ставился.
   Действие копирует шаблон заклинания в такие действия — у заклинаний персонажей мира и в папке предметов. Ничего не удаляет. */
export default async function ({ log }) {
  const report = [];
  const fixItem = async (item, owner) => {
    if (item.type !== "spell") return;
    const it = item.system?.target?.template;
    if (!it?.type) return;
    const upd = {};
    for (const a of item.system.activities ?? []) {
      const t = a.target;
      if (t?.override && !t.template?.type) {
        upd[`system.activities.${a.id}.target.template`] = { count: it.count ?? "", contiguous: !!it.contiguous, type: it.type, size: it.size ?? "", width: it.width ?? "", height: it.height ?? "", units: it.units || "ft" };
      }
    }
    if (Object.keys(upd).length) { await item.update(upd); report.push({ owner, spell: item.name, activities: Object.keys(upd).length }); }
  };
  for (const actor of game.actors) for (const item of actor.items) await fixItem(item, actor.name);
  for (const item of game.items) await fixItem(item, "папка предметов");
  log(report.length ? report.map(r => `${r.owner}: ${r.spell} (${r.activities})`).join("; ") : "чинить нечего");
  ui.notifications.info(report.length ? `Шаблоны областей восстановлены: ${report.length}.` : "Шаблоны областей уже в порядке.");
  return report;
}
