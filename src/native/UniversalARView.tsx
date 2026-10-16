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
  x: number;
  y: number;
  z: number;
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
};

const COMPONENT_NAME = Platform.OS === 'ios' ? 'ARView' : 'ARViewManager';
const NativeARView = requireNativeComponent<UniversalARViewProps>(COMPONENT_NAME);

export function UniversalARView(props: UniversalARViewProps): React.JSX.Element {
  return <NativeARView {...props} />;
}

