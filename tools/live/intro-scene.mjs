/* «Непреклонный» 3.6.8 — стартовый экран: сцена «Заставка». Пока она открыта, модуль поверх холста показывает горящий
   крейсер во весь экран (видео по кругу) и надпись «Последний курс «Непреклонного»»; фон самой сцены — кадр из ролика.
   Гул крейсера — плейлист «Непреклонный · заставка», играет при активации сцены.
   Сцена становится активной: все, кто заходит в мир, видят заставку. «Начать акт» уводит в камеры и глушит звук.
   Ничего не удаляет. */
export default async function ({ log }) {
  const MOD = "nepreklonny-40k", base = `modules/${MOD}/`;
  const V = base + "maps/00_intro/intro_poster_1920x1088.webp", SND = base + "sounds/intro/intro_cruiser.ogg", THUMB = base + "maps/00_intro/intro_thumb.webp";
  const PL = "Непреклонный · заставка";
  let pl = game.playlists.getName(PL);
  if (!pl) { pl = await Playlist.create({ name: PL, sounds: [{ name: "Горящий крейсер", path: SND, repeat: true, volume: 0.5 }] }); log(`плейлист «${PL}» создан`); }
  let snd = pl.sounds.find(s => s.path === SND) ?? pl.sounds.contents[0];
  if (!snd) { [snd] = await pl.createEmbeddedDocuments("PlaylistSound", [{ name: "Горящий крейсер", path: SND, repeat: true, volume: 0.5 }]); }
  const data = {
    name: "Заставка", navName: "Заставка", navigation: true, navOrder: -100,
    width: 1920, height: 1088, padding: 0, backgroundColor: "#000000", background: { src: V }, thumb: THUMB,
    grid: { type: CONST.GRID_TYPES.GRIDLESS, size: 128 }, tokenVision: false, fog: { exploration: false },
    environment: { darknessLevel: 0 }, initial: { x: 960, y: 544, scale: 1 },
    playlist: pl.id, playlistSound: snd.id, flags: { [MOD]: { scene: "intro" } },
  };
  let scene = game.scenes.find(s => s.flags?.[MOD]?.scene === "intro");
  if (!scene) { scene = await Scene.create(data); log("сцена «Заставка» создана"); }
  else { await scene.update(data); log("сцена «Заставка» обновлена"); }
  await scene.activate();
  log("заставка активна: все игроки на ней");
  ui.notifications.info("Стартовый экран: горящий крейсер. «Начать акт» уведёт всех в камеры.");
  return { scene: scene.id, playlist: pl.id };
}
