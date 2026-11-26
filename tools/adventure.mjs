// Собирает приключение «Акт I» одним документом Adventure: сцены, NPC, прегены, журнал, макросы — в папках.
// Мастер импортирует всё одной кнопкой «Импортировать приключение».
// Запуск из корня модуля после build_act1.py: node tools/adventure.mjs  (нужен @foundryvtt/foundryvtt-cli)
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";
import fs from "node:fs";
import crypto from "node:crypto";

const MOD = "nepreklonny-40k";
const PATHS = Object.fromEntries(JSON.parse(fs.readFileSync("module.json", "utf8")).packs.map(p => [p.name, p.path]));
const fid = (...parts) => {     // детерминированный id из 16 символов, как в build_act1.py
  const h = crypto.createHash("sha256").update(parts.join("|")).digest();
  const A = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return [...h.subarray(0, 16)].map(b => A[b % A.length]).join("");
};
const strip = o => {            // внутри приключения документы лежат целиком, без ключей LevelDB
  if (Array.isArray(o)) return o.map(strip);
  if (o && typeof o === "object") { const r = {}; for (const [k, v] of Object.entries(o)) if (k !== "_key") r[k] = strip(v); return r; }
  return o;
};
const readDir = dir => fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort().map(f => JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8")));
const fromPack = async name => {
  // копия пака: чтение LevelDB переписывает его файлы, а пак в репозитории трогать нельзя
  const copy = `/tmp/adv-db-${name}`, tmp = `/tmp/adv-${name}`;
  for (const d of [copy, tmp]) fs.rmSync(d, { recursive: true, force: true });
  fs.cpSync(PATHS[name], copy, { recursive: true });
  await extractPack(copy, tmp, { log: false });
  return readDir(tmp);
};

const AID = fid("adventure", "act1");
const folder = (key, name, type, color, sort) => ({ _id: fid("folder", "adv", key), name, type, color, sorting: "m", sort, folder: null, description: "", flags: {} });
const F = {
  scene: folder("scene", "Акт I — сцены", "Scene", "#3a0f3a", 100),
  npc: folder("npc", "Акт I — персонажи мастера", "Actor", "#3a0f3a", 100),
  pc: folder("pc", "Прегены «Непреклонного»", "Actor", "#5b1a1a", 200),
  journal: folder("journal", "Акт I", "JournalEntry", "#3a0f3a", 100),
  macro: folder("macro", "Акт I", "Macro", "#3a0f3a", 100),
};
const inFolder = (docs, f) => docs.map(d => ({ ...strip(d), folder: f._id }));

const scenes = inFolder(readDir("src/act1-scenes"), F.scene);
const npcs = inFolder(readDir("src/act1-actors"), F.npc);
const pcs = inFolder(await fromPack("heroes40k"), F.pc);
const journal = inFolder(readDir("src/act1-journal"), F.journal);
const macros = inFolder(readDir("src/act1-macros"), F.macro);

const adv = {
  _id: AID, name: "Последний курс «Непреклонного» — акт I",
  img: `modules/${MOD}/maps/01_prison_block/preview.jpg`,
  caption: "Ваншот по Warhammer 40 000 на D&D 2024. Пять сцен акта I, NPC, прегены, текст модуля и макросы.",
  description: "<p>Всё для акта I одной кнопкой: сцены со стенами, дверями, светом, звуками и зонами, персонажи мастера, десять прегенов, текст модуля с раздатками и макросы сцен. Документы раскладываются по папкам «Акт I».</p><p>Если что-то уже импортировано из отдельных компендиумов, импорт обновит это на месте.</p>",
  scenes, actors: [...npcs, ...pcs], items: [], journal, tables: [], macros, cards: [], playlists: [], combats: [],
  folders: Object.values(F), sort: 0, flags: {},
  _stats: { coreVersion: "13.351", systemId: "dnd5e", systemVersion: "5.3.3" },
  _key: `!adventures!${AID}`,
};
const src = "src/act1-adventure";
fs.rmSync(src, { recursive: true, force: true }); fs.mkdirSync(src, { recursive: true });
fs.writeFileSync(`${src}/act1_${AID}.json`, JSON.stringify(adv, null, 1));
const out = PATHS["act1-adventure"] ?? "packs/act1-adventure";
fs.rmSync(out, { recursive: true, force: true });
await compilePack(src, out, { log: false });
console.log("adventure", out, { scenes: scenes.length, actors: adv.actors.length, journal: journal.length, macros: macros.length });
