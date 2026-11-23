import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

// 起動画面（LaunchScreen.storyboard）と同じロゴ・同じ大きさ・同じ位置。
// 画像は Images.xcassets の LaunchLogo をそのまま使う（JS 側に同じ画像を持たない）
const LOGO = { uri: 'LaunchLogo' };
const LOGO_SIZE = 140;
// ロゴを見せておく時間と、消えていく時間
const HOLD_MS = 1400;
const FADE_MS = 600;

/**
 * 起動画面のロゴを少し長く見せる。
 * iOS の起動画面は JS の準備ができた瞬間に消えてしまうので、
 * 同じ見た目のものを上に重ねておき、少し待ってからふわっと消す。
 */
export default function SplashOverlay(): React.JSX.Element | null {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.delay(HOLD_MS),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_MS,
          easing: Easing.bezier(0.33, 0, 0.2, 1),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.06,
          duration: FADE_MS,
          easing: Easing.bezier(0.33, 0, 0.2, 1),
          useNativeDriver: true,
        }),
      ]),
    ]);
    animation.start(() => setIsDone(true));
    return () => animation.stop();
  }, [opacity, scale]);

  if (isDone) {
    return null;
  }
  return (
    <Animated.View pointerEvents="none" style={[styles.root, { opacity }]}>
      <Animated.Image source={LOGO} style={[styles.logo, { transform: [{ scale }] }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    resizeMode: 'contain',
  },
});
