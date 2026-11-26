import random, statistics, sim
random.seed(3); N = 2500
base = dict(hall_smart=True, foes_first=False, companions=True, lasguns=False, choice="none", anchors_from=3, turret_hit=0.4)
rows = []
for players, keep in ((5, None), (4, ["ser", "kom", "isp", "psy"]), (4, ["kom", "isp", "psy", "teh"]), (3, ["ser", "kom", "isp"]), (3, ["isp", "psy", "teh"])):
    for rest in ("нет", "2 из группы", "капелла"):
        for hp, leg, dc in ((136, 2, 16), (115, 1, 16), (100, 1, 15), (85, 1, 15), (85, 0, 15)):
            if players == 5 and (hp, leg) != (136, 2): continue
            cfg = dict(base, keep=keep, chapel=rest == "капелла", chapel_partial=2 if rest == "2 из группы" else 0, u_hp=hp, u_leg=leg, u_dc=dc)
            st = sim.run(N, cfg)
            rows.append((players, "+".join(keep) if keep else "все", rest, hp, leg, dc, 100 * st["u_tpk"] / N, statistics.mean(st["u_down_end"]), statistics.mean(st["u_rounds"])))
            print(f"{players} {rows[-1][1]:22s} отдых:{rest:12s} хиты {hp} лег.{leg} Сл{dc} → все легли {rows[-1][6]:4.0f}%  лежат к концу {rows[-1][7]:.2f}  раундов {rows[-1][8]:.1f}", flush=True)
