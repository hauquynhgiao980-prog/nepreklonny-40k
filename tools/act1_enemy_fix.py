"""Враги и NPC акта I: иконки способностей и вещей (tools/act1_icons.py) и правка текстов, оставшихся от основ
(пират, берсерк). Один словарь FIX — для исходников компендиумов и для живого мира (tools/live/act1-icons.mjs)."""
import json, glob, sys
A1 = "modules/nepreklonny-40k/icons/gen/act1/"
FLAK = "modules/nepreklonny-40k/icons/claude/gear40k/G49kaByMgDJiPADk.webp"
CULT = {"Ритуальный нож": {"img": A1 + "cult_knife.webp"}, "Лоскутная броня": {"img": A1 + "cult_rags.webp"},
        "Ради Тёмных Богов": {"img": A1 + "cult_dark_gods.webp"}, "Толпа": {"img": A1 + "cult_mob.webp"}}
FIX = {
    "Культист-ренегат": CULT, "Крюк": CULT, "Тихий Сол": CULT, "Культист с лазганом": CULT,
    "Предатель-стрелок": {
        "Бронежилет с сорванной аквилой": {"img": FLAK},
        "Мультиатака": {"img": A1 + "shooter_multi.webp",
                        "system.description.value": "<p>Предатель совершает две атаки: из автогана или штык-ножом, в любом сочетании.</p>"},
        "Штык-нож": {"img": A1 + "shooter_bayonet.webp", "system.description.chat": "<p>[[lookup @name]] бьёт штык-ножом!</p>"},
        "Выучка Гвардии": {"img": A1 + "shooter_drill.webp",
                           "system.description.value": "<p>Бывший гвардеец: дальнобойные атаки, сделанные вплотную к врагу, предатель совершает без помехи.</p>",
                           "system.description.chat": "", "system.activities": {}},
        "Подавляющий огонь": {"img": A1 + "shooter_suppress.webp"},
    },
    "Отмеченный Хаосом": {
        "Цепной топор": {"img": A1 + "leader_axe.webp", "system.description.chat": "<p>Отмеченный рубит цепным топором!</p>"},
        "Шипастая броня": {"img": A1 + "leader_armor.webp"},
        "Жажда крови": {"img": A1 + "leader_bloodlust.webp", "replace": ["Пока берсерк", "Пока отмеченный"]},
        "Кровь для Тёмных богов": {"img": A1 + "leader_blood.webp"},
        "Презрение к колдовству": {"img": A1 + "leader_scorn.webp"},
    },
    "Сторожевая турель палубы": {"Очередь": {"img": A1 + "turret_burst.webp"}, "Бьёт по движению": {"img": A1 + "turret_motion.webp"},
                                 "Как обезвредить": {"img": A1 + "turret_disarm.webp"}},
    "Череп-протоколист": {"Запись допроса": {"img": A1 + "skull_record.webp"}},
    "Варро, матрос пусковой команды": {"Хромает": {"img": A1 + "varro_limp.webp"}, "Образок паствы": {"img": A1 + "varro_icon.webp"}},
}

# новые способности: добавляются, если у актёра их ещё нет (по имени)
GRENADE_ICON = "modules/nepreklonny-40k/icons/claude/gear40k/dmgGrenadeFragme.webp"
GRENADE = {
    "_id": "nkGrenadeLeader1", "name": "Фраг-граната", "type": "feat", "img": GRENADE_ICON, "sort": 3500,
    "system": {
        "description": {"value": "<p>Один раз за бой, действием: отмеченный швыряет фраг-гранату в скопление героев в пределах 60 футов. "
                                 "Сфера радиусом 10 футов: спасбросок Ловкости Сл 13, 10 (3к6) колющего урона при провале, половина при успехе.</p>"
                                 "<p>Нажмите «Метнуть» здесь или «Граната вожака» в сценарии: модуль сам выберет точку, где больше героев, "
                                 "игрокам придёт окно со спасброском, урон вычтется сам.</p>", "chat": ""},
        "type": {"value": "monster", "subtype": ""},
        "activities": {"nkGrenadeThrow01": {
            "type": "utility", "_id": "nkGrenadeThrow01", "sort": 0, "name": "Метнуть в скопление героев",
            "activation": {"type": "action", "value": None, "override": False},
            "consumption": {"scaling": {"allowed": False}, "spellSlot": True, "targets": [{"type": "itemUses", "target": "", "value": "1", "scaling": {}}]},
            "description": {}, "duration": {"units": "inst", "concentration": False, "override": False}, "effects": [],
            "range": {"override": False, "units": "self"},
            "target": {"template": {"contiguous": False, "units": "ft"}, "affects": {"choice": False}, "override": False, "prompt": False},
            "uses": {"spent": 0, "recovery": []}, "roll": {"prompt": False, "visible": False}, "flags": {}}},
        "uses": {"spent": 0, "recovery": [], "max": "1"},
        "requirements": "", "properties": [], "source": {"book": "Непреклонный", "rules": "2024"}},
    "effects": [], "flags": {"nepreklonny-40k": {"autoGrenade": {"dc": 13, "n": 3, "d": 6, "type": "piercing", "radius": 10, "range": 60}}},
    "_stats": {},
}
ADD = {"Отмеченный Хаосом": [GRENADE]}

def setp(o, path, v):
    ks = path.split("."); 
    for k in ks[:-1]: o = o.setdefault(k, {})
    o[ks[-1]] = v

def fix_actor(a):
    n = 0
    have = {i["name"] for i in a.get("items", [])}
    for it in ADD.get(a["name"], []):
        if it["name"] in have: continue
        new = json.loads(json.dumps(it))
        if "_key" in a: new["_key"] = f"!actors.items!{a['_id']}.{new['_id']}"
        a.setdefault("items", []).append(new); n += 1
    for it in a.get("items", []):
        f = FIX.get(a["name"], {}).get(it["name"])
        if not f: continue
        for k, v in f.items():
            if k == "replace":
                d = it["system"]["description"]; d["value"] = d["value"].replace(*v)
            elif k == "img": it["img"] = v
            else: setp(it, k, v)
        n += 1
    return n

def dump(path, data, raw):
    ind = len(raw.split("\n")[1]) - len(raw.split("\n")[1].lstrip(" "))
    open(path, "w", encoding="utf-8").write(json.dumps(data, ensure_ascii=False, indent=ind) + ("\n" if raw.endswith("\n") else ""))

if __name__ == "__main__":
    if sys.argv[1:] == ["--js"]:
        print(json.dumps({"FIX": FIX, "ADD": ADD}, ensure_ascii=False)); sys.exit()
    files = glob.glob("src/enemies40k/*.json") + glob.glob("src/act1-actors/*.json")
    for p in files:
        raw = open(p, encoding="utf-8").read(); a = json.loads(raw)
        if a["name"] in FIX and fix_actor(a): dump(p, a, raw); print("fixed", a["name"])
    for p in glob.glob("src/act1-adventure/*.json"):
        raw = open(p, encoding="utf-8").read(); adv = json.loads(raw); n = sum(fix_actor(a) for a in adv["actors"] if a["name"] in FIX)
        if n: dump(p, adv, raw); print("adventure items", n)
