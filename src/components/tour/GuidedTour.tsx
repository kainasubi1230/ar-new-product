import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Tab } from '../BottomNav';
import { Icons } from '../../assets/icons';
import { measureTourTarget, type TourTargetKey } from './tourTargets';

// 使い方ツアーを最後まで見たか（初回の説明のあと 1 回だけ出す。マイページの歯車からもう一度見られる）
const TOUR_DONE_KEY = 'loca:tourDone';
export const markTourDone = () => AsyncStorage.setItem(TOUR_DONE_KEY, '1').catch(() => {});
export const hasFinishedTour = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(TOUR_DONE_KEY)) === '1';
  } catch {
    return false;
  }
};

type Step = {
  title: string;
  body: string;
  /** 補足（小さく） */
  note?: string;
  /** 光らせる場所 */
  target?: TourTargetKey;
  /** 'tap' は光っているところを押すと進む（押すと本当にその画面に移る）。'next' は「次へ」で進む */
  mode: 'next' | 'tap';
  /** 吹き出しの位置。center: 真ん中 / target: 光らせた場所の上 / bottom: 下のタブの上（画面を見せながら説明する） */
  placement: 'center' | 'target' | 'bottom';
  /** 背景の暗さ（画面を見せたいときは薄く） */
  dim: number;
  /** 'tap' のときに移るタブ */
  tab?: Tab;
  buttonLabel?: string;
};

const buildSteps = (isLoggedIn: boolean): Step[] => [
  {
    title: 'ホーム',
    body: 'カメラに映る景色の中に、近くの言葉が現れます。やわらかい光が見えたら、そちらへスマホを向けてみよう。',
    mode: 'next',
    placement: 'center',
    dim: 0.55,
  },
  {
    title: '言葉を残す',
    body: '「＋」から言葉を書いて、置きたい場所にカメラを向けるだけ。机やベンチの上に、景色ごと言葉を残せます。',
    target: 'post',
    mode: 'next',
    placement: 'target',
    dim: 0.6,
  },
  {
    title: '探索',
    body: '地図で、まわりの言葉を探せます。光っているところをタップしてみよう。',
    target: 'tab:radar',
    mode: 'tap',
    placement: 'target',
    dim: 0.6,
    tab: 'radar',
  },
  {
    title: '探索',
    body: 'ピンを選んで「この言葉をARで探す」を押すと、その言葉だけを探す準備をしてからホームに戻ります。',
    mode: 'next',
    placement: 'center',
    dim: 0.25,
  },
  {
    title: '通知',
    body: '言葉との出会いを、そっと知らせます。タップしてみよう。',
    target: 'tab:notifications',
    mode: 'tap',
    placement: 'target',
    dim: 0.6,
    tab: 'notifications',
  },
  {
    title: '通知',
    body: '関心タグに合う言葉の近くを通ったときだけ、通知が届きます。スマホに振り回されることはありません。',
    mode: 'next',
    placement: 'center',
    dim: 0.25,
  },
  {
    title: 'マイページ',
    body: '自分の言葉と、設定はここに。タップしてみよう。',
    target: 'tab:mypage',
    mode: 'tap',
    placement: 'target',
    dim: 0.6,
    tab: 'mypage',
  },
  {
    title: 'マイページ',
    body: isLoggedIn
      ? '残した言葉と拾った言葉を見返せます。「関心タグ」では、見たい言葉と見たくない言葉を選べます。'
      : 'ログインすると、言葉を残したり拾ったりできます。関心タグや安心フィルターで、見たい言葉と見たくない言葉も選べます。',
    mode: 'next',
    placement: 'center',
    dim: 0.25,
  },
  {
    title: 'ホームへ',
    body: 'さいごに、ホームに戻ろう。',
    target: 'tab:home',
    mode: 'tap',
    placement: 'target',
    dim: 0.6,
    tab: 'home',
  },
  {
    title: '準備ができました',
    body: '景色の中の言葉を、探しに出かけよう。',
    note: '気になる言葉は、長押しで通報・ブロックできます',
    mode: 'next',
    placement: 'center',
    dim: 0.55,
    buttonLabel: 'はじめる',
  },
];

type Props = {
  visible: boolean;
  isLoggedIn: boolean;
  /** 光っているタブを押したとき、本当にそのタブへ移る */
  onSelectTab: (tab: Tab) => void;
  /** 最後まで見た・スキップした */
  onFinish: () => void;
};

// 光らせる丸の、部品より大きくする分
const HOLE_PADDING = 10;
// 穴の外側を暗くする太い枠。穴から画面の角まで（約 1000pt）届けば足りる。
// 大きすぎると iPhone が一度に描ける大きさ（約 8000px）を超え、画面によって膜が崩れる
const DIM_BORDER = 1250;
// 穴の基準の半径（実際の大きさは scale で合わせる。動きはすべてネイティブで動かしてなめらかにする）
const BASE_RADIUS = 40;
const EASE = Easing.bezier(0.33, 0, 0.2, 1);
const DIM_COLOR = '#0F172A';

type Hole = { cx: number; cy: number; r: number };

// 画面の作り直しが終わり、次の描画が 2 回まわるまで待つ
const waitForIdle = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

/**
 * 使い方ツアー。本物の画面の上に暗い膜を重ね、1 か所だけ丸く光らせて吹き出しで説明する。
 * 光っているタブを押すと、そのタブへ本当に移ってから続きを説明する（ゲームのチュートリアルのように）。
 * 段階が変わるときは、吹き出しがふっと消え → 光る丸が次の場所へすべるように移り → 新しい吹き出しが出る
 */
export function GuidedTour({ visible, isLoggedIn, onSelectTab, onFinish }: Props): React.JSX.Element | null {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const steps = useMemo(() => buildSteps(isLoggedIn), [isLoggedIn]);
  // 進めたい段階（index）と、いま画面に出している段階（shownIndex）。切り替えの間だけずれる
  const [index, setIndex] = useState(0);
  const [shownIndex, setShownIndex] = useState(0);
  const [hole, setHole] = useState<Hole | null>(null);
  // 下のタブの上端（吹き出しを「下のタブの上」に置くため）
  const [navTop, setNavTop] = useState<number | null>(null);
  const isTransitioningRef = useRef(false);
  // ひとつ前の段階で丸が見えていたか。見えていたときだけ次の場所へすべらせ、
  // 見えていなかったら（真ん中の吹き出しのあと）新しい場所でその場に開く（膜が薄く見えている間に丸が画面を横切らないように）
  const isHoleShownRef = useRef(false);
  // タブを移った直後か。ホームの AR は作り直しで一瞬固まるので、落ち着くまで待ってから丸を動かす
  const didSwitchTabRef = useRef(false);

  const bubble = useRef(new Animated.Value(0)).current;
  // 吹き出しの「ぽんっ」と出る動き（0 → 1。ばねで少し行き過ぎてから落ち着く）
  const pop = useRef(new Animated.Value(0)).current;
  const holeX = useRef(new Animated.Value(0)).current;
  const holeY = useRef(new Animated.Value(0)).current;
  const holeScale = useRef(new Animated.Value(1)).current;
  // 穴あきの膜と、穴なしの膜の濃さ（光らせる場所があるかで入れ替える）
  const holeLayer = useRef(new Animated.Value(0)).current;
  const fullLayer = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  const step = steps[Math.min(shownIndex, steps.length - 1)];
  const isFinal = shownIndex === steps.length - 1;

  // 開くたびに最初から
  useEffect(() => {
    if (!visible) return;
    setIndex(0);
    setShownIndex(0);
    setHole(null);
    isHoleShownRef.current = false;
    bubble.setValue(0);
    holeLayer.setValue(0);
    fullLayer.setValue(0);
  }, [visible, bubble, holeLayer, fullLayer]);

  // 段階が変わるたびに：吹き出しを消しながら次の場所を測り、丸を動かしてから吹き出しを出す
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const next = steps[Math.min(index, steps.length - 1)];
    isTransitioningRef.current = true;
    const run = async () => {
      const fadeOut = new Promise<void>((resolve) =>
        Animated.parallel([
          Animated.timing(bubble, { toValue: 0, duration: 160, easing: EASE, useNativeDriver: true }),
          Animated.timing(pop, { toValue: 0.6, duration: 160, easing: EASE, useNativeDriver: true }),
        ]).start(() =>
          resolve()
        )
      );
      // タブを移った直後は画面が作り直されて一瞬固まるので、落ち着くまで待ってから測る
      // （固まっている間に丸を動かすと、引っかかって見える）
      const settleMs = didSwitchTabRef.current ? 420 : 60;
      didSwitchTabRef.current = false;
      const measure = (async () => {
        await new Promise<void>((resolve) => setTimeout(() => resolve(), settleMs));
        await waitForIdle();
        const home = await measureTourTarget('tab:home');
        const rect = next.target ? await measureTourTarget(next.target) : null;
        return { home, rect };
      })();
      const [{ home, rect }] = await Promise.all([measure, fadeOut]);
      if (cancelled) return;

      if (home) setNavTop(home.y - 10);
      const nextHole: Hole | null = rect
        ? {
            cx: rect.x + rect.width / 2,
            cy: rect.y + rect.height / 2,
            r: Math.max(rect.width, rect.height) / 2 + HOLE_PADDING,
          }
        : null;
      setShownIndex(index);
      setHole(nextHole);

      const animations: Animated.CompositeAnimation[] = [];
      if (nextHole) {
        const scale = nextHole.r / BASE_RADIUS;
        if (isHoleShownRef.current) {
          animations.push(
            Animated.timing(holeX, { toValue: nextHole.cx, duration: 440, easing: EASE, useNativeDriver: true }),
            Animated.timing(holeY, { toValue: nextHole.cy, duration: 440, easing: EASE, useNativeDriver: true }),
            Animated.timing(holeScale, { toValue: scale, duration: 440, easing: EASE, useNativeDriver: true })
          );
        } else {
          holeX.setValue(nextHole.cx);
          holeY.setValue(nextHole.cy);
          holeScale.setValue(scale);
        }
      }
      isHoleShownRef.current = nextHole != null;
      animations.push(
        Animated.timing(holeLayer, {
          toValue: nextHole ? next.dim : 0,
          duration: 360,
          easing: EASE,
          useNativeDriver: true,
        }),
        Animated.timing(fullLayer, {
          toValue: nextHole ? 0 : next.dim,
          duration: 360,
          easing: EASE,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(nextHole ? 260 : 140),
          Animated.parallel([
            Animated.timing(bubble, { toValue: 1, duration: 220, easing: EASE, useNativeDriver: true }),
            Animated.sequence([
              Animated.timing(pop, { toValue: 0, duration: 0, useNativeDriver: true }),
              Animated.spring(pop, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
            ]),
          ]),
        ])
      );
      Animated.parallel(animations).start(() => {
        if (!cancelled) isTransitioningRef.current = false;
      });
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [visible, index, steps, bubble, holeX, holeY, holeScale, holeLayer, fullLayer]);

  // 光っている丸から、輪がゆっくり広がって消える。
  // 輪は段階ごとに作り直されるので、そのたびに動きをかけ直す
  // （ネイティブで動いている途中の値に、あとから作った輪をつないでも動かないため）
  const isRingShown = visible && hole != null && step.mode === 'tap';
  useEffect(() => {
    if (!isRingShown) return;
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isRingShown, shownIndex, pulse]);

  if (!visible) return null;

  const finish = () => {
    markTourDone();
    onFinish();
  };

  const goNext = () => {
    // 切り替えの途中に押されても、二つ飛ばさない
    if (isTransitioningRef.current) return;
    if (shownIndex >= steps.length - 1) {
      finish();
      return;
    }
    setIndex(shownIndex + 1);
  };

  // 光っているタブを押したら、先に吹き出しと輪を消してからタブを移る（固まる時間に何も動いていないように）
  const onTapTarget = () => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    Animated.parallel([
          Animated.timing(bubble, { toValue: 0, duration: 160, easing: EASE, useNativeDriver: true }),
          Animated.timing(pop, { toValue: 0.6, duration: 160, easing: EASE, useNativeDriver: true }),
        ]).start(() => {
      if (step.tab) {
        didSwitchTabRef.current = true;
        onSelectTab(step.tab);
      }
      if (shownIndex >= steps.length - 1) {
        finish();
        return;
      }
      setIndex(shownIndex + 1);
    });
  };

  // 吹き出しの位置
  const bubbleWidth = Math.min(screenWidth - 32, 420);
  const bubbleLeft = (screenWidth - bubbleWidth) / 2;
  let bubblePosition: { top?: number; bottom?: number };
  if (step.placement === 'target' && hole) {
    bubblePosition = { bottom: screenHeight - (hole.cy - hole.r) + 18 };
  } else if (step.placement === 'bottom') {
    bubblePosition = { bottom: screenHeight - (navTop ?? screenHeight - 120) + 12 };
  } else {
    bubblePosition = { top: screenHeight * 0.3 };
  }
  const arrowLeft =
    step.placement === 'target' && hole
      ? Math.min(Math.max(hole.cx - bubbleLeft - 9, 24), bubbleWidth - 42)
      : null;

  // transformOrigin は小数を読めない（「132.5px」だとエラーになる）ので整数にする
  const bubbleOrigin =
    arrowLeft != null ? `${Math.round(arrowLeft + 9)}px 100%` : step.placement === 'bottom' ? '50% 100%' : '50% 50%';

  const holeTransform = [{ translateX: holeX }, { translateY: holeY }, { scale: holeScale }];
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] });

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        {/* 穴なしの暗い膜 */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: DIM_COLOR, opacity: fullLayer }]}
        />
        {/* 穴あきの暗い膜（光らせる場所だけ丸く抜く。太い枠の内側が穴になる） */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.holeLayer,
            {
              left: -(BASE_RADIUS + DIM_BORDER),
              top: -(BASE_RADIUS + DIM_BORDER),
              width: (BASE_RADIUS + DIM_BORDER) * 2,
              height: (BASE_RADIUS + DIM_BORDER) * 2,
              borderRadius: BASE_RADIUS + DIM_BORDER,
              borderWidth: DIM_BORDER,
              opacity: holeLayer,
              transform: holeTransform,
            },
          ]}
        />
        {/* 広がって消える輪（押してほしい段階だけ。「＋」の説明のように見せるだけの段階では出さない） */}
        {isRingShown && hole && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              {
                opacity: Animated.multiply(bubble, ringOpacity),
                transform: [...holeTransform, { scale: ringScale }],
              },
            ]}
          />
        )}
        {/* 光っているところ。タップで進む段階だけ押せる */}
        {hole && step.mode === 'tap' && (
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={onTapTarget}
            style={{
              position: 'absolute',
              left: hole.cx - hole.r,
              top: hole.cy - hole.r,
              width: hole.r * 2,
              height: hole.r * 2,
              borderRadius: hole.r,
            }}
          />
        )}

        {/* 吹き出し */}
        <Animated.View
          style={[
            styles.bubble,
            bubblePosition,
            {
              left: bubbleLeft,
              width: bubbleWidth,
              opacity: bubble,
              // 光らせた場所（矢印の先）から、ふくらむように出てくる
              transformOrigin: bubbleOrigin,
              transform: [
                { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [step.placement === 'center' ? 12 : 22, 0] }) },
                { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
              ],
            },
          ]}
        >
          {isFinal ? (
            // さいごの段階だけ、ロゴと大きなボタンで送り出す
            <View style={styles.finalContent}>
              <Image source={Icons.logo} style={styles.finalLogo} resizeMode="cover" />
              <Text style={styles.finalTitle}>{step.title}</Text>
              <Text style={styles.finalBody}>{step.body}</Text>
              {step.note && <Text style={styles.finalNote}>{step.note}</Text>}
              <TouchableOpacity style={styles.finalButton} onPress={goNext} activeOpacity={0.85}>
                <Text style={styles.finalButtonText}>{step.buttonLabel ?? 'はじめる'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.title}>{step.title}</Text>
              <Text style={styles.body}>{step.body}</Text>
              {step.note && <Text style={styles.note}>{step.note}</Text>}
              <View style={styles.footer}>
                <Text style={styles.progress}>
                  {shownIndex + 1} / {steps.length}
                </Text>
                {step.mode === 'next' ? (
                  <TouchableOpacity style={styles.button} onPress={goNext} activeOpacity={0.85}>
                    <Text style={styles.buttonText}>{step.buttonLabel ?? '次へ'}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.tapHint}>光っているところをタップ</Text>
                )}
              </View>
            </>
          )}
          {arrowLeft != null && <View style={[styles.arrow, { left: arrowLeft }]} />}
        </Animated.View>

        {/* いつでもやめられる */}
        {shownIndex < steps.length - 1 && (
          <TouchableOpacity
            style={styles.skip}
            onPress={finish}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.skipText}>スキップ</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  holeLayer: {
    position: 'absolute',
    borderColor: DIM_COLOR,
  },
  ring: {
    position: 'absolute',
    left: -BASE_RADIUS,
    top: -BASE_RADIUS,
    width: BASE_RADIUS * 2,
    height: BASE_RADIUS * 2,
    borderRadius: BASE_RADIUS,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  bubble: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },
  title: {
    color: '#059669',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  body: {
    color: '#0F172A',
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
  },
  note: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  progress: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  tapHint: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 9,
  },
  arrow: {
    position: 'absolute',
    bottom: -8,
    width: 18,
    height: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
  },
  finalContent: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  finalLogo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: 18,
  },
  finalTitle: {
    color: '#0F172A',
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  finalBody: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  finalNote: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 12,
  },
  finalButton: {
    alignSelf: 'stretch',
    marginTop: 22,
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  finalButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
  },
  skip: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 62 : 24,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  skipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
