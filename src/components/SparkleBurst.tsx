import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

export type Sparkle = { id: number; x: number; y: number };

type Props = {
  /** 弾けさせる場所（画面上の位置）。1 つにつき 1 回弾けて消える */
  sparkles: Sparkle[];
  /** 弾け終わった */
  onDone: (id: number) => void;
};

const PARTICLE_COUNT = 14;
const DURATION_MS = 900;
const COLORS = ['#FDE68A', '#6EE7B7', '#FFFFFF', '#A7F3D0', '#FCD34D'];
const GLYPHS = ['✦', '✧', '✦', '·'];

/** 言葉を拾ったときの、タップした所からパラパラ弾けるキラキラ（Calm：小さく、短く、ふわっと消える） */
export function SparkleBurst({ sparkles, onDone }: Props): React.JSX.Element {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {sparkles.map((sparkle) => (
        <Burst key={sparkle.id} sparkle={sparkle} onDone={onDone} />
      ))}
    </View>
  );
}

function Burst({ sparkle, onDone }: { sparkle: Sparkle; onDone: (id: number) => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  // 粒ごとの飛ぶ向き・距離・大きさ・色（弾けるたびに少しずつ違う）
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const distance = 36 + Math.random() * 46;
      return {
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        size: 9 + Math.random() * 9,
        color: COLORS[i % COLORS.length],
        glyph: GLYPHS[i % GLYPHS.length],
        spin: (Math.random() - 0.5) * 240,
      };
    })
  ).current;

  // 親が描き直されても弾け直さないよう、アニメーションは 1 回だけ始める（終わったときは最新の onDone を呼ぶ）
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => onDoneRef.current(sparkle.id));
  }, [progress, sparkle.id]);

  return (
    <>
      {particles.map((p, index) => {
        const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] });
        // 少しだけ下に落ちながら消える
        const translateY = progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, p.dy, p.dy + 18] });
        const opacity = progress.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 0.8, 0] });
        const scale = progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.4, 1.1, 0.5] });
        const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] });
        return (
          <Animated.Text
            key={index}
            style={[
              styles.particle,
              {
                left: sparkle.x - p.size / 2,
                top: sparkle.y - p.size / 2,
                fontSize: p.size,
                color: p.color,
                opacity,
                transform: [{ translateX }, { translateY }, { scale }, { rotate }],
              },
            ]}
          >
            {p.glyph}
          </Animated.Text>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    textShadowColor: 'rgba(16, 185, 129, 0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
});
