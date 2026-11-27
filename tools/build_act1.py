# -*- coding: utf-8 -*-
"""Собирает исходники компендиумов акта I (JSON для @foundryvtt/foundryvtt-cli):
src/act1-scenes, src/act1-journal, src/act1-actors, src/act1-macros; правит src/enemies40k.
Потом: node tools/compile.mjs — компилирует src/* в packs/*.
Запуск из корня репозитория: python3 tools/build_act1.py"""
import copy, glob, hashlib, json, os, re, shutil, string, sys
import markdown

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from macros import MACROS

MOD = 'nepreklonny-40k'
M = f'modules/{MOD}/maps/'
SRC = os.path.join(ROOT, 'src')
STATS = {"coreVersion": "13.351", "systemId": "dnd5e", "systemVersion": "5.3.3", "createdTime": 1764072000000,
         "modifiedTime": 1764072000000, "lastModifiedBy": None, "compendiumSource": None, "duplicateSource": None}
AL = string.ascii_letters + string.digits


def fid(*parts):
    """Детерминированный 16-символьный id Foundry."""
    h = hashlib.sha256('|'.join(parts).encode()).digest()
    return ''.join(AL[b % len(AL)] for b in h[:16])


def reset(pack):
    d = os.path.join(SRC, pack)
    shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    return d


def dump(d, name, doc):
    safe = re.sub(r'[^\w\-]+', '_', name)[:40]
    with open(os.path.join(d, f'{safe}_{doc["_id"]}.json'), 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)


# ---------------------------------------------------------------- сцены
def tile(sid, tid, role, src, x, y, w, h, hidden, sort, video=None, locked=True):
    t = {"_id": tid, "texture": {"src": src, "anchorX": 0.5, "anchorY": 0.5, "offsetX": 0, "offsetY": 0, "fit": "fill",
                                 "scaleX": 1, "scaleY": 1, "rotation": 0, "tint": "#ffffff", "alphaThreshold": 0.75},
         "width": w, "height": h, "x": x, "y": y, "elevation": 0, "sort": sort, "rotation": 0, "alpha": 1,
         "hidden": hidden, "locked": locked, "restrictions": {"light": False, "weather": False},
         "occlusion": {"mode": 0, "alpha": 0}, "flags": {MOD: {"role": role}}, "_key": f"!scenes.tiles!{sid}.{tid}"}
    if video:
        t["video"] = video
    return t


def sound(sid, name, path, x, y, radius_ft, volume, walls=False):
    snd_id = fid('sound', sid, name, str(x), str(y))
    return {"_id": snd_id, "x": x, "y": y, "elevation": 0, "radius": radius_ft, "path": path, "repeat": True,
            "volume": volume, "walls": walls, "easing": True, "hidden": False, "flags": {MOD: {"role": name}},
            "_key": f"!scenes.sounds!{sid}.{snd_id}"}


def scene(key, name, nav, w, h, bg, tiles=(), sounds=()):
    sid = fid('scene', key)
    return sid, {
        "_id": sid, "name": name, "active": False, "navigation": True, "navOrder": nav, "navName": "",
        "background": {"src": bg, "anchorX": 0, "anchorY": 0, "offsetX": 0, "offsetY": 0, "fit": "fill",
                       "scaleX": 1, "scaleY": 1, "rotation": 0, "tint": "#ffffff", "alphaThreshold": 0},
        "foreground": None, "thumb": None, "width": w, "height": h, "padding": 0,
        "initial": {"x": w // 2, "y": h // 2, "scale": 0.5}, "backgroundColor": "#000000",
        "grid": {"type": 1, "size": 128, "style": "solidLines", "thickness": 1, "color": "#000000", "alpha": 0.15,
                 "distance": 5, "units": "ft"},
        "tokenVision": True, "environment": {"darknessLevel": 0, "globalLight": {"enabled": True}},
        "drawings": [], "tokens": [], "lights": [], "notes": [], "sounds": list(sounds), "regions": [],
        "templates": [], "tiles": list(tiles), "walls": [], "playlist": None, "playlistSound": None,
        "journal": None, "journalEntryPage": None, "weather": "", "folder": None, "sort": nav * 100,
        "ownership": {"default": 0}, "flags": {MOD: {"scene": key}}, "_stats": STATS, "_key": f"!scenes!{sid}"}


ENV = {"darknessLevel": 0.35, "darknessLock": False,
       "globalLight": {"enabled": True, "alpha": 0.5, "bright": False, "color": None, "coloration": 1, "luminosity": 0,
                       "saturation": 0, "contrast": 0, "shadows": 0, "darkness": {"min": 0, "max": 0.6}}}


THUMBS = {k: M + d + '/thumb.webp' for k, d in (('cells', '01_prison_block'), ('post', '02_guard_post'), ('hall', '03_transit_hall'),
                                                 ('lifeboats', '04_lifeboat_deck'), ('gallery', '05_gallery'))}


def apply_markup(s):
    """Стены, свет, звуки и зоны из tools/markup/<сцена>.json (их собирает конвейер tools/markup/pipeline)."""
    key = s["flags"][MOD]["scene"]
    path = os.path.join(ROOT, 'tools', 'markup', f'{key}.json')
    if not os.path.exists(path):
        return s
    m = json.load(open(path, encoding='utf-8'))
    sid = s["_id"]
    s["environment"] = copy.deepcopy(ENV)
    walls = []
    for i, w in enumerate(m["walls"]):
        wid = fid('wall', key, str(i), *map(str, w["c"]))
        doc = {k: v for k, v in w.items() if k not in ('role', 'states', 'on')}
        fl = {"markup": True, **({"role": w["role"]} if w.get("role") else {}), **({"states": w["states"], "on": w["on"]} if w.get("states") else {})}
        doc.update({"_id": wid, "flags": {MOD: fl}, "_key": f"!scenes.walls!{sid}.{wid}"})
        walls.append(doc)
    s["walls"] = walls
    lights = []
    for i, l in enumerate(m["lights"]):
        lid = fid('light', key, str(i), str(l["x"]), str(l["y"]))
        lights.append({"_id": lid, "x": l["x"], "y": l["y"], "elevation": 0, "rotation": 0, "walls": True, "vision": False,
                       "hidden": l["hidden"], "config": l["config"], "flags": {MOD: {"role": l["role"], "markup": True}},
                       "_key": f"!scenes.lights!{sid}.{lid}"})
    s["lights"] = lights
    for z in m["sounds"]:
        snd_id = fid('sound', sid, z["role"], str(z["x"]), str(z["y"]))
        s["sounds"].append({"_id": snd_id, "x": z["x"], "y": z["y"], "elevation": 0, "radius": z["radius"], "path": z["path"],
                            "repeat": True, "volume": z["volume"], "walls": z["walls"], "easing": True, "hidden": z["hidden"],
                            "flags": {MOD: {"role": z["role"], "markup": True}}, "_key": f"!scenes.sounds!{sid}.{snd_id}"})
    regions = []
    for i, r in enumerate(m["regions"]):
        rid = fid('region', key, str(i), r["name"])
        beh = []
        for j, b in enumerate(r["behaviors"]):
            bid = fid('behavior', key, str(i), str(j))
            beh.append({"_id": bid, "name": b["name"], "type": b["type"], "system": b["system"], "disabled": b.get("disabled", False),
                        "flags": {}, "_key": f"!scenes.regions.behaviors!{sid}.{rid}.{bid}"})
        regions.append({"_id": rid, "name": r["name"], "color": r["color"],
                        "shapes": [{"type": "polygon", "points": r["pts"], "hole": False}],
                        "elevation": {"bottom": None, "top": None}, "behaviors": beh, "visibility": 0, "locked": False,
                        "flags": {MOD: {"role": r["name"], "markup": True}}, "_key": f"!scenes.regions!{sid}.{rid}"})
    s["regions"] = regions
    th = THUMBS.get(key)
    if th: s["thumb"] = th
    return s


def build_scenes():
    d = reset('act1-scenes')
    out = []
    # пролог: видео мостика не входит в репозиторий — положите файл в maps/00_bridge/
    sid, s = scene('bridge', 'Пролог. Мостик', 0, 2176, 3840, M + '00_bridge/bridge_intact_2176x3840.mp4'); out.append(s)
    sid, s = scene('cells', '0. Тюремный блок', 1, 4608, 3072, M + '01_prison_block/cells8_anim_4608x3072.webm'); out.append(s)
    sid = fid('scene', 'post')
    snd = [sound(sid, 'vox', M + '02_guard_post/vox_imperator_zashishaet.ogg', 1750, 520, 40, 0.6)]
    # череп-протоколист парит в допросной между когитатором и койкой
    tl = [tile(sid, fid('tile', 'servo-skull'), 'servo-skull', M + '02_guard_post/servo_skull.webm', 1572, 322, 256, 256, False, 1,
               {"loop": True, "autoplay": True, "volume": 0})]
    _, s = scene('post', '1. Пост охраны', 2, 2304, 3072, M + '02_guard_post/post_guard_anim_2304x3072.webm', tiles=tl, sounds=snd); out.append(s)
    sid = fid('scene', 'hall'); P = M + '03_transit_hall/'
    tl = [tile(sid, fid('tile', 'zone'), 'zone', P + 'hall_breach_zone_anim_1248x2104.webm', 1056, 756, 1248, 2104, True, 1,
               {"loop": True, "autoplay": False, "volume": 0}),
          tile(sid, fid('tile', 'breach'), 'breach', P + 'hall_breach_piece_1152x1536.webm', 1152, 820, 1152, 1536, True, 2,
               {"loop": False, "autoplay": False, "volume": 0.8}),
          tile(sid, fid('tile', 'rip'), 'rip', P + 'hall_rip_piece_1152x1536.webm', 1152, 820, 1152, 1536, True, 3,
               {"loop": False, "autoplay": False, "volume": 0.8})]
    _, s = scene('hall', '2. Зал этапа', 3, 2304, 3072, P + 'hall_etap_anim_2304x3072.webm', tiles=tl); out.append(s)
    sid = fid('scene', 'lifeboats'); L = M + '04_lifeboat_deck/'
    tl = [tile(sid, fid('tile', 'turret-fire'), 'turret-fire', L + 'lifeboats_hall_fire_tile_1228x2536.webm', 600, 792, 1228, 2536, False, 1,
               {"loop": True, "autoplay": True, "volume": 0}),
          tile(sid, fid('tile', 'capsule7'), 'capsule7', L + 'lifeboats_capsule7_tile.png', 1775, 1380, 529, 644, False, 2),
          tile(sid, fid('tile', 'valve'), 'valve', L + 'lifeboats_valve_stopped_104.png', 160, 1186, 104, 104, True, 3)]
    snd = []
    for n, y in zip((5, 6, 7, 8, 9), (500, 1100, 1700, 2300, 2917)):
        snd.append(sound(sid, f'collar-slow-{n}', L + 'collar_beep_slow.ogg', 1795, y, 15, 0.5))
        snd.append(sound(sid, f'collar-fast-{n}', L + 'collar_beep_fast.ogg', 1795, y, 7.5, 0.8))
    _, s = scene('lifeboats', '3. Шлюпочная палуба', 4, 2304, 3328, L + 'lifeboats_deck_dead_anim_2304x3328.webm', tiles=tl, sounds=snd); out.append(s)
    _, s = scene('gallery', '4. Смотровая галерея', 5, 3072, 2304, M + '05_gallery/gallery_clean_anim_3072x2304.webm'); out.append(s)
    for s in out:
        apply_markup(s)
        dump(d, s['name'], s)
    return out


# ---------------------------------------------------------------- журнал
def md2html(md):
    html = markdown.markdown(md, extensions=['tables', 'sane_lists'])
    return html.replace('<table>', '<table class="nep40k">')


def page(eid, name, html, sort):
    pid = fid('page', eid, name)
    return {"_id": pid, "name": name, "type": "text", "title": {"show": True, "level": 1}, "image": {},
            "text": {"content": html, "format": 1}, "video": {"controls": True, "volume": 0.5}, "src": None,
            "system": {}, "sort": sort, "ownership": {"default": -1}, "flags": {}, "_stats": STATS,
            "_key": f"!journal.pages!{eid}.{pid}"}


def build_journal():
    d = reset('act1-journal')
    md = open(os.path.join(SRC, 'act1_text.md'), encoding='utf-8').read()
    md = re.sub(r'^# .*\n', '', md, count=1)
    parts = re.split(r'^### ', md, flags=re.M)
    head, sections = parts[0], parts[1:]
    head = re.sub(r'^## .*\n', '', head, flags=re.M).strip()
    eid = fid('journal', 'act1-text')
    pages = [page(eid, 'О модуле', md2html(head + '\n\nСцены, персонажи и макросы лежат в соседних компендиумах «Акт I». '
                                            'Сцены уже со стоящими фонами, тайлами и звуками: стены и двери поставьте сами.'), 100000)]
    for i, sec in enumerate(sections):
        title, body = sec.split('\n', 1)
        pages.append(page(eid, title.strip(), md2html(body.strip()), 100000 * (i + 2)))
    entry = {"_id": eid, "name": "Последний курс «Непреклонного» — акт I", "pages": pages, "folder": None, "sort": 0,
             "ownership": {"default": 0}, "flags": {}, "_stats": STATS, "_key": f"!journal!{eid}"}
    dump(d, entry['name'], entry)
    # раздатки — текст для игроков, без подсказок мастеру
    def grab(start, stop):
        i = md.index(start); j = md.index(stop, i)
        return md[i:j]
    manifest = grab('**Манифест особого груза.**', '**Схема эвакуации')
    manifest = '\n'.join(l.lstrip('> ').rstrip() for l in manifest.splitlines())
    manifest = manifest.replace('**Манифест особого груза.** ', '')
    evac = grab('**Схема эвакуации.', '**Ошейники.**').replace('**Схема эвакуации. Ярус 12-Т.** ', 'Ярус 12-Т. ')
    ship = grab('**Схема корабля.**', 'Штурмовик видит строку')
    ship = ship.split('раздатка:', 1)[1]
    hid = fid('journal', 'act1-handouts')
    hp = [page(hid, 'Манифест особого груза', md2html(manifest.strip()), 100000),
          page(hid, 'Схема эвакуации', md2html(evac.strip()), 200000),
          page(hid, 'Схема корабля с повреждениями', md2html('Планшет вокс-мастера Каллена Бранта.\n\n' + ship.strip()), 300000)]
    hand = {"_id": hid, "name": "Акт I — раздатки игрокам", "pages": hp, "folder": None, "sort": 100,
            "ownership": {"default": 0}, "flags": {}, "_stats": STATS, "_key": f"!journal!{hid}"}
    dump(d, hand['name'], hand)
    return entry, hand


# ---------------------------------------------------------------- персонажи
def load_enemy(prefix):
    f = glob.glob(os.path.join(SRC, 'enemies40k', prefix + '*.json'))[0]
    return json.load(open(f, encoding='utf-8')), f


def rekey(actor, aid, keep=None, rename=None):
    """Новый id актёра и ключи вложенных предметов и эффектов."""
    a = copy.deepcopy(actor)
    a['_id'] = aid; a['_key'] = f'!actors!{aid}'; a['folder'] = None; a['ownership'] = {"default": 0}
    a['_stats'] = STATS
    items = []
    for it in a.get('items', []):
        if keep is not None and it['name'] not in keep:
            continue
        it = copy.deepcopy(it)
        if rename and it['name'] in rename:
            it['name'] = rename[it['name']]
        it['_key'] = f"!actors.items!{aid}.{it['_id']}"
        it['ownership'] = {"default": 0}
        for ef in it.get('effects', []):
            ef['_key'] = f"!actors.items.effects!{aid}.{it['_id']}.{ef['_id']}"
            ef['origin'] = None
        items.append(it)
    a['items'] = items
    a['effects'] = []
    return a


def feat(aid, name, html, acts=None, uses=None, img='icons/svg/aura.svg'):
    iid = fid('item', aid, name)
    return {"_id": iid, "name": name, "type": "feat", "img": img,
            "system": {"type": {"value": "monster", "subtype": ""}, "activities": acts or {},
                       "uses": uses or {"spent": 0, "recovery": [], "max": ""},
                       "description": {"value": html, "chat": ""}, "identifier": "", "source": {"revision": 1, "rules": "2024"},
                       "advancement": [], "cover": None, "crewed": False, "enchant": {},
                       "prerequisites": {"level": None, "repeatable": False, "items": []}, "properties": [], "requirements": ""},
            "effects": [], "sort": 0, "ownership": {"default": 0}, "flags": {}, "_key": f"!actors.items!{aid}.{iid}"}


def act_base(aid, name, kind, activation='action', extra=None):
    acid = fid('activity', aid, name, kind)
    a = {"type": kind, "_id": acid, "sort": 0, "activation": {"type": activation, "value": 1 if activation == 'legendary' else None, "override": False, "condition": ""},
         "consumption": {"scaling": {"allowed": False}, "spellSlot": True, "targets": []}, "description": {"chatFlavor": ""},
         "duration": {"units": "inst", "concentration": False, "override": False}, "effects": [],
         "range": {"override": False, "units": "self"}, "target": {"template": {"contiguous": False, "units": "ft"},
                                                                   "affects": {"choice": False}, "override": False, "prompt": True},
         "uses": {"spent": 0, "recovery": []}, "name": ""}
    if extra:
        a.update(extra)
    return acid, a


def dmg(n, die, bonus, types):
    return {"custom": {"enabled": False, "formula": ""}, "number": n, "denomination": die, "bonus": bonus, "types": types, "scaling": {"number": 1}}


A1 = f'modules/{MOD}/icons/gen/act1/'   # портреты и токены NPC и врагов акта I (рамки — tools/token_frame.py)


def build_actors():
    d = reset('act1-actors')
    cult, _ = load_enemy('Культист_ренегат')
    demon, _ = load_enemy('Демон_цепей')
    out = []

    def set_bio(a, html):
        a['system']['details']['biography']['value'] = html

    def token(a, name, src=None, w=1, h=1, scale=None, disp=-1):
        t = a['prototypeToken']; t['name'] = name; t['width'] = w; t['height'] = h; t['disposition'] = disp
        if src:
            t['texture']['src'] = src
        if scale is None:  # кольцо портрета как у героев (у героев масштаб 1)
            m = re.search(r'icons/gen/act1/token_([a-z_]+)\.webp$', t['texture'].get('src') or '')
            if m:
                scale = 0.9 if m.group(1).startswith('kultist') else {'kryuk': 0.96, 'sol': 0.96, 'varro': 0.96, 'turret': 0.96}.get(m.group(1), 0.9)
        if scale:
            t['texture']['scaleX'] = scale; t['texture']['scaleY'] = scale

    # Крюк и Тихий Сол — культисты-ренегаты
    for name, bio in (("Крюк", "<p>Попутчик-смертник из камеры 6 или 7. Улыбчивый парень из нижнего улья, болтает без умолку и всё время спрашивает: кто вы, за что вас, кто из вас псайкер.</p><p>Уже принадлежит пастве Апостола. Когда из торпеды прозвучит «На колени, агнцы!», встаёт на колени и в первом раунде бьёт ближайшего героя в спину.</p>"),
                      ("Тихий Сол", "<p>Попутчик-смертник, молчун, всё время шепчет себе под нос — литанию задом наперёд. На запястье под рукавом вырезана восьмиконечная звезда. Прячет под робой папку из ящика пульта: дело единицы 5, псайкера.</p><p>Уже принадлежит пастве Апостола и в зале этапа встанет на колени.</p>")):
        aid = fid('actor', name)
        a = rekey(cult, aid); a['name'] = name; set_bio(a, bio)
        key = {'Крюк': 'kryuk', 'Тихий Сол': 'sol'}[name]
        a['img'] = A1 + key + '.webp'; token(a, name, A1 + 'token_' + key + '.webp', disp=0)
        out.append(a)

    # Варро — выживший матрос, простолюдин 2/4 хита
    aid = fid('actor', 'Варро')
    a = rekey(cult, aid, keep=[]); a['name'] = 'Варро, матрос пусковой команды'
    s = a['system']
    for ab in s['abilities'].values():
        ab['value'] = 10
    s['attributes']['hp'] = {"value": 2, "max": 4, "temp": None, "tempmax": None, "formula": "1d8"}
    s['attributes']['ac'] = {"flat": 10, "calc": "flat"}
    s['details']['cr'] = 0
    set_bio(a, "<p>Выживший матрос пусковой команды. Прячется во второй комнате слева, у вентиля, вне сектора турели. Ошейника нет. Осколок в бедре: пока не подлечат, скорость вдвое меньше. Руку всё время держит у груди — там жестяной образок паствы Варта.</p><p>В бою не сражается, прячется за спинами. Доверие — тайный счёт мастера, см. сцену 3.</p>")
    a['items'] = [feat(aid, 'Хромает', '<p>Пока Варро не подлечили стимулятором или проверкой Мудрости (Медицина) Сл 10, его скорость вдвое меньше.</p>'),
                  feat(aid, 'Образок паствы', '<p>Жестяной образок: агнец, на обороте звезда из восьми стрелок. Исповедник узнаёт работу своего ученика Ионы.</p>')]
    src = M + '04_lifeboat_deck/lifeboats_survivor_token_384.png'
    a['img'] = A1 + 'varro.webp'; token(a, 'Варро', A1 + 'token_varro.webp', 1, 1, None, 0)
    out.append(a)

    # Сторожевая турель
    aid = fid('actor', 'Турель')
    a = rekey(cult, aid, keep=[]); a['name'] = 'Сторожевая турель палубы'
    s = a['system']
    for k, v in dict(str=10, dex=10, con=14, int=3, wis=10, cha=1).items():
        s['abilities'][k]['value'] = v
    s['attributes']['hp'] = {"value": 30, "max": 30, "temp": None, "tempmax": None, "formula": ""}
    s['attributes']['ac'] = {"flat": 17, "calc": "flat"}
    s['attributes']['movement']['walk'] = "0"
    s['details']['cr'] = 3
    s['details']['type'] = {"value": "construct", "subtype": "", "swarm": "", "custom": ""}
    s['traits']['size'] = 'lg'
    s['traits']['di']['value'] = ['poison', 'psychic']
    s['traits']['ci']['value'] = ['poisoned', 'charmed', 'frightened']
    set_bio(a, '<p>Спаренная турель в нижнем торце шлюпочной палубы. Её дух машины отравлен скрапкодом: это она расстреляла бегущих к шлюпкам.</p>')
    acid, act = act_base(aid, 'Очередь', 'save', 'special', {
        "range": {"override": False, "units": "ft", "value": "60", "special": ""},
        "target": {"template": {"contiguous": False, "units": "ft", "type": "line", "size": "60", "width": "5"},
                   "affects": {"choice": False, "type": "creature"}, "override": False, "prompt": True},
        "damage": {"parts": [dmg(4, 8, "", ["piercing"])], "onSave": "half", "critical": {"allow": False}},
        "save": {"ability": ["dex"], "dc": {"calculation": "", "formula": "14"}}})
    a['items'] = [
        feat(aid, 'Очередь', '<p>Раз в раунд, на счёт инициативы 20: очередь по ближайшему из тех, кто двигался по залу после её прошлой очереди. Линия от турели через цель шириной в клетку. Все в линии делают спасбросок Ловкости Сл 14: провал — 4к8 колющего урона, успех — половина.</p>', {acid: act}),
        feat(aid, 'Бьёт по движению', '<p>Кто не двигался после её прошлой очереди, для турели невидим. Комнаты слева вне её сектора.</p>'),
        feat(aid, 'Как обезвредить', '<p>Подобраться вплотную и потратить действие: Техножрец отключает её без броска, остальные — Ловкость (воровские инструменты) Сл 15. Или обесточить в щитовой (первая комната слева, кабель виден без броска): действие, без броска. Или сломать. Макрос «Турель» прячет тайл стрельбы.</p>')]
    src = M + '04_lifeboat_deck/turret/lifeboats_turret_off_1024.png'
    a['img'] = A1 + 'turret.webp'; token(a, 'Турель', src, 2, 2, 1.6, -1)   # на карте — вид сверху, в листе — портрет
    a['prototypeToken']['lockRotation'] = False                                # вид сверху — можно крутить
    out.append(a)

    # Нерождённый — тварь варпа, ПО 9
    aid = fid('actor', 'Нерождённый')
    a = rekey(demon, aid, keep=[]); a['name'] = 'Нерождённый'
    s = a['system']
    for k, v in dict(str=20, dex=14, con=17, int=12, wis=14, cha=18).items():
        s['abilities'][k]['value'] = v
        s['abilities'][k]['proficient'] = 1 if k in ('wis', 'cha') else 0
    s['attributes']['hp'] = {"value": 136, "max": 136, "temp": None, "tempmax": None, "formula": "16d10 + 48"}
    s['attributes']['ac'] = {"calc": "natural", "flat": 15}
    s['attributes']['movement'] = {"walk": "30", "fly": "30", "units": None, "hover": True, "ignoredDifficultTerrain": []}
    s['details']['cr'] = 9
    s['details']['type'] = {"value": "fiend", "subtype": "демон", "swarm": "", "custom": ""}
    s['details']['alignment'] = 'Хаотично-злое'
    s['traits']['size'] = 'lg'
    s['traits']['di']['value'] = ['poison', 'psychic']
    s['traits']['dr']['value'] = ['cold', 'fire', 'lightning']
    s['traits']['ci']['value'] = ['charmed', 'frightened', 'poisoned']
    s['resources']['legact'] = {"max": 2, "spent": 0}
    s['resources']['lair'] = {"value": True, "initiative": 20, "inside": False}
    set_bio(a, '<p>Тварь варпа, которую Несущие Слово зовут Нерождённым. Поднимается из разлома у помоста смотровой галереи, когда голос Вела превращает вокс в врата. Говорит голосом Вела.</p><p><em>Опыт 5000. Высокая сложность для пятерых героев 5 уровня.</em></p>')
    claw_id, claw = act_base(aid, 'Коготь', 'attack', 'action', {
        "range": {"override": False, "units": "ft", "value": "10", "special": ""},
        "target": {"template": {"contiguous": False, "units": "ft", "type": ""}, "affects": {"choice": False, "type": "creature", "count": "1"},
                   "override": False, "prompt": True},
        "attack": {"critical": {"threshold": None}, "flat": False, "type": {"value": "melee", "classification": "weapon"}, "ability": "str", "bonus": ""},
        "damage": {"critical": {"bonus": ""}, "includeBase": False, "parts": [dmg(2, 8, "@mod", ["slashing"]), dmg(1, 8, "", ["psychic"])]}})
    word_id, word = act_base(aid, 'Слово', 'save', 'action', {
        "range": {"override": False, "units": "self"},
        "target": {"template": {"contiguous": False, "units": "ft", "type": "cone", "size": "30"}, "affects": {"choice": False, "type": "creature"},
                   "override": False, "prompt": True},
        "consumption": {"scaling": {"allowed": False}, "spellSlot": True, "targets": [{"type": "itemUses", "value": "1", "target": "", "scaling": {}}]},
        "damage": {"parts": [dmg(4, 8, "", ["psychic"])], "onSave": "half", "critical": {"allow": False}},
        "save": {"ability": ["wis"], "dc": {"calculation": "cha", "formula": ""}}})
    step_id, step = act_base(aid, 'Шаг сквозь дымку', 'utility', 'legendary', {
        "name": "Шаг сквозь дымку", "range": {"override": False, "units": "ft", "value": "30", "special": "в видимую точку внутри дымки у разлома"}})
    legclaw_id, legclaw = act_base(aid, 'Удар когтем', 'attack', 'legendary', {**{k: v for k, v in claw.items() if k in ("range", "target", "attack", "damage")}, "name": "Удар когтем"})
    bolt_id, bolt = act_base(aid, 'Молния', 'save', 'lair', {
        "name": "Молния вдоль ветки",
        "target": {"template": {"contiguous": False, "units": "ft", "type": "line", "size": "60", "width": "5"}, "affects": {"choice": False, "type": "creature"},
                   "override": False, "prompt": True},
        "damage": {"parts": [dmg(3, 8, "", ["lightning"])], "onSave": "half", "critical": {"allow": False}},
        "save": {"ability": ["dex"], "dc": {"calculation": "", "formula": "14"}}})
    haze_id, haze = act_base(aid, 'Дымка', 'utility', 'lair', {
        "name": "Дымка сгущается", "duration": {"units": "round", "value": "1", "concentration": False, "override": False},
        "target": {"template": {"contiguous": False, "units": "ft", "type": "sphere", "size": "15"}, "affects": {"choice": False}, "override": False, "prompt": True}})
    def regen(n, label):
        return act_base(aid, f'Восстановление {n}', 'heal', 'special', {
            "name": label, "activation": {"type": "special", "value": None, "override": False, "condition": "в начале своего хода, пока цел хоть один якорь"},
            "target": {"template": {"contiguous": False, "units": "ft"}, "affects": {"choice": False, "type": "self"}, "override": False, "prompt": False},
            "healing": {"custom": {"enabled": True, "formula": str(n)}, "number": None, "denomination": None, "bonus": "", "types": ["healing"], "scaling": {"number": 1}}})
    regen10_id, regen10 = regen(10, "Восстановление · 10 хитов")
    regen15_id, regen15 = regen(15, "Восстановление · 15 (испытание 3 провалено)")
    lair_html = ('<p>На счёт инициативы 20 (при ничьей — последней) одно на выбор мастера:</p><ul>'
                 '<li>Молния бьёт вдоль ветки на полу: линия 60 футов длиной и 5 шириной от разлома, спасбросок Ловкости Сл 14, 3к8 урона электричеством, при успехе половина.</li>'
                 '<li>Лиловая дымка сгущается: сфера радиусом 15 футов вокруг разлома сильно заслонена до следующего хода логова.</li></ul>')
    a['items'] = [
        feat(aid, 'Мультиатака', '<p>Нерождённый дважды бьёт когтем.</p>'),
        feat(aid, 'Коготь', '<p><em>Бросок рукопашной атаки:</em> +9, досягаемость 10 футов. <em>Попадание:</em> 2к8 + 5 рубящего урона и 1к8 урона психической энергией.</p>', {claw_id: claw}),
        feat(aid, 'Слово (перезарядка 5–6)', '<p>Голос Вела из пасти твари. Конус 30 футов, спасбросок Мудрости Сл 16. <em>Провал:</em> 4к8 урона психической энергией, существо падает ничком и не может встать до конца своего следующего хода. <em>Успех:</em> половина урона. Пользуется «Словом», только пока открыт канал вокса.</p>',
             {word_id: word}, {"spent": 0, "max": "1", "recovery": [{"period": "recharge", "type": "recoverAll", "formula": "5"}]}),
        feat(aid, 'Якоря', '<p>Пока цел хоть один якорь, в начале своего хода Нерождённый восстанавливает 10 хитов (15, если испытание 3 провалено), и его нельзя изгнать заклинанием. Якоря: два сердца на левых кафедрах (каждое — КД 12, 15 хитов) и канал вокса (оборвать — действие у когитатора: Техножрец без броска, остальные — Интеллект (Магия) Сл 15).</p>'
             '<p>При 0 хитов тварь утягивает в разлом. Если разбиты оба сердца и оборван канал, её утягивает сразу, в конце текущего хода.</p>', {regen10_id: regen10, regen15_id: regen15}),
        feat(aid, 'Легендарные действия (2 за раунд)', '<p>После хода другого существа: удар когтем или шаг сквозь дымку — телепорт на 30 футов в видимую точку внутри лиловой дымки у разлома.</p>', {legclaw_id: legclaw, step_id: step}),
        feat(aid, 'Логово: разлом', lair_html, {bolt_id: bolt, haze_id: haze}),
        feat(aid, 'Тактика', '<p>Первой идёт на того, у кого больше Света. Тех, кто принял Шёпот в испытании 3, обходит, пока есть другие цели: «эти уже наши».</p>')]
    UNB_ICON = {"Мультиатака": "multiattack", "Коготь": "claw", "Слово (перезарядка 5–6)": "word", "Якоря": "anchors", "Легендарные действия (2 за раунд)": "legendary", "Логово: разлом": "lair", "Тактика": "tactics"}
    for it in a['items']:
        if it['name'] in UNB_ICON: it['img'] = A1 + f"unborn_{UNB_ICON[it['name']]}.webp"   # медальоны способностей
    a['img'] = A1 + 'nerozhdenny.webp'; token(a, 'Нерождённый', A1 + 'token_nerozhdenny_aura.webm', 3, 3, 1.5, -1)   # живой: петля MiniMax с аурой варпа, огромный
    a['system']['traits']['size'] = 'huge'
    a['prototypeToken']['lockRotation'] = False                                # вид сверху — можно крутить
    a['prototypeToken']['light'].update({'dim': 20, 'bright': 5, 'color': '#a01cff', 'alpha': 0.5, 'coloration': 1, 'luminosity': 0.5,
                                         'animation': {'type': 'pulse', 'speed': 3, 'intensity': 5, 'reverse': False}})
    out.append(a)

    # Череп-протоколист
    aid = fid('actor', 'Череп')
    a = rekey(cult, aid, keep=[]); a['name'] = 'Череп-протоколист'
    s = a['system']
    for k, v in dict(str=3, dex=14, con=10, int=10, wis=12, cha=6).items():
        s['abilities'][k]['value'] = v
    s['attributes']['hp'] = {"value": 3, "max": 3, "temp": None, "tempmax": None, "formula": "1d4 + 1"}
    s['attributes']['ac'] = {"flat": 13, "calc": "flat"}
    s['attributes']['movement'] = {"walk": "0", "fly": "30", "units": None, "hover": True, "ignoredDifficultTerrain": []}
    s['details']['cr'] = 0
    s['details']['type'] = {"value": "construct", "subtype": "", "swarm": "", "custom": ""}
    s['traits']['size'] = 'tiny'
    set_bio(a, '<p>Сервочереп допросчика под потолком допросной. Вокс в нём сломан, и он раз за разом хрипит: «Император защищает!»</p>')
    a['items'] = [feat(aid, 'Запись допроса', '<p>Череп записывал допросы. Что именно он хранит, решает мастер по сцене 1.</p>')]
    a['img'] = M + '02_guard_post/servo_skull_token.webp'
    token(a, 'Череп-протоколист', M + '02_guard_post/servo_skull.webm', 1, 1, 2, 0)
    out.append(a)

    for a in out:
        dump(d, a['name'], a)
    return out


# ---------------------------------------------------------------- макросы
def build_macros():
    d = reset('act1-macros')
    out = []
    for i, (name, img, cmd) in enumerate(MACROS):
        mid = fid('macro', name)
        m = {"_id": mid, "name": name, "type": "script", "img": img, "scope": "global", "command": cmd, "folder": None,
             "sort": (i + 1) * 100, "ownership": {"default": 0}, "flags": {}, "_stats": STATS, "_key": f"!macros!{mid}"}
        dump(d, name, m); out.append(m)
    return out


# ---------------------------------------------------------------- враги: Отмеченный Хаосом
def patch_enemies():
    a, f = load_enemy('Отмеченный_')
    a['name'] = 'Отмеченный Хаосом'
    a['prototypeToken']['name'] = 'Отмеченный Хаосом'
    a['img'] = A1 + 'otmechenny.webp'; a['prototypeToken']['texture']['src'] = A1 + 'token_otmechenny.webp'
    bio = a['system']['details']['biography']['value']
    a['system']['details']['biography']['value'] = bio.replace('Бог Крови даровал', 'Тёмные боги даровали')
    for it in a['items']:
        if it['name'] == 'Кровь для Бога Крови':
            it['name'] = 'Кровь для Тёмных богов'
    os.remove(f)
    json.dump(a, open(os.path.join(SRC, 'enemies40k', f'Отмеченный_Хаосом_{a["_id"]}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    sc = build_scenes(); jr = build_journal(); ac = build_actors(); mc = build_macros(); patch_enemies()
    print('сцен', len(sc), '| страниц текста', len(jr[0]['pages']), '| раздаток', len(jr[1]['pages']), '| персонажей', len(ac), '| макросов', len(mc))
