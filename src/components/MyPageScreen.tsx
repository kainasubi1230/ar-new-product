import React, { useCallback, useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ImageSourcePropType,
  KeyboardAvoidingView,
  Modal,
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
import {
  WordCard,
  WordCardAvatar,
  WordCardDate,
  WordCardMeta,
  WordCardReadCount,
  getAvatarIconSource,
} from './WordCard';
import { fetchCollectedPosts, uncollectPost } from '../services/readService';
import { supabase } from '../lib/supabase';
import {
  normalizeTag,
  DEFAULT_MUTED_TAG_PRESETS,
  ALL_SUGGESTED_TAGS,
} from '../services/interestTagService';
import { pickAvatarImage, isCustomAvatarUri } from '../native/AvatarPicker';

const { width } = Dimensions.get('window');

export const AVATAR_OPTIONS = [
  { key: 'mypage', label: 'ひと', icon: Icons.mypage },
  { key: 'walking', label: '散歩', icon: Icons.walking },
  { key: 'cafe', label: 'カフェ', icon: Icons.cafe },
  { key: 'book', label: '読書', icon: Icons.book },
  { key: 'art', label: 'アート', icon: Icons.art },
  { key: 'gourmet', label: 'グルメ', icon: Icons.gourmet },
  { key: 'herb', label: '自然', icon: Icons.herb },
  { key: 'history', label: '歴史', icon: Icons.history },
  { key: 'view', label: '絶景', icon: Icons.view },
  { key: 'footprints', label: '足跡', icon: Icons.footprints },
];

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

  // データ状態
  const [placedList, setPlacedList] = useState<PlacedMemory[]>(INITIAL_PLACED);
  // AR で目にした他の人の言葉（post_reads）
  const [collectedList, setCollectedList] = useState<CollectedWord[]>(INITIAL_COLLECTED);

  // 関心タグ・安心フィルター・アイコン設定（preferencesStore）
  const {
    interestTags,
    toggleInterestTag,
    pocketNoticeEnabled,
    setPocketNoticeEnabled,
    onlyInterestTags,
    setOnlyInterestTags,
    hideNegativePosts,
    setHideNegativePosts,
    mutedTags = [],
    toggleMutedTag,
    setMutedTags,
    userAvatarIcon = 'mypage',
    setUserAvatarIcon,
    showDevInfo,
    setShowDevInfo,
  } = usePreferences();

  const [isAvatarModalVisible, setIsAvatarModalVisible] = useState(false);
  const [customMutedTagInput, setCustomMutedTagInput] = useState('');
  const [customInterestTagInput, setCustomInterestTagInput] = useState('');

  const tags: InterestTag[] = INITIAL_TAGS.map((tag) => ({
    ...tag,
    enabled: interestTags.includes(`#${tag.name}`),
  }));
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

      const formatted: PlacedMemory[] = (data || []).map((p) => ({
        id: p.id,
        // 置いた場所の名前（無ければ空。下で後から埋める）
        placeName: p.place_name ?? '',
        locationHint: `GPS精度: 約${Math.round(p.accuracy_m || 10)}m`,
        message: p.message,
        tags: normalizeTags(p.tags),
        placedAt: new Date(p.created_at).toLocaleDateString('ja-JP'),
        readCount: 0,
        expiresIn: '無期限',
      }));

      // 自分の言葉が何人に拾われたか（posts.read_count。拾われるたびに DB が数える）
      const withCounts = formatted.map((item, index) => ({
        ...item,
        readCount: (data ?? [])[index]?.read_count ?? 0,
      }));

      setPlacedList(withCounts);

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

  // アバターアイコンの変更
  const handleSelectAvatar = async (iconKey: string) => {
    setUserAvatarIcon(iconKey);
    setIsAvatarModalVisible(false);
    if (user) {
      try {
        await supabase.auth.updateUser({
          data: { avatar_icon: iconKey },
        });
      } catch (e) {
        console.warn('アバターアイコン保存エラー:', e);
      }
    }
  };

  // 写真ライブラリから好きな画像を選択（不適切画像はオンデバイスでブロック）
  const handlePickCustomPhoto = async () => {
    try {
      const dataUri = await pickAvatarImage();
      if (!dataUri) return; // キャンセル
      await handleSelectAvatar(dataUri);
    } catch (e: any) {
      const msg = e?.message || '画像を読み込めませんでした。';
      Alert.alert('アイコンを設定できませんでした', msg);
    }
  };

  // 自由な関心タグの追加
  const handleAddCustomInterestTag = (raw?: string) => {
    const target = (raw ?? customInterestTagInput).trim();
    if (!target) return;
    const formatted = normalizeTag(target);
    if (formatted && !interestTags.includes(formatted)) {
      toggleInterestTag(formatted);
    }
    setCustomInterestTagInput('');
  };

  // 安心フィルターの除外タグ追加
  const handleAddCustomMutedTag = () => {
    const trimmed = customMutedTagInput.trim();
    if (!trimmed) return;
    const formatted = normalizeTag(trimmed);
    if (!mutedTags.includes(formatted)) {
      setMutedTags([...mutedTags, formatted]);
    }
    setCustomMutedTagInput('');
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

  // 右上の設定ボタンのメニュー（開発用の情報の表示（開発ビルドのみ）・ログアウト）
  // ※「関心タグの編集」は削除済み
  const openSettingsMenu = () => {
    const canSignOut = user != null && onSignOut != null;
    const devInfoLabel = showDevInfo ? '開発用の情報を隠す' : '開発用の情報を表示';
    const toggleDevInfo = () => setShowDevInfo(!showDevInfo);
    if (Platform.OS === 'ios') {
      const options = [
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
          if (options[index] === devInfoLabel) toggleDevInfo();
          if (options[index] === 'ログアウト') onSignOut?.();
        }
      );
      return;
    }
    Alert.alert('設定', undefined, [
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
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => setIsAvatarModalVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.avatarCircle}>
              {isCustomAvatarUri(userAvatarIcon) ? (
                <Image
                  source={{ uri: userAvatarIcon }}
                  style={styles.avatarCustomPhoto}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={getAvatarIconSource(userAvatarIcon)}
                  style={styles.avatarIcon}
                  resizeMode="contain"
                />
              )}
            </View>
            <View style={styles.avatarEditBadge}>
              <Text style={styles.avatarEditBadgeText}>✎</Text>
            </View>
          </TouchableOpacity>
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
            ※マップ制度は廃止し、シンプルなリスト表示に一本化
        ═══════════════════════════════════════════════════════ */}
        {activeTab === 'placed' && (
          <View style={styles.tabSection}>
            <View style={styles.subHeaderRow}>
              <View style={styles.subHeaderTitleGroup}>
                <Image source={Icons.footprints} style={styles.subHeaderFootprintIcon} resizeMode="contain" />
                <Text style={styles.subSectionTitle}>
                  街に残した言葉 ({placedList.length})
                </Text>
              </View>
            </View>

            <View style={styles.cardListContainer}>
              {placedList.map((item) => (
                <WordCard
                  key={item.id}
                  message={item.message}
                  tags={item.tags}
                  onDelete={() => handleDeleteMemory(item.id, item.message)}
                  footer={
                    <>
                      <WordCardAvatar name={displayName} icon={userAvatarIcon} />
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
                      <WordCardAvatar name={item.author} icon={item.stampIcon || item.handle} />
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
            {/* 1. ポケット通知 */}
            <View style={[styles.filterToggleCard, isPocketNoticeOn && styles.filterToggleCardOn]}>
              <View style={[styles.filterToggleIconBox, isPocketNoticeOn && styles.filterToggleIconBoxOn]}>
                <Image
                  source={Icons.notice}
                  style={[styles.filterToggleIcon, isPocketNoticeOn && styles.filterToggleIconOn]}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.filterToggleTextGroup}>
                <View style={styles.filterToggleTitleRow}>
                  <Text style={[styles.filterToggleTitle, isPocketNoticeOn && styles.filterToggleTitleOn]}>
                    ポケット通知
                  </Text>
                </View>
                <Text style={styles.filterToggleDesc}>
                  関心タグに設定した言葉が近くにある時だけ、通知が届きます。
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

            {/* 2. 関心タグの言葉だけ表示 */}
            <View style={[styles.filterToggleCard, onlyInterestTags && styles.filterToggleCardOn]}>
              <View style={[styles.filterToggleIconBox, onlyInterestTags && styles.filterToggleIconBoxOn]}>
                <Image
                  source={Icons.search}
                  style={[styles.filterToggleIcon, onlyInterestTags && styles.filterToggleIconOn]}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.filterToggleTextGroup}>
                <View style={styles.filterToggleTitleRow}>
                  <Text style={[styles.filterToggleTitle, onlyInterestTags && styles.filterToggleTitleOn]}>
                    関心タグの言葉だけ表示
                  </Text>
                </View>
                <Text style={styles.filterToggleDesc}>
                  ARカメラと地図に、関心タグ（と近いジャンル）の言葉だけを出します。
                </Text>
              </View>
              <Switch
                value={onlyInterestTags}
                onValueChange={setOnlyInterestTags}
                trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                ios_backgroundColor="#CBD5E1"
                thumbColor="#FFFFFF"
              />
            </View>

            {/* 3. 安心フィルター */}
            <View style={[styles.filterToggleCard, hideNegativePosts && styles.filterToggleCardOn]}>
              <View style={[styles.filterToggleIconBox, hideNegativePosts && styles.filterToggleIconBoxOn]}>
                <Image
                  source={Icons.herb}
                  style={[styles.filterToggleIcon, hideNegativePosts && styles.filterToggleIconOn]}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.filterToggleTextGroup}>
                <View style={styles.filterToggleTitleRow}>
                  <Text style={[styles.filterToggleTitle, hideNegativePosts && styles.filterToggleTitleOn]}>
                    安心フィルター
                  </Text>
                </View>
                <Text style={styles.filterToggleDesc}>
                  ネガティブな表現や、見たくない除外タグの言葉をARと地図に出しません。
                </Text>
              </View>
              <Switch
                value={hideNegativePosts}
                onValueChange={setHideNegativePosts}
                trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                ios_backgroundColor="#CBD5E1"
                thumbColor="#FFFFFF"
              />
            </View>

            {/* 安心フィルターの除外タグカスタマイズ（安心フィルターがONのとき表示） */}
            {hideNegativePosts && (
              <View style={styles.mutedConfigCard}>
                <View style={styles.mutedConfigTitleRow}>
                  <Image source={Icons.herb} style={styles.mutedConfigTitleIcon} resizeMode="contain" />
                  <Text style={styles.mutedConfigTitle}>見たくない言葉・除外タグの選択</Text>
                </View>
                <Text style={styles.mutedConfigSub}>
                  選択したタグを含む言葉は、空間に表示されなくなります。
                </Text>

                {/* プリセット候補 */}
                <View style={styles.mutedChipWrap}>
                  {DEFAULT_MUTED_TAG_PRESETS.map((tag) => {
                    const isMuted = mutedTags.includes(tag);
                    return (
                      <TouchableOpacity
                        key={tag}
                        style={[styles.mutedChip, isMuted && styles.mutedChipSelected]}
                        onPress={() => toggleMutedTag(tag)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.mutedChipText, isMuted && styles.mutedChipTextSelected]}>
                          {isMuted ? `✓ ${tag}` : `+ ${tag}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* 選択中の除外タグ一覧 */}
                {mutedTags.length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.mutedSelectedLabel}>除外中のタグ ({mutedTags.length}個):</Text>
                    <View style={styles.mutedSelectedRow}>
                      {mutedTags.map((tag) => (
                        <View key={tag} style={styles.mutedActiveBadge}>
                          <Text style={styles.mutedActiveBadgeText}>{tag}</Text>
                          <TouchableOpacity onPress={() => toggleMutedTag(tag)} style={styles.mutedRemoveBtn}>
                            <Text style={styles.mutedRemoveText}>×</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* 自由な除外キーワード/タグ追加入力 */}
                <View style={styles.customMutedRow}>
                  <TextInput
                    style={styles.customMutedInput}
                    placeholder="# 除外したい単語・タグを入力..."
                    placeholderTextColor="#94A3B8"
                    value={customMutedTagInput}
                    onChangeText={setCustomMutedTagInput}
                    onSubmitEditing={handleAddCustomMutedTag}
                    returnKeyType="done"
                  />
                  {customMutedTagInput.trim().length > 0 && (
                    <TouchableOpacity style={styles.customMutedAddBtn} onPress={handleAddCustomMutedTag}>
                      <Text style={styles.customMutedAddBtnText}>追加</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            <Text style={styles.subSectionTitle}>
              空間で見たいジャンル（大カテゴリ）
            </Text>
            <Text style={styles.tagsGuideSub}>
              大カテゴリを選ぶと、関連する派生タグや表記揺れ（例: #cafe・#珈琲）もまとめて自動ヒットします。
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

            {/* タグ増加対応: フリータグ検索＆追加カード */}
            <View style={styles.customInterestCard}>
              <Text style={styles.customInterestTitle}>特定のタグを検索・追加</Text>
              <Text style={styles.customInterestSub}>
                大カテゴリ以外の細かいタグも追加できます（表記揺れ・同義語も自動でまとまります）。
              </Text>
              <View style={styles.customMutedRow}>
                <TextInput
                  style={styles.customMutedInput}
                  placeholder="# タグを検索・追加 (例: サウナ, 隠れ家)..."
                  placeholderTextColor="#94A3B8"
                  value={customInterestTagInput}
                  onChangeText={setCustomInterestTagInput}
                  onSubmitEditing={() => handleAddCustomInterestTag()}
                  returnKeyType="done"
                />
                {customInterestTagInput.trim().length > 0 && (
                  <TouchableOpacity
                    style={styles.customInterestAddBtn}
                    onPress={() => handleAddCustomInterestTag()}
                  >
                    <Text style={styles.customMutedAddBtnText}>追加</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* インクリメンタル候補チップ */}
              <View style={styles.mutedChipWrap}>
                {ALL_SUGGESTED_TAGS.filter((t) => {
                  const q = customInterestTagInput.trim().replace(/^#+/, '').toLowerCase();
                  return !q || t.toLowerCase().includes(q);
                })
                  .slice(0, 8)
                  .map((tag) => {
                    const isAdded = interestTags.includes(tag);
                    return (
                      <TouchableOpacity
                        key={tag}
                        style={[styles.interestSuggestChip, isAdded && styles.interestSuggestChipActive]}
                        onPress={() => toggleInterestTag(tag)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.interestSuggestChipText,
                            isAdded && styles.interestSuggestChipTextActive,
                          ]}
                        >
                          {isAdded ? `✓ ${tag}` : `+ ${tag}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>

              {/* 追加済みのカスタムタグ（大カテゴリ8種以外） */}
              {(() => {
                const presetTagNames = new Set(INITIAL_TAGS.map((t) => `#${t.name}`));
                const customSelected = interestTags.filter((t) => !presetTagNames.has(t));
                if (customSelected.length === 0) return null;
                return (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.mutedSelectedLabel}>
                      登録中のカスタムタグ ({customSelected.length}個):
                    </Text>
                    <View style={styles.mutedSelectedRow}>
                      {customSelected.map((tag) => (
                        <View key={tag} style={styles.interestActiveBadge}>
                          <Text style={styles.interestActiveBadgeText}>{tag}</Text>
                          <TouchableOpacity
                            onPress={() => toggleInterestTag(tag)}
                            style={styles.mutedRemoveBtn}
                          >
                            <Text style={styles.interestRemoveText}>×</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })()}
            </View>
          </View>
        )}
      </ScrollView>

      {/* アバターアイコン選択モーダル */}
      <Modal
        visible={isAvatarModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAvatarModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.avatarModalOverlay}
          activeOpacity={1}
          onPress={() => setIsAvatarModalVisible(false)}
        >
          <View style={styles.avatarModalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.avatarModalHeader}>
              <View>
                <Text style={styles.avatarModalTitle}>アバターアイコンを選択</Text>
                <Text style={styles.avatarModalSub}>
                  メッセージカードや拾った言葉に表示されます
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsAvatarModalVisible(false)}
                style={styles.avatarModalCloseBtn}
              >
                <Text style={styles.avatarModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 写真ライブラリからカスタム画像を選ぶ */}
            <TouchableOpacity
              style={styles.photoPickerButton}
              onPress={handlePickCustomPhoto}
              activeOpacity={0.75}
            >
              <View style={styles.photoPickerIconCircle}>
                {isCustomAvatarUri(userAvatarIcon) ? (
                  <Image
                    source={{ uri: userAvatarIcon }}
                    style={styles.photoPickerCurrentThumb}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={styles.photoPickerIconEmoji}>🖼</Text>
                )}
              </View>
              <View style={styles.photoPickerTextWrap}>
                <Text style={styles.photoPickerTitle}>写真ライブラリから好きな画像を選ぶ</Text>
                <Text style={styles.photoPickerSub}>
                  不適切な画像は端末内で自動チェックされ設定できません
                </Text>
              </View>
              <Text style={styles.photoPickerArrow}>›</Text>
            </TouchableOpacity>

            <View style={styles.avatarGrid}>
              {AVATAR_OPTIONS.map((opt) => {
                const isSelected = userAvatarIcon === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.avatarOptionItem, isSelected && styles.avatarOptionItemSelected]}
                    onPress={() => handleSelectAvatar(opt.key)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.avatarOptionCircle, isSelected && styles.avatarOptionCircleSelected]}>
                      <Image
                        source={opt.icon}
                        style={[styles.avatarOptionImage, isSelected && styles.avatarOptionImageSelected]}
                        resizeMode="contain"
                      />
                    </View>
                    <Text style={[styles.avatarOptionLabel, isSelected && styles.avatarOptionLabelSelected]}>
                      {opt.label}
                    </Text>
                    {isSelected && <Text style={styles.avatarSelectedBadge}>✓ 選択中</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
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

  // Profile Section & Avatar
  profileSection: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  avatarButton: {
    position: 'relative',
    marginBottom: 10,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarIcon: {
    width: 44,
    height: 44,
    tintColor: '#10B981',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#10B981',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarEditBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  userName: {
    color: '#0F172A',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 2,
  },
  userBio: {
    color: '#64748B',
    fontSize: 13,
    marginBottom: 16,
  },

  // 3つのトグルカード（ポケット通知、関心タグのみ、安心フィルターで統一）
  filterToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  filterToggleCardOn: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  filterToggleIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  filterToggleIconBoxOn: {
    backgroundColor: '#DCFCE7',
  },
  filterToggleIcon: {
    width: 20,
    height: 20,
    tintColor: '#64748B',
  },
  filterToggleIconOn: {
    tintColor: '#059669',
  },
  filterToggleTextGroup: {
    flex: 1,
    marginRight: 10,
  },
  filterToggleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  filterToggleTitle: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  filterToggleTitleOn: {
    color: '#065F46',
    fontWeight: '800',
  },
  filterToggleDesc: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 16,
  },

  // 安心フィルター除外設定カード
  mutedConfigCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 14,
    marginBottom: 16,
  },
  mutedConfigTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  mutedConfigTitleIcon: {
    width: 15,
    height: 15,
    tintColor: '#991B1B',
  },
  mutedConfigTitle: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  mutedConfigSub: {
    color: '#B91C1C',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 10,
  },
  mutedChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mutedChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  mutedChipSelected: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  mutedChipText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
  },
  mutedChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  mutedSelectedLabel: {
    color: '#991B1B',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  mutedSelectedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  mutedActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F87171',
    gap: 4,
  },
  mutedActiveBadgeText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '700',
  },
  mutedRemoveBtn: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mutedRemoveText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 13,
  },
  customMutedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 10,
    marginTop: 10,
  },
  customMutedInput: {
    flex: 1,
    height: 38,
    fontSize: 13,
    color: '#0F172A',
  },
  customMutedAddBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  customMutedAddBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // アバターモーダル
  avatarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  avatarModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  avatarModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  avatarModalTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 2,
  },
  avatarModalSub: {
    color: '#64748B',
    fontSize: 12,
  },
  avatarModalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarModalCloseText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  avatarOptionItem: {
    width: (width - 40 - 36) / 4,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  avatarOptionItemSelected: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  avatarOptionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 4,
  },
  avatarOptionCircleSelected: {
    borderColor: '#10B981',
    backgroundColor: '#10B981',
  },
  avatarOptionImage: {
    width: 22,
    height: 22,
    tintColor: '#475569',
  },
  avatarOptionImageSelected: {
    tintColor: '#FFFFFF',
  },
  avatarOptionLabel: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
  avatarOptionLabelSelected: {
    color: '#065F46',
    fontWeight: '800',
  },
  avatarSelectedBadge: {
    color: '#059669',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
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
  avatarCustomPhoto: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  customInterestCard: {
    marginTop: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customInterestTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  customInterestSub: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 10,
  },
  customInterestAddBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    justifyContent: 'center',
  },
  interestSuggestChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  interestSuggestChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  interestSuggestChipText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  interestSuggestChipTextActive: {
    color: '#047857',
    fontWeight: '700',
  },
  interestActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 999,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 4,
    gap: 4,
  },
  interestActiveBadgeText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '700',
  },
  interestRemoveText: {
    color: '#059669',
    fontSize: 14,
    fontWeight: '700',
  },
  photoPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    gap: 12,
  },
  photoPickerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPickerCurrentThumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  photoPickerIconEmoji: {
    fontSize: 20,
  },
  photoPickerTextWrap: {
    flex: 1,
  },
  photoPickerTitle: {
    color: '#065F46',
    fontSize: 14,
    fontWeight: '700',
  },
  photoPickerSub: {
    color: '#047857',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  photoPickerArrow: {
    color: '#059669',
    fontSize: 22,
    fontWeight: '600',
  },
});
