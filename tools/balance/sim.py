"""Симуляция боёв акта I «Последний курс „Непреклонного“»: зал этапа (первая шайка) и Нерождённый.
Пятеро прегенов 5 уровня (по одному каждого класса), статблоки из компендиумов модуля.
Модель упрощённая: позиции — группами (у торпеды / в ближнем бою / на дистанции), без клеток."""
import random, statistics, sys
from dataclasses import dataclass, field

def d(n, s): return sum(random.randint(1, s) for _ in range(n))
def d20(adv=0):
    a, b = random.randint(1, 20), random.randint(1, 20)
    return max(a, b) if adv > 0 else min(a, b) if adv < 0 else a

# ---------------------------------------------------------------- герои
@dataclass
class Hero:
    key: str; name: str; hp: int; maxhp: int; ac: int; saves: dict; init: int
    hd: int; hd_die: int; con: int
    res: dict = field(default_factory=dict)
    down: bool = False; dead: bool = False; ds_ok: int = 0; ds_fail: int = 0
    prone: bool = False; whisper3: bool = False; sturdy: bool = False   # Стойкость (Свет 2): раз за игру остаётся 1 хит
    def alive(self): return not self.down and not self.dead
    def hurt(self, dmg):
        if self.dead or dmg <= 0: return
        if self.down:
            self.ds_fail += 2 if dmg > 0 else 0
            if self.ds_fail >= 3: self.dead = True
            return
        self.hp -= dmg
        if self.hp <= 0:
            if self.sturdy: self.sturdy = False; self.hp = 1; return
            if -self.hp >= self.maxhp: self.dead = True; self.hp = 0; return
            self.hp = 0; self.down = True; self.ds_ok = self.ds_fail = 0
    def heal(self, n):
        if self.dead: return
        self.hp = min(self.maxhp, self.hp + n); self.down = False; self.ds_ok = self.ds_fail = 0
    def death_save(self):
        r = random.randint(1, 20)
        if r == 20: self.heal(1); return
        if r >= 10: self.ds_ok += 1
        else: self.ds_fail += 2 if r == 1 else 1
        if self.ds_fail >= 3: self.dead = True
        elif self.ds_ok >= 3: self.ds_ok = 3   # стабилен, но лежит

def party(mage_armor=False):
    return [
        Hero("ser", "Сержант", 44, 44, 17, dict(str=4, dex=4, con=5, int=0, wis=1, cha=-1), 7, 5, 10, 2,
             dict(surge=1, wind=3, grenades=3)),
        Hero("kom", "Комиссар", 54, 54, 18, dict(str=4, dex=0, con=2, int=-1, wis=4, cha=5), 0, 5, 10, 2,
             dict(s1=4, s2=2, cd=2, loh=25)),
        Hero("isp", "Исповедник", 48, 48, 18, dict(str=1, dex=0, con=2, int=-1, wis=7, cha=4), 0, 5, 8, 2,
             dict(s1=4, s2=3, s3=2, cd=2, holy=1)),
        Hero("psy", "Псайкер", 42, 42, 14 if mage_armor else 11, dict(str=-1, dex=1, con=5, int=0, wis=1, cha=7), 1, 5, 6, 2,
             dict(s1=4, s2=3, s3=2, sp=5)),
        Hero("teh", "Техножрец", 48, 48, 19, dict(str=0, dex=2, con=5, int=7, wis=1, cha=-1), 2, 5, 8, 2,
             dict(s1=4, s2=2, jolt=4, def_hp=31)),
    ]

def best_save(h, abilities): return max(h.saves[a] for a in abilities)

# ---------------------------------------------------------------- испытание (сумма против порога)
def trial(heroes, abilities, per, choice):
    """choice: 'none' | 'whisper' | 'vow'. Итог: 'ok' | 'cost' | 'fail'."""
    rollers = [h for h in heroes if not h.dead]
    adv = 1 if choice == "whisper" else -1 if choice == "vow" else 0
    total = sum(d20(adv) + best_save(h, abilities) for h in rollers)
    need = per * len(rollers)
    res = "ok" if total >= need else "cost" if need - total < 10 else "fail"
    return res

def trial_damage(heroes, res, dice=(2, 6)):
    if res == "ok": return
    for h in heroes:
        if h.alive(): h.hurt(d(*dice))

def short_rest(heroes):
    for h in heroes:
        if h.dead: continue
        if h.down: h.heal(1)
        while h.hd > 0 and h.hp < h.maxhp * 0.75:
            h.hd -= 1; h.heal(d(1, h.hd_die) + h.con)
        if h.key == "ser": h.res["surge"] = 1; h.res["wind"] = min(3, h.res["wind"] + 1)
        if h.key in ("kom", "isp"): h.res["cd"] = min(2, h.res["cd"] + 1)
        if h.key == "psy": h.res["sp"] = min(5, h.res["sp"] + 2)

def long_rest(heroes, fresh):
    for h, f in zip(heroes, fresh):
        if h.dead: continue
        h.hp = h.maxhp; h.down = False; h.hd = 5; h.res = dict(f.res); h.sturdy = h.sturdy

# ---------------------------------------------------------------- зал этапа
@dataclass
class Foe:
    kind: str; hp: int; ac: int; atk: int; dmg: tuple; dex: int; str_: int; wis: int; con: int
    state: str = "torpedo"     # torpedo | engaged | hatch | out
    target: object = None; charmed: bool = False; maxhp: int = 0
    def alive(self): return self.hp > 0 and self.state != "out"

def hall_foes(companions, lasguns):
    fs = [Foe("cult", 9, 12, 3, (1, 4, 2), 1, 0, 0, 0) for _ in range(8)]
    fs += [Foe("shoot", 33, 14, 5, (1, 8, 3), 3, 0, 1, 1, state="hatch") for _ in range(2)]
    fs += [Foe("boss", 67, 13, 5, (1, 12, 3), 1, 3, 0, 3)]
    if companions:
        for _ in range(2):
            f = Foe("comp", 9, 12, 3, (1, 10, 1) if lasguns else (1, 4, 2), 1, 0, 0, 0, state="engaged"); fs.append(f)
    for f in fs: f.maxhp = f.hp
    return fs

def hall(heroes, smart, foes_first=False, companions=True, lasguns=False, grenades_used=None):
    foes = hall_foes(companions, lasguns)
    spirit = {"on": False}
    order = [(d20() + h.init + (100 if (not foes_first) and smart and h.key == "ser" else 0) * 0, "h", h) for h in heroes]
    order += [(d20() + f.dex + (30 if foes_first else 0), "f", f) for f in foes if f.kind != "comp"]
    order.sort(key=lambda x: -x[0])
    comps = [f for f in foes if f.kind == "comp"]
    # попутчики: на «На колени» встают и бьют в спину ближайшего — до всех
    for f in comps:
        t = random.choice([h for h in heroes if h.alive()])
        f.target = t
        if d20(1) + f.atk >= t.ac: t.hurt(d(*f.dmg[:2]) + f.dmg[2] + (0 if lasguns else 1))
    def living(kind=None, state=None):
        return [f for f in foes if f.alive() and (kind is None or f.kind == kind) and (state is None or f.state == state)]
    def hit_foe(f, dmg):
        f.hp -= dmg; f.charmed = False
    def save_foe(f, ab, dc, cover=0):
        mod = {"dex": f.dex, "str": f.str_, "wis": f.wis, "con": f.con}[ab]
        return d20(1 if f.kind == "boss" else 0) + mod + cover >= dc
    for rnd in (1, 2):
        for _, side, x in order:
            if side == "h":
                h = x
                if h.down and not h.dead: h.death_save(); continue
                if not h.alive(): continue
                foes_alive = living()
                if not foes_alive: break
                torpedo = living(state="torpedo")
                engaged = [f for f in living() if f.state == "engaged"]
                near = [f for f in engaged if f.target is h]
                def single(pref=None):
                    pool = pref or engaged or [f for f in foes_alive if f.kind != "shoot"] or foes_alive
                    pool = sorted(pool, key=lambda f: f.hp)
                    return pool[0] if smart else random.choice(pool)
                if h.key == "ser":
                    acts = 1 + (1 if smart and h.res["surge"] and rnd == 1 else 0)
                    if acts == 2: h.res["surge"] = 0
                    for _ in range(acts):
                        torpedo = living(state="torpedo")
                        if smart and h.res["grenades"] and len(torpedo) >= 3:
                            h.res["grenades"] -= 1
                            if grenades_used is not None: grenades_used.append(1)
                            for f in random.sample(torpedo, min(4, len(torpedo))):
                                dmg = d(5, 6); hit_foe(f, dmg if not save_foe(f, "dex", 15) else dmg // 2)
                            continue
                        for _ in range(2):
                            tg = single(living(kind="shoot") if smart and rnd == 2 and living(kind="shoot") else None)
                            if not tg: break
                            r = d20(1 if tg.charmed else 0)
                            ac = tg.ac   # Меткий стрелок игнорирует укрытие
                            if r + 9 >= ac or r >= 19:
                                hit_foe(tg, d(2 if r >= 19 else 1, 10) + 4)
                    if h.hp < h.maxhp / 2 and h.res["wind"]: h.res["wind"] -= 1; h.heal(d(1, 10) + 5)
                elif h.key == "kom":
                    tg = None
                    boss = living(kind="boss")
                    for i in range(2):
                        tg = single(boss if smart and boss and boss[0].state == "engaged" else None)
                        if not tg: break
                        r = d20()
                        if r + 7 >= tg.ac or r == 20:
                            dmg = d(2 if r == 20 else 1, 8) + 6
                            if smart and tg.kind == "boss" and (h.res["s2"] or h.res["s1"]):
                                if h.res["s2"]: h.res["s2"] -= 1; dmg += d(3, 8)
                                else: h.res["s1"] -= 1; dmg += d(2, 8)
                            hit_foe(tg, dmg)
                elif h.key == "isp":
                    if smart and not spirit["on"] and h.res["s3"] and len(living()) >= 5:
                        h.res["s3"] -= 1; spirit["on"] = True
                    else:
                        tg = single()
                        if tg:
                            dmg = d(2, 8)
                            hit_foe(tg, dmg if not save_foe(tg, "dex", 15) else 0)
                    down = [a for a in heroes if a.down and not a.dead]
                    if down and h.res["s1"]: h.res["s1"] -= 1; down[0].heal(d(2, 4) + 4 + 3)
                elif h.key == "psy":
                    if smart and h.res["s3"] and len(torpedo) >= 4:
                        h.res["s3"] -= 1
                        for f in random.sample(torpedo, min(5, len(torpedo))):
                            if not save_foe(f, "wis", 15): f.charmed = True
                    elif smart and len(near) >= 2 and h.res["s1"]:
                        h.res["s1"] -= 1
                        for f in near:
                            dmg = d(2, 6); hit_foe(f, dmg if not save_foe(f, "str", 15) else dmg // 2)
                    else:
                        tg = single()
                        if tg:
                            r = d20()
                            if r + 7 >= tg.ac:
                                dmg = d(2, 8); hit_foe(tg, dmg)
                                if tg.kind == "boss": h.hurt(d(1, 6))
                elif h.key == "teh":
                    if smart and len(near) >= 2 and h.res["s1"]:
                        h.res["s1"] -= 1
                        for f in near:
                            dmg = d(2, 8); hit_foe(f, dmg if not save_foe(f, "con", 15) else dmg // 2)
                    else:
                        jolt = False
                        for _ in range(2):
                            tg = single()
                            if not tg: break
                            r = d20()
                            if r + 7 >= tg.ac or r == 20:
                                dmg = d(2 if r == 20 else 1, 8) + 4
                                if smart and not jolt and h.res["jolt"] and tg.hp > dmg: h.res["jolt"] -= 1; jolt = True; dmg += d(2, 6)
                                hit_foe(tg, dmg)
                    tg = single()   # сервотурель
                    if tg and d20() + 7 >= tg.ac: hit_foe(tg, d(1, 8) + 3)
            else:
                f = x
                if not f.alive(): continue
                if f.charmed: continue
                # святые стражи: в начале хода врага рядом с исповедником
                if spirit["on"] and f.state == "engaged" and random.random() < 0.75:
                    dmg = d(3, 8); hit_foe(f, dmg if not save_foe(f, "wis", 15) else dmg // 2)
                    if not f.alive(): continue
                standing = [h for h in heroes if h.alive()]
                if not standing: break
                if f.kind == "shoot":
                    tgts = random.sample(standing, min(2, len(standing)))
                    for t in tgts:
                        if d20() + t.saves["dex"] < 15: t.hurt(d(2, 8))
                    continue
                if f.state == "torpedo":
                    f.state = "engaged"
                    if f.kind == "boss":
                        f.target = next((h for h in standing if h.key == "kom"), random.choice(standing))
                    else:
                        cnt = {h.key: sum(1 for g in foes if g.alive() and g.state == "engaged" and g.target is h) for h in standing}
                        cand = [h for h in standing if cnt[h.key] < 3] or standing
                        f.target = max(cand, key=lambda h: (cnt[h.key], random.random()))
                    if spirit["on"] and random.random() < 0.6:
                        dmg = d(3, 8); hit_foe(f, dmg if not save_foe(f, "wis", 15) else dmg // 2)
                        if not f.alive(): continue
                if not f.target or not f.target.alive(): f.target = random.choice(standing)
                t = f.target
                adv = 0
                if f.kind in ("cult", "comp"):
                    mob = sum(1 for g in foes if g is not f and g.alive() and g.state == "engaged" and g.target is t)
                    adv = 1 if mob >= 2 else 0
                if f.kind == "boss" and f.hp <= f.maxhp // 2: adv = 1
                r = d20(adv)
                if r == 20 or r + f.atk >= t.ac:
                    n, s, b = f.dmg
                    dmg = d(n * (2 if r == 20 else 1), s) + b
                    t.hurt(dmg)
                    if f.kind == "boss" and not t.alive():
                        others = [h for h in heroes if h.alive()]
                        if others:
                            t2 = random.choice(others)
                            if d20(adv) + f.atk >= t2.ac: t2.hurt(d(1, 12) + 3)
    # декомпрессия: кто из врагов стоит — спасбросок Силы 12, стрелки улетают с торпедой
    left = [f for f in foes if f.alive() and f.kind not in ("shoot",)]
    staying = [f for f in left if d20() + f.str_ >= 12]
    return dict(foes_left=len(left), foes_staying=len(staying), shooters_left=len(living(kind="shoot")),
                boss_hp=max(0, next(f for f in foes if f.kind == "boss").hp), staying=staying)

def decompression_fire(heroes, staying, lasguns):
    # устоявшие с оружием дальнего боя стреляют по разу с помехой; в зале это только попутчики с лазганами
    for f in staying:
        if f.kind == "comp" and lasguns:
            t = random.choice([h for h in heroes if h.alive()] or heroes)
            if d20(-1) + f.atk >= t.ac: t.hurt(d(1, 10) + 1)

# ---------------------------------------------------------------- Нерождённый
def unborn(heroes, smart_from, trial3_failed, rounds_max=12, hp=136, leg=2, word_dc=16):
    """smart_from: с какого раунда герои бьют якоря (None — не бьют вообще)."""
    U = dict(hp=hp, max=hp, ac=15, word=True, leg=leg)
    regen = 15 if trial3_failed else 10
    hearts = [15, 15]; vox = True
    faerie = False; spirit = False
    order = [(d20() + h.init, "h", h) for h in heroes] + [(d20() + 2, "u", None)]
    order.sort(key=lambda x: -x[0])
    focus = None
    def pick_target():
        st = [h for h in heroes if h.alive()]
        if not st: return None
        pref = [h for h in st if not h.whisper3] or st
        return random.choice(pref)
    def claw(t):
        if t is None: return
        r = d20(1 if t.prone else 0)
        ac = t.ac
        if t.key == "psy" and t.res.get("s1") and r + 9 >= ac and r + 9 < ac + 5:   # Щит
            t.res["s1"] -= 1; return
        if r == 20 or r + 9 >= ac:
            t.hurt(d(4 if r == 20 else 2, 8) + 5 + d(2 if r == 20 else 1, 8))
    def anchors(): return sum(1 for x in hearts if x > 0) + (1 if vox else 0)
    def dmg_u(n, typ="ok"):
        U["hp"] -= n
    for rnd in range(1, rounds_max + 1):
        # логово на 20
        st = [h for h in heroes if h.alive()]
        if not st: return dict(win=False, rounds=rnd, why="все лежат")
        for t in random.sample(st, min(2, len(st))):
            dmg = d(3, 8); t.hurt(dmg if d20() + t.saves["dex"] < 14 else dmg // 2)
        smart = smart_from is not None and rnd >= smart_from
        for _, side, h in order:
            if U["hp"] <= 0: return dict(win=True, rounds=rnd, why="хиты")
            if side == "u":
                U["leg"] = leg
                for x in heroes: x.prone = False
                if anchors(): U["hp"] = min(U["max"], U["hp"] + regen)
                if spirit and random.random() < 0.6:
                    dmg = d(3, 8); dmg_u(dmg if d20() + 2 < 15 else dmg // 2)
                if not U["word"] and random.randint(1, 6) >= 5: U["word"] = True
                st = [x for x in heroes if x.alive()]
                if not st: return dict(win=False, rounds=rnd, why="все лежат")
                if vox and U["word"] and len(st) >= 2:
                    U["word"] = False
                    for t in random.sample(st, min(len(st), random.choice([2, 3, 3, 4]))):
                        dmg = d(4, 8)
                        if d20() + t.saves["wis"] < word_dc: t.hurt(dmg); t.prone = t.alive()
                        else: t.hurt(dmg // 2)
                else:
                    if focus is None or not focus.alive(): focus = pick_target()
                    claw(focus); claw(focus)
                continue
            # легендарные действия: удар когтем после ходов героев, 2 за раунд
            if U["leg"] > 0 and random.random() < 0.5:
                U["leg"] -= 1
                if focus is None or not focus.alive(): focus = pick_target()
                claw(focus)
            if h.down and not h.dead: h.death_save(); continue
            if not h.alive(): continue
            adv = 1 if faerie else 0
            def gun(bonus, dice, die, mod, crit=20, n=2):
                tot = 0
                for _ in range(n):
                    r = d20(adv)
                    if r >= crit: tot += d(dice * 2, die) + mod
                    elif r + bonus >= U["ac"]: tot += d(dice, die) + mod
                return tot
            if h.key == "ser":
                n = 2 + (2 if h.res["surge"] else 0); h.res["surge"] = 0
                if smart and any(x > 0 for x in hearts):
                    for _ in range(n):
                        i = next((k for k, x in enumerate(hearts) if x > 0), None)
                        if i is None: dmg_u(gun(9, 1, 10, 4, 19, 1)); continue
                        r = d20()
                        if r + 9 >= 12: hearts[i] -= d(1, 10) + 4
                else:
                    dmg_u(gun(9, 1, 10, 4, 19, n))
                if h.hp < h.maxhp / 2 and h.res["wind"]: h.res["wind"] -= 1; h.heal(d(1, 10) + 5)
            elif h.key == "teh":
                if smart and vox:
                    vox = False      # оборвать канал — действие у когитатора
                elif not faerie and h.res["s1"] and (smart_from is not None):
                    h.res["s1"] -= 1
                    if d20() + 2 < 15: faerie = True
                else:
                    dmg = gun(7, 1, 8, 4)
                    if dmg and h.res["jolt"]: h.res["jolt"] -= 1; dmg += d(2, 6)
                    dmg_u(dmg)
                if h.res["def_hp"] > 0 and d20(adv) + 7 >= U["ac"]: dmg_u(d(1, 8) + 3)
            elif h.key == "kom":
                smited = False
                for i in range(2):
                    r = d20(adv)
                    if r == 20 or r + 9 >= U["ac"]:
                        dmg = d(2 if r == 20 else 1, 8) + 6
                        if not smited and (h.res["s2"] or h.res["s1"]):
                            smited = True
                            if h.res["s2"]: h.res["s2"] -= 1; dmg += d(4, 8)
                            else: h.res["s1"] -= 1; dmg += d(3, 8)
                        dmg_u(dmg)
                down = [x for x in heroes if x.down and not x.dead]
                if down and h.res["loh"] >= 5: h.res["loh"] -= 5; down[0].heal(5)
            elif h.key == "isp":
                down = [x for x in heroes if x.down and not x.dead]
                hurt = [x for x in heroes if x.alive() and x.hp < x.maxhp * 0.4]
                if len(down) + len(hurt) >= 2 and h.res["cd"]:
                    h.res["cd"] -= 1; pool = 25
                    for x in down + hurt:
                        k = min(pool, x.maxhp // 2 - max(0, x.hp));
                        if k > 0: x.heal(k); pool -= k
                elif not spirit and h.res["s3"]:
                    h.res["s3"] -= 1; spirit = True
                elif h.res["holy"] and random.random() < 0.5:
                    h.res["holy"] -= 1
                    if d20() + 2 < 15: dmg_u(d(2, 6))
                else:
                    dmg = d(2, 12); dmg_u(dmg if d20() + 2 < 15 else 0)
                if down:
                    slot = "s1" if h.res["s1"] else "s2" if h.res["s2"] else None
                    if slot: h.res[slot] -= 1; down[0].heal(d(2, 4) + 4 + 3)
            elif h.key == "psy":
                slot = "s3" if h.res["s3"] else "s2" if h.res["s2"] else "s1" if h.res["s1"] else None
                if slot:
                    h.res[slot] -= 1; darts = 3 + int(slot[1]) - 1
                    dmg_u(sum(d(1, 4) + 1 for _ in range(darts)))
                    if h.res["sp"] >= 2:   # ускоренный заряд варпа бонусным действием
                        h.res["sp"] -= 2
                        if d20(adv) + 7 >= U["ac"]: dmg_u(d(2, 8))
                else:
                    if d20(adv) + 7 >= U["ac"]: dmg_u(d(2, 8))
            # якоря кончились — тварь утягивает в конце этого хода
            if smart and anchors() == 0:
                return dict(win=True, rounds=rnd, why="якоря")
    return dict(win=U["hp"] <= 0, rounds=rounds_max, why="время")

# ---------------------------------------------------------------- прогоны
def run(n, cfg):
    stats = dict(hall_down=[], hall_dead=0, hall_any_down=0, hp_after_hall=[], t1=[], t2=[], t3=[], u_win=0, u_tpk=0, u_dead=[], u_down_end=[], u_rounds=[], why={}, hull=[])
    for _ in range(n):
        keep = cfg.get("keep")
        H = [h for h in party(cfg.get("mage_armor", False)) if not keep or h.key in keep]
        fresh = [h for h in party(cfg.get("mage_armor", False)) if not keep or h.key in keep]
        for h in H: h.sturdy = cfg.get("sturdy", False)
        r = hall(H, cfg["hall_smart"], cfg["foes_first"], cfg["companions"], cfg["lasguns"])
        downs = sum(1 for h in H if h.down or h.dead)
        stats["hall_any_down"] += downs > 0; stats["hall_dead"] += sum(1 for h in H if h.dead)
        decompression_fire(H, r["staying"], cfg["lasguns"])
        hull = 8
        t1 = trial(H, ["str", "dex"], 12, cfg["choice"]); trial_damage(H, t1); hull -= t1 == "fail"; stats["t1"].append(t1)
        stats["hp_after_hall"].append(sum(max(0, h.hp) for h in H)); stats.setdefault("hp_before_unborn", [])
        short_rest(H)
        if random.random() < cfg.get("turret_hit", 0.4):    # кто-то попал под очередь турели
            t = random.choice([h for h in H if h.alive()]); dmg = d(4, 8); t.hurt(dmg if d20() + t.saves["dex"] < 14 else dmg // 2)
        t2 = trial(H, ["int", "dex", "con"], 12, cfg["choice"]); trial_damage(H, t2); hull -= t2 == "fail"; stats["t2"].append(t2)
        short_rest(H)
        if cfg["chapel"]: long_rest(H, fresh)
        t3 = trial(H, ["wis", "cha", "con"], 13, cfg["choice"]); trial_damage(H, t3); hull -= t3 == "fail"; stats["t3"].append(t3)
        for h in H: h.whisper3 = cfg["choice"] == "whisper"
        stats["hp_before_unborn"].append(sum(max(0, h.hp) for h in H))
        if cfg.get("chapel_partial"):
            for h in random.sample([x for x in H if not x.dead], min(cfg["chapel_partial"], len(H))):
                f = next(x for x in fresh if x.key == h.key); h.hp = h.maxhp; h.down = False; h.res = dict(f.res)
        u = unborn(H, cfg["anchors_from"], t3 == "fail", hp=cfg.get("u_hp", 136), leg=cfg.get("u_leg", 2), word_dc=cfg.get("u_dc", 16))
        stats["u_win"] += u["win"]; stats["u_tpk"] += (not u["win"])
        stats["u_dead"].append(sum(1 for h in H if h.dead)); stats["u_down_end"].append(sum(1 for h in H if not h.alive()))
        stats["u_rounds"].append(u["rounds"]); stats["why"][u["why"]] = stats["why"].get(u["why"], 0) + 1; stats["hull"].append(hull)
    return stats

def pct(x, n): return f"{100 * x / n:.0f}%"
if __name__ == "__main__":
    random.seed(1)
    N = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
    SC = {
        "Лучший": dict(hall_smart=True, foes_first=False, companions=False, lasguns=False, choice="whisper", chapel=False, anchors_from=2, mage_armor=True, turret_hit=0.0),
        "Средний": dict(hall_smart=True, foes_first=False, companions=True, lasguns=False, choice="none", chapel=False, anchors_from=3, turret_hit=0.4),
        "Худший": dict(hall_smart=False, foes_first=True, companions=True, lasguns=True, choice="vow", chapel=False, anchors_from=None, turret_hit=1.0),
        "Худший + капелла": dict(hall_smart=False, foes_first=True, companions=True, lasguns=True, choice="vow", chapel=True, anchors_from=None, turret_hit=1.0),
        "Средний + капелла": dict(hall_smart=True, foes_first=False, companions=True, lasguns=False, choice="none", chapel=True, anchors_from=3, turret_hit=0.4),
        "4 игрока (без техножреца), средний": dict(hall_smart=True, foes_first=False, companions=True, lasguns=False, choice="none", chapel=False, anchors_from=3, turret_hit=0.4, keep=["ser", "kom", "isp", "psy"]),
        "4 игрока, средний + капелла": dict(hall_smart=True, foes_first=False, companions=True, lasguns=False, choice="none", chapel=True, anchors_from=3, turret_hit=0.4, keep=["ser", "kom", "isp", "psy"]),
        "3 игрока (сержант, комиссар, исповедник), средний": dict(hall_smart=True, foes_first=False, companions=True, lasguns=False, choice="none", chapel=False, anchors_from=3, turret_hit=0.4, keep=["ser", "kom", "isp"]),
        "3 игрока, средний + капелла": dict(hall_smart=True, foes_first=False, companions=True, lasguns=False, choice="none", chapel=True, anchors_from=3, turret_hit=0.4, keep=["ser", "kom", "isp"]),
        "3 игрока (псайкер, техножрец, исповедник), худший": dict(hall_smart=False, foes_first=True, companions=True, lasguns=True, choice="vow", chapel=False, anchors_from=None, turret_hit=1.0, keep=["psy", "teh", "isp"]),
        "Якоря не трогают, без капеллы": dict(hall_smart=True, foes_first=False, companions=True, lasguns=False, choice="none", chapel=False, anchors_from=None, turret_hit=0.4),
        "Якоря не трогают, с капеллой": dict(hall_smart=True, foes_first=False, companions=True, lasguns=False, choice="none", chapel=True, anchors_from=None, turret_hit=0.4),
    }
    for name, cfg in SC.items():
        s = run(N, cfg)
        c = lambda L, v: pct(L.count(v), N)
        print(f"\n=== {name} ({N} прогонов)")
        print(f"  Зал: хоть один герой упал — {pct(s['hall_any_down'], N)}; погибших героев в среднем {s['hall_dead'] / N:.2f}; хиты группы после зала и декомпрессии ~{statistics.mean(s['hp_after_hall']):.0f} из 236")
        print(f"  Испытания: 1 — успех {c(s['t1'], 'ok')}, с ценой {c(s['t1'], 'cost')}, провал {c(s['t1'], 'fail')} | 2 — {c(s['t2'], 'ok')}/{c(s['t2'], 'cost')}/{c(s['t2'], 'fail')} | 3 — {c(s['t3'], 'ok')}/{c(s['t3'], 'cost')}/{c(s['t3'], 'fail')}")
        print(f"  Нерождённый: победа {pct(s['u_win'], N)}, все легли {pct(s['u_tpk'], N)}; раундов в среднем {statistics.mean(s['u_rounds']):.1f}; погибших героев {statistics.mean(s['u_dead']):.2f}; лежат к концу {statistics.mean(s['u_down_end']):.2f}; как кончилось {s['why']}")
        print(f"  Хиты группы перед Нерождённым ~{statistics.mean(s['hp_before_unborn']):.0f}; корпус к галерее в среднем {statistics.mean(s['hull']):.2f}")
