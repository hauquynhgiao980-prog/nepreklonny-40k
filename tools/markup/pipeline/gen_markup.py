"""Сводит стены, свет, звуки и зоны каждой карты в tools/markup/<сцена>.json для build_act1.py."""
import json, math
OUT = '/home/claude/nepreklonny-40k/tools/markup/'
SND = 'modules/nepreklonny-40k/sounds/ambient/'
KEY = {'prison': 'cells', 'post': 'post', 'hall': 'hall', 'boats': 'lifeboats', 'gallery': 'gallery'}
NOTE = 'const tok = event.data.token; if (!tok || !event.user?.isSelf) return;\n' \
       'const gm = ChatMessage.getWhisperRecipients("GM").map(u => u.id);\n'
def notify(text):
    return NOTE + f'ChatMessage.create({{ content: `<b>${{tok.name}}</b> ${text}`, whisper: gm, speaker: {{ alias: "Непреклонный" }} }});'
def rect(x0, y0, x1, y1): return [x0, y0, x1, y0, x1, y1, x0, y1]
def region(name, pts, behaviors, color='#8a1c1c'):
    return {'name': name, 'color': color, 'pts': pts, 'behaviors': behaviors}
def exitz(name, pts, text, color='#d9a21b'):
    return region(name, pts, [{'name': 'Сообщить мастеру', 'type': 'executeScript', 'system': {'events': ['tokenEnter'], 'source': notify(text)}}], color)
def snd(name, file, x, y, r, vol, walls=False, hidden=False):
    return {'role': name, 'path': SND + file, 'x': x, 'y': y, 'radius': r, 'volume': vol, 'walls': walls, 'hidden': hidden}

SOUNDS = {
 'prison': [snd('hum', 'ship_hum.ogg', 2304, 1536, 200, .3), snd('siren', 'siren_distant.ogg', 2304, 1536, 160, .35),
            snd('sparks-8', 'sparks.ogg', 4008, 1940, 20, .9, True)],
 'post': [snd('hum', 'ship_hum.ogg', 1152, 1536, 150, .3), snd('cogitator', 'cogitator.ogg', 380, 560, 20, .5, True),
          snd('candles-office', 'candles.ogg', 330, 480, 15, .7, True), snd('candles-interrogation', 'candles.ogg', 1950, 420, 15, .7, True)],
 'hall': [snd('hum', 'ship_hum.ogg', 1152, 1536, 150, .3), snd('steam-n', 'steam_vents.ogg', 1130, 900, 25, .6),
          snd('steam-s', 'steam_vents.ogg', 1130, 2300, 25, .6), snd('cogitator', 'cogitator.ogg', 340, 1700, 20, .45, True),
          snd('wind', 'wind_breach.ogg', 1980, 1530, 150, .9, False, True)],
 'boats': [snd('hum', 'ship_hum.ogg', 1152, 1664, 160, .3), snd('turret', 'turret_servo.ogg', 1288, 2896, 40, .6),
           snd('steam-valve', 'steam_vents.ogg', 300, 1100, 15, .5, True)] +
          [snd(f'sparks-{n}', 'sparks.ogg', 2050, y, 15, .7, True) for n, y in ((5, 480), (6, 1086), (8, 2308), (9, 2922))],
 'gallery': [snd('hum', 'ship_hum.ogg', 1536, 1450, 150, .2), snd('vox', 'vox_static.ogg', 2215, 1000, 40, .45),
             snd('candles-w', 'candles.ogg', 1000, 1100, 25, .5), snd('candles-e', 'candles.ogg', 2740, 1100, 25, .5),
             snd('rift', 'warp_rift.ogg', 2215, 1350, 90, .9, False, True)],
}
DARK8 = {'name': 'Тьма в камере 8', 'type': 'adjustDarknessLevel', 'system': {'mode': 0, 'modifier': 0.9}}
TURRET = NOTE + 'const t = canvas.scene?.tiles.find(x => x.flags?.["nepreklonny-40k"]?.role === "turret-fire");\n' \
         'if (!t || t.hidden) return;\n' \
         'ChatMessage.create({ content: `<b>${tok.name}</b> в секторе турели: она стреляет вдоль зала.`, whisper: gm, speaker: { alias: "Непреклонный" } });'
REGIONS = {
 'prison': [exitz('Выход: к посту охраны (запад)', rect(95, 1370, 330, 1700), 'у западного выхода из блока: дальше «Пост охраны».'),
            exitz('Выход: восток', rect(4278, 1370, 4513, 1700), 'у восточного выхода из блока.'),
            region('Камера 8: свет погас', None, [DARK8], '#1c1c8a')],
 'post': [exitz('Выход: блок камер', rect(112, 1390, 330, 1670), 'у прохода обратно в блок камер.'),
          exitz('Выход: дальше в корабль', rect(1930, 1390, 2150, 1670), 'у правого прохода: дальше в корабль.'),
          exitz('Дверь с шевронами: к залу этапа', rect(1900, 2330, 2150, 2590), 'у двери с шевронами: дальше «Зал этапа».')],
 'hall': [exitz('Шлюз (верх)', rect(840, 235, 1410, 460), 'у верхнего шлюза.'),
          exitz('Нижний проход', rect(832, 2710, 1415, 2938), 'у нижнего прохода.')],
 'boats': [exitz('Шлюз (верх)', rect(1123, 222, 1432, 450), 'у верхнего шлюза.'),
           exitz('Шлюз (низ)', rect(1123, 2990, 1432, 3214), 'у нижнего шлюза.'),
           region('Сектор турели', rect(820, 330, 1700, 2640), [{'name': 'Турель видит', 'type': 'executeScript', 'system': {'events': ['tokenEnter'], 'source': TURRET}}], '#b3241b')],
 'gallery': [exitz('Лифт', rect(1960, 1830, 2460, 2050), 'у дверей лифта.')],
}

def wall_doc(w):
    k = w['kind']; d = {'c': w['c'], 'light': 20, 'move': 20, 'sight': 20, 'sound': 20, 'dir': 0, 'door': 0, 'ds': 0,
                        'threshold': {'light': None, 'sight': None, 'sound': None, 'attenuation': False}, 'animation': None}
    if k == 'limited': d.update(light=10, sight=10, sound=0)
    elif k in ('glass', 'window'): d.update(light=0, sight=0, sound=20)
    elif k == 'door':
        d['door'] = 1; d['ds'] = 2 if w.get('locked') else (1 if w.get('open') else 0)
        d['doorSound'] = 'futuristicHydraulic'
        d['role'] = w.get('name')
    return d

for m, key in KEY.items():
    spec = json.load(open(f'{m}.spec.json'))
    walls = json.load(open(f'{m}.walls.json'))
    opened = {d['name'] for d in spec.get('doors', []) if d.get('open')}
    for w in walls:
        if w['kind'] == 'door' and w.get('name') in opened: w['open'] = True
    lights = json.load(open(f'{m}.lights.json'))
    L = []
    for l in lights:
        a = l.get('anim') or ['pulse', 2, 2]
        role = l.get('role') or ('hall-light' if m == 'hall' and l['kind'] != 'red' else l['kind'])
        L.append({'x': l['x'], 'y': l['y'], 'hidden': bool(l.get('hidden')), 'role': role,
                  'config': {'dim': l['dim'], 'bright': l['bright'], 'color': l['color'], 'alpha': l['alpha'], 'angle': 360,
                             'coloration': 1, 'attenuation': 0.5, 'luminosity': 0.5, 'saturation': 0, 'contrast': 0, 'shadows': 0,
                             'negative': False, 'priority': 0,
                             'animation': {'type': a[0], 'speed': a[1], 'intensity': a[2], 'reverse': False},
                             'darkness': {'min': 0, 'max': 1}}})
    if m == 'hall':
        L.append({'x': 1125, 'y': 300, 'hidden': True, 'role': 'lock-alarm',
                  'config': {'dim': 25, 'bright': 6, 'color': '#ff1a0d', 'alpha': 0.55, 'angle': 360, 'coloration': 1, 'attenuation': 0.5,
                             'luminosity': 0.5, 'saturation': 0, 'contrast': 0, 'shadows': 0, 'negative': False, 'priority': 0,
                             'animation': {'type': 'siren', 'speed': 6, 'intensity': 6, 'reverse': False}, 'darkness': {'min': 0, 'max': 1}}})
    R = REGIONS.get(m, [])
    if m == 'prison':
        c8 = [r for r in json.load(open('prison.polys.json')) if r['name'] == 'cell8'][0]['poly']
        R[2]['pts'] = [v for p in c8 for v in p]
    doc = {'walls': [wall_doc(w) for w in walls], 'lights': L, 'sounds': SOUNDS[m], 'regions': R}
    json.dump(doc, open(OUT + key + '.json', 'w'), ensure_ascii=False, indent=1)
    print(key, len(doc['walls']), 'walls', len(L), 'lights', len(doc['sounds']), 'sounds', len(R), 'regions')
