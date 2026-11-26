// Компилирует src/<pack> (JSON) в packs/<pack> (LevelDB) для Foundry v13.
// Запуск из корня репозитория: node tools/compile.mjs   (нужен пакет @foundryvtt/foundryvtt-cli)
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import fs from "node:fs";
// Папка пака берётся из module.json: при обновлении на работающем сервере
// пак кладут в новую папку (например, act1-scenes-340), чтобы не трогать открытую базу.
const PATHS = Object.fromEntries(JSON.parse(fs.readFileSync("module.json", "utf8")).packs.map(p => [p.name, p.path]));
const PACKS = ["act1-scenes", "act1-journal", "act1-actors", "act1-macros", "enemies40k"];
for (const p of PACKS) {
  const out = PATHS[p] ?? `packs/${p}`;
  fs.rmSync(out, { recursive: true, force: true });
  await compilePack(`src/${p}`, out, { log: false });
  console.log("собран", p, fs.readdirSync(`src/${p}`).length, "документов");
}
