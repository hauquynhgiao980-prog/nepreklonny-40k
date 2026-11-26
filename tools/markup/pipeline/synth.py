"""Процедурные эмбиент-петли 16 с (моно, 32 кГц): гул корабля, сирена, искры, пар, свечи, когитатор, ветер пробоя, варп, сервопривод, вокс."""
import numpy as np, subprocess, os
from scipy import signal
SR = 32000; T = 16.0; XF = 1.0
N = int(SR * (T + XF)); t = np.arange(N) / SR
rng = np.random.default_rng(40000)

def lp(x, f, o=2): b, a = signal.butter(o, f / (SR / 2)); return signal.lfilter(b, a, x)
def hp(x, f, o=2): b, a = signal.butter(o, f / (SR / 2), 'high'); return signal.lfilter(b, a, x)
def bp(x, f1, f2, o=2): b, a = signal.butter(o, [f1 / (SR / 2), f2 / (SR / 2)], 'band'); return signal.lfilter(b, a, x)
def noise(): return rng.standard_normal(N)
def brown():
    x = np.cumsum(rng.standard_normal(N)); x = hp(x, 15); return x / np.abs(x).max()
def env_burst(t0, a, d, n=N):
    e = np.zeros(n); i0 = int(t0 * SR); ia = int(a * SR); idd = int(d * SR)
    seg = np.concatenate([np.linspace(0, 1, max(ia, 1)), np.exp(-np.linspace(0, 5, max(idd, 1)))])
    e[i0:i0 + len(seg)] = seg[:max(0, n - i0)]; return e
def reverb(x, decay=1.2, mix=0.3):
    ir_n = int(SR * decay); ir = rng.standard_normal(ir_n) * np.exp(-np.linspace(0, 6, ir_n)); ir = lp(ir, 3000)
    y = signal.fftconvolve(x, ir)[:len(x)]; y /= np.abs(y).max() + 1e-9
    return (1 - mix) * x / (np.abs(x).max() + 1e-9) + mix * y
def loop(x):
    n = int(SR * T); xf = int(SR * XF)
    out = x[:n].copy(); w = np.linspace(0, 1, xf)
    out[:xf] = x[n:n + xf] * (1 - w) + x[:xf] * w
    return out
def save(name, x, peak=0.8):
    x = loop(x); x = x / (np.abs(x).max() + 1e-9) * peak
    wav = f'snd/{name}.wav'; ogg = f'snd/{name}.ogg'
    from scipy.io import wavfile; wavfile.write(wav, SR, (x * 32767).astype(np.int16))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '3', ogg], check=True)
    os.remove(wav); print(name, os.path.getsize(ogg) // 1024, 'KB')

# 1. Гул корабля: низкие гармоники с биениями, бурый шум, редкий скрип корпуса
lfo = 1 + 0.15 * np.sin(2 * np.pi * t / 8)
hum = sum(a * np.sin(2 * np.pi * f * t + p) for f, a, p in [(41, 1, 0), (41.7, .7, 1), (82, .5, 2), (123, .25, .5), (164, .12, 1.3)]) * lfo
hum = hum / np.abs(hum).max() + 0.6 * lp(brown(), 180)
creak = np.zeros(N)
for t0 in (3.1, 9.7, 13.4):
    f0 = rng.uniform(180, 320); seg = env_burst(t0, .3, 1.8) * np.sin(2 * np.pi * (f0 * t + 8 * np.sin(2 * np.pi * 3 * t)))
    creak += 0.18 * bp(seg + 0.3 * env_burst(t0, .3, 1.8) * noise(), 120, 900)
save('ship_hum', hum + creak, 0.7)

# 2. Далёкая сирена: два тона, вой 4 с, глухо через переборки
ph = np.cumsum(560 + 260 * (0.5 - 0.5 * np.cos(2 * np.pi * t / 4))) / SR
sir = np.sign(np.sin(2 * np.pi * ph)) * 0.6 + np.sin(2 * np.pi * 2 * ph) * 0.4
sir = lp(sir, 1400, 4) * (0.8 + 0.2 * np.sin(2 * np.pi * t / 4))
save('siren_distant', reverb(sir, 1.6, 0.45) + 0.15 * lp(brown(), 200), 0.6)

# 3. Искры: треск разрядов пачками
sp = np.zeros(N)
for _ in range(14):
    t0 = rng.uniform(0, T); k = rng.integers(6, 25)
    for j in range(k):
        tt = t0 + j * rng.uniform(0.004, 0.03)
        if tt < T + XF - .05: sp += rng.uniform(.3, 1) * env_burst(tt, .0005, rng.uniform(.005, .03)) * noise()
buzz = 0.08 * np.sign(np.sin(2 * np.pi * 100 * t)) * (np.abs(lp(noise(), 3)) > 0.8)
save('sparks', hp(sp, 1500) + lp(buzz, 2000), 0.85)

# 4. Пар из решёток: шипение порывами
st = np.zeros(N)
for t0 in (0.8, 5.2, 9.0, 12.6):
    d = rng.uniform(1.5, 2.6); st += env_burst(t0, .08, d) * hp(noise(), 2500)
save('steam_vents', st + 0.05 * hp(noise(), 4000), 0.6)

# 5. Свечи: тихое потрескивание огня
cd = 0.25 * lp(brown(), 400)
for _ in range(45):
    cd += rng.uniform(.2, .8) * env_burst(rng.uniform(0, T), .0005, rng.uniform(.004, .02)) * bp(noise(), 800, 5000)
save('candles', cd, 0.45)

# 6. Когитатор: писк данных, щелчки реле, гул трансформатора
cg = 0.12 * np.sin(2 * np.pi * 120 * t) + 0.05 * np.sin(2 * np.pi * 240 * t)
tt = 0.2
while tt < T + XF - .2:
    f = rng.choice([880, 1320, 1760, 2093, 2637]); d = rng.uniform(.04, .14)
    cg += 0.25 * env_burst(tt, .002, d) * np.sign(np.sin(2 * np.pi * f * t))
    if rng.random() < .25: cg += 0.4 * env_burst(tt + d, .0003, .01) * noise()
    tt += rng.uniform(.08, .6)
save('cogitator', lp(cg, 5000), 0.5)

# 7. Ветер пробоины: рёв воздуха в пустоту, гул и вой
wn = noise(); mod = 0.7 + 0.3 * lp(noise(), 0.6) / 0.2
roar = lp(wn, 500) * 2 + bp(wn, 600, 2500) * 0.6 * (0.6 + 0.4 * np.sin(2 * np.pi * t / 5.3))
howl = np.sin(2 * np.pi * np.cumsum(300 + 80 * np.sin(2 * np.pi * t / 7)) / SR) * 0.15
save('wind_breach', (roar + howl) * np.clip(mod, .3, 1.4), 0.9)

# 8. Варп: низкий гул, шёпот (форманты по шуму) и сердце «тук-тук» 12 раз за петлю
dr = sum(np.sin(2 * np.pi * f * t + p) for f, p in [(36.7, 0), (37.4, 1), (55.1, 2), (73.3, .3)]) * 0.3
wh = np.zeros(N)
for _ in range(16):
    t0 = rng.uniform(0, T); d = rng.uniform(.6, 1.6)
    f1 = rng.uniform(500, 900); f2 = rng.uniform(1200, 2400)
    seg = bp(noise(), f1 - 150, f1 + 150) + 0.7 * bp(noise(), f2 - 300, f2 + 300)
    wh += env_burst(t0, .2, d) * seg * (0.5 + 0.5 * np.sin(2 * np.pi * rng.uniform(3, 7) * t))
hb = np.zeros(N)
for k in range(13):
    t0 = k * T / 12
    for dt, a in ((0, 1), (0.22, .7)):
        if t0 + dt < T + XF - .3: hb += a * env_burst(t0 + dt, .01, .25) * np.sin(2 * np.pi * 52 * t)
save('warp_rift', reverb(dr + 0.6 * wh / (np.abs(wh).max() + 1e-9) + 1.2 * hb, 2.2, .35), 0.85)

# 9. Сервопривод турели: вой поворота и щелчки
sv = np.zeros(N)
for t0 in (1.0, 4.3, 7.8, 11.2, 14.1):
    d = rng.uniform(.5, 1.1); f = 900 + 400 * np.sin(np.pi * np.clip((t - t0) / d, 0, 1))
    seg = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * ((t > t0) & (t < t0 + d))
    sv += 0.25 * lp(seg, 3000) + 0.6 * env_burst(t0 + d, .0005, .02) * noise()
save('turret_servo', sv + 0.05 * np.sin(2 * np.pi * 60 * t), 0.6)

# 10. Вокс-помехи: шипение эфира, всплески, обрывки тона
vx = 0.35 * bp(noise(), 300, 3400) * (0.6 + 0.4 * (lp(noise(), 2) > 0))
for t0 in (2.0, 6.5, 10.4, 13.9):
    vx += env_burst(t0, .01, .25) * np.sin(2 * np.pi * rng.uniform(700, 1100) * t) * 0.5
    vx += env_burst(t0 + .3, .005, .4) * bp(noise(), 1000, 3000) * 0.8
save('vox_static', vx, 0.5)
