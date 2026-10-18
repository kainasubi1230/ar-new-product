import React, { useEffect, useState } from 'react';
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
  type RelocalizationStatusEvent,
  type RelocalizeTarget,
  type WorldMapSaveRequest,
  type WorldMapStatusEvent,
} from './src/native/UniversalARView';
import { ScreenHeader } from './src/components/ScreenHeader';
import { Icons } from './src/assets/icons';
import { insertPostWithCurrentLocation } from './src/services/postService';
import { signOut } from './src/services/authService';
import {
  findNearestPostWithWorldMap,
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
  // 自分がこのセッションで置いた投稿は、地図を読み込み直す対象から外す
  const ownPostIdsRef = React.useRef<Set<string>>(new Set());

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

  // ホーム（カメラ）を開いたとき、30m以内に地図付きの投稿があればその地図を読み込む
  const isMappingInProgress = worldMapPhase === 'mapping' || worldMapPhase === 'uploading';
  useEffect(() => {
    if (!isWorldMapSupported || activeTab !== 'home' || isPlacementMode || isMappingInProgress || relocalizeTarget) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const post = await findNearestPostWithWorldMap(ownPostIdsRef.current);
        if (cancelled || !post) return;
        const supabaseConfig = await getNativeSupabaseConfig();
        if (cancelled) return;
        setRelocalizeTarget({
          postId: String(post.id),
          worldMapPath: post.worldmap_path,
          cardTitle: post.author ?? 'guest',
          cardDescription: post.message ?? '',
          cardIcon: post.handle ?? '',
          cardColor: '#10B981',
          supabase: supabaseConfig,
        });
      } catch (err) {
        console.warn('近くの地図の検索に失敗しました:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, isPlacementMode, isMappingInProgress, relocalizeTarget]);

  const handleWorldMapStatus = async (event: WorldMapStatusEvent) => {
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
      showToast(`📖 ${relocalizeTarget?.cardTitle ?? ''}さんのメッセージが見つかりました`);
    } else if (event.phase === 'failed') {
      setRelocalizationPhase(null);
      console.warn('再位置合わせに失敗しました:', event.message);
      showToast(`❌ ${event.message || '地図の読み込みに失敗しました'}`);
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
            onWorldMapStatus={(event) => handleWorldMapStatus(event.nativeEvent)}
            onRelocalizationStatus={(event) => handleRelocalizationStatus(event.nativeEvent)}
          />

          {/* Top Screen Header */}
          <ScreenHeader
            title="ホーム"
            style={styles.homeHeader}
          />

          {/* ARWorldMap Guide Banner (地図の記録中 / 読み込み・再位置合わせ中) */}
          {!isPlacementMode && (isMappingInProgress || relocalizationPhase) && (
            <View style={styles.placementGuidePill} pointerEvents="none">
              <Text style={styles.placementGuideText}>
                {worldMapPhase === 'mapping'
                  ? '🗺️ この場所を記録中です。周りをゆっくり見回してください'
                  : worldMapPhase === 'uploading'
                    ? '☁️ この場所の地図をアップロード中...'
                    : relocalizationPhase === 'downloading'
                      ? '🗺️ 近くのメッセージの地図を読み込み中...'
                      : '📷 置いたときと同じ景色にカメラを向けてください'}
              </Text>
            </View>
          )}

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
