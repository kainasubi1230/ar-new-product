import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { hexToHsv, hsvToHex, normalizeHexInput, type Hsv } from '../../utils/color';

type Props = {
  value: string;
  onChange: (hex: string) => void;
  /** 下に並べる色（無ければ QUICK_COLORS） */
  quickColors?: readonly string[];
  /** スライダーを触っている間 true（外側の ScrollView のスクロールを止めるのに使う） */
  onDraggingChange?: (isDragging: boolean) => void;
};

const QUICK_COLORS = [
  '#FFFFFF', '#F4E9D2', '#FFD6E0', '#FFB4A2', '#FF6B6B', '#FFB703', '#FFE066', '#B5E48C',
  '#52B788', '#4CC9F0', '#4361EE', '#9B5DE5', '#8D6E63', '#6C757D', '#343A40', '#111111',
];

/** 色を選ぶ：色相・彩度・明度のスライダー、HEX の入力、よく使う色（中央そろえ） */
export function ColorPicker({ value, onChange, quickColors = QUICK_COLORS, onDraggingChange }: Props): React.JSX.Element {
  // 灰色（彩度 0）にしても色相を忘れないよう、HSV は手元で持つ
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexText, setHexText] = useState(value);
  const lastEmitted = useRef(value);

  // 外から色が変わった（パーツの切り替え・プリセット・リセット）ときだけ合わせ直す
  useEffect(() => {
    if (value.toUpperCase() !== lastEmitted.current.toUpperCase()) {
      setHsv(hexToHsv(value));
      lastEmitted.current = value;
    }
    setHexText(value);
  }, [value]);

  const update = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    lastEmitted.current = hex;
    onChange(hex);
  };

  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const gray = hsvToHex({ h: hsv.h, s: 0, v: hsv.v });
  const full = hsvToHex({ h: hsv.h, s: hsv.s, v: 1 });

  return (
    <View style={styles.container}>
      <GradientSlider
        id="hue"
        label="色相"
        value={hsv.h / 360}
        stops={['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000']}
        thumbColor={pure}
        onDraggingChange={onDraggingChange}
        onChange={(x) => update({ ...hsv, h: Math.min(359.9, x * 360) })}
      />
      <GradientSlider
        id="saturation"
        label="彩度"
        value={hsv.s}
        stops={[gray, hsvToHex({ h: hsv.h, s: 1, v: hsv.v })]}
        thumbColor={value}
        onDraggingChange={onDraggingChange}
        onChange={(x) => update({ ...hsv, s: x })}
      />
      <GradientSlider
        id="brightness"
        label="明度"
        value={hsv.v}
        stops={['#000000', full]}
        thumbColor={value}
        onDraggingChange={onDraggingChange}
        onChange={(x) => update({ ...hsv, v: x })}
      />

      <View style={styles.hexRow}>
        <View style={[styles.hexSwatch, { backgroundColor: value }]} />
        <Text style={styles.hexHash}>HEX</Text>
        <TextInput
          style={styles.hexInput}
          value={hexText}
          onChangeText={(text) => {
            setHexText(text);
            const hex = normalizeHexInput(text);
            // 6 桁そろったらすぐ反映（3 桁は確定したときだけ）
            if (hex && text.replace('#', '').length === 6) {
              setHsv(hexToHsv(hex));
              lastEmitted.current = hex;
              onChange(hex);
            }
          }}
          onEndEditing={() => {
            const hex = normalizeHexInput(hexText);
            if (hex) {
              setHsv(hexToHsv(hex));
              lastEmitted.current = hex;
              onChange(hex);
            } else {
              setHexText(value);
            }
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          placeholder="#RRGGBB"
          placeholderTextColor="#94A3B8"
        />
      </View>

      <View style={styles.quickRow}>
        {quickColors.map((hex) => (
          <TouchableOpacity
            key={hex}
            accessibilityLabel={hex}
            activeOpacity={0.7}
            onPress={() => {
              setHsv(hexToHsv(hex));
              lastEmitted.current = hex;
              onChange(hex);
            }}
            style={[styles.quickDot, { backgroundColor: hex }, value.toUpperCase() === hex.toUpperCase() && styles.quickDotSelected]}
          />
        ))}
      </View>
    </View>
  );
}

type SliderProps = {
  /** グラデーションの id（英数字） */
  id: string;
  label: string;
  /** 0〜1 */
  value: number;
  stops: string[];
  thumbColor: string;
  onChange: (value: number) => void;
  onDraggingChange?: (isDragging: boolean) => void;
};

const TRACK_HEIGHT = 22;
const THUMB = 30;

/** グラデーションの帯の上をつまんで動かすスライダー（触った所にすぐ飛ぶ） */
function GradientSlider({ id, label, value, stops, thumbColor, onChange, onDraggingChange }: SliderProps): React.JSX.Element {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onDraggingRef = useRef(onDraggingChange);
  onDraggingRef.current = onDraggingChange;

  const pick = (x: number) => {
    if (widthRef.current <= 0) return;
    onChangeRef.current(Math.min(1, Math.max(0, x / widthRef.current)));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // 縦スクロールに取られないようにする
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        onDraggingRef.current?.(true);
        pick(e.nativeEvent.locationX);
      },
      onPanResponderMove: (e) => pick(e.nativeEvent.locationX),
      onPanResponderRelease: () => onDraggingRef.current?.(false),
      onPanResponderTerminate: () => onDraggingRef.current?.(false),
    })
  ).current;

  const gradientId = `avatar-slider-${id}`;
  return (
    <View style={styles.sliderBlock}>
      <Text style={styles.sliderLabel}>{label}</Text>
      <View
        style={styles.sliderTouch}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
        {...responder.panHandlers}
      >
        <View style={styles.track} pointerEvents="none">
          {width > 0 && (
            <Svg width={width} height={TRACK_HEIGHT}>
              <Defs>
                <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                  {stops.map((c, i) => (
                    <Stop key={i} offset={stops.length === 1 ? 0 : i / (stops.length - 1)} stopColor={c} />
                  ))}
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={width} height={TRACK_HEIGHT} rx={TRACK_HEIGHT / 2} fill={`url(#${gradientId})`} />
            </Svg>
          )}
        </View>
        <View
          pointerEvents="none"
          style={[styles.thumb, { left: value * Math.max(0, width) - THUMB / 2, backgroundColor: thumbColor }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  sliderBlock: { gap: 4 },
  sliderLabel: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  sliderTouch: { height: THUMB + 6, justifyContent: 'center', marginHorizontal: THUMB / 2 },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  hexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  hexSwatch: { width: 28, height: 28, borderRadius: 9, borderWidth: 2, borderColor: '#E2E8F0' },
  hexHash: { fontSize: 12, fontWeight: '800', color: '#94A3B8' },
  hexInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
    paddingVertical: 4,
  },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  quickDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#E2E8F0' },
  quickDotSelected: { borderWidth: 3, borderColor: '#10B981', transform: [{ scale: 1.12 }] },
});
