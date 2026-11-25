// Компилирует src/<pack> (JSON) в packs/<pack> (LevelDB) для Foundry v13.
// Запуск из корня репозитория: node tools/compile.mjs   (нужен пакет @foundryvtt/foundryvtt-cli)
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import fs from "node:fs";
const PACKS = ["act1-scenes", "act1-journal", "act1-actors", "act1-macros", "enemies40k"];
for (const p of PACKS) {
  fs.rmSync(`packs/${p}`, { recursive: true, force: true });
  await compilePack(`src/${p}`, `packs/${p}`, { log: false });
  console.log("собран", p, fs.readdirSync(`src/${p}`).length, "документов");
}
