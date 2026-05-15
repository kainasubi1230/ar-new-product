import React from 'react';
import {
  NativeSyntheticEvent,
  requireNativeComponent,
  StyleProp,
  ViewStyle,
} from 'react-native';

export type ModelPlacedEvent = {
  modelUrl: string;
  x: number;
  y: number;
  z: number;
};

export type UniversalARViewProps = {
  style?: StyleProp<ViewStyle>;
  selectedModelUrl: string;
  onModelPlaced?: (event: NativeSyntheticEvent<ModelPlacedEvent>) => void;
};

const NativeARView = requireNativeComponent<UniversalARViewProps>('ARViewManager');

export function UniversalARView(props: UniversalARViewProps): React.JSX.Element {
  return <NativeARView {...props} />;
}
