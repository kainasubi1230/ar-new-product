import type { ImageSourcePropType } from 'react-native';
import { Icons } from '../assets/icons';
import { bearingDegrees, distanceInMeters } from '../utils/geo';
import type { MapRegion } from './nearbyPostService';

/**
 * 文化遺産のピン（探索マップ）。
 * データはアプリに同梱（src/data/heritageSites.json、scripts/build-heritage-sites.py で作る）。
 * 通信も料金もかからず、圏外でも出せる。
 * - 位置と種類：Wikidata（CC0）
 * - 説明文：日本語版 Wikipedia の冒頭（CC BY-SA 4.0）。出典として記事名とライセンスを必ず表示する
 */

export type HeritageKind =
  | 'world'
  | 'treasure'
  | 'specialHistoric'
  | 'historic'
  | 'specialScenic'
  | 'scenic'
  | 'important';

export interface HeritageSite {
  /** Wikidata の ID（Q…） */
  id: string;
  name: string;
  /** 指定の種類。大事な順（世界遺産 → 国宝 → 特別史跡 → …） */
  kinds: HeritageKind[];
  lat: number;
  lng: number;
  /** 短い説明（Wikipedia の冒頭） */
  desc: string;
  /** 説明の出典の Wikipedia 記事名 */
  wiki: string;
}

export interface NearbyHeritageSite extends HeritageSite {
  distanceM: number;
  bearingDeg: number;
}

export const HERITAGE_KIND_LABELS: Record<HeritageKind, string> = {
  world: '世界遺産',
  treasure: '国宝',
  specialHistoric: '特別史跡',
  historic: '史跡',
  specialScenic: '特別名勝',
  scenic: '名勝',
  important: '重要文化財',
};

/** ピンとカードの絵の種類：建物（国宝・重文）・世界遺産・史跡・名勝 */
type HeritageIconType = 'temple' | 'world' | 'kofun' | 'scenic';

const iconTypeOf = (site: HeritageSite): HeritageIconType => {
  const primary = site.kinds[0];
  if (primary === 'world') return 'world';
  if (primary === 'specialHistoric' || primary === 'historic') return 'kofun';
  if (primary === 'specialScenic' || primary === 'scenic') return 'scenic';
  return 'temple';
};

const ICONS: Record<HeritageIconType, ImageSourcePropType> = {
  temple: Icons.heritageTemple,
  world: Icons.heritageWorld,
  kofun: Icons.heritageKofun,
  scenic: Icons.heritageScenic,
};

export const heritageIcon = (site: HeritageSite) => ICONS[iconTypeOf(site)];

/** 「世界遺産・国宝」のような種類の表示 */
export const heritageKindText = (site: HeritageSite) =>
  site.kinds.map((k) => HERITAGE_KIND_LABELS[k]).join('・');

export const heritageSourceUrl = (site: HeritageSite) =>
  `https://ja.wikipedia.org/wiki/${encodeURIComponent(site.wiki.replace(/ /g, '_'))}`;

/**
 * 地図の上を、縦に HERITAGE_GRID_ROWS 区画くらいに分けて、1 区画に 1 つだけ出す（Calm：ピンで地図が埋まらないように）。
 * 近づけば区画が小さくなり、隠れていたものも出てくる
 */
const HERITAGE_GRID_ROWS = 8;

/** 目立たせる種類（世界遺産・国宝・特別史跡・特別名勝）。区画の中ではこれを先に選び、ピンも少し大きく */
export const isMajorHeritage = (site: HeritageSite) =>
  site.kinds.some((k) => k === 'world' || k === 'treasure' || k === 'specialHistoric' || k === 'specialScenic');

const KIND_RANK: Record<HeritageKind, number> = {
  world: 0,
  treasure: 1,
  specialHistoric: 2,
  specialScenic: 3,
  historic: 4,
  scenic: 5,
  important: 6,
};

let sitesCache: HeritageSite[] | null = null;
// 約 2000 件・600KB あるので、探索ページを開いたときに初めて読み込む
const allSites = (): HeritageSite[] => {
  if (!sitesCache) sitesCache = require('../data/heritageSites.json') as HeritageSite[];
  return sitesCache;
};

/**
 * 地図に映っている範囲の文化遺産を、区画ごとに 1 つずつ（大事な種類 → 区画の真ん中に近い順で選ぶ）。
 * 区画は緯度経度に固定した格子（大きさは 2 のべき乗の度に丸める）なので、地図を少し動かしたくらいでは顔ぶれが変わらない。
 * keepId（選んでいるもの）は区画にかかわらず必ず残す。
 * 距離・方角は from（今の位置）から。分からなければ地図の真ん中から
 */
export const findHeritageInRegion = (
  region: MapRegion,
  from: { latitude: number; longitude: number } | null,
  keepId?: string | null
): NearbyHeritageSite[] => {
  const halfLat = region.latitudeDelta / 2;
  const halfLng = region.longitudeDelta / 2;
  const cellDeg = 2 ** Math.round(Math.log2(region.latitudeDelta / HERITAGE_GRID_ROWS));
  const best = new Map<string, { site: HeritageSite; rank: number; offset: number }>();
  let kept: HeritageSite | null = null;
  for (const s of allSites()) {
    if (Math.abs(s.lat - region.latitude) > halfLat || Math.abs(s.lng - region.longitude) > halfLng) continue;
    if (s.id === keepId) kept = s;
    const row = Math.floor(s.lat / cellDeg);
    const col = Math.floor(s.lng / cellDeg);
    const key = `${row}:${col}`;
    const rank = KIND_RANK[s.kinds[0]] ?? 9;
    const offset = ((s.lat / cellDeg) % 1 - 0.5) ** 2 + ((s.lng / cellDeg) % 1 - 0.5) ** 2;
    const current = best.get(key);
    if (!current || rank < current.rank || (rank === current.rank && offset < current.offset)) {
      best.set(key, { site: s, rank, offset });
    }
  }
  const sites = [...best.values()].map((b) => b.site);
  if (kept && !sites.includes(kept)) sites.push(kept);
  const origin = from ?? region;
  return sites.map((s) => ({
    ...s,
    distanceM: distanceInMeters(origin.latitude, origin.longitude, s.lat, s.lng),
    bearingDeg: bearingDegrees(origin.latitude, origin.longitude, s.lat, s.lng),
  }));
};
