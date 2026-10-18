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

/** この投稿の地図を読み込み、再位置合わせできたらカードを表示する（iOSのみ） */
export type RelocalizeTarget = {
  postId: string;
  worldMapPath: string;
  cardTitle: string;
  cardDescription: string;
  cardIcon: string;
  cardColor: string;
  supabase: NativeSupabaseConfig;
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
  phase: 'downloading' | 'relocalizing' | 'found' | 'failed';
  postId: string;
  message?: string;
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
  onWorldMapStatus?: (event: NativeSyntheticEvent<WorldMapStatusEvent>) => void;
  onRelocalizationStatus?: (event: NativeSyntheticEvent<RelocalizationStatusEvent>) => void;
};

const COMPONENT_NAME = Platform.OS === 'ios' ? 'ARView' : 'ARViewManager';
const NativeARView = requireNativeComponent<UniversalARViewProps>(COMPONENT_NAME);

export function UniversalARView(props: UniversalARViewProps): React.JSX.Element {
  return <NativeARView {...props} />;
}

