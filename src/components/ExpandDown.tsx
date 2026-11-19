import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type LayoutChangeEvent } from 'react-native';

type Props = {
  open: boolean;
  children: React.ReactNode;
  /** 開く・閉じるのにかける時間（ms） */
  duration?: number;
  /** 畳み終わって消えたとき（上の要素の見た目を、閉じ終わってから戻したいとき用） */
  onClosed?: () => void;
};

/**
 * 上の要素の下から、引き出しのように下へ開く入れ物。高さを 0 から中身の高さまで広げ、
 * 中身は少し上からすべり降りてくる。閉じるときは逆に畳んでから消す（下にあるものも一緒になめらかに動く）
 */
// 出だしも終わりもゆっくりな、なめらかな曲線（急に動き出したり、急に止まったりしない）
const SMOOTH = Easing.bezier(0.33, 0, 0.2, 1);

export function ExpandDown({ open, children, duration = 420, onClosed }: Props): React.JSX.Element | null {
  const [isMounted, setIsMounted] = useState(open);
  const [contentHeight, setContentHeight] = useState(0);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    if (open) setIsMounted(true);
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration,
      easing: SMOOTH,
      // 高さは native driver で動かせない
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished && !open) {
        setIsMounted(false);
        onClosed?.();
      }
    });
    return () => animation.stop();
    // onClosed は毎回作り直されても動きをやり直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, duration, progress]);

  if (!isMounted) return null;

  const onContentLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (Math.abs(height - contentHeight) > 0.5) setContentHeight(height);
  };

  // 最初から開いていて、まだ高さを測れていないときは、ふつうに並べて測る
  // （高さ 0 の入れ物に入れると、一覧を開いた瞬間にカードが一度消えて見える）
  if (open && contentHeight === 0) {
    return <Animated.View onLayout={onContentLayout}>{children}</Animated.View>;
  }

  return (
    <Animated.View
      style={{
        overflow: 'hidden',
        height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, contentHeight] }),
        opacity: progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.35, 1] }),
      }}
    >
      {/* 中身は本来の高さで測る（外の高さに縛られないよう absolute） */}
      <Animated.View
        onLayout={onContentLayout}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
        }}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}
