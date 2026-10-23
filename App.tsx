import React, { useEffect, useState } from 'react';
import Geolocation from '@react-native-community/geolocation';
import {
  Image,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { User } from '@supabase/supabase-js';
import { DiscoveryRadarScreen } from './src/components/DiscoveryRadarScreen';
import { MyPageScreen } from './src/components/MyPageScreen';
import { NotificationScreen } from './src/components/NotificationScreen';
import { PostModal } from './src/components/PostModal';
import { TagManageModal } from './src/components/TagManageModal';
import {
  UniversalARView,
  type GeoTag,
  type RelocalizationStatusEvent,
  type RelocalizeTarget,
  type WorldMapSaveRequest,
  type WorldMapStatusEvent,
} from './src/native/UniversalARView';
import { ScreenHeader } from './src/components/ScreenHeader';
import { Icons } from './src/assets/icons';
import { insertPostWithCurrentLocation } from './src/services/postService';
import { signOut } from './src/services/authService';
import type { LocationCoords } from './src/services/postService';
import { findNearbyPosts } from './src/services/nearbyPostService';
import { distanceInMeters } from './src/utils/geo';
import {
  WORLDMAP_RADIUS_M,
  findNearbyWorldMapPosts,
  getNativeSupabaseConfig,
  updatePostWorldMapPath,
} from './src/services/worldMapService';
import { supabase } from './src/lib/supabase';

type TabType = 'home' | 'radar' | 'notifications' | 'mypage';

// ARWorldMap による「置いた場所の再現」は iOS (ARKit) のみ
const isWorldMapSupported = Platform.OS === 'ios';

export default function App(): React.JSX.Element {
  // ホームはAR機能そのもの
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isPostModalVisible, setIsPostModalVisible] = useState<boolean>(false);
  const [isTagModalVisible, setIsTagModalVisible] = useState<boolean>(false);

  // Auth User
  const [user, setUser] = useState<User | null>(null);

  // AR Card Data
  const [currentMessage, setCurrentMessage] = useState<string>('ここの席、午後の光が最高。');
  const [currentAuthor] = useState<string>('sora');
  const [currentHandle] = useState<string>('@sora');
  const [selectedTag, setSelectedTag] = useState<string>('#カフェ');
  const [selectedTags, setSelectedTags] = useState<string[]>(['#カフェ']);
  const [placeTrigger, setPlaceTrigger] = useState<number>(0);
  const [isPlacementMode, setIsPlacementMode] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
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
  const [currentCoords, setCurrentCoords] = useState<LocationCoords | null>(null);
  const relocalizeTargetRef = React.useRef<RelocalizeTarget | null>(null);
  // セカイカメラ風に、近くの投稿を方角タグとして AR 画面に浮かべる
  const [geoTags, setGeoTags] = useState<GeoTag[]>([]);
  relocalizeTargetRef.current = relocalizeTarget;
  const isRelocalizing = relocalizationPhase === 'downloading' || relocalizationPhase === 'relocalizing';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
    }
  }, [activeTab]);

  useEffect(() => {
    if (!isWorldMapSupported || activeTab !== 'home') {
      return;
    }
    const watchId = Geolocation.watchPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setCurrentCoords(coords);
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
      { enableHighAccuracy: true, distanceFilter: 15 }
    );
    return () => Geolocation.clearWatch(watchId);
  }, [activeTab]);

  useEffect(() => {
    if (
      !isWorldMapSupported ||
      activeTab !== 'home' ||
      !currentCoords ||
      isRelocalizeSuppressed ||
      isPostModalVisible ||
      isPlacementMode ||
      isMappingInProgress
    ) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const posts = await findNearbyWorldMapPosts(currentCoords);
        // 新しい地図ほど多くのカードが入っている。ただし今のセッションで自分が置いた投稿の地図は選ばない
        const mapPost = posts.find((post) => !ownPostIdsRef.current.has(String(post.id)));
        if (cancelled || !mapPost) return;
        // いま読み込んでいる地図の範囲内なら何もしない（読み直すと出ているカードが消える）
        const current = relocalizeTargetRef.current;
        if (current?.cards.some((card) => card.postId === String(mapPost.id))) return;

        const supabaseConfig = await getNativeSupabaseConfig();
        if (cancelled) return;
        // 新しい地図を読み込むとセッションがやり直しになり、自分の置いたカードも消える
        ownPostIdsRef.current.clear();
        setRelocalizeTarget({
          postId: String(mapPost.id),
          worldMapPath: mapPost.worldmap_path,
          cards: posts.map((post) => ({
            postId: String(post.id),
            cardTitle: post.author ?? 'guest',
            cardDescription: post.message ?? '',
            cardIcon: post.handle ?? '',
            cardColor: '#10B981',
          })),
          supabase: supabaseConfig,
        });
      } catch (err) {
        console.warn('近くの地図の検索に失敗しました:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    currentCoords,
    isRelocalizeSuppressed,
    isPostModalVisible,
    isPlacementMode,
    isMappingInProgress,
  ]);

  useEffect(() => {
    if (!isWorldMapSupported || activeTab !== 'home' || !currentCoords) {
      return;
    }
    let cancelled = false;
    findNearbyPosts(currentCoords)
      .then((posts) => {
        if (cancelled) return;
        setGeoTags(
          posts.map((post) => ({
            postId: String(post.id),
            cardTitle: post.author ?? 'guest',
            cardDescription: post.message ?? '',
            cardIcon: post.handle ?? '',
            cardColor: '#10B981',
            distanceM: post.distanceM,
            bearingDeg: post.bearingDeg,
          }))
        );
      })
      .catch((err) => console.warn('近くの投稿の取得に失敗しました:', err));
    return () => {
      cancelled = true;
    };
  }, [activeTab, currentCoords]);

  const handleWorldMapStatus = async (event: WorldMapStatusEvent) => {
    // 依頼は受け取ってもらえたので消す。残すと、作り直された AR ビューが古い依頼をもう一度処理してしまう
    setWorldMapSaveRequest(null);
    setWorldMapPhase(event.phase);
    if (event.phase === 'saved' && event.path) {
      try {
        await updatePostWorldMapPath(event.postId, event.path);
        showToast('🗺️ この場所の地図を保存しました');
      } catch (err: any) {
        showToast(`❌ ${err?.message || '地図の保存に失敗しました'}`);
      }
      setWorldMapPhase(null);
    } else if (event.phase === 'failed') {
      showToast(`❌ ${event.message || '地図の保存に失敗しました'}`);
      setWorldMapPhase(null);
    }
  };

  const handleRelocalizationStatus = (event: RelocalizationStatusEvent) => {
    if (event.phase === 'found') {
      setRelocalizationPhase(null);
      const card = relocalizeTarget?.cards.find((c) => c.postId === event.postId);
      showToast(`📖 ${card?.cardTitle ?? ''}さんのメッセージが見つかりました`);
    } else if (event.phase === 'relocalizedWithoutCard') {
      setRelocalizationPhase(null);
      console.warn(event.message);
      showToast(`⚠️ ${event.message}`);
    } else if (event.phase === 'failed') {
      setRelocalizationPhase(null);
      console.warn('再位置合わせに失敗しました:', event.message);
      showToast(`❌ ${event.message || '地図の読み込みに失敗しました'}`);
    } else if (event.phase === 'mapExtended') {
      // 見回した分を地図に足して保存し直した（見ている人の操作は不要なので通知しない）
      console.log(`地図を育てました: ${event.postId} (${Math.round((event.bytes ?? 0) / 1024)}KB)`);
    } else if (event.phase === 'timeout') {
      // relocalizeTarget は残す（同じ場所で何度も照合し直さないため。別の場所に移動すれば探し直す）
      setRelocalizationPhase(null);
      showToast('⏱ カードを置いた景色が見つからなかったので、通常モードに戻しました');
    } else if (event.phase === 'cancelled') {
      setRelocalizationPhase(null);
      setRelocalizeTarget(null);
    } else {
      setRelocalizationPhase(event.phase);
    }
  };

  const handleOpenPostCreation = () => {
    if (!user) {
      showToast('📍 メッセージを置くにはログインが必要です');
      setActiveTab('mypage');
      return;
    }
    setIsRelocalizeSuppressed(true);
    suppressedAtRef.current = currentCoords;
    // 地図の読み込み・再位置合わせの途中なら中止する（終わってからセッションをやり直すと、置いたカードが消える）
    if (isRelocalizing) {
      setRelocalizeTarget(null);
    }
    setIsPostModalVisible(true);
  };

  const showToast = (msg: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const handlePostSubmit = (data: { message: string; tags: string[]; category: string }) => {
    setIsPostModalVisible(false);
    setCurrentMessage(data.message);
    const tags = data.tags && data.tags.length > 0 ? data.tags : [selectedTag];
    setSelectedTags(tags);
    if (tags[0]) setSelectedTag(tags[0]);
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
            cardIcon={currentHandle}
            placeTrigger={placeTrigger}
            isPreviewActive={isPlacementMode}
            onScreenTapped={() => {
              // 配置モード中でなければログインチェックして投稿作成
              if (!isPlacementMode) {
                handleOpenPostCreation();
              }
            }}
            onCardPlaced={async (event) => {
              setIsPlacementMode(false);
              const { cardDescription, anchorId, x, y, z } = event.nativeEvent;
              const messageToSave = cardDescription || currentMessage;
              const authorName =
                user?.user_metadata?.username || user?.email?.split('@')[0] || currentAuthor;
              const authorHandle = user?.email ? `@${user.email.split('@')[0]}` : currentHandle;

              showToast(`📍 現在地を取得して「${messageToSave}」を保存中...`);
              try {
                const { post } = await insertPostWithCurrentLocation({
                  message: messageToSave,
                  author: authorName,
                  handle: authorHandle,
                  tags: selectedTags,
                  ar_x: x,
                  ar_y: y,
                  ar_z: z,
                });
                showToast(`✅ 「${messageToSave}」をSupabaseに保存しました！`);

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
                const errMsg = err?.message || '保存に失敗しました';
                console.error('onCardPlaced Supabase保存エラー:', err);
                showToast(`❌ 保存失敗: ${errMsg}`);
              }
            }}
            worldMapSaveRequest={worldMapSaveRequest}
            relocalizeTarget={relocalizeTarget}
            geoTags={geoTags}
            onWorldMapStatus={(event) => handleWorldMapStatus(event.nativeEvent)}
            onRelocalizationStatus={(event) => handleRelocalizationStatus(event.nativeEvent)}
          />

          {/* Top Screen Header */}
          <ScreenHeader
            title="ホーム"
            style={styles.homeHeader}
          />

          {/* Placement Mode HUD (Guide Banner & Confirmation Action Bar) */}
          {isPlacementMode && (
            <>
              <View style={styles.placementGuidePill} pointerEvents="none">
                <Text style={styles.placementGuideText}>
                  📍 カメラを向けて置く場所を合わせ、「ここに設置する」を押してください
                </Text>
              </View>

              <View style={styles.placementActionBar}>
                <TouchableOpacity
                  style={styles.placementCancelBtn}
                  onPress={handleCancelPlacement}
                  activeOpacity={0.8}
                >
                  <Text style={styles.placementCancelText}>✕ やめる</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.placementConfirmBtn}
                  onPress={handleConfirmPlacement}
                  activeOpacity={0.85}
                >
                  <Text style={styles.placementConfirmIcon}>✨</Text>
                  <Text style={styles.placementConfirmText}>ここに設置する</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Toast Message */}
          {toastMessage && (
            <View style={styles.toastContainer} pointerEvents="none">
              <View style={styles.toastCard}>
                <Text style={styles.toastText}>{toastMessage}</Text>
              </View>
            </View>
          )}
        </View>

        {/* 2. Discovery Radar Screen (Walking navigation) */}
        {activeTab === 'radar' && (
          <DiscoveryRadarScreen
            onBack={() => setActiveTab('home')}
            onStartNavigation={() => setActiveTab('home')}
          />
        )}

        {/* 3. Notifications Screen (Pocket alerts) */}
        {activeTab === 'notifications' && (
          <NotificationScreen
            onOpenARWithTag={(tag) => {
              setSelectedTag(tag);
              setActiveTab('home');
            }}
          />
        )}

        {/* 4. MyPage Screen (Profile & history / Auth screen if not logged in) */}
        {activeTab === 'mypage' && (
          <MyPageScreen
            onOpenARLens={() => setActiveTab('home')}
            onOpenTagManage={() => setIsTagModalVisible(true)}
            user={user}
            onSignOut={async () => {
              await signOut();
              showToast('ログアウトしました');
            }}
          />
        )}
      </View>

      {/* Global Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('home')}
          activeOpacity={0.7}
        >
          <Image
            source={Icons.home}
            style={[styles.navIcon, activeTab === 'home' && styles.navIconActive]}
            resizeMode="contain"
          />
          <Text style={[styles.navLabel, activeTab === 'home' && styles.navLabelActive]}>
            ホーム
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('radar')}
          activeOpacity={0.7}
        >
          <Image
            source={Icons.search}
            style={[styles.navIcon, activeTab === 'radar' && styles.navIconActive]}
            resizeMode="contain"
          />
          <Text style={[styles.navLabel, activeTab === 'radar' && styles.navLabelActive]}>
            探索
          </Text>
        </TouchableOpacity>

        {/* Center Plus Button (Emerald Green circle) */}
        <TouchableOpacity
          style={styles.centerPlusButton}
          onPress={() => {
            setActiveTab('home');
            handleOpenPostCreation();
          }}
          activeOpacity={0.85}
        >
          <View style={styles.plusBarH} />
          <View style={styles.plusBarV} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('notifications')}
          activeOpacity={0.7}
        >
          <Image
            source={Icons.notice}
            style={[styles.navIcon, activeTab === 'notifications' && styles.navIconActive]}
            resizeMode="contain"
          />
          <Text style={[styles.navLabel, activeTab === 'notifications' && styles.navLabelActive]}>
            通知
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('mypage')}
          activeOpacity={0.7}
        >
          <Image
            source={Icons.mypage}
            style={[styles.navIcon, activeTab === 'mypage' && styles.navIconActive]}
            resizeMode="contain"
          />
          <Text style={[styles.navLabel, activeTab === 'mypage' && styles.navLabelActive]}>
            マイページ
          </Text>
        </TouchableOpacity>
      </View>

      {/* Post Modal (AI suggestions, message input) */}
      <PostModal
        visible={isPostModalVisible}
        onClose={() => setIsPostModalVisible(false)}
        onSubmit={handlePostSubmit}
      />

      {/* Tag Management Modal (Tag filter / Calm settings) */}
      <TagManageModal
        visible={isTagModalVisible}
        onClose={() => setIsTagModalVisible(false)}
        onSave={(tags) => {
          if (tags[0]) setSelectedTag(tags[0]);
        }}
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

  // Placement Mode HUD
  placementGuidePill: {
    position: 'absolute',
    top: 68,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  placementGuideText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  placementActionBar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 35,
  },
  placementCancelBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  placementCancelText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '700',
  },
  placementConfirmBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#10B981',
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  placementConfirmIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  placementConfirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Toast
  toastContainer: {
    position: 'absolute',
    top: '46%',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 25,
  },
  toastCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },

  // Global Bottom Navigation Bar
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
    zIndex: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 8,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    minWidth: 56,
  },
  navIcon: {
    width: 26,
    height: 26,
    tintColor: '#94A3B8',
  },
  navIconActive: {
    tintColor: '#10B981',
  },
  navLabel: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  navLabelActive: {
    color: '#059669',
    fontWeight: '700',
  },
  centerPlusButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -24,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  plusBarH: {
    position: 'absolute',
    width: 22,
    height: 3.5,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  plusBarV: {
    position: 'absolute',
    width: 3.5,
    height: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
});
