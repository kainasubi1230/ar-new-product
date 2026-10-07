import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { UniversalARView } from './src/native/UniversalARView';

type CardPreset = {
  id: string;
  label: string;
  icon: string;
  title: string;
  description: string;
  color: string;
};

const PRESETS: CardPreset[] = [
  {
    id: 'spot',
    label: '📌 スポット案内',
    icon: '📌',
    title: '会議室 Alpha',
    description: '定員 10名 • プロジェクター / ホワイトボード完備',
    color: '#00E5FF',
  },
  {
    id: 'product',
    label: '🏷️ 商品情報',
    icon: '🏷️',
    title: 'スマート空気清浄機 Pro',
    description: '¥34,800 • HEPA 13 フィルター • 22dB 静音動作',
    color: '#00E676',
  },
  {
    id: 'warning',
    label: '⚠️ 注意事項',
    icon: '⚠️',
    title: '足元注意：清掃作業中',
    description: '床面が濡れて滑りやすくなっております',
    color: '#FF3D00',
  },
  {
    id: 'custom',
    label: '✏️ カスタムメモ',
    icon: '💡',
    title: 'ARメモカード',
    description: '自由にメッセージを入力してAR空間に投影',
    color: '#AA00FF',
  },
];

function App(): React.JSX.Element {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESETS[0].id);
  const [customTitle, setCustomTitle] = useState<string>(PRESETS[0].title);
  const [customDescription, setCustomDescription] = useState<string>(PRESETS[0].description);
  const [customColor, setCustomColor] = useState<string>(PRESETS[0].color);
  const [customIcon, setCustomIcon] = useState<string>(PRESETS[0].icon);
  const [lastPlacedMessage, setLastPlacedMessage] = useState<string>('まだ配置されていません');

  const handleSelectPreset = (preset: CardPreset) => {
    setSelectedPresetId(preset.id);
    setCustomTitle(preset.title);
    setCustomDescription(preset.description);
    setCustomColor(preset.color);
    setCustomIcon(preset.icon);
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* AR View Header Status */}
      <View style={styles.topHeader}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>AR SPATIAL CARD PROJECTOR</Text>
        </View>
        <Text style={styles.headerHint}>画面の平面をタップしてカードを投影</Text>
      </View>

      {/* AR View Camera Canvas */}
      <View style={styles.arContainer}>
        <UniversalARView
          style={StyleSheet.absoluteFill}
          cardTitle={customTitle}
          cardDescription={customDescription}
          cardColor={customColor}
          cardIcon={customIcon}
          onCardPlaced={(event) => {
            const { cardTitle, x, y, z } = event.nativeEvent;
            setLastPlacedMessage(
              `「${cardTitle}」 @ (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})m`,
            );
          }}
          onModelPlaced={(event) => {
            if (event.nativeEvent?.x !== undefined) {
              const { x, y, z } = event.nativeEvent;
              setLastPlacedMessage(
                `カード投影 @ (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})m`,
              );
            }
          }}
        />
      </View>

      {/* Control Panel Bottom Sheet */}
      <View style={styles.bottomSheet}>
        <View style={styles.sheetHeaderRow}>
          <Text style={styles.sheetTitle}>AR 空間情報カード設定</Text>
          <Text style={styles.lastPlacedText}>直近配置: {lastPlacedMessage}</Text>
        </View>

        {/* Preset Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.presetList}
        >
          {PRESETS.map((preset) => {
            const isSelected = preset.id === selectedPresetId;
            return (
              <TouchableOpacity
                key={preset.id}
                style={[
                  styles.presetChip,
                  isSelected && {
                    borderColor: preset.color,
                    backgroundColor: `${preset.color}25`,
                  },
                ]}
                onPress={() => handleSelectPreset(preset)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    isSelected && { color: preset.color, fontWeight: '700' },
                  ]}
                >
                  {preset.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Card Content Customizer */}
        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>アイコン</Text>
            <TextInput
              style={styles.iconInput}
              value={customIcon}
              onChangeText={setCustomIcon}
              maxLength={4}
            />
            <Text style={[styles.inputLabel, { marginLeft: 12 }]}>タイトル</Text>
            <TextInput
              style={[styles.textInput, styles.titleInput]}
              value={customTitle}
              onChangeText={setCustomTitle}
              placeholder="タイトルを入力"
              placeholderTextColor="#5A6E8C"
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>詳細説明</Text>
            <TextInput
              style={[styles.textInput, styles.descInput]}
              value={customDescription}
              onChangeText={setCustomDescription}
              placeholder="詳細情報やメッセージを入力"
              placeholderTextColor="#5A6E8C"
              multiline
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#07090E',
  },
  topHeader: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 10,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  badge: {
    backgroundColor: 'rgba(0, 229, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00E5FF',
    marginBottom: 6,
  },
  badgeText: {
    color: '#00E5FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerHint: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  arContainer: {
    flex: 1,
  },
  bottomSheet: {
    backgroundColor: '#0E131F',
    paddingTop: 14,
    paddingBottom: 24,
    paddingHorizontal: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: '#1F2B42',
  },
  sheetHeaderRow: {
    marginBottom: 10,
  },
  sheetTitle: {
    color: '#F0F4FF',
    fontSize: 16,
    fontWeight: '700',
  },
  lastPlacedText: {
    color: '#8A99B5',
    fontSize: 12,
    marginTop: 2,
  },
  presetList: {
    gap: 8,
    paddingVertical: 6,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#151C2C',
    borderWidth: 1,
    borderColor: '#24324D',
  },
  presetChipText: {
    color: '#A0B0D0',
    fontSize: 13,
  },
  inputContainer: {
    marginTop: 12,
    gap: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputLabel: {
    color: '#7C8BA5',
    fontSize: 12,
    marginRight: 8,
    fontWeight: '600',
  },
  iconInput: {
    backgroundColor: '#161E30',
    color: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#24324D',
    textAlign: 'center',
    width: 44,
  },
  textInput: {
    backgroundColor: '#161E30',
    color: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#24324D',
  },
  titleInput: {
    flex: 1,
  },
  descInput: {
    flex: 1,
    height: 40,
  },
});

export default App;

