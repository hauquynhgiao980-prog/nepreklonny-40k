/* «Непреклонный» 3.6.6 — сначала враги и NPC акта I в мире, потом окно сброса игры (можно отменить).
   Враги и NPC: иконки способностей и вещей, тексты стрелка и вожака без следов основ
   (пират, берсерк), новый актёр «Культист с лазганом». Меняет предметы этих актёров и их токенов на сценах. Ничего не удаляет,
   кроме лишнего действия у «Выучки Гвардии» (раньше это было очарование пирата). */
const MOD = "nepreklonny-40k", T1 = `modules/${MOD}/icons/gen/act1/`, LAS = "Культист с лазганом";
const FIX = {"Культист-ренегат": {"Ритуальный нож": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_knife.webp"}, "Лоскутная броня": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_rags.webp"}, "Ради Тёмных Богов": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_dark_gods.webp"}, "Толпа": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_mob.webp"}}, "Крюк": {"Ритуальный нож": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_knife.webp"}, "Лоскутная броня": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_rags.webp"}, "Ради Тёмных Богов": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_dark_gods.webp"}, "Толпа": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_mob.webp"}}, "Тихий Сол": {"Ритуальный нож": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_knife.webp"}, "Лоскутная броня": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_rags.webp"}, "Ради Тёмных Богов": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_dark_gods.webp"}, "Толпа": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_mob.webp"}}, "Культист с лазганом": {"Ритуальный нож": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_knife.webp"}, "Лоскутная броня": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_rags.webp"}, "Ради Тёмных Богов": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_dark_gods.webp"}, "Толпа": {"img": "modules/nepreklonny-40k/icons/gen/act1/cult_mob.webp"}}, "Предатель-стрелок": {"Бронежилет с сорванной аквилой": {"img": "modules/nepreklonny-40k/icons/claude/gear40k/G49kaByMgDJiPADk.webp"}, "Мультиатака": {"img": "modules/nepreklonny-40k/icons/gen/act1/shooter_multi.webp", "system.description.value": "<p>Предатель совершает две атаки: из автогана или штык-ножом, в любом сочетании.</p>"}, "Штык-нож": {"img": "modules/nepreklonny-40k/icons/gen/act1/shooter_bayonet.webp", "system.description.chat": "<p>[[lookup @name]] бьёт штык-ножом!</p>"}, "Выучка Гвардии": {"img": "modules/nepreklonny-40k/icons/gen/act1/shooter_drill.webp", "system.description.value": "<p>Бывший гвардеец: дальнобойные атаки, сделанные вплотную к врагу, предатель совершает без помехи.</p>", "system.description.chat": "", "system.activities": {}}, "Подавляющий огонь": {"img": "modules/nepreklonny-40k/icons/gen/act1/shooter_suppress.webp"}}, "Отмеченный Хаосом": {"Цепной топор": {"img": "modules/nepreklonny-40k/icons/gen/act1/leader_axe.webp", "system.description.chat": "<p>Отмеченный рубит цепным топором!</p>"}, "Шипастая броня": {"img": "modules/nepreklonny-40k/icons/gen/act1/leader_armor.webp"}, "Жажда крови": {"img": "modules/nepreklonny-40k/icons/gen/act1/leader_bloodlust.webp", "replace": ["Пока берсерк", "Пока отмеченный"]}, "Кровь для Тёмных богов": {"img": "modules/nepreklonny-40k/icons/gen/act1/leader_blood.webp"}, "Презрение к колдовству": {"img": "modules/nepreklonny-40k/icons/gen/act1/leader_scorn.webp"}}, "Сторожевая турель палубы": {"Очередь": {"img": "modules/nepreklonny-40k/icons/gen/act1/turret_burst.webp"}, "Бьёт по движению": {"img": "modules/nepreklonny-40k/icons/gen/act1/turret_motion.webp"}, "Как обезвредить": {"img": "modules/nepreklonny-40k/icons/gen/act1/turret_disarm.webp"}}, "Череп-протоколист": {"Запись допроса": {"img": "modules/nepreklonny-40k/icons/gen/act1/skull_record.webp"}}, "Варро, матрос пусковой команды": {"Хромает": {"img": "modules/nepreklonny-40k/icons/gen/act1/varro_limp.webp"}, "Образок паствы": {"img": "modules/nepreklonny-40k/icons/gen/act1/varro_icon.webp"}}};
const FROM = { "Культист-ренегат": "enemies40k", "Предатель-стрелок": "enemies40k", "Отмеченный Хаосом": "enemies40k" };

function itemUpdates(actor) {
  const map = FIX[actor.name] || {}, out = [];
  for (const it of actor.items) {
    const f = map[it.name]; if (!f) continue;
    const u = { _id: it.id };
    for (const [k, v] of Object.entries(f)) {
      if (k === "replace") { const d = it.system.description?.value ?? ""; if (d.includes(v[0])) u["system.description.value"] = d.replaceAll(v[0], v[1]); }
      else if (k === "system.activities") { for (const id of Object.keys(it._source.system.activities ?? {})) u[`system.activities.-=${id}`] = null; }
      else if (foundry.utils.getProperty(it._source, k) !== v) u[k] = v;
    }
    if (Object.keys(u).length > 1) out.push(u);
  }
  return out;
}

async function folderId() {
  let f = game.folders.find(f => f.type === "Actor" && f.name === "Акт I — персонажи мастера");
  f ??= await Folder.create({ name: "Акт I — персонажи мастера", type: "Actor", color: "#3a0f3a" });
  return f.id;
}

async function lasCultist(base) {
  const gear = game.packs.get(`${MOD}.gear40k`);
  const gid = gear && (await gear.getIndex()).find(e => e.name === "Лазган")?._id;
  const gun = gid ? (await gear.getDocument(gid)).toObject() : null;
  if (!gun) throw new Error("В компендиуме «Снаряжение» нет лазгана.");
  delete gun._id; delete gun.folder;
  gun.system.properties = ["two"];
  gun.system.uses = { spent: 0, max: "", recovery: [] }; gun.system.equipped = true; gun.system.proficient = 1;
  for (const [k, v] of Object.entries(gun.system.activities ?? {})) if (v.type !== "attack") delete gun.system.activities[k];
  gun.system.description.value = "<p>Лазган убитого гвардейца. Культист стреляет из него, а нож держит под рукой.</p>";
  const data = base.toObject(); delete data._id;
  data.name = LAS; data.folder = base.folder?.id ?? null; data.img = `${T1}kultist_g.webp`;
  data.system.details.cr = 0.25;
  data.items = [...data.items.map(i => { delete i._id; return i; }), gun];
  if (data.prototypeToken) { data.prototypeToken.name = LAS; data.prototypeToken.texture.src = `${T1}token_kultist_g.webp`; }
  return Actor.create(data);
}

export default async function ({ log }) {
  let n = 0;
  for (const [name, pack] of Object.entries(FROM)) {
    if (game.actors.find(a => a.name === name)) continue;
    const p = game.packs.get(`${MOD}.${pack}`), id = p && (await p.getIndex()).find(e => e.name === name)?._id;
    if (!id) { log(`«${name}» нет ни в мире, ни в компендиуме`); continue; }
    await game.actors.importFromCompendium(p, id, { folder: await folderId() });
    log(`«${name}» взят из компендиума в папку «Акт I — персонажи мастера»`);
  }
  for (const a of game.actors.filter(a => FIX[a.name] && a.name !== LAS)) {
    const u = itemUpdates(a); if (!u.length) continue;
    await a.updateEmbeddedDocuments("Item", u); n += u.length; log(`${a.name}: ${u.length}`);
  }
  let las = game.actors.find(a => a.name === LAS);
  if (!las) {
    const base = game.actors.find(a => a.name === "Культист-ренегат");
    if (base) { las = await lasCultist(base); log("создан «Культист с лазганом»"); }
  } else { const u = itemUpdates(las); if (u.length) { await las.updateEmbeddedDocuments("Item", u); n += u.length; } }
  for (const scene of game.scenes) for (const t of scene.tokens) {
    if (t.actorLink || !t.actor || !FIX[t.actor.name] || !t.delta?.items?.size) continue;
    const u = itemUpdates(t.actor); if (!u.length) continue;
    await t.actor.updateEmbeddedDocuments("Item", u); n += u.length; log(`${scene.name}: токен «${t.name}» — ${u.length}`);
  }
  ui.notifications.info(`Враги и NPC акта I: обновлено способностей и вещей — ${n}.`);
  // сброс игры к началу акта I: окно с выбором из модуля (scripts/dela/reset.mjs)
  const { resetDialog } = await import(`/modules/${MOD}/scripts/dela/reset.mjs?v=${Date.now()}`);
  const res = await resetDialog();
  if (res) for (const l of res) log(l); else log("сброс отменён");
  return { items: n, lasgun: !!las, reset: !!res };
}
