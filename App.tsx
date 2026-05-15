import React, { useMemo, useState } from 'react';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { UniversalARView } from './src/native/UniversalARView';

type ModelItem = {
  id: string;
  label: string;
  color: string;
  iosUrl: string;
  androidUrl: string;
};

const MODELS: ModelItem[] = [
  {
    id: 'chair',
    label: 'Chair',
    color: '#1E90FF',
    iosUrl: 'models/chair.usdz',
    androidUrl: 'models/chair.glb',
  },
  {
    id: 'lamp',
    label: 'Lamp',
    color: '#FF8C00',
    iosUrl: 'models/lamp.usdz',
    androidUrl: 'models/lamp.glb',
  },
  {
    id: 'table',
    label: 'Table',
    color: '#3CB371',
    iosUrl: 'models/table.usdz',
    androidUrl: 'models/table.glb',
  },
];

function App(): React.JSX.Element {
  const [selectedModelId, setSelectedModelId] = useState<string>(MODELS[0].id);
  const [lastPlacedMessage, setLastPlacedMessage] = useState<string>('No model placed yet');

  const selectedModel = useMemo(() => {
    return MODELS.find((item) => item.id === selectedModelId) ?? MODELS[0];
  }, [selectedModelId]);

  const selectedModelUrl = Platform.OS === 'ios' ? selectedModel.iosUrl : selectedModel.androidUrl;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />

      <View style={styles.arContainer}>
        <UniversalARView
          style={StyleSheet.absoluteFill}
          selectedModelUrl={selectedModelUrl}
          onModelPlaced={(event) => {
            const { modelUrl, x, y, z } = event.nativeEvent;
            setLastPlacedMessage(
              `${modelUrl} @ (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`,
            );
          }}
        />
      </View>

      <View style={styles.bottomSheet}>
        <Text style={styles.sheetTitle}>Spatial Inventory</Text>
        <Text style={styles.sheetSubtitle}>Selected: {selectedModel.label}</Text>
        <Text style={styles.sheetSubtitle}>Last Placed: {lastPlacedMessage}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modelList}
        >
          {MODELS.map((item) => {
            const isSelected = item.id === selectedModelId;
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.modelCard,
                  { backgroundColor: item.color },
                  isSelected ? styles.modelCardSelected : undefined,
                ]}
                onPress={() => setSelectedModelId(item.id)}
                activeOpacity={0.85}
              >
                <Text style={styles.modelText}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#090B10',
  },
  arContainer: {
    flex: 1,
  },
  bottomSheet: {
    backgroundColor: '#121723',
    paddingTop: 12,
    paddingBottom: 20,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: '#25304A',
  },
  sheetTitle: {
    color: '#E8EEFF',
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 16,
  },
  sheetSubtitle: {
    color: '#A8B4D0',
    fontSize: 14,
    marginTop: 4,
    paddingHorizontal: 16,
  },
  modelList: {
    marginTop: 14,
    paddingHorizontal: 12,
    gap: 10,
  },
  modelCard: {
    width: 110,
    height: 74,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modelCardSelected: {
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.03 }],
  },
  modelText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default App;
