#!/usr/bin/env python3
"""
探索マップに出す「文化遺産のピン」のデータを作る（アプリに同梱する JSON）。

  python3 -I scripts/build-heritage-sites.py

- 位置と種類：Wikidata（CC0）。世界遺産の構成資産・国宝/重要文化財の建造物・特別史跡/史跡・特別名勝/名勝
- 説明文：日本語版 Wikipedia の冒頭（CC BY-SA 4.0）。アプリでは出典として記事名を表示する
- 日本語版 Wikipedia に記事がないもの（大きな寺の中の一つひとつの堂など）は、説明文が書けないので入れない
- 美術品・書・刀などの「動かせる文化財」は、場所が決まっていないので入れない

標準ライブラリだけで動く。実行は数分かかる（Wikipedia へは20件ずつ、間を空けて問い合わせる）。
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

OUT_PATH = 'src/data/heritageSites.json'
UA = 'loca-heritage-data-script/1.0 (offline dataset build)'

# Wikidata の「文化財指定」（P1435）→ アプリでの種類コード
KINDS = {
    'Q9259': 'world',  # 世界遺産
    'Q43113623': 'world',  # 世界遺産の構成資産
    'Q1139795': 'treasure',  # 国宝
    'Q26764449': 'specialHistoric',  # 特別史跡
    'Q30834580': 'historic',  # 史跡
    'Q94987823': 'specialScenic',  # 特別名勝
    'Q11414752': 'scenic',  # 名勝
    'Q1188622': 'important',  # 重要文化財
}
# 史跡・名勝・世界遺産は、それ自体が「場所」なのでそのまま入れる
PLACE_KINDS = {'world', 'specialHistoric', 'historic', 'specialScenic', 'scenic'}
# 国宝・重要文化財は美術品も多いので、建物・構造物・遺跡（の下位分類）だけ入れる
STRUCTURE_ROOTS = [
    'Q811979',  # 建築物・構造物
    'Q41176',  # 建物
    'Q839954',  # 遺跡
    'Q2221906',  # 地理的な場所
    'Q1076486',  # スポーツ施設など（旧競技場など）
    'Q24398318',  # 宗教建築
    'Q13226383',  # 施設
]
KIND_ORDER = ['world', 'treasure', 'specialHistoric', 'historic', 'specialScenic', 'scenic', 'important']

DESC_MAX = 120


def get_json(url: str, accept: str = 'application/json', timeout: int = 300):
    """混んでいて断られたら（429/503）、少し待ってやり直す"""
    for attempt in range(6):
        req = urllib.request.Request(url, headers={'Accept': accept, 'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                return json.load(res)
        except urllib.error.HTTPError as err:
            if err.code not in (429, 503) or attempt == 5:
                raise
            wait = int(err.headers.get('Retry-After') or 0) or 10 * (attempt + 1)
            sys.stderr.write(f'\n{err.code}: {wait} 秒待ってやり直します\n')
            time.sleep(wait)


def sparql(query: str):
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': query})
    return get_json(url, 'application/sparql-results+json')['results']['bindings']


def qid(uri: str) -> str:
    return uri.rsplit('/', 1)[-1]


def fetch_items():
    values = ' '.join(f'wd:{q}' for q in KINDS)
    rows = sparql(f'''
SELECT ?i ?label ?c ?title (GROUP_CONCAT(DISTINCT ?d; separator="|") AS ?ds) WHERE {{
  VALUES ?d {{ {values} }}
  ?i wdt:P1435 ?d; wdt:P17 wd:Q17; wdt:P625 ?c.
  ?w schema:about ?i; schema:isPartOf <https://ja.wikipedia.org/>; schema:name ?title.
  OPTIONAL {{ ?i rdfs:label ?label FILTER(LANG(?label) = "ja") }}
}} GROUP BY ?i ?label ?c ?title''')
    roots = ' '.join(f'wd:{q}' for q in STRUCTURE_ROOTS)
    structures = {
        qid(r['i']['value'])
        for r in sparql(f'''
SELECT DISTINCT ?i WHERE {{
  VALUES ?d {{ wd:Q1188622 wd:Q1139795 }}
  VALUES ?root {{ {roots} }}
  ?i wdt:P1435 ?d; wdt:P17 wd:Q17; wdt:P625 ?c; wdt:P31/wdt:P279* ?root.
}}''')
    }
    return rows, structures


def parse_point(wkt: str):
    m = re.match(r'Point\(([-\d.]+) ([-\d.]+)\)', wkt)
    if not m:
        return None
    lng, lat = float(m.group(1)), float(m.group(2))
    # 日本の範囲外（座標の入力ミス）は捨てる
    if not (20 <= lat <= 46 and 122 <= lng <= 154):
        return None
    return round(lat, 5), round(lng, 5)


def fetch_extracts(titles):
    out = {}
    for start in range(0, len(titles), 20):
        chunk = titles[start:start + 20]
        params = {
            'action': 'query', 'format': 'json', 'formatversion': '2', 'prop': 'extracts',
            'exintro': '1', 'explaintext': '1', 'exlimit': '20', 'redirects': '1', 'titles': '|'.join(chunk),
        }
        data = get_json('https://ja.wikipedia.org/w/api.php?' + urllib.parse.urlencode(params), timeout=60)['query']
        back = {}
        for n in data.get('normalized', []) + data.get('redirects', []):
            back[n['to']] = back.get(n['from'], n['from'])
        for page in data.get('pages', []):
            original = back.get(page['title'], page['title'])
            out[original] = page.get('extract') or ''
        sys.stderr.write(f'\rWikipedia {min(start + 20, len(titles))}/{len(titles)}')
        time.sleep(0.5)
    sys.stderr.write('\n')
    return out


def short_description(extract: str) -> str:
    text = extract.strip().split('\n')[0]
    # 読み仮名や別名の括弧（「東大寺（とうだいじ）は」）を外す
    text = re.sub(r'（[^（）]*）|\([^()]*\)', '', text)
    text = re.sub(r'（[^（）]*）|\([^()]*\)', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    sentences = [s + '。' for s in text.split('。') if s.strip()]
    desc = ''
    for s in sentences:
        if desc and len(desc + s) > DESC_MAX:
            break
        desc += s
        if len(desc) >= 50:
            break
    if len(desc) > DESC_MAX:
        desc = desc[:DESC_MAX - 1].rstrip('、') + '…'
    return desc


def main():
    rows, structures = fetch_items()
    by_title = {}
    for r in rows:
        kinds = {KINDS[qid(d)] for d in r['ds']['value'].split('|')}
        item = qid(r['i']['value'])
        if not (kinds & PLACE_KINDS) and item not in structures:
            continue
        point = parse_point(r['c']['value'])
        if point is None:
            continue
        title = r['title']['value']
        entry = by_title.setdefault(title, {'id': item, 'name': r.get('label', {}).get('value') or title, 'kinds': set(), 'point': point})
        entry['kinds'] |= kinds

    extracts = fetch_extracts(sorted(by_title))
    sites = []
    for title, e in sorted(by_title.items(), key=lambda kv: kv[1]['id']):
        desc = short_description(extracts.get(title, ''))
        if not desc:
            continue
        # 特別史跡なら「史跡」は重ねて書かない（名勝も同じ）
        kinds = e['kinds']
        if 'specialHistoric' in kinds:
            kinds.discard('historic')
        if 'specialScenic' in kinds:
            kinds.discard('scenic')
        if 'treasure' in kinds:
            kinds.discard('important')
        sites.append({
            'id': e['id'],
            'name': e['name'],
            'kinds': [k for k in KIND_ORDER if k in kinds],
            'lat': e['point'][0],
            'lng': e['point'][1],
            'desc': desc,
            'wiki': title,
        })

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(sites, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')
    print(f'{len(sites)} 件を {OUT_PATH} に書きました')


if __name__ == '__main__':
    main()
