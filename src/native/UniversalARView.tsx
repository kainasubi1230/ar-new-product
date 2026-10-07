import React from 'react';
import {
  NativeSyntheticEvent,
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
  selectedModelUrl?: string;
  onCardPlaced?: (event: NativeSyntheticEvent<CardPlacedEvent>) => void;
  onModelPlaced?: (event: NativeSyntheticEvent<any>) => void;
};

const NativeARView = requireNativeComponent<UniversalARViewProps>('ARViewManager');

export function UniversalARView(props: UniversalARViewProps): React.JSX.Element {
  return <NativeARView {...props} />;
}

