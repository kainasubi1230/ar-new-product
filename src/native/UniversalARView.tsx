import React from 'react';
import {
  NativeSyntheticEvent,
  Platform,
  requireNativeComponent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import type { GeoTagLevel } from '../config/distanceTiers';

export type CardPlacedEvent = {
  cardTitle: string;
  cardDescription: string;
  cardColor: string;
  cardIcon: string;
  /** iOSのみ。投稿IDが決まるまでの仮アンカーID（worldMapSaveRequest に渡す） */
  anchorId?: string;
  x: number;
  y: number;
  z: number;
};

export type NativeSupabaseConfig = {
  url: string;
  apiKey: string;
  accessToken?: string;
};

/** requestId が変わるたびに、anchorId のカードを postId のアンカーにして地図を保存する（iOSのみ） */
export type WorldMapSaveRequest = {
  requestId: number;
  postId: string;
  anchorId: string;
  supabase: NativeSupabaseConfig;
};

export type RelocalizeCard = {
  postId: string;
  cardTitle: string;
  cardDescription: string;
  cardIcon: string;
  cardColor: string;
  /** posts.tags。空ならカードにタグの行を出さない */
  cardTags: string[];
};

/**
 * postId の投稿の地図を読み込み、再位置合わせできたら cards のうち地図に入っている投稿をすべてカードで表示する（iOSのみ）
 */
export type RelocalizeTarget = {
  postId: string;
  worldMapPath: string;
  /** 置いたときの景色の写真。あれば照合中に半透明で重ねて「この景色に合わせてください」と案内する */
  snapshotPath?: string | null;
  cards: RelocalizeCard[];
  supabase: NativeSupabaseConfig;
};

/** 方角タグ（iOSのみ）。GPSの距離・方角とコンパスで、AR 画面のその方向に浮かべる */
export type GeoTag = {
  postId: string;
  cardTitle: string;
  cardDescription: string;
  cardIcon: string;
  cardColor: string;
  /** posts.tags。空ならタグの行を出さない */
  cardTags: string[];
  /** summary: タグと距離だけ / message: 本文も出す（しきい値は src/config/distanceTiers.ts） */
  level: GeoTagLevel;
  /** 0〜1。近いほど 1 で、濃く描く（遠いほど薄く小さく） */
  prominence: number;
  /** 関心タグに合う投稿など、少し大きく濃く強調して出す */
  highlighted: boolean;
  distanceM: number;
  /** 現在地から見た方角（北=0°、時計回り） */
  bearingDeg: number;
};

export type WorldMapStatusEvent = {
  /** snapshotSaved: 置いたときの景色の写真を上げた（地図の記録とは別に届く） */
  phase: 'mapping' | 'uploading' | 'saved' | 'failed' | 'snapshotSaved';
  postId: string;
  mappingStatus?: 'notAvailable' | 'limited' | 'extending' | 'mapped';
  path?: string;
  bytes?: number;
  message?: string;
};

export type RelocalizationStatusEvent = {
  phase:
    | 'downloading'
    | 'relocalizing'
    | 'found'
    | 'relocalizedWithoutCard'
    | 'timeout'
    | 'mapExtended'
    | 'failed'
    | 'cancelled';
  postId: string;
  message?: string;
  bytes?: number;
};

/** 位置情報が「正確な位置情報」で許可されているか（iOSのみ） */
export type LocationAccuracyStatusEvent = {
  fullAccuracy: boolean;
};

/** コンパスの精度が悪く、8 の字の補正が必要か（iOSのみ） */
export type CompassStatusEvent = {
  needsCalibration: boolean;
  /** 方位の誤差（度）。負の値は無効 */
  headingAccuracy: number;
};

export type UniversalARViewProps = {
  style?: StyleProp<ViewStyle>;
  cardTitle: string;
  cardDescription: string;
  cardColor: string;
  cardIcon: string;
  /** これから置くカードのタグ（iOSのみ）。空ならタグの行を出さない */
  cardTags?: string[];
  placeTrigger?: number;
  isPreviewActive?: boolean;
  selectedModelUrl?: string;
  onScreenTapped?: (event: NativeSyntheticEvent<{ x: number; y: number }>) => void;
  onCardPlaced?: (event: NativeSyntheticEvent<CardPlacedEvent>) => void;
  onModelPlaced?: (event: NativeSyntheticEvent<any>) => void;
  worldMapSaveRequest?: WorldMapSaveRequest | null;
  relocalizeTarget?: RelocalizeTarget | null;
  geoTags?: GeoTag[];
  onWorldMapStatus?: (event: NativeSyntheticEvent<WorldMapStatusEvent>) => void;
  onRelocalizationStatus?: (event: NativeSyntheticEvent<RelocalizationStatusEvent>) => void;
  onLocationAccuracyStatus?: (event: NativeSyntheticEvent<LocationAccuracyStatusEvent>) => void;
  onCompassStatus?: (event: NativeSyntheticEvent<CompassStatusEvent>) => void;
};

const COMPONENT_NAME = Platform.OS === 'ios' ? 'ARView' : 'ARViewManager';
const NativeARView = requireNativeComponent<UniversalARViewProps>(COMPONENT_NAME);

export function UniversalARView(props: UniversalARViewProps): React.JSX.Element {
  return <NativeARView {...props} />;
}

