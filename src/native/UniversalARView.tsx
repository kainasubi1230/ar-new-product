import React from 'react';
import {
  NativeSyntheticEvent,
  Platform,
  requireNativeComponent,
  StyleProp,
  ViewStyle,
} from 'react-native';

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
};

/**
 * postId の投稿の地図を読み込み、再位置合わせできたら cards のうち地図に入っている投稿をすべてカードで表示する（iOSのみ）
 */
export type RelocalizeTarget = {
  postId: string;
  worldMapPath: string;
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
  distanceM: number;
  /** 現在地から見た方角（北=0°、時計回り） */
  bearingDeg: number;
};

export type WorldMapStatusEvent = {
  phase: 'mapping' | 'uploading' | 'saved' | 'failed';
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

export type UniversalARViewProps = {
  style?: StyleProp<ViewStyle>;
  cardTitle: string;
  cardDescription: string;
  cardColor: string;
  cardIcon: string;
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
};

const COMPONENT_NAME = Platform.OS === 'ios' ? 'ARView' : 'ARViewManager';
const NativeARView = requireNativeComponent<UniversalARViewProps>(COMPONENT_NAME);

export function UniversalARView(props: UniversalARViewProps): React.JSX.Element {
  return <NativeARView {...props} />;
}

