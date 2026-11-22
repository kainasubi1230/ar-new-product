import React, { useRef, useState } from 'react';
import {
  Image,
  ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Icons } from '../assets/icons';

// 説明を見終わったか（端末に保存。アプリを消すまで二度と出さない）
const ONBOARDING_DONE_KEY = 'loca:onboardingDone';

export const hasSeenOnboarding = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_DONE_KEY)) === '1';
  } catch {
    return false;
  }
};

const markOnboardingDone = () => AsyncStorage.setItem(ONBOARDING_DONE_KEY, '1').catch(() => {});

type Page = {
  /** ロゴの絵（1 枚目）か、緑に染める小さなアイコン */
  hero: 'logo' | ImageSourcePropType;
  title: string;
  body: string;
  /** 補足（小さく） */
  note?: string;
};

const PAGES: Page[] = [
  {
    hero: 'logo',
    title: '現実空間に、言葉を残す',
    body: 'Loca は、AR で好きな場所に言葉を残し、共有する空間メディアです。その場所にスマホをかざすと、景色の中に言葉が現れます。',
  },
  {
    hero: Icons.view,
    title: '景色が、主役',
    body: '言葉は、カメラに映る景色を手がかりに、置かれた机やベンチの上にピタッと現れます。どの景色に向けた言葉なのかが、ひと目で伝わります。',
  },
  {
    hero: Icons.herb,
    title: '安心して、出会える',
    body: '見たくない言葉には、自分でフィルターをかけられます。通知は、関心タグに合う言葉の近くを通ったときだけ届きます。',
  },
  {
    hero: Icons.walking,
    title: '画面の外へ、出かけよう',
    body: '誰かの想いとの出会いが、あなたの世界を少しずつ広げていきます。',
    note: 'このあと、カメラと位置情報の許可をお願いします。言葉をその場所に表示するために使います。使い方は、このあと画面の上でご案内します。',
  },
];

type Props = {
  onDone: () => void;
};

/** 初めてアプリを開いたときの説明（横にめくる 4 枚） */
export function OnboardingScreen({ onDone }: Props): React.JSX.Element {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const isLast = page === PAGES.length - 1;

  const finish = () => {
    markOnboardingDone();
    onDone();
  };

  const next = () => {
    if (isLast) {
      finish();
      return;
    }
    scrollRef.current?.scrollTo({ x: width * (page + 1), animated: true });
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={styles.container}>
      {/* 最後のページ以外は「スキップ」 */}
      <View style={styles.topBar}>
        {!isLast && (
          <TouchableOpacity onPress={finish} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.skip}>スキップ</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pager}
      >
        {PAGES.map((item) => (
          <View key={item.title} style={[styles.page, { width }]}>
            {item.hero === 'logo' ? (
              <Image source={Icons.logo} style={styles.logo} resizeMode="cover" />
            ) : (
              <View style={styles.iconCircle}>
                <Image source={item.hero} style={styles.icon} resizeMode="contain" />
              </View>
            )}
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
            {item.note && <Text style={styles.note}>{item.note}</Text>}
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {PAGES.map((item, index) => (
          <View key={item.title} style={[styles.dot, index === page && styles.dotActive]} />
        ))}
      </View>

      <TouchableOpacity style={styles.button} onPress={next} activeOpacity={0.85}>
        <Text style={styles.buttonText}>{isLast ? 'はじめる' : '次へ'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
  },
  topBar: {
    height: 28,
    alignItems: 'flex-end',
    paddingHorizontal: 24,
  },
  skip: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  logo: {
    width: 180,
    height: 180,
    borderRadius: 40,
    marginBottom: 36,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  icon: {
    width: 52,
    height: 52,
    tintColor: '#10B981',
  },
  title: {
    color: '#0F172A',
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
  note: {
    color: '#059669',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 18,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },
  dotActive: {
    width: 20,
    backgroundColor: '#10B981',
  },
  button: {
    marginHorizontal: 24,
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
