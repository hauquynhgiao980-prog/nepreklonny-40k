import random, statistics, sim
random.seed(5); N = 5000
SC = {
 "Лучший: герои ходят первыми, бьют гранатой и узором по выходу из торпеды, попутчиков уже нет": dict(smart=True, ff=False, comp=False, las=False, ma=True),
 "Средний: умная игра, попутчики живы, без лазганов": dict(smart=True, ff=False, comp=True, las=False, ma=False),
 "Худший: враги ходят первыми, попутчики с лазганами бьют в спину, игроки без тактики": dict(smart=False, ff=True, comp=True, las=True, ma=False),
}
for name, c in SC.items():
    taken, worst_hero, psy, downs, left, boss, cleared = [], [], [], 0, [], [], 0
    for _ in range(N):
        H = sim.party(c["ma"])
        r = sim.hall(H, c["smart"], c["ff"], c["comp"], c["las"])
        tk = sum(h.maxhp - max(0, h.hp) for h in H); taken.append(tk)
        worst_hero.append(max(h.maxhp - max(0, h.hp) for h in H)); psy.append(next(h for h in H if h.key == "psy").maxhp - max(0, next(h for h in H if h.key == "psy").hp))
        downs += any(not h.alive() for h in H); left.append(r["foes_left"] + r["shooters_left"]); boss.append(r["boss_hp"]); cleared += (r["foes_left"] + r["shooters_left"]) == 0
    q = lambda L, p: sorted(L)[int(p * (len(L) - 1))]
    print(f"\n=== {name}")
    print(f"  урон группе за 2 раунда: в среднем {statistics.mean(taken):.0f} из 236, в худших 5% — {q(taken, .95)}")
    print(f"  больше всех получил один герой: в среднем {statistics.mean(worst_hero):.0f}, в худших 5% — {q(worst_hero, .95)}; псайкер в среднем {statistics.mean(psy):.0f} из 42")
    print(f"  хоть кто-то упал: {100 * downs / N:.1f}%; врагов на ногах к декомпрессии: {statistics.mean(left):.1f} из 11–13; вожак жив с {statistics.mean(boss):.0f} хитами из 67; зал зачищен до декомпрессии: {100 * cleared / N:.0f}%")
