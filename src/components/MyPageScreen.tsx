import React, { useCallback, useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ImageSourcePropType,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { User } from '@supabase/supabase-js';
import { Icons } from '../assets/icons';
import { ScreenHeader } from './ScreenHeader';
import { signInWithEmail, signUpWithEmail } from '../services/authService';
import { deleteMyPost, fillPostPlaceName } from '../services/postService';
import { usePreferences } from '../services/preferencesStore';
import { SHOW_AR_DEBUG } from '../config/debug';
import { WordCard, WordCardAvatar, WordCardDate, WordCardMeta, WordCardReadCount } from './WordCard';
import { fetchCollectedPosts, uncollectPost } from '../services/readService';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

// 1. 自分が置いた言葉（残した言葉）
type PlacedMemory = {
  id: string;
  placeName: string;
  locationHint: string;
  message: string;
  /** 投稿のタグ（「#」付き）。空ならタグの欄を出さない */
  tags: string[];
  placedAt: string;
  readCount: number; // 「誰かが読んだよ 🐾」
  expiresIn: string; // 寿命（公開期限）
  mapCoord: { xPercent: number; yPercent: number };
};

// 2. 出会った言葉の記録（拾った言葉コレクション）
type CollectedWord = {
  id: string;
  collectedAt: string;
  placeName: string;
  author: string;
  handle: string;
  message: string;
  /** 言葉のタグ（「#」付き）。空ならタグの欄を出さない */
  tags: string[];
  stampIcon: string;
};

// 3. 関心タグ
type InterestTag = {
  id: string;
  name: string;
  icon: ImageSourcePropType;
  enabled: boolean;
  desc: string;
};

type Props = {
  onOpenARLens: () => void;
  onOpenTagManage: () => void;
  user?: User | null;
  onSignOut?: () => void;
};

// 初期表示用（Supabaseから読み込むため初期値は空）
const INITIAL_PLACED: PlacedMemory[] = [];
const INITIAL_COLLECTED: CollectedWord[] = [];

// タグを「#」付きにそろえ、空のものを除く（AR のカードと同じ扱い）
const normalizeTags = (tags: string[] | null | undefined) =>
  (tags ?? [])
    .map((t) => t.trim())
    .filter((t) => t && t !== '#')
    .map((t) => (t.startsWith('#') ? t : `#${t}`));

const INITIAL_TAGS: InterestTag[] = [
  { id: 't1', name: '散歩', icon: Icons.walking, enabled: true, desc: '街歩きや小道、おすすめの休憩スポット' },
  { id: 't2', name: 'カフェ', icon: Icons.cafe, enabled: true, desc: '落ち着ける席や美味しい珈琲の記録' },
  { id: 't3', name: '日常', icon: Icons.everyday, enabled: true, desc: '街で見つけた小さな気づきや独り言' },
  { id: 't4', name: '本', icon: Icons.book, enabled: true, desc: '本と読書、心に残る一節のしおり' },
  { id: 't5', name: 'グルメ', icon: Icons.gourmet, enabled: false, desc: '路地裏の隠れ家やおすすめの一皿' },
  { id: 't6', name: '歴史', icon: Icons.history, enabled: false, desc: '街の記憶、昔話、碑の由来' },
  { id: 't7', name: 'アート', icon: Icons.art, enabled: false, desc: 'ストリートアートやギャラリーの発見' },
  { id: 't8', name: '自然', icon: Icons.herb, enabled: false, desc: '公園や木漏れ日、季節の移ろいを感じる場所' },
];

export const getTagIcon = (tag: string): ImageSourcePropType => {
  const normalized = tag.replace('#', '').trim();
  switch (normalized) {
    case '散歩':
      return Icons.walking;
    case 'カフェ':
      return Icons.cafe;
    case '日常':
      return Icons.everyday;
    case '本':
      return Icons.book;
    case 'グルメ':
      return Icons.gourmet;
    case '歴史':
      return Icons.history;
    case 'アート':
      return Icons.art;
    case '夜景':
    case '景色':
    case '風景':
      return Icons.view;
    case '自然':
    case 'ハーブ':
      return Icons.herb;
    default:
      return Icons.herb;
  }
};

export function MyPageScreen({
  onOpenARLens,
  onOpenTagManage,
  user,
  onSignOut,
}: Props): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'placed' | 'collected' | 'tags'>('placed');
  const [placedViewMode, setPlacedViewMode] = useState<'list' | 'map'>('list');

  // データ状態
  const [placedList, setPlacedList] = useState<PlacedMemory[]>(INITIAL_PLACED);
  // AR で目にした他の人の言葉（post_reads）
  const [collectedList, setCollectedList] = useState<CollectedWord[]>(INITIAL_COLLECTED);
  // 関心タグとポケット通知は端末に保存し、AR・地図・通知と共有する（preferencesStore）
  const { interestTags, toggleInterestTag, pocketNoticeEnabled, setPocketNoticeEnabled, showDevInfo, setShowDevInfo } =
    usePreferences();
  const tags: InterestTag[] = INITIAL_TAGS.map((tag) => ({
    ...tag,
    enabled: interestTags.includes(`#${tag.name}`),
  }));
  const [selectedMapPin, setSelectedMapPin] = useState<PlacedMemory | null>(null);
  const isPocketNoticeOn = pocketNoticeEnabled;
  const setIsPocketNoticeOn = setPocketNoticeEnabled;
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Supabaseから自分の投稿を取得する
  const fetchPosts = useCallback(async () => {
    if (!user) return;
    try {
      // 自分の投稿だけ（posts.user_id は投稿時に DB が auth.uid() を入れる）
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formatted: PlacedMemory[] = (data || []).map((p, idx) => ({
        id: p.id,
        // 置いた場所の名前（無ければ空。下で後から埋める）
        placeName: p.place_name ?? '',
        locationHint: `GPS精度: 約${Math.round(p.accuracy_m || 10)}m`,
        message: p.message,
        tags: normalizeTags(p.tags),
        placedAt: new Date(p.created_at).toLocaleDateString('ja-JP'),
        readCount: 0,
        expiresIn: '無期限',
        mapCoord: {
          xPercent: 50 + (((idx * 17) % 60) - 30),
          yPercent: 50 + (((idx * 23) % 60) - 30),
        },
      }));

      // 自分の言葉が何人に拾われたか（posts.read_count。拾われるたびに DB が数える）
      const withCounts = formatted.map((item, index) => ({
        ...item,
        readCount: (data ?? [])[index]?.read_count ?? 0,
      }));

      setPlacedList(withCounts);
      if (withCounts.length > 0) {
        setSelectedMapPin((prev) => prev ?? withCounts[0]);
      }

      // 場所の名前がまだ無い投稿（この機能の前に置いたもの）は、位置から名前を求めて書き足す（一度に 10 件まで）
      const missing = (data ?? []).filter((p) => !p.place_name && p.lat != null && p.lng != null).slice(0, 10);
      for (const p of missing) {
        const placeName = await fillPostPlaceName(String(p.id), p.lat, p.lng);
        if (placeName) {
          setPlacedList((prev) => prev.map((item) => (item.id === p.id ? { ...item, placeName } : item)));
        }
      }
    } catch (e) {
      console.warn('投稿取得エラー:', e);
    }

    // 拾った言葉
    try {
      const collected = await fetchCollectedPosts(user.id);
      setCollectedList(
        collected.map((post) => ({
          id: post.postId,
          collectedAt: new Date(post.readAt).toLocaleDateString('ja-JP'),
          // 拾った場所の名前（無ければ空）
          placeName: post.placeName ?? '',
          author: post.author,
          handle: post.handle,
          message: post.message,
          tags: normalizeTags(post.tags),
          stampIcon: 'herb',
        }))
      );
    } catch (e) {
      console.warn('拾った言葉の取得エラー:', e);
    }
  }, [user]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchPosts();
    setIsRefreshing(false);
  };

  // 1. 言葉の削除
  const handleDeleteMemory = (id: string, message: string) => {
    Alert.alert(
      '言葉を削除',
      `「${message}」を削除しますか？\nその場所から取り除かれ、他の人からも見えなくなります。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMyPost(id);
            } catch (err: any) {
              // 消せなかったときは一覧に残したまま知らせる（消えたように見せない）
              Alert.alert('削除できませんでした', err?.message ?? '');
              return;
            }
            setPlacedList((prev) => prev.filter((item) => item.id !== id));
            if (selectedMapPin?.id === id) {
              setSelectedMapPin(null);
            }
          },
        },
      ]
    );
  };

  // 2. 拾った言葉から外す（相手の言葉そのものは消えない）
  const handleUncollect = (postId: string, author: string) => {
    if (!user) return;
    Alert.alert(
      '拾った言葉から外す',
      `${author}さんの言葉を、拾った言葉から外しますか？\n言葉そのものは消えず、その場所に残ります。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '外す',
          style: 'destructive',
          onPress: async () => {
            try {
              await uncollectPost(postId, user.id);
            } catch (err: any) {
              Alert.alert('外せませんでした', err?.message ?? '');
              return;
            }
            setCollectedList((prev) => prev.filter((item) => item.id !== postId));
          },
        },
      ]
    );
  };

  // 寿命（期限）切り替え
  const handleToggleExpiry = (id: string) => {
    const nextExpiries = ['残り3日', '残り7日', '残り24時間', '無期限'];
    setPlacedList((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const currentIdx = nextExpiries.indexOf(item.expiresIn);
        const nextIdx = (currentIdx + 1) % nextExpiries.length;
        return { ...item, expiresIn: nextExpiries[nextIdx] };
      })
    );
  };

  // 3. タグ切り替え
  const handleToggleTag = (tagId: string) => {
    const tag = INITIAL_TAGS.find((t) => t.id === tagId);
    if (tag) toggleInterestTag(tag.name);
  };

  // 未ログイン時の認証フォーム用ステート
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleAuthSubmit = async () => {
    if (!authEmail.trim() || !authPassword) {
      setAuthError('メールアドレスとパスワードを入力してください');
      return;
    }
    if (authPassword.length < 6) {
      setAuthError('パスワードは6文字以上で入力してください');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (authMode === 'signup') {
        const result = await signUpWithEmail(authEmail, authPassword, authUsername);
        if (result.session) {
          Alert.alert('登録完了', 'アカウントを登録し、ログインしました！');
        } else {
          Alert.alert(
            '確認メールを送信しました',
            'ご入力いただいたメールアドレスに確認用リンクを送信しました。メール内のリンクを開いて登録を完了してください。'
          );
        }
      } else {
        await signInWithEmail(authEmail, authPassword);
      }
    } catch (err: any) {
      let msg = err?.message || 'エラーが発生しました';
      if (msg.includes('Invalid login credentials')) {
        msg = 'メールアドレスまたはパスワードが正しくありません';
      } else if (msg.includes('User already registered')) {
        msg = 'このメールアドレスは既に登録されています。ログインをお試しください';
      } else if (msg.includes('Password should be at least')) {
        msg = 'パスワードは6文字以上で入力してください';
      }
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  // 1. 未ログインの場合：マイページ全体をログイン・新規登録画面にする
  if (!user) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="マイページ" showTitleLogo={true} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.fullAuthContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.authHero}>
              <View style={styles.authHeroIconCircle}>
                <Image source={Icons.mypage} style={styles.authHeroIcon} resizeMode="contain" />
              </View>
              <Text style={styles.authHeroTitle}>
                {authMode === 'signin' ? 'マイページへログイン' : '新規アカウント作成'}
              </Text>
              <Text style={styles.authHeroSubtitle}>
                ログインすると、街に残した言葉や出会った記憶を保存・同期できます
              </Text>
            </View>

            {/* Tab Switcher */}
            <View style={styles.authTabSwitch}>
              <TouchableOpacity
                style={[styles.authTabBtn, authMode === 'signin' && styles.authTabBtnActive]}
                onPress={() => {
                  setAuthMode('signin');
                  setAuthError(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.authTabText, authMode === 'signin' && styles.authTabTextActive]}>
                  ログイン
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.authTabBtn, authMode === 'signup' && styles.authTabBtnActive]}
                onPress={() => {
                  setAuthMode('signup');
                  setAuthError(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.authTabText, authMode === 'signup' && styles.authTabTextActive]}>
                  新規登録
                </Text>
              </TouchableOpacity>
            </View>

            {/* Form */}
            <View style={styles.authForm}>
              {authMode === 'signup' && (
                <View style={styles.authField}>
                  <Text style={styles.authFieldLabel}>ユーザーネーム（任意）</Text>
                  <TextInput
                    style={styles.authInput}
                    placeholder="例: sora"
                    placeholderTextColor="#94A3B8"
                    value={authUsername}
                    onChangeText={setAuthUsername}
                    autoCapitalize="none"
                  />
                </View>
              )}

              <View style={styles.authField}>
                <Text style={styles.authFieldLabel}>メールアドレス</Text>
                <TextInput
                  style={styles.authInput}
                  placeholder="example@email.com"
                  placeholderTextColor="#94A3B8"
                  value={authEmail}
                  onChangeText={setAuthEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.authField}>
                <Text style={styles.authFieldLabel}>パスワード（6文字以上）</Text>
                <TextInput
                  style={styles.authInput}
                  placeholder="••••••••"
                  placeholderTextColor="#94A3B8"
                  value={authPassword}
                  onChangeText={setAuthPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              {authError && (
                <View style={styles.authErrorCard}>
                  <Text style={styles.authErrorText}>⚠️ {authError}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.authSubmitBtn, authLoading && styles.authSubmitBtnDisabled]}
                onPress={handleAuthSubmit}
                disabled={authLoading}
                activeOpacity={0.85}
              >
                {authLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.authSubmitBtnText}>
                    {authMode === 'signin' ? 'ログインする' : '登録してはじめる'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // 2. ログイン済みの場合：通常のマイページを表示
  const displayName =
    user.user_metadata?.username || user.email?.split('@')[0] || 'ユーザー';

  // 右上の設定ボタンのメニュー（関心タグの編集・開発用の情報の表示（開発ビルドのみ）・ログアウト）
  const openSettingsMenu = () => {
    const canSignOut = user != null && onSignOut != null;
    const devInfoLabel = showDevInfo ? '開発用の情報を隠す' : '開発用の情報を表示';
    const toggleDevInfo = () => setShowDevInfo(!showDevInfo);
    if (Platform.OS === 'ios') {
      const options = [
        '関心タグを編集',
        ...(SHOW_AR_DEBUG ? [devInfoLabel] : []),
        ...(canSignOut ? ['ログアウト'] : []),
        'キャンセル',
      ];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: canSignOut ? options.indexOf('ログアウト') : undefined,
        },
        (index) => {
          if (options[index] === '関心タグを編集') onOpenTagManage();
          if (options[index] === devInfoLabel) toggleDevInfo();
          if (options[index] === 'ログアウト') onSignOut?.();
        }
      );
      return;
    }
    Alert.alert('設定', undefined, [
      { text: '関心タグを編集', onPress: onOpenTagManage },
      ...(SHOW_AR_DEBUG ? [{ text: devInfoLabel, onPress: toggleDevInfo }] : []),
      ...(canSignOut ? [{ text: 'ログアウト', style: 'destructive' as const, onPress: onSignOut }] : []),
      { text: 'キャンセル', style: 'cancel' as const },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <ScreenHeader
        title="マイページ"
        rightAction={
          <TouchableOpacity style={styles.settingsBtn} onPress={openSettingsMenu} activeOpacity={0.7}>
            <Image source={Icons.setting} style={styles.settingsIcon} resizeMode="contain" />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
      >
        {/* Profile Card */}
        <View style={styles.profileSection}>
          <View style={styles.avatarCircle}>
            <Image
              source={Icons.mypage}
              style={styles.avatarIcon}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.userBio}>{user.email}</Text>

          {/* Footprint Count Summary */}
          <View style={styles.statsRow}>
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.7}
              onPress={() => setActiveTab('placed')}
            >
              <Text style={styles.statNumber}>{placedList.length}</Text>
              <Text style={styles.statLabel}>残した言葉</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.7}
              onPress={() => setActiveTab('collected')}
            >
              <Text style={styles.statNumber}>{collectedList.length}</Text>
              <Text style={styles.statLabel}>拾った言葉</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.7}
              onPress={() => setActiveTab('tags')}
            >
              <Text style={styles.statNumber}>{tags.filter((t) => t.enabled).length}</Text>
              <Text style={styles.statLabel}>関心タグ</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 3 Main Tabs */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'placed' && styles.tabBtnActive]}
            onPress={() => setActiveTab('placed')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabBtnText, activeTab === 'placed' && styles.tabBtnTextActive]}>
              残した言葉
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'collected' && styles.tabBtnActive]}
            onPress={() => setActiveTab('collected')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabBtnText, activeTab === 'collected' && styles.tabBtnTextActive]}>
              拾った言葉
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'tags' && styles.tabBtnActive]}
            onPress={() => setActiveTab('tags')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabBtnText, activeTab === 'tags' && styles.tabBtnTextActive]}>
              関心タグ
            </Text>
          </TouchableOpacity>
        </View>

        {/* ═══════════════════════════════════════════════════════
            1. 自分が置いた言葉（「残した言葉」リスト）
        ═══════════════════════════════════════════════════════ */}
        {activeTab === 'placed' && (
          <View style={styles.tabSection}>
            {/* View Mode Toggle: [リスト ≡] / [プライベートマップ 🗺️] */}
            <View style={styles.subHeaderRow}>
              <View style={styles.subHeaderTitleGroup}>
                <Image source={Icons.footprints} style={styles.subHeaderFootprintIcon} resizeMode="contain" />
                <Text style={styles.subSectionTitle}>
                  街に残した言葉 ({placedList.length})
                </Text>
              </View>
              <View style={styles.viewModeToggle}>
                <TouchableOpacity
                  style={[styles.modeToggleBtn, placedViewMode === 'list' && styles.modeToggleBtnActive]}
                  onPress={() => setPlacedViewMode('list')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modeToggleText, placedViewMode === 'list' && styles.modeToggleTextActive]}>
                    リスト
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeToggleBtn, placedViewMode === 'map' && styles.modeToggleBtnActive]}
                  onPress={() => setPlacedViewMode('map')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modeToggleText, placedViewMode === 'map' && styles.modeToggleTextActive]}>
                    マップ
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* List Mode */}
            {placedViewMode === 'list' && (
              <View style={styles.cardListContainer}>
                {placedList.map((item) => (
                  <WordCard
                    key={item.id}
                    message={item.message}
                    tags={item.tags}
                    onDelete={() => handleDeleteMemory(item.id, item.message)}
                    footer={
                      <>
                        <WordCardDate date={item.placedAt} placeName={item.placeName} action="placed" />
                        {item.readCount > 0 && <WordCardReadCount count={item.readCount} />}
                      </>
                    }
                  />
                ))}

                {placedList.length === 0 && (
                  <View style={styles.emptyStateBox}>
                    <Image source={Icons.footprints} style={styles.emptyFootprintsIcon} resizeMode="contain" />
                    <Text style={styles.emptyStateText}>まだ街に残した言葉がありません</Text>
                    <Text style={styles.emptyStateSub}>ホーム画面の「＋」ボタンから、今いる場所に言葉を設置できます。</Text>
                  </View>
                )}
              </View>
            )}

            {/* Map Mode (プライベートマップ化) */}
            {placedViewMode === 'map' && (
              <View style={styles.privateMapContainer}>
                <View style={styles.privateMapCanvas}>
                  {/* Map Grid Lines */}
                  <View style={styles.mapGridLineH} />
                  <View style={styles.mapGridLineV} />
                  <View style={styles.mapWaterCircle} />

                  <Text style={styles.mapCityLabel}>Tenjin Private Map</Text>

                  {/* Placed Pins */}
                  {placedList.map((item) => {
                    const isSelected = selectedMapPin?.id === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.mapPinWrapper,
                          {
                            left: `${item.mapCoord.xPercent}%`,
                            top: `${item.mapCoord.yPercent}%`,
                          },
                          isSelected && styles.mapPinWrapperSelected,
                        ]}
                        onPress={() => setSelectedMapPin(item)}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.mapPinBubble, isSelected && styles.mapPinBubbleSelected]}>
                          <Image
                            source={Icons.pin}
                            style={[styles.mapPinIconImage, isSelected && styles.mapPinIconImageSelected]}
                            resizeMode="contain"
                          />
                        </View>
                        <Text style={[styles.mapPinLabel, isSelected && styles.mapPinLabelSelected]} numberOfLines={1}>
                          {item.placeName.split(' ')[0]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Selected Pin Detail Callout */}
                {selectedMapPin && (
                  <View style={styles.mapSelectedCard}>
                    <View style={styles.mapSelectedHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.mapSelectedPlaceRow}>
                          <Image source={Icons.pin} style={styles.mapSelectedPinIcon} resizeMode="contain" />
                          <Text style={styles.mapSelectedPlace}>{selectedMapPin.placeName}</Text>
                        </View>
                        <View style={styles.mapSelectedMetaRow}>
                          <Image source={Icons.calendar} style={styles.calendarIconSmall} resizeMode="contain" />
                          <Text style={styles.mapSelectedDate}>{selectedMapPin.placedAt}</Text>
                          <Image source={Icons.hourglass} style={styles.hourglassIconSmall} resizeMode="contain" />
                          <Text style={styles.mapSelectedExpiry}>{selectedMapPin.expiresIn}</Text>
                        </View>
                      </View>
                      <View style={styles.footprintBadge}>
                        <Image source={Icons.footprints} style={styles.footprintIcon} resizeMode="contain" />
                        <Text style={styles.footprintText}>{selectedMapPin.readCount}</Text>
                      </View>
                    </View>
                    <Text style={styles.mapSelectedMessage}>{selectedMapPin.message}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════
            2. 出会った言葉の記録（「拾った言葉」リスト）
        ═══════════════════════════════════════════════════════ */}
        {activeTab === 'collected' && (
          <View style={styles.tabSection}>
            <View style={styles.subHeaderRow}>
              <View style={styles.subHeaderTitleGroup}>
                <Image source={Icons.herb} style={styles.subHeaderFootprintIcon} resizeMode="contain" />
                <Text style={styles.subSectionTitle}>
                  街で拾った言葉 ({collectedList.length})
                </Text>
              </View>
            </View>

            <View style={styles.cardListContainer}>
              {collectedList.map((item) => (
                <WordCard
                  key={item.id}
                  message={item.message}
                  tags={item.tags}
                  onDelete={() => handleUncollect(item.id, item.author)}
                  footer={
                    <>
                      <WordCardAvatar name={item.author} />
                      <WordCardMeta>{item.author}さん</WordCardMeta>
                      <WordCardDate date={item.collectedAt} placeName={item.placeName} action="collected" />
                    </>
                  }
                />
              ))}

              {collectedList.length === 0 && (
                <View style={styles.emptyStateBox}>
                  <Image source={Icons.herb} style={styles.emptyFootprintsIcon} resizeMode="contain" />
                  <Text style={styles.emptyStateText}>まだ街で拾った言葉がありません</Text>
                  <Text style={styles.emptyStateSub}>探索レーダーを頼りに街を歩くと、誰かが残した言葉に出会えます。</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════
            3. 関心タグの設定（空間のフィルタリング設定）
        ═══════════════════════════════════════════════════════ */}
        {activeTab === 'tags' && (
          <View style={styles.tabSection}>
            {/* Master Notification Switch */}
            <View style={[styles.pocketNoticeCard, !isPocketNoticeOn && styles.pocketNoticeCardOff]}>
              <View style={[styles.pocketNoticeIconCircle, !isPocketNoticeOn && styles.pocketNoticeIconCircleOff]}>
                <Image
                  source={Icons.herb}
                  style={[styles.pocketNoticeHerb, !isPocketNoticeOn && styles.pocketNoticeHerbOff]}
                  resizeMode="contain"
                />
              </View>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.pocketNoticeTitle, !isPocketNoticeOn && styles.pocketNoticeTitleOff]}>
                  ポケット通知
                </Text>
                <Text style={[styles.pocketNoticeDesc, !isPocketNoticeOn && styles.pocketNoticeDescOff]}>
                  {isPocketNoticeOn
                    ? '関心タグに設定した言葉が近くにある時だけ、通知が届きます。'
                    : 'ポケット通知はオフです。近くに言葉があっても通知されません。'}
                </Text>
              </View>
              <Switch
                value={isPocketNoticeOn}
                onValueChange={setIsPocketNoticeOn}
                trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                ios_backgroundColor="#CBD5E1"
                thumbColor="#FFFFFF"
              />
            </View>

            <Text style={styles.subSectionTitle}>
              空間で見たいジャンル（今はこの気分）
            </Text>
            <Text style={styles.tagsGuideSub}>
              タグをタップしてON/OFFを切り替えます。選んだタグの言葉は、ARと地図で少し目立って表示され、ポケット通知の対象になります。
            </Text>

            {/* Tags Toggle Grid */}
            <View style={styles.tagGrid}>
              {tags.map((tag) => (
                <TouchableOpacity
                  key={tag.id}
                  style={[styles.tagToggleCard, tag.enabled && styles.tagToggleCardActive]}
                  onPress={() => handleToggleTag(tag.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.tagCardTopRow}>
                    <View style={[styles.tagIconWrapper, tag.enabled && styles.tagIconWrapperActive]}>
                      <Image
                        source={tag.icon}
                        style={[styles.tagCardIconImage, tag.enabled && styles.tagCardIconImageActive]}
                        resizeMode="contain"
                      />
                    </View>
                    <View style={[styles.tagCheckCircle, tag.enabled && styles.tagCheckCircleActive]}>
                      <Text style={styles.tagCheckSymbol}>{tag.enabled ? '✓' : '+'}</Text>
                    </View>
                  </View>
                  <Text style={[styles.tagCardName, tag.enabled && styles.tagCardNameActive]}>
                    #{tag.name}
                  </Text>
                  <Text style={styles.tagCardDesc} numberOfLines={2}>
                    {tag.desc}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  settingsBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsIcon: {
    width: 20,
    height: 20,
    tintColor: '#475569',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // Profile Section
  profileSection: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  avatarCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 2.5,
    borderColor: '#10B981',
  },
  avatarIcon: {
    width: 42,
    height: 42,
    tintColor: '#10B981',
  },
  userName: {
    color: '#0F172A',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 3,
  },
  userBio: {
    color: '#64748B',
    fontSize: 13,
    marginBottom: 16,
  },

  // Footprint Summary Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    width: '100%',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  statNumber: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },

  // 3 Main Tabs
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 3,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 11,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabBtnText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#059669',
    fontWeight: '800',
  },

  tabSection: {
    marginBottom: 20,
  },

  // Sub Header & View Mode Toggle
  subHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  subHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subHeaderFootprintIcon: {
    width: 16,
    height: 16,
    marginRight: 6,
    tintColor: '#10B981',
  },
  subSectionTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  viewModeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modeToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  modeToggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  modeToggleText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  modeToggleTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },

  // Placed Memory Cards
  cardListContainer: {
    gap: 12,
  },
  placedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  placeTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  placePinIcon: {
    width: 16,
    height: 16,
    marginRight: 6,
    tintColor: '#10B981',
  },
  placeNameText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
  expiryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  expiryHourglassIcon: {
    width: 12,
    height: 12,
    marginRight: 4,
    tintColor: '#B45309',
  },
  expiryText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '700',
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginLeft: 2,
  },
  dateMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6,
  },
  calendarIcon: {
    width: 12,
    height: 12,
    marginRight: 4,
    tintColor: '#64748B',
  },
  dateMetaText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '500',
  },
  locationHintText: {
    color: '#64748B',
    fontSize: 11,
    flex: 1,
  },
  memoryMessageText: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  memoryFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memoryTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    // タグが多くても、横の「誰かが読んだよ」や削除ボタンを押し出さない
    flexShrink: 1,
    marginRight: 6,
  },
  memoryTagIcon: {
    width: 11,
    height: 11,
    marginRight: 4,
    tintColor: '#475569',
  },
  memoryTagText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
  footprintBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  footprintIcon: {
    width: 12,
    height: 12,
    marginRight: 4,
    tintColor: '#059669',
  },
  footprintText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },
  deleteBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deleteBtnText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '600',
  },

  // Private Map Canvas
  privateMapContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  privateMapCanvas: {
    height: 240,
    backgroundColor: '#F0FDF4',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapGridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  mapGridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  mapWaterCircle: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    bottom: -20,
    right: 30,
  },
  mapCityLabel: {
    position: 'absolute',
    top: 12,
    left: 14,
    color: '#059669',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  mapPinWrapper: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: -16 }, { translateY: -28 }],
  },
  mapPinWrapperSelected: {
    transform: [{ translateX: -18 }, { translateY: -32 }],
    zIndex: 10,
  },
  mapPinBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  mapPinBubbleSelected: {
    backgroundColor: '#10B981',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderColor: '#FFFFFF',
  },
  mapPinIconImage: {
    width: 16,
    height: 16,
    tintColor: '#10B981',
  },
  mapPinIconImageSelected: {
    tintColor: '#FFFFFF',
  },
  mapPinLabel: {
    color: '#0F172A',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 4,
    borderRadius: 4,
    marginTop: 2,
  },
  mapPinLabelSelected: {
    color: '#059669',
    fontWeight: '800',
  },
  mapSelectedCard: {
    padding: 14,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  mapSelectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  mapSelectedPlaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapSelectedPinIcon: {
    width: 15,
    height: 15,
    marginRight: 4,
    tintColor: '#10B981',
  },
  mapSelectedPlace: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  mapSelectedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  calendarIconSmall: {
    width: 12,
    height: 12,
    marginRight: 4,
    tintColor: '#64748B',
  },
  mapSelectedDate: {
    color: '#64748B',
    fontSize: 11,
    marginRight: 8,
  },
  hourglassIconSmall: {
    width: 11,
    height: 11,
    marginRight: 3,
    tintColor: '#B45309',
  },
  mapSelectedExpiry: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '600',
  },
  mapSelectedMessage: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },

  // 2. Collected Words (拾った言葉)
  collectedStampBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  collectedStampBadgeIcon: {
    width: 12,
    height: 12,
    marginRight: 4,
    tintColor: '#059669',
  },
  collectedStampBadgeText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },
  collectedAuthorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  collectedAuthorIcon: {
    width: 12,
    height: 12,
    marginRight: 4,
    tintColor: '#64748B',
  },
  collectedAuthorText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },

  // 3. Interest Tags
  pocketNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 16,
  },
  pocketNoticeCardOff: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  pocketNoticeIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  pocketNoticeIconCircleOff: {
    backgroundColor: '#E2E8F0',
  },
  pocketNoticeHerb: {
    width: 20,
    height: 22,
    tintColor: '#059669',
  },
  pocketNoticeHerbOff: {
    tintColor: '#94A3B8',
  },
  pocketNoticeTitle: {
    color: '#059669',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  pocketNoticeTitleOff: {
    color: '#64748B',
  },
  pocketNoticeDesc: {
    color: '#047857',
    fontSize: 11,
    lineHeight: 15,
  },
  pocketNoticeDescOff: {
    color: '#94A3B8',
  },
  tagsGuideSub: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 14,
    marginTop: 4,
    lineHeight: 17,
  },
  tagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tagToggleCard: {
    width: (width - 32 - 10) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  tagToggleCardActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  tagCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tagIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagIconWrapperActive: {
    backgroundColor: '#DCFCE7',
  },
  tagCardIconImage: {
    width: 18,
    height: 18,
    tintColor: '#64748B',
  },
  tagCardIconImageActive: {
    tintColor: '#059669',
  },
  tagCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagCheckCircleActive: {
    backgroundColor: '#10B981',
  },
  tagCheckSymbol: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  tagCardName: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  tagCardNameActive: {
    color: '#059669',
    fontWeight: '800',
  },
  tagCardDesc: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 14,
  },

  // Empty State
  emptyStateBox: {
    alignItems: 'center',
    paddingVertical: 36,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 20,
  },
  emptyStateIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyFootprintsIcon: {
    width: 36,
    height: 36,
    marginBottom: 10,
    tintColor: '#94A3B8',
  },
  emptyStateText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyStateSub: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  headerLogoutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
  },
  headerLogoutText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  // Full-screen Auth on MyPage
  fullAuthContainer: {
    padding: 24,
    paddingTop: 36,
    paddingBottom: 48,
    alignItems: 'center',
  },
  authHero: {
    alignItems: 'center',
    marginBottom: 28,
  },
  authHeroIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  authHeroIcon: {
    width: 36,
    height: 36,
    tintColor: '#10B981',
  },
  authHeroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  authHeroSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  authTabSwitch: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    width: '100%',
    maxWidth: 360,
    marginBottom: 24,
  },
  authTabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  authTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  authTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  authTabTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  authForm: {
    width: '100%',
    maxWidth: 360,
    gap: 16,
  },
  authField: {
    gap: 6,
  },
  authFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  authInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0F172A',
  },
  authErrorCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 12,
    padding: 12,
  },
  authErrorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
  },
  authSubmitBtn: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  authSubmitBtnDisabled: {
    opacity: 0.65,
  },
  authSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
