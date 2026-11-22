import React, { useEffect, useState } from 'react';
import Geolocation from '@react-native-community/geolocation';
import {
  Image,
  Linking,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { User } from '@supabase/supabase-js';
import { DiscoveryMapScreen } from './src/components/DiscoveryMapScreen';
import { MyPageScreen } from './src/components/MyPageScreen';
import { NotificationScreen } from './src/components/NotificationScreen';
import { PostModal } from './src/components/PostModal';
import {
  UniversalARView,
  type ARDebugInfoEvent,
  type ARNotice,
  type GeoTag,
  type RelocalizationStatusEvent,
  type RelocalizeTarget,
  type WorldMapSaveRequest,
  type WorldMapStatusEvent,
} from './src/native/UniversalARView';
import { ScreenHeader } from './src/components/ScreenHeader';
import { Icons } from './src/assets/icons';
import { insertPostWithCurrentLocation } from './src/services/postService';
import { deleteMyAccount, signOut } from './src/services/authService';
import { avatarHandleFor } from './src/config/avatarColors';
import type { LocationCoords } from './src/services/postService';
import { findNearbyPosts, type NearbyPost } from './src/services/nearbyPostService';
import {
  DISTANCE_TIERS,
  geoTagLevelFor,
  geoTagProminenceFor,
  positionUncertaintyFor,
  relocalizeSearchRadiusFor,
} from './src/config/distanceTiers';
import { PresenceSheet } from './src/components/PresenceSheet';
import { BottomNav, type Tab } from './src/components/BottomNav';
import { TermsConsentModal } from './src/components/TermsConsentModal';
import { OnboardingScreen, hasSeenOnboarding } from './src/components/OnboardingScreen';
import SplashOverlay from './src/components/SplashOverlay';
import { GuidedTour, hasFinishedTour } from './src/components/tour/GuidedTour';
import { TERMS_VERSION } from './src/config/legal';
import { blockUser, fetchMyModeration, reportPost, unblockUser } from './src/services/moderationService';
import { openPostMenu } from './src/utils/postMenu';
import { usePocketNotice } from './src/hooks/usePocketNotice';
import { CalmToast, type ToastKind, type ToastMessage } from './src/components/CalmToast';
import { SparkleBurst, type Sparkle } from './src/components/SparkleBurst';
import { isVisibleUnderFilters, matchesInterestTags } from './src/utils/interestTags';
import { checkPostSafety } from './src/services/safetyFilter';
import { adoptPreferencesForUser, usePreferences } from './src/services/preferencesStore';
import { collectPost } from './src/services/readService';
import { reverseGeocode } from './src/services/geocoder';
import { GpsAverager } from './src/utils/gpsAverager';
import { LOCATION_ACCURACY } from './src/config/locationAccuracy';
import { SHOW_AR_DEBUG } from './src/config/debug';
import { ARDebugOverlay, type RelocalizeSearchDebug } from './src/components/ARDebugOverlay';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { distanceInMeters } from './src/utils/geo';
import {
  WORLDMAP_RADIUS_M,
  findNearbyWorldMapPosts,
  getNativeSupabaseConfig,
  chooseWorldMapPost,
  updatePostSnapshotPath,
  updatePostWorldMapPath,
  updatePostWorldMapPostIds,
} from './src/services/worldMapService';
import { supabase } from './src/lib/supabase';


// ARWorldMap による「置いた場所の再現」は iOS (ARKit) のみ
const isWorldMapSupported = Platform.OS === 'ios';

// お知らせのアイコン（SF Symbols）。個別に指定しなければ種類で決める
const DEFAULT_NOTICE_SYMBOLS: Record<ToastKind, string> = {
  info: 'info.circle',
  success: 'checkmark.circle',
  error: 'exclamationmark.circle',
};

// 前回の現在地。起動直後は GPS を待たずにこれで方角タグを出し、正確な位置が取れたら差し替える
const LAST_COORDS_STORAGE_KEY = 'loca:lastCoords';

type TrackedCoords = LocationCoords & {
  /** 前回の位置や、精度の低いキャッシュ。方角タグには使うが、地図の照合には使わない */
  isApproximate: boolean;
};

// 探索画面で選んだ「探している言葉」を覚えておく時間（遠くから歩いて向かう分も見込む）
const FOCUS_EXPIRE_MS = 30 * 60 * 1000;

/**
 * 初めて開いたときは、説明（OnboardingScreen）だけを出す。見終わるまで AR は作らない
 * （AR を作るとカメラの許可を求められるので、説明の途中で許可のダイアログが出てしまう）
 */
export default function App(): React.JSX.Element {
  const [hasSeenIntro, setHasSeenIntro] = useState<boolean | null>(null);
  useEffect(() => {
    hasSeenOnboarding().then(setHasSeenIntro);
  }, []);
  let content: React.JSX.Element;
  if (hasSeenIntro === null) {
    // 読み込むまでは、起動画面と同じ白
    content = <View style={styles.root} />;
  } else if (!hasSeenIntro) {
    content = (
      <OnboardingScreen
        onDone={() => {
          setHasSeenIntro(true);
        }}
      />
    );
  } else {
    content = <MainApp />;
  }
  // 起動画面のロゴを少し長く見せてから、ふわっと消す
  return (
    <View style={styles.root}>
      {content}
      <SplashOverlay />
    </View>
  );
}

function MainApp(): React.JSX.Element {
  // ホームはAR機能そのもの
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [isPostModalVisible, setIsPostModalVisible] = useState<boolean>(false);

  // Auth User
  const [user, setUser] = useState<User | null>(null);
  // ログイン中のアクセストークン（約 1 時間で更新される）。ネイティブが Storage に地図や写真を読み書きするのに使う
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // AR Card Data
  const [currentMessage, setCurrentMessage] = useState<string>('ここの席、午後の光が最高。');
  const [currentAuthor] = useState<string>('sora');
  // これから置くカードのタグ（投稿画面で選んだもの）
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [placeTrigger, setPlaceTrigger] = useState<number>(0);
  const [isPlacementMode, setIsPlacementMode] = useState<boolean>(false);
  // 画面の下に出る小さなお知らせ（CalmToast）
  const [toast, setToast] = useState<ToastMessage | null>(null);
  // ホーム（AR）でのお知らせ。ネイティブの案内画面に 2.5 秒出る（id が変わるたびに出す）
  const [notice, setNotice] = useState<ARNotice | null>(null);
  const noticeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ARWorldMap
  const [worldMapSaveRequest, setWorldMapSaveRequest] = useState<WorldMapSaveRequest | null>(null);
  const [worldMapPhase, setWorldMapPhase] = useState<WorldMapStatusEvent['phase'] | null>(null);
  const [relocalizeTarget, setRelocalizeTarget] = useState<RelocalizeTarget | null>(null);
  const [relocalizationPhase, setRelocalizationPhase] =
    useState<RelocalizationStatusEvent['phase'] | null>(null);
  // いまの AR セッションで自分が置いた投稿（画面に出ている）。その地図を読み込み直すとカードが一度消えるので、読み込む地図には選ばない。
  // 表示するカードの一覧には含める（読み込んだ地図に入っていれば出す）
  const ownPostIdsRef = React.useRef<Set<string>>(new Set());
  // 投稿を始めたら、ホームを離れるか WORLDMAP_RADIUS_M 以上移動するまで近くの地図を自動で読み込まない（置いたカードが消えるため）
  const [isRelocalizeSuppressed, setIsRelocalizeSuppressed] = useState<boolean>(false);
  const suppressedAtRef = React.useRef<LocationCoords | null>(null);
  // ホーム表示中に追いかけている現在地（移動したら近くの地図を探し直す）
  const [currentCoords, setCurrentCoords] = useState<TrackedCoords | null>(null);
  // 照合する地図を探すための位置。誤差 15m 以下の平均（currentCoords）を待たず、
  // GPS の生の値が fallbackMaxAccuracyM 以内なら使う（候補を広めに探して、景色で確かめるため）
  const [relocalizeCoords, setRelocalizeCoords] = useState<LocationCoords | null>(null);
  // 関心タグとポケット通知の設定（マイページ・タグ管理で変える。端末に保存）
  const {
    interestTags,
    pocketNoticeEnabled,
    onlyInterestTags,
    hideNegativePosts,
    mutedTags,
    avatarColor,
  } = usePreferences();
  // 表示の設定（関心タグのみ表示・安心フィルター）で、AR・地図に出すか。自分の投稿はいつも出す
  // 通報した言葉と、ブロックした人（その人のアプリでは AR・地図・通知に出さない）
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [reportedPostIds, setReportedPostIds] = useState<string[]>([]);
  const moderationKey = `${blockedUserIds.join('|')}/${reportedPostIds.join('|')}`;
  // 照合で出したカードの投稿者（長押しのメニューと、ブロックしたときにもう出ているカードを消すのに使う）
  const cardOwnersRef = React.useRef<Map<string, { userId: string | null; author: string }>>(new Map());
  // 言葉を置く前の、利用規約への同意
  const [isTermsVisible, setIsTermsVisible] = useState(false);

  const isPostVisible = (post: {
    id?: string | number;
    message?: string | null;
    tags?: readonly string[] | null;
    user_id?: string | null;
  }) =>
    !(post.id != null && reportedPostIds.includes(String(post.id))) &&
    !(post.user_id != null && blockedUserIds.includes(post.user_id)) &&
    isVisibleUnderFilters(post, {
      interestTags,
      onlyInterestTags,
      hideNegativePosts,
      mutedTags,
      isOwn: user != null && post.user_id === user.id,
    });
  // 探索画面に渡す版（設定が変わったときだけ作り直す。地図のピンを毎回計算し直さない）
  const isPostVisibleForMap = React.useCallback(
    (post: NearbyPost) => isPostVisible(post),
    // isPostVisible が使う値だけを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interestTags, onlyInterestTags, hideNegativePosts, mutedTags, user?.id, moderationKey]
  );
  // 位置情報が「おおよそ」でしか許可されていないと、方角タグが大きくずれる
  const [isFullAccuracy, setIsFullAccuracy] = useState<boolean>(true);
  // デバッグ表示。ふだんは出さず、ホームの見出しを長押しすると切り替わる（開発ビルドのときだけ）
  const [isDebugVisible, setIsDebugVisible] = useState<boolean>(false);
  // デバッグ表示の中身（SHOW_AR_DEBUG のときだけ更新する）
  const [nativeDebug, setNativeDebug] = useState<ARDebugInfoEvent | null>(null);
  const [relocalizeSearchDebug, setRelocalizeSearchDebug] = useState<RelocalizeSearchDebug | null>(null);
  const [rawGpsAccuracy, setRawGpsAccuracy] = useState<number | null>(null);
  const relocalizeTargetRef = React.useRef<RelocalizeTarget | null>(null);
  // セカイカメラ風に、近くの投稿を方角タグとして AR 画面に浮かべる
  const [geoTags, setGeoTags] = useState<GeoTag[]>([]);
  const nearbyPostsRef = React.useRef<Map<string, NearbyPost>>(new Map());
  // 「カードをタップすると、言葉を拾えます」は 1 回の起動で 1 回だけ
  const hasShownCollectHintRef = React.useRef(false);
  // 探索画面のピンで選んだ「探している言葉」。照合ではその言葉が入った地図を最優先にする。
  // 見つかった・景色が見つからなかった・別のピンを選んだ・FOCUS_EXPIRE_MS たったら忘れる
  const focusRef = React.useRef<{ postId: string; setAt: number } | null>(null);
  // ホームに戻ったときに出すお知らせ（探索画面からホームに移るときに決める）
  const pendingHomeNoticeRef = React.useRef<{ message: string; symbol: string; subtitle?: string } | null>(null);
  // 言葉を拾ったときに弾けるキラキラ（タップした画面上の位置）
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  // 近くの投稿（近い順）。探索（レーダー）画面に出す
  const [nearbyPosts, setNearbyPosts] = useState<NearbyPost[]>([]);
  // 現在地を追うのは、ホーム（AR）と探索（レーダー）を開いている間
  const isLocationActive = activeTab === 'home' || activeTab === 'radar';
  // 気配をタップしたときの案内（投稿者名と、置いたときの景色の写真）
  const [tappedPresence, setTappedPresence] = useState<{ authorName: string; snapshotPath: string | null } | null>(null);
  relocalizeTargetRef.current = relocalizeTarget;
  const isRelocalizing = relocalizationPhase === 'downloading' || relocalizationPhase === 'relocalizing';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? null);
    });

    // トークンが更新されたとき（TOKEN_REFRESHED）も届くので、ネイティブには常に最新のトークンを渡せる
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      // 関心タグなどの設定は端末に保存しているので、別のアカウントになったら初期値に戻す
      if (session?.user) {
        adoptPreferencesForUser(session.user.id);
      }
      // 前のバージョンでログイン情報に入れてしまった写真のアイコン（巨大な data: URI）を短い目印に置き換える。
      // 残っているとトークンが巨大になり、投稿が「ログインしていない人」として保存されて地図の保存も失敗する
      const avatarIcon = session?.user?.user_metadata?.avatar_icon;
      if (typeof avatarIcon === 'string' && avatarIcon.length > 200) {
        // onAuthStateChange の中で auth を待つと固まることがあるので、外に出してから呼ぶ
        setTimeout(() => {
          supabase.auth
            .updateUser({ data: { avatar_icon: 'custom' } })
            .then(({ error }) => {
              if (error) console.warn('ログイン情報のアイコンを軽くできませんでした:', error.message);
              else console.log('ログイン情報のアイコンを軽くしました');
            });
        }, 0);
      }
      setAccessToken(session?.access_token ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 使い方ツアー（本物の画面の上で、光るところを押しながら一通り案内する）
  const [isTourVisible, setIsTourVisible] = useState(false);
  // ツアーをまだ最後まで見ていなければ始める（起動のロゴが消え、カメラ・位置の許可のダイアログに答えるころに）。
  // 途中でアプリを閉じたら、次に開いたときにもう一度
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    hasFinishedTour().then((done) => {
      if (!done) timer = setTimeout(() => setIsTourVisible(true), 2500);
    });
    return () => clearTimeout(timer);
  }, []);

  // 探索画面から来たときのお知らせ（作り直された AR ビューに渡す）
  useEffect(() => {
    if (activeTab !== 'home' || !pendingHomeNoticeRef.current) return;
    const { message, symbol, subtitle } = pendingHomeNoticeRef.current;
    pendingHomeNoticeRef.current = null;
    showToast(message, 'info', { symbol, subtitle });
    // showToast は activeTab で出し先を決めるので、activeTab の変化だけを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ホーム（カメラ）を開いている間は現在地を追いかけ、30m以内に地図付きの投稿があればその地図を読み込む
  const isMappingInProgress = worldMapPhase === 'mapping' || worldMapPhase === 'uploading';
  useEffect(() => {
    if (activeTab !== 'home') {
      setIsRelocalizeSuppressed(false);
      // AR ビューが作り直されると自分の置いたカードも消えるので、読み込み対象に戻す
      ownPostIdsRef.current.clear();
      // ホームの AR ビューは display: none の間に破棄され、戻ると作り直される（新アーキテクチャの挙動）。
      // 途中だった地図の記録・照合は消えるので状態を戻す。relocalizeTarget は残し、作り直されたビューで照合し直す
      setWorldMapPhase(null);
      setRelocalizationPhase(null);
      // 戻ってきたら、その時点の GPS で照合の候補を探し直す
      setRelocalizeCoords(null);
      // 「景色が見つかりませんでした」などの表示中のお知らせをクリア（戻った時に作り直された AR ビューで再表示されるのを防ぐ）
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = null;
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      setNotice(null);
      setToast(null);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!isWorldMapSupported || !isLocationActive) {
      return;
    }
    let cancelled = false;
    // まだ正確な位置が無いときだけ、おおよその位置で埋める（後から来た古い位置で上書きしない）
    const fillApproximate = (coords: LocationCoords) => {
      if (cancelled) return;
      setCurrentCoords((prev) => (prev && !prev.isApproximate ? prev : { ...coords, isApproximate: true }));
    };

    // 1. 前回保存した位置ですぐに方角タグを出す
    AsyncStorage.getItem(LAST_COORDS_STORAGE_KEY)
      .then((saved) => {
        if (saved) fillApproximate(JSON.parse(saved));
      })
      .catch(() => {});

    // 2. iOS が持っている直前の位置（キャッシュ）。精度は低くてもすぐ返ってくる
    Geolocation.getCurrentPosition(
      (position) =>
        fillApproximate({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 5000 }
    );

    // 3. 正確な位置を追いかける。誤差の大きい値は捨て、直近の良い値を平均してから差し替える
    //    （タグはネイティブ側でなめらかに移動する）
    const averager = new GpsAverager();
    let lastCommitted: LocationCoords | null = null;
    const watchStartedAt = Date.now();
    const watchId = Geolocation.watchPosition(
      (position) => {
        if (SHOW_AR_DEBUG) {
          setRawGpsAccuracy(position.coords.accuracy);
        }
        const raw = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        const elapsedMs = Date.now() - watchStartedAt;
        const maxRelocalizeAcc =
          elapsedMs >= LOCATION_ACCURACY.relocalizeFallbackAfterMs
            ? LOCATION_ACCURACY.relocalizeFallbackAccuracyM
            : LOCATION_ACCURACY.relocalizeMaxAccuracyM;

        if (raw.accuracy != null && raw.accuracy <= maxRelocalizeAcc) {
          // 少し動いたか、誤差がはっきり良くなったときだけ差し替える（そのたびに候補を探し直さない）
          setRelocalizeCoords((prev) =>
            !prev ||
            distanceInMeters(prev.latitude, prev.longitude, raw.latitude, raw.longitude) >=
              LOCATION_ACCURACY.commitDistanceM ||
            raw.accuracy < (prev.accuracy ?? Infinity) - 8
              ? raw
              : prev
          );
        }
        const coords = averager.add({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        if (!coords) return; // まだ使える値が無い
        // 平均した位置が少し揺れただけでは更新しない（そのたびに投稿を取り直さない）
        if (
          lastCommitted &&
          distanceInMeters(lastCommitted.latitude, lastCommitted.longitude, coords.latitude, coords.longitude) <
            LOCATION_ACCURACY.commitDistanceM
        ) {
          return;
        }
        lastCommitted = coords;
        setCurrentCoords({ ...coords, isApproximate: false });
        AsyncStorage.setItem(LAST_COORDS_STORAGE_KEY, JSON.stringify(coords)).catch(() => {});
        const suppressedAt = suppressedAtRef.current;
        if (
          suppressedAt &&
          distanceInMeters(suppressedAt.latitude, suppressedAt.longitude, coords.latitude, coords.longitude) >
            WORLDMAP_RADIUS_M
        ) {
          suppressedAtRef.current = null;
          setIsRelocalizeSuppressed(false);
        }
      },
      (error) => console.warn('現在地の追跡に失敗しました:', error.message),
      // 平均を取るため、動いていなくても値を受け取る（更新するかは commitDistanceM で絞る）
      { enableHighAccuracy: true, distanceFilter: 0 }
    );
    return () => {
      cancelled = true;
      Geolocation.clearWatch(watchId);
    };
  }, [isLocationActive]);

  // ポケット通知（関心タグに合う言葉の近くに来たら通知）。通知をタップしたらホームを開く
  usePocketNotice({
    enabled: pocketNoticeEnabled,
    interestTags,
    userId: user?.id ?? null,
    hiddenUserIds: blockedUserIds,
    hiddenPostIds: reportedPostIds,
    onOpened: () => setActiveTab('home'),
  });

  // ログインしたら、自分がブロックした人と通報した言葉を読み込む（ログアウトしたら空に）
  useEffect(() => {
    if (!user) {
      setBlockedUserIds([]);
      setReportedPostIds([]);
      return;
    }
    fetchMyModeration()
      .then(({ blockedUserIds: blocked, reportedPostIds: reported }) => {
        setBlockedUserIds(blocked);
        setReportedPostIds(reported);
      })
      .catch((err) => console.warn(err));
  }, [user?.id]);

  // もう AR に出ているカードのうち、通報した言葉とブロックした人の言葉（ネイティブが光ごと消す）
  const hiddenPostIds = React.useMemo(() => {
    const ids = new Set(reportedPostIds);
    cardOwnersRef.current.forEach((owner, postId) => {
      if (owner.userId && blockedUserIds.includes(owner.userId)) ids.add(postId);
    });
    return [...ids];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moderationKey]);

  // 照合（地図の読み込み）を止めている理由。空なら照合を探しに行く。デバッグ表示にもそのまま出す
  const relocalizeBlockReasons = [
    !isWorldMapSupported && 'iOS以外',
    activeTab !== 'home' && 'ホーム以外のタブ',
    // 前回の位置やキャッシュでは照合しない（別の場所の地図を読み込んでしまう）。GPS の生の値（誤差 65m 以内）を待つ
    !relocalizeCoords && `照合用の位置待ち(誤差${LOCATION_ACCURACY.fallbackMaxAccuracyM}m以内)`,
    isRelocalizeSuppressed && '投稿後の抑制中(isRelocalizeSuppressed)',
    isPostModalVisible && '投稿画面を開いている',
    isPlacementMode && '配置中',
    isMappingInProgress && '地図を記録・保存中',
  ].filter((reason): reason is string => Boolean(reason));
  const relocalizeBlockKey = relocalizeBlockReasons.join('|');

  useEffect(() => {
    if (relocalizeBlockReasons.length > 0 || !relocalizeCoords) {
      return;
    }
    // GPS は候補を絞るだけ（照合は景色で確かめる）なので、誤差に合わせて広めに探す
    const radiusM = relocalizeSearchRadiusFor(relocalizeCoords.accuracy);
    let cancelled = false;
    (async () => {
      try {
        const posts = await findNearbyWorldMapPosts(relocalizeCoords, radiusM);
        if (cancelled) return;
        const mapPostIdsOf = (post: (typeof posts)[number]) => post.worldmap_post_ids ?? [String(post.id)];

        // 探している言葉（探索画面のピンで選んだもの）があれば、その言葉が入った地図だけから選ぶ
        if (focusRef.current && Date.now() - focusRef.current.setAt > FOCUS_EXPIRE_MS) {
          focusRef.current = null;
        }
        const focusId = focusRef.current?.postId ?? null;
        const focusMaps = focusId ? posts.filter((post) => mapPostIdsOf(post).includes(focusId)) : [];
        if (focusId && focusMaps.length === 0) {
          const focusPost = nearbyPostsRef.current.get(focusId);
          if (focusPost && focusPost.distanceM <= radiusM) {
            // すぐ近くにいるのに、その言葉が入った地図が無い（景色を記録していない投稿）。光の気配で場所を示すだけ
            focusRef.current = null;
            showToast('この言葉は景色の記録がありません', 'info', {
              symbol: 'sparkles',
              subtitle: '光の気配で場所を示しています',
            });
          }
          // まだ遠いときは、ふだん通りに探して、近づくのを待つ
        }
        const isFocusSearch = focusMaps.length > 0;

        // 近くの投稿をいちばん多く含む地図を選ぶ（同じ数なら新しいほう）。今のセッションで自分が置いた投稿の地図は選ばない
        const chosen = chooseWorldMapPost(isFocusSearch ? focusMaps : posts, ownPostIdsRef.current);
        const mapPost = chosen?.post;
        // いま読み込んでいる地図と同じなら読み直さない（読み直すと出ているカードが消える）。
        // 探している言葉が、いま読み込んでいる地図に入っているときも読み直さない
        const loadedId = relocalizeTargetRef.current?.postId;
        const isAlreadyLoaded =
          mapPost != null &&
          (loadedId === String(mapPost.id) || (isFocusSearch && focusMaps.some((post) => String(post.id) === loadedId)));
        if (SHOW_AR_DEBUG && !cancelled) {
          setRelocalizeSearchDebug({
            radiusM,
            candidates: posts.length,
            excludedOwn: posts.filter((post) => ownPostIdsRef.current.has(String(post.id))).length,
            chosenPostId: mapPost ? String(mapPost.id) : null,
            note:
              posts.length === 0
                ? '範囲内に地図付きの投稿なし'
                : !mapPost
                  ? '候補が全部「自分が今置いた投稿」で除外'
                  : isAlreadyLoaded
                    ? `読み込み済みの地図（近くの投稿${chosen?.nearbyCount}件入り）`
                    : `照合を開始（近くの投稿${chosen?.nearbyCount}件入りの地図${isFocusSearch ? '・探している言葉入り' : ''}）`,
          });
        }
        if (cancelled || !mapPost || isAlreadyLoaded) return;

        const supabaseConfig = await getNativeSupabaseConfig();
        if (cancelled) return;
        // 新しい地図を読み込むとセッションがやり直しになり、自分の置いたカードも消える
        ownPostIdsRef.current.clear();
        setRelocalizeTarget({
          postId: String(mapPost.id),
          worldMapPath: mapPost.worldmap_path,
          // その地図で出せる投稿の写真を、今いる場所から近い順に（1 つの地図に何部屋分も入っていることがある）。
          // 探している言葉があれば、その言葉を置いたときの写真だけ（どこに向ければいいか迷わない）
          snapshots: (() => {
            const all = posts
              .filter((post) => mapPostIdsOf(mapPost).includes(String(post.id)))
              .filter((post) => post.snapshot_path)
              .sort((a, b) => a.distanceM - b.distanceM)
              .map((post) => ({ postId: String(post.id), path: post.snapshot_path as string }));
            const focusPath =
              isFocusSearch && focusId
                ? (posts.find((post) => String(post.id) === focusId)?.snapshot_path ??
                  nearbyPostsRef.current.get(focusId)?.snapshot_path)
                : null;
            return focusId && focusPath ? [{ postId: focusId, path: focusPath }] : all;
          })(),
          // 表示の設定で隠す投稿はカードにしない（地図にアンカーがあっても、内容を知らない投稿は出ない）
          cards: posts.filter(isPostVisible).map((post) => {
            cardOwnersRef.current.set(String(post.id), { userId: post.user_id, author: post.author ?? 'guest' });
            return {
            postId: String(post.id),
            cardTitle: post.author ?? 'guest',
            cardDescription: post.message ?? '',
            cardIcon: post.handle ?? '',
            cardColor: '#10B981',
            cardTags: post.tags ?? [],
            cardReadCount: post.read_count ?? 0,
            };
          }),
          supabase: supabaseConfig,
        });
      } catch (err: any) {
        console.warn('近くの地図の検索に失敗しました:', err);
        if (SHOW_AR_DEBUG && !cancelled) {
          setRelocalizeSearchDebug({
            radiusM,
            candidates: 0,
            excludedOwn: 0,
            chosenPostId: null,
            note: `エラー: ${err?.message ?? err}`,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // 止める理由は relocalizeBlockKey にまとめてある
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relocalizeCoords, relocalizeBlockKey]);

  useEffect(() => {
    if (!isWorldMapSupported || !isLocationActive || !currentCoords) {
      return;
    }
    let cancelled = false;
    findNearbyPosts(currentCoords)
      .then((allPosts) => {
        if (cancelled) return;
        const posts = allPosts.filter(isPostVisible);
        // 気配をタップしたときに、投稿者名と景色の写真を引けるように覚えておく
        nearbyPostsRef.current = new Map(posts.map((post) => [String(post.id), post]));
        // 探索（レーダー）画面にも同じ一覧を出す
        setNearbyPosts(posts);
        // AR空間には遠くの方角タグ（message / summary）を出さず、近くの気配（presence）だけを渡す
        setGeoTags(
          posts
            .filter((post) => geoTagLevelFor(post.distanceM) === 'presence')
            .map((post) => ({
              postId: String(post.id),
              cardTitle: post.author ?? 'guest',
              cardDescription: post.message ?? '',
              cardIcon: post.handle ?? '',
              cardColor: '#10B981',
              cardTags: post.tags ?? [],
              level: geoTagLevelFor(post.distanceM),
              prominence: geoTagProminenceFor(post.distanceM),
              uncertaintyM: positionUncertaintyFor(post.accuracy_m, currentCoords.accuracy),
              highlighted: matchesInterestTags(post.tags, interestTags),
              distanceM: post.distanceM,
              bearingDeg: post.bearingDeg,
            }))
        );
      })
      .catch((err) => console.warn('近くの投稿の取得に失敗しました:', err));
    return () => {
      cancelled = true;
    };
    // isPostVisible は interestTags・表示の設定・user で変わる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocationActive, currentCoords, interestTags, onlyInterestTags, hideNegativePosts, user?.id, moderationKey]);

  const handleWorldMapStatus = async (event: WorldMapStatusEvent) => {
    // 依頼は受け取ってもらえたので消す。残すと、作り直された AR ビューが古い依頼をもう一度処理してしまう
    setWorldMapSaveRequest(null);
    if (event.phase === 'snapshotSaved') {
      // 景色の写真は地図の記録と並行して届くので、記録中の状態（worldMapPhase）は変えない
      if (event.path) {
        updatePostSnapshotPath(event.postId, event.path).catch((err) => console.warn(err));
      }
      return;
    }
    setWorldMapPhase(event.phase);
    if (event.phase === 'saved' && event.path) {
      try {
        await updatePostWorldMapPath(event.postId, event.path, event.anchorPostIds);
        showToast('この場所を覚えました', 'success', { symbol: 'map' });
      } catch (err: any) {
        console.warn('地図の場所の保存に失敗しました:', err);
        showToast('この場所を覚えられませんでした', 'error');
      }
      setWorldMapPhase(null);
    } else if (event.phase === 'failed') {
      console.warn('地図の保存に失敗しました:', event.message);
      showToast('この場所を覚えられませんでした', 'error');
      setWorldMapPhase(null);
    }
  };

  const handleRelocalizationStatus = (event: RelocalizationStatusEvent) => {
    if (event.phase === 'found') {
      // 照合で見つかっただけ（壁の向こうの部屋の分も一度に届く）。知らせるのは画面に現れたとき（seen）
      setRelocalizationPhase(null);
    } else if (event.phase === 'seen') {
      // 探していた言葉が現れた
      if (focusRef.current?.postId === event.postId) {
        focusRef.current = null;
        const own = isOwnPost(event.postId);
        const author = relocalizeTargetRef.current?.cards.find((c) => c.postId === event.postId)?.cardTitle;
        if (!own) hasShownCollectHintRef.current = true;
        showToast(own ? 'あなたの言葉が見つかりました' : `${author ?? ''}さんの言葉が見つかりました`, 'success', {
          symbol: 'sparkles',
          subtitle: own ? undefined : 'タップすると、言葉を拾えます',
        });
        return;
      }
      // 他の人のカードが初めて画面に現れたら、タップで拾えることを 1 回だけ伝える
      if (!hasShownCollectHintRef.current && !isOwnPost(event.postId)) {
        hasShownCollectHintRef.current = true;
        showToast('カードをタップすると、言葉を拾えます', 'info', {
          symbol: 'hand.tap',
          subtitle: '長押しで、通報やブロックもできます',
        });
      }
    } else if (event.phase === 'relocalizedWithoutCard') {
      setRelocalizationPhase(null);
      // 原因の切り分け用（デバッグ表示にも出る）。利用者には知らせない
      console.warn(event.message);
    } else if (event.phase === 'failed') {
      setRelocalizationPhase(null);
      console.warn('再位置合わせに失敗しました:', event.message);
      showToast('近くの言葉を読み込めませんでした', 'error');
    } else if (event.phase === 'mapExtended') {
      // 見回した分を地図に足して保存し直した（見ている人の操作は不要なので通知しない）
      console.log(`地図を育てました: ${event.postId} (${Math.round((event.bytes ?? 0) / 1024)}KB)`);
      // 育てた地図に増えた投稿も、照合する地図を選ぶときに数えられるようにする（持ち主のときだけ更新できる）
      if (event.anchorPostIds) {
        updatePostWorldMapPostIds(event.postId, event.anchorPostIds).catch(() => {});
      }
    } else if (event.phase === 'timeout') {
      // relocalizeTarget は残す（同じ場所で何度も照合し直さないため。別の場所に移動すれば探し直す）
      setRelocalizationPhase(null);
      focusRef.current = null;
      showToast('景色が見つかりませんでした', 'info', {
        symbol: 'eye.slash',
        subtitle: 'いつもの表示に戻しました',
      });
    } else if (event.phase === 'cancelled') {
      setRelocalizationPhase(null);
      setRelocalizeTarget(null);
    } else {
      setRelocalizationPhase(event.phase);
    }
  };

  // 自分の言葉か（今のセッションで置いたもの、または投稿者が自分）
  const isOwnPost = (postId: string) =>
    ownPostIdsRef.current.has(postId) ||
    (user != null && nearbyPostsRef.current.get(postId)?.user_id === user.id);

  // 照合で出した他の人のカードをタップしたら、言葉を拾う（マイページの「拾った言葉」に残る）
  const handleCardTapped = (postId: string, x: number, y: number) => {
    if (isOwnPost(postId)) return;
    if (!user) {
      showToast('言葉を拾うにはログインが必要です', 'info', { symbol: 'person.crop.circle' });
      return;
    }
    // タップした所からキラキラを弾けさせる（通信を待たずに、すぐ）
    setSparkles((prev) => [...prev, { id: Date.now() + Math.random(), x, y }]);
    const card = relocalizeTarget?.cards.find((c) => c.postId === postId);
    // 拾った場所（今の位置と、その場所の名前）も残す。名前は取れなくても拾う
    const coords = currentCoords;
    (coords ? reverseGeocode(coords.latitude, coords.longitude) : Promise.resolve(null))
      .then((placeName) =>
        collectPost(
          postId,
          user.id,
          coords ? { latitude: coords.latitude, longitude: coords.longitude, placeName } : null
        )
      )
      .then((result) =>
        showToast(
          result === 'already' ? 'この言葉はもう拾っています' : `${card?.cardTitle ?? ''}さんの言葉を拾いました`,
          result === 'already' ? 'info' : 'success',
          {
            symbol: result === 'already' ? 'checkmark.circle' : 'sparkles',
            subtitle: result === 'already' ? undefined : 'マイページの「拾った言葉」に残ります',
          }
        )
      )
      .catch((err) => {
        console.warn(err);
        showToast('言葉を拾えませんでした', 'error');
      });
  };

  // 探索画面の「この言葉をARで探す」：その言葉を「探している言葉」にしてホームを開く。
  // ホームに戻ると照合の候補を探し直すので、そこでその言葉の入った地図が選ばれる
  const handleOpenARFromMap = (post: NearbyPost | null) => {
    if (post) {
      const postId = String(post.id);
      focusRef.current = { postId, setAt: Date.now() };
      const isFar = post.distanceM > DISTANCE_TIERS.relocalizeSearchMaxM;
      pendingHomeNoticeRef.current = isFar
        ? {
            message: '近づくと、この言葉を探します',
            symbol: 'location.north.line',
            subtitle: `${post.author ?? 'guest'}さんの言葉まで ${
              post.distanceM >= 1000 ? `${(post.distanceM / 1000).toFixed(1)}km` : `${Math.round(post.distanceM)}m`
            }`,
          }
        : { message: 'この言葉を探します', symbol: 'viewfinder', subtitle: '置いたときの景色にカメラを向けてください' };
    }
    setActiveTab('home');
  };

  const handleOpenPostCreation = () => {
    if (!user) {
      showToast('言葉を置くにはログインが必要です', 'info', { symbol: 'person.crop.circle' });
      setActiveTab('mypage');
      return;
    }
    // 初めて置くとき（と、規約を改定したとき）は、先に利用規約への同意をもらう
    if (user.user_metadata?.terms_accepted !== TERMS_VERSION) {
      setIsTermsVisible(true);
      return;
    }
    startPostCreation();
  };

  // 利用規約に同意したら、ログイン情報に記録して（短い値だけ）、そのまま投稿画面を開く
  const handleAgreeTerms = () => {
    setIsTermsVisible(false);
    supabase.auth.updateUser({ data: { terms_accepted: TERMS_VERSION } }).then(({ error }) => {
      if (error) console.warn('利用規約への同意を記録できませんでした:', error.message);
    });
    startPostCreation();
  };

  // 他の人の言葉のメニュー（通報・ブロック）。AR のカードの長押しと、探索画面のカードの「…」から
  const handleOpenPostMenu = (postId: string, authorUserId: string | null, authorName: string) => {
    if (!user) {
      showToast('通報・ブロックにはログインが必要です', 'info', { symbol: 'person.crop.circle' });
      return;
    }
    if (authorUserId === user.id || ownPostIdsRef.current.has(postId)) return;
    openPostMenu({
      authorName,
      onReport: (reason) => {
        reportPost(postId, reason)
          .then(() => {
            setReportedPostIds((prev) => (prev.includes(postId) ? prev : [...prev, postId]));
            showToast('通報しました', 'success', {
              symbol: 'flag',
              subtitle: '運営が確認します。この言葉はもう表示されません',
            });
          })
          .catch((err) => {
            console.warn(err);
            showToast('通報できませんでした', 'error');
          });
      },
      onBlock: () => {
        if (!authorUserId) {
          showToast('この言葉の投稿者はブロックできません', 'info');
          return;
        }
        blockUser(authorUserId)
          .then(() => {
            setBlockedUserIds((prev) => (prev.includes(authorUserId) ? prev : [...prev, authorUserId]));
            showToast('ブロックしました', 'success', {
              symbol: 'hand.raised',
              subtitle: `${authorName}さんの言葉はもう表示されません`,
            });
          })
          .catch((err) => {
            console.warn(err);
            showToast('ブロックできませんでした', 'error');
          });
      },
    });
  };

  const startPostCreation = () => {
    setIsRelocalizeSuppressed(true);
    suppressedAtRef.current = currentCoords;
    // 地図の読み込み・再位置合わせの途中なら中止する（終わってからセッションをやり直すと、置いたカードが消える）
    if (isRelocalizing) {
      setRelocalizeTarget(null);
    }
    setIsPostModalVisible(true);
  };

  // お知らせを出す。kind：info（お知らせ）/ success（できた）/ error（できなかった）。失敗の詳しい理由は console に出し、画面には短く。
  // ホーム（AR）では「近くのメッセージを読み込み中」などの案内と同じ見た目（中央にアイコンと一言）でネイティブに出してもらい、
  // ホーム以外（AR ビューが無い）では画面下の小さな帯（CalmToast）で出す
  const showToast = (
    message: string,
    kind: ToastKind = 'info',
    options: { symbol?: string; subtitle?: string } = {}
  ) => {
    // 使い方ツアーの間は出さない（吹き出しと重なるため）
    if (isTourVisible) return;
    if (isWorldMapSupported && activeTab === 'home') {
      setNotice({
        id: Date.now(),
        symbol: options.symbol ?? DEFAULT_NOTICE_SYMBOLS[kind],
        title: message,
        subtitle: options.subtitle,
      });
      // 一度きりの命令なので、出し終わったら消す（残すと、作り直された AR ビューがもう一度出してしまう）
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
      noticeTimerRef.current = setTimeout(() => setNotice(null), 3000);
      return;
    }
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ id: Date.now(), message, kind });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const handlePostSubmit = (data: { message: string; tags: string[]; category: string }) => {
    const tags = data.tags ?? [];
    // 投稿時に安心フィルターで単語をスキャンし、該当したらその場で投稿キャンセル＆テロップ表示
    const safety = checkPostSafety({ message: data.message, tags });
    if (safety.blocked) {
      setIsPostModalVisible(false);
      setIsPlacementMode(false);
      setIsRelocalizeSuppressed(false);
      showToast('安心フィルターにより投稿できません', 'error', {
        symbol: 'exclamationmark.shield.fill',
        subtitle: 'やさしい言葉に書き換えてお試しください',
      });
      return;
    }

    setIsPostModalVisible(false);
    setCurrentMessage(data.message);
    // 選んだタグをそのまま使う（空なら空のまま保存し、カードにもタグを出さない）
    setSelectedTags(tags);
    // 投稿内容をセットして、リアルタイムプレビュー＆配置決定モードへ
    setIsPlacementMode(true);
  };

  const handleConfirmPlacement = () => {
    // プレビュー位置に確定配置
    setPlaceTrigger((prev) => prev + 1);
  };

  const handleCancelPlacement = () => {
    setIsPlacementMode(false);
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar
        barStyle="dark-content"
        translucent
        backgroundColor="transparent"
      />

      {/* Main View Area */}
      <View style={styles.mainContainer}>
        {/* 1. Home = Pure AR Camera Screen (No remote timeline - in-place only) */}
        <View
          style={[
            styles.arContainer,
            activeTab !== 'home' && styles.hiddenContainer,
          ]}
          pointerEvents={activeTab === 'home' ? 'auto' : 'none'}
        >
          <UniversalARView
            style={StyleSheet.absoluteFill}
            cardTitle={currentAuthor}
            cardDescription={currentMessage}
            cardColor="#10B981"
            cardIcon={avatarHandleFor(avatarColor)}
            cardTags={selectedTags}
            placeTrigger={placeTrigger}
            isPreviewActive={isPlacementMode}
            supabaseAccessToken={accessToken ?? ''}
            notice={notice}
            onCardTapped={(event) =>
              handleCardTapped(event.nativeEvent.postId, event.nativeEvent.x, event.nativeEvent.y)
            }
            onCardLongPressed={(event) => {
              const postId = event.nativeEvent.postId;
              const owner = cardOwnersRef.current.get(postId);
              handleOpenPostMenu(postId, owner?.userId ?? null, owner?.author ?? 'guest');
            }}
            hiddenPostIds={hiddenPostIds}
            hudHidden={isTourVisible}
            onPresenceTapped={(event) => {
              const post = nearbyPostsRef.current.get(event.nativeEvent.postId);
              if (!post) return;
              setTappedPresence({ authorName: post.author ?? 'guest', snapshotPath: post.snapshot_path });
            }}
            onScreenTapped={() => {
              // 配置モード中でなければログインチェックして投稿作成
              if (!isPlacementMode) {
                handleOpenPostCreation();
              }
            }}
            onCardPlaced={async (event) => {
              setIsPlacementMode(false);
              const { cardDescription, anchorId, x, y, z, offsetEastM, offsetNorthM, offsetUpM, headingDeg } =
                event.nativeEvent;
              // カード自体の位置を求めるための、スマホからのずれと向き（北が分からないときは無い）
              const placement =
                offsetEastM != null && offsetNorthM != null && offsetUpM != null && headingDeg != null
                  ? { offsetEastM, offsetNorthM, offsetUpM, headingDeg }
                  : null;
              const messageToSave = cardDescription || currentMessage;
              // 念のため配置確定時にも安心フィルターを再チェック
              if (checkPostSafety({ message: messageToSave, tags: selectedTags }).blocked) {
                setIsRelocalizeSuppressed(false);
                showToast('安心フィルターにより投稿できません', 'error', {
                  symbol: 'exclamationmark.shield.fill',
                  subtitle: 'やさしい言葉に書き換えてお試しください',
                });
                return;
              }
              const authorName =
                user?.user_metadata?.username || user?.email?.split('@')[0] || currentAuthor;
              // アイコンは名前の頭文字の丸。選んだ色を handle に入れて、他の人のカードでも同じ色で出す
              const authorHandle = avatarHandleFor(avatarColor);

              showToast('言葉を置いています…', 'info', { symbol: 'arrow.up.circle' });
              try {
                const { post } = await insertPostWithCurrentLocation(
                  {
                    message: messageToSave,
                    author: authorName,
                    handle: authorHandle,
                    tags: selectedTags,
                    ar_x: x,
                    ar_y: y,
                    ar_z: z,
                  },
                  {
                    placement,
                    // 平均を取った確定位置があれば、その場の 1 回の測定より優先する
                    preferredCoords: currentCoords && !currentCoords.isApproximate ? currentCoords : null,
                  }
                );
                showToast('ここに言葉を置きました', 'success', {
                  symbol: 'mappin.and.ellipse',
                  subtitle: `「${messageToSave}」`,
                });

                // 置いたカードのアンカーを投稿IDで確定し、この場所の地図を保存する
                if (isWorldMapSupported && anchorId && post?.id != null) {
                  const postId = String(post.id);
                  ownPostIdsRef.current.add(postId);
                  setWorldMapSaveRequest({
                    requestId: Date.now(),
                    postId,
                    anchorId,
                    supabase: await getNativeSupabaseConfig(),
                  });
                }
              } catch (err: any) {
                console.error('投稿の保存に失敗しました:', err);
                showToast('言葉を置けませんでした', 'error');
              }
            }}
            worldMapSaveRequest={worldMapSaveRequest}
            relocalizeTarget={relocalizeTarget}
            geoTags={geoTags}
            onWorldMapStatus={(event) => handleWorldMapStatus(event.nativeEvent)}
            onRelocalizationStatus={(event) => handleRelocalizationStatus(event.nativeEvent)}
            onLocationAccuracyStatus={(event) => setIsFullAccuracy(event.nativeEvent.fullAccuracy)}
            debugEnabled={SHOW_AR_DEBUG && isDebugVisible}
            onDebugInfo={(event) => setNativeDebug(event.nativeEvent)}
          />

          {SHOW_AR_DEBUG && isDebugVisible && (
            <ARDebugOverlay
              gps={{
                accuracyM: currentCoords?.accuracy ?? null,
                isApproximate: currentCoords ? currentCoords.isApproximate : null,
                rawAccuracyM: rawGpsAccuracy,
              }}
              blockReasons={relocalizeBlockReasons}
              search={relocalizeSearchDebug}
              native={nativeDebug}
            />
          )}

          {/* Top Screen Header */}
          <ScreenHeader
            title="ホーム"
            onTitleLongPress={SHOW_AR_DEBUG ? () => setIsDebugVisible((visible) => !visible) : undefined}
            style={styles.homeHeader}
          />

          {/* 位置情報が「おおよそ」だと言葉の方角が大きくずれるので、控えめに案内する */}
          {!isPlacementMode && !isFullAccuracy && (
            <View style={styles.calmNotice} pointerEvents="box-none">
              <Text style={styles.calmNoticeText}>
                位置情報が「おおよそ」になっています。設定で「正確な位置情報」をオンにすると、言葉の方角が正確になります
              </Text>
              <TouchableOpacity
                style={styles.calmNoticeButton}
                onPress={() => Linking.openSettings()}
                activeOpacity={0.8}
              >
                <Text style={styles.calmNoticeButtonText}>設定を開く</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Placement Mode HUD (Guide Banner & Confirmation Action Bar) */}
          {isPlacementMode && (
            <>
              <View style={styles.placementGuidePill} pointerEvents="none">
                <Text style={styles.placementGuideText}>置きたい場所にカメラを向けてください</Text>
              </View>

              <View style={styles.placementActionBar}>
                <TouchableOpacity
                  style={styles.placementCancelBtn}
                  onPress={handleCancelPlacement}
                  activeOpacity={0.8}
                >
                  <Text style={styles.placementCancelText}>やめる</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.placementConfirmBtn}
                  onPress={handleConfirmPlacement}
                  activeOpacity={0.85}
                >
                  <Image source={Icons.pin} style={styles.placementConfirmIcon} resizeMode="contain" />
                  <Text style={styles.placementConfirmText}>ここに置く</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* 言葉を拾ったときのキラキラ */}
          <SparkleBurst
            sparkles={sparkles}
            onDone={(id) => setSparkles((prev) => prev.filter((sparkle) => sparkle.id !== id))}
          />

          {/* 気配（照合できていない近くの投稿の光）をタップしたときの案内 */}
          <PresenceSheet presence={tappedPresence} onClose={() => setTappedPresence(null)} />

          {/* 画面の下に出る小さなお知らせ */}
          <CalmToast toast={toast} />
        </View>

        {/* 2. Discovery Radar Screen (Walking navigation) */}
        {activeTab === 'radar' && (
          <DiscoveryMapScreen
            posts={nearbyPosts}
            coords={currentCoords}
            interestTags={interestTags}
            onOpenAR={handleOpenARFromMap}
            isPostVisible={isPostVisibleForMap}
            isOwnPost={(post) => user != null && post.user_id === user.id}
            onOpenPostMenu={(post) =>
              handleOpenPostMenu(String(post.id), post.user_id, post.author ?? 'guest')
            }
          />
        )}

        {/* 3. Notifications Screen (Pocket alerts) */}
        {activeTab === 'notifications' && (
          <NotificationScreen
            pocketNoticeEnabled={pocketNoticeEnabled}
            interestTags={interestTags}
            onOpenAR={() => setActiveTab('home')}
          />
        )}

        {/* 4. MyPage Screen (Profile & history / Auth screen if not logged in) */}
        {activeTab === 'mypage' && (
          <MyPageScreen
            onOpenARLens={() => setActiveTab('home')}
            user={user}
            onSignOut={async () => {
              await signOut();
              showToast('ログアウトしました');
            }}
            onNotice={(message, options) => showToast(message, 'success', options)}
            blockedUserIds={blockedUserIds}
            onUnblock={async (userId) => {
              try {
                await unblockUser(userId);
                setBlockedUserIds((prev) => prev.filter((id) => id !== userId));
                showToast('ブロックを解除しました', 'success', { symbol: 'hand.raised.slash' });
              } catch (err) {
                console.warn(err);
                showToast('解除できませんでした', 'error');
              }
            }}
            onDeleteAccount={async () => {
              await deleteMyAccount();
              showToast('アカウントを削除しました');
            }}
            onReplayTour={() => {
              setActiveTab('home');
              setIsTourVisible(true);
            }}
          />
        )}
      </View>

      <BottomNav
        activeTab={activeTab}
        onSelect={setActiveTab}
        onPressPost={() => {
          setActiveTab('home');
          handleOpenPostCreation();
        }}
      />

      {/* Post Modal (AI suggestions, message input) */}
      <TermsConsentModal
        visible={isTermsVisible}
        onAgree={handleAgreeTerms}
        onCancel={() => setIsTermsVisible(false)}
      />

      <PostModal
        visible={isPostModalVisible}
        onClose={() => setIsPostModalVisible(false)}
        onSubmit={handlePostSubmit}
        preferredTags={interestTags}
      />

      <GuidedTour
        visible={isTourVisible}
        isLoggedIn={user != null}
        onSelectTab={setActiveTab}
        onFinish={() => setIsTourVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mainContainer: {
    flex: 1,
  },
  arContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
  },
  hiddenContainer: {
    display: 'none',
  },

  // Home Screen Header
  homeHeader: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    zIndex: 20,
  },

  // 方角タグの精度の案内（Calm：白く小さく、操作の邪魔をしない）
  calmNotice: {
    position: 'absolute',
    top: 68,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 18,
    zIndex: 24,
  },
  calmNoticeText: {
    flex: 1,
    color: '#334155',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  calmNoticeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  calmNoticeButtonText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },

  // Placement Mode HUD
  // カードを置くときの案内と操作（Calm：絵文字を使わず、お知らせの帯と同じ半透明のトーン）
  placementGuidePill: {
    position: 'absolute',
    top: 68,
    alignSelf: 'center',
    maxWidth: '86%',
    backgroundColor: 'rgba(15, 23, 42, 0.74)',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 22,
    zIndex: 25,
  },
  placementGuideText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  placementActionBar: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 35,
  },
  placementCancelBtn: {
    height: 52,
    paddingHorizontal: 22,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placementCancelText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '600',
  },
  placementConfirmBtn: {
    flex: 1,
    height: 52,
    flexDirection: 'row',
    borderRadius: 26,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  placementConfirmIcon: {
    width: 16,
    height: 16,
    tintColor: '#FFFFFF',
  },
  placementConfirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
