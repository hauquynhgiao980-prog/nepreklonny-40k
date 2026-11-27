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

def setp(o, path, v):
    ks = path.split("."); 
    for k in ks[:-1]: o = o.setdefault(k, {})
    o[ks[-1]] = v

def fix_actor(a):
    n = 0
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
        print(json.dumps(FIX, ensure_ascii=False)); sys.exit()
    files = glob.glob("src/enemies40k/*.json") + glob.glob("src/act1-actors/*.json")
    for p in files:
        raw = open(p, encoding="utf-8").read(); a = json.loads(raw)
        if a["name"] in FIX and fix_actor(a): dump(p, a, raw); print("fixed", a["name"])
    for p in glob.glob("src/act1-adventure/*.json"):
        raw = open(p, encoding="utf-8").read(); adv = json.loads(raw); n = sum(fix_actor(a) for a in adv["actors"] if a["name"] in FIX)
        if n: dump(p, adv, raw); print("adventure items", n)
