import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

export type ToastKind = 'info' | 'success' | 'error';
export type ToastMessage = { id: number; message: string; kind: ToastKind };

type Props = {
  /** 出すメッセージ。null にするとふわっと消える */
  toast: ToastMessage | null;
};

const DOT_COLORS: Record<ToastKind, string> = {
  info: '#CBD5E1',
  success: '#34D399',
  error: '#FCA5A5',
};

/**
 * 画面の下に出る、小さく穏やかなお知らせ（Calm）。下からふわっと浮き上がり、ふわっと消える。
 * 先頭の小さな点の色で、お知らせ・成功・失敗を見分ける
 */
export function CalmToast({ toast }: Props): React.JSX.Element | null {
  // 消える間も文字を残しておくため、表示中のメッセージは別に持つ
  const [shown, setShown] = useState<ToastMessage | null>(toast);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (toast) {
      setShown(toast);
      Animated.timing(progress, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: 260,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setShown(null);
      });
    }
  }, [toast, progress]);

  if (!shown) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[styles.pill, { opacity: progress, transform: [{ translateY }] }]}>
        <View style={[styles.dot, { backgroundColor: DOT_COLORS[shown.kind] }]} />
        <Text style={styles.text} numberOfLines={2}>
          {shown.message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 36,
    alignItems: 'center',
    zIndex: 45,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.74)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 9,
  },
  text: {
    flexShrink: 1,
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
