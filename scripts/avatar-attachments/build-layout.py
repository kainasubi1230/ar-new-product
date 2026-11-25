#!/usr/bin/env python3
"""
アタッチメントの装着位置の表（src/config/avatarAttachmentLayout.json）を作る。
  python3 scripts/avatar-attachments/build-layout.py

キャラクターはみんな左を向いた横顔。キャラクターごとに顔の目印（目・頭のてっぺん・耳の付け根）を決め、
アイテムごとの「合わせる点」（メガネはレンズの中心、帽子はかぶり口、リボンは結び目）をそこに合わせる。
出力は、キャラクター × アイテムごとの x・y（絵がある範囲の中心）・幅・高さ（絵がある範囲の大きさ）・回転（度、時計回り）・重なり順。
単位は、キャラクターの絵（512×512）の px。アプリと確認用の画像（preview.swift）は、この表をそのまま使う。

位置を直すときは、下の FACES（キャラクターの目印）か ITEM_ANCHORS（アイテムの合わせる点）を変えて作り直し、
swift scripts/avatar-attachments/preview.swift で確かめる。1 つだけ直したいときは OVERRIDES に書く。
"""
import json
import math
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
METRICS = json.load(open(os.path.join(os.path.dirname(__file__), 'item-metrics.json')))

# 重なり順（大きいほど上）。帽子の上にリボン、いちばん上にメガネ
Z = {'hat': 1, 'ribbon': 2, 'glasses': 3}

# キャラクターごとの顔の目印（512px の絵の座標）
# glasses: レンズの中心を合わせる目の位置・レンズの直径（白いふち込み）・回転
# hat:     かぶり口の真ん中を置く位置・かぶり口の幅・回転（頭の傾きに合わせる。マイナスは左＝鼻の方が下がる向き）
# ribbon:  結び目を置く位置（耳の付け根・頭の横）・リボンの幅・回転
FACES = {
    # 尖った耳：帽子は手前の耳の付け根の後ろ（頭のてっぺん）、リボンは耳と耳の間の付け根
    'cat': {
        'glasses': {'x': 219, 'y': 236, 'lens': 62, 'rot': -4},
        'hat': {'x': 262, 'y': 186, 'width': 96, 'rot': -8},
        'ribbon': {'x': 270, 'y': 178, 'width': 64, 'rot': 14},
    },
    'dog': {
        'glasses': {'x': 211, 'y': 232, 'lens': 58, 'rot': -4},
        'hat': {'x': 258, 'y': 172, 'width': 100, 'rot': -8},
        'ribbon': {'x': 286, 'y': 166, 'width': 62, 'rot': 14},
    },
    'fox': {
        'glasses': {'x': 222, 'y': 220, 'lens': 58, 'rot': -8},
        'hat': {'x': 250, 'y': 164, 'width': 92, 'rot': -14},
        'ribbon': {'x': 302, 'y': 158, 'width': 60, 'rot': 14},
    },
    'rabbit': {
        'glasses': {'x': 194, 'y': 272, 'lens': 56, 'rot': -3},
        'hat': {'x': 206, 'y': 234, 'width': 88, 'rot': -6},
        'ribbon': {'x': 262, 'y': 224, 'width': 62, 'rot': 16},
    },
    # 丸い耳：耳を隠さないよう、帽子はおでこ寄り。リボンは手前の耳の付け根の後ろ
    'bear': {
        'glasses': {'x': 209, 'y': 230, 'lens': 62, 'rot': -3},
        'hat': {'x': 218, 'y': 176, 'width': 92, 'rot': -10},
        'ribbon': {'x': 306, 'y': 158, 'width': 62, 'rot': 14},
    },
    'panda': {
        # 目は黒い模様の中。模様の真ん中にレンズを合わせる
        'glasses': {'x': 212, 'y': 205, 'lens': 80, 'rot': -6},
        'hat': {'x': 200, 'y': 150, 'width': 92, 'rot': -16},
        'ribbon': {'x': 298, 'y': 124, 'width': 62, 'rot': 14},
    },
    # 耳なし：帽子は丸い頭のてっぺん、リボンは頭の後ろ寄りの横
    'penguin': {
        'glasses': {'x': 231, 'y': 181, 'lens': 56, 'rot': -6},
        'hat': {'x': 262, 'y': 128, 'width': 110, 'rot': -8},
        'ribbon': {'x': 322, 'y': 132, 'width': 66, 'rot': 22},
    },
    # ひよこ：帽子は冠羽の根元（羽の先は帽子の上に出る）、リボンは冠羽の後ろ
    'chick': {
        'glasses': {'x': 227, 'y': 224, 'lens': 56, 'rot': -3},
        'hat': {'x': 258, 'y': 178, 'width': 104, 'rot': -4},
        'ribbon': {'x': 316, 'y': 182, 'width': 62, 'rot': 18},
    },
}

# アイテムの「合わせる点」（アイテムの絵 512px の中の座標）と、その点で測る大きさ
# 帽子：かぶり口の真ん中と、かぶり口の幅。リボン：結び目
ITEM_ANCHORS = {
    'hat_01': {'x': 248, 'y': 318, 'size': 220},  # ベレー帽
    'hat_02': {'x': 300, 'y': 318, 'size': 180},  # キャップ（つばは左＝顔の前に出る）
    'hat_03': {'x': 256, 'y': 318, 'size': 190},  # シルクハット（つばの幅の 8 割弱。大きいと両耳を覆う）
    'hat_04': {'x': 256, 'y': 345, 'size': 230},  # ニット帽
    'ribbon_01': {'x': 256, 'y': 256},
    'ribbon_02': {'x': 270, 'y': 200},
    'ribbon_03': {'x': 254, 'y': 192},
    'ribbon_04': {'x': 264, 'y': 190},
}

# 個別に直したいもの：OVERRIDES['cat']['hat_03'] = {'dx': 0, 'dy': -4, 'scale': 1.0, 'rot': 0}
OVERRIDES = {}

ITEMS = sorted(METRICS.keys())


def category_of(item):
    return item.split('_')[0]


def place(animal, item):
    face = FACES[animal][category_of(item)]
    m = METRICS[item]
    box = m['box']
    box_cx = box['x'] + box['width'] / 2
    box_cy = box['y'] + box['height'] / 2
    cat = category_of(item)
    if cat == 'glasses':
        anchor = (m['lens']['x'], m['lens']['y'])
        scale = face['lens'] / m['lens']['diameter']
    elif cat == 'hat':
        a = ITEM_ANCHORS[item]
        anchor = (a['x'], a['y'])
        scale = face['width'] / a['size']
    else:
        a = ITEM_ANCHORS[item]
        anchor = (a['x'], a['y'])
        scale = face['width'] / box['width']
    rot = face['rot']
    o = OVERRIDES.get(animal, {}).get(item, {})
    scale *= o.get('scale', 1)
    rot += o.get('rot', 0)
    # 合わせる点から、絵がある範囲の中心までのずれ（回転・拡大込み）
    dx = (box_cx - anchor[0]) * scale
    dy = (box_cy - anchor[1]) * scale
    r = math.radians(rot)
    cx = face['x'] + dx * math.cos(r) - dy * math.sin(r) + o.get('dx', 0)
    cy = face['y'] + dx * math.sin(r) + dy * math.cos(r) + o.get('dy', 0)
    return {
        'x': round(cx, 1),
        'y': round(cy, 1),
        'width': round(box['width'] * scale, 1),
        'height': round(box['height'] * scale, 1),
        'rotation': rot,
        'zIndex': Z[cat],
    }


layout = {animal: {item: place(animal, item) for item in ITEMS} for animal in FACES}
items = {
    item: {
        'category': category_of(item),
        # 絵がある範囲（アイテムの絵 512px の中）。アプリはこれを使って、範囲の中心・大きさを表の値に合わせて描く
        'box': METRICS[item]['box'],
        'imageSize': METRICS[item]['imageSize'],
    }
    for item in ITEMS
}
out = os.path.join(ROOT, 'src', 'config', 'avatarAttachmentLayout.json')
with open(out, 'w') as f:
    json.dump({'canvasSize': 512, 'items': items, 'layout': layout}, f, ensure_ascii=False, indent=2)
    f.write('\n')
print('→', os.path.relpath(out, ROOT), '（', ', '.join(layout.keys()), '）')
