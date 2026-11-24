import React, { useCallback, useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { User } from '@supabase/supabase-js';
import { Icons } from '../assets/icons';
import { ScreenHeader } from './ScreenHeader';
import { ExpandDown } from './ExpandDown';
import { styles } from './mypage/styles';
import { AuthForm } from './mypage/AuthForm';
import { AvatarPickerModal } from './mypage/AvatarPickerModal';
import { BlockedUsersModal } from './mypage/BlockedUsersModal';
import { InterestSettingsTab } from './mypage/InterestSettingsTab';
import { deleteMyPost, fillPostPlaceName, updateMyPostsAuthor } from '../services/postService';
import { usePreferences } from '../services/preferencesStore';
import { displayNameOf } from '../services/authService';
import { animalImageOf, avatarHandleFor, resolveAvatarAnimal, type AvatarAnimal } from '../config/avatarColors';
import {
  WordCard,
  WordCardAvatar,
  WordCardDate,
  WordCardMeta,
  WordCardReadCount,
} from './WordCard';
import { fetchCollectedPosts, uncollectPost } from '../services/readService';
import { supabase } from '../lib/supabase';

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


type Props = {
  user?: User | null;
  onSignOut?: () => void;
  /** アカウントを削除する（確認はマイページで出す） */
  onDeleteAccount?: () => Promise<void>;
  /** ブロックした人（歯車の「ブロック中の人」に出す） */
  blockedUserIds?: string[];
  /** ブロックを外す */
  onUnblock?: (userId: string) => Promise<void>;
  /** 画面下の小さなお知らせ（削除した、など） */
  onNotice?: (message: string, options?: { symbol?: string; subtitle?: string }) => void;
  /** 使い方ツアーをもう一度見る（歯車のメニュー） */
  onReplayTour?: () => void;
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


export function MyPageScreen({
  user,
  onSignOut,
  onDeleteAccount,
  onNotice,
  blockedUserIds = [],
  onUnblock,
  onReplayTour,
}: Props): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'placed' | 'collected' | 'tags'>('placed');

  // データ状態
  const [placedList, setPlacedList] = useState<PlacedMemory[]>(INITIAL_PLACED);
  // AR で目にした他の人の言葉（post_reads）
  const [collectedList, setCollectedList] = useState<CollectedWord[]>(INITIAL_COLLECTED);

  // 関心タグの数（上の数字）とアイコンの色（preferencesStore）。関心タグの設定は InterestSettingsTab
  const { interestTags, avatarColor, avatarAnimal: savedAvatarAnimal, setAvatar } = usePreferences();
  const avatarAnimal = resolveAvatarAnimal(savedAvatarAnimal, user?.id);

  const [isAvatarModalVisible, setIsAvatarModalVisible] = useState(false);
  const [isBlockedListVisible, setIsBlockedListVisible] = useState(false);
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

  // アイコン（動物と色）の変更。ログイン情報にも短い値だけを入れる（別の端末でログインしたとき用）
  const handleSelectAvatar = async (animal: AvatarAnimal, hex: string) => {
    setAvatar(animal, hex);
    setIsAvatarModalVisible(false);
    if (user) {
      try {
        await supabase.auth.updateUser({
          data: { avatar_color: hex, avatar_animal: animal },
        });
        // これまでに置いた言葉のアイコンも、新しいものにそろえる
        await updateMyPostsAuthor(user.id, { handle: avatarHandleFor(hex, animal) });
      } catch (e) {
        console.warn('アバターアイコン保存エラー:', e);
      }
    }
  };

  // 削除の通信中のカードと、消えていく途中のカード（畳み終わったら一覧から外す）
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(new Set());
  const [leavingIds, setLeavingIds] = useState<ReadonlySet<string>>(new Set());
  const withId = (set: ReadonlySet<string>, id: string) => new Set(set).add(id);
  const withoutId = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    next.delete(id);
    return next;
  };

  // サーバーで消し終えたら、カードを畳んで消し、お知らせを出す。失敗したらカードを元に戻す
  const removeWithFeedback = async (
    id: string,
    remove: () => Promise<void>,
    failTitle: string,
    notice: { message: string; symbol: string; subtitle?: string }
  ) => {
    setDeletingIds((prev) => withId(prev, id));
    try {
      await remove();
    } catch (err: any) {
      setDeletingIds((prev) => withoutId(prev, id));
      // 消せなかったときは一覧に残したまま知らせる（消えたように見せない）
      Alert.alert(failTitle, err?.message ?? '');
      return;
    }
    setLeavingIds((prev) => withId(prev, id));
    onNotice?.(notice.message, { symbol: notice.symbol, subtitle: notice.subtitle });
  };

  // カードが畳み終わったら、一覧から外す
  const finishLeaving = (id: string, list: 'placed' | 'collected') => {
    if (list === 'placed') setPlacedList((prev) => prev.filter((item) => item.id !== id));
    else setCollectedList((prev) => prev.filter((item) => item.id !== id));
    setLeavingIds((prev) => withoutId(prev, id));
    setDeletingIds((prev) => withoutId(prev, id));
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
          onPress: () =>
            removeWithFeedback(id, () => deleteMyPost(id), '削除できませんでした', {
              message: '言葉を削除しました',
              symbol: 'trash',
              subtitle: 'その場所から取り除きました',
            }),
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
          onPress: () =>
            removeWithFeedback(postId, () => uncollectPost(postId, user.id), '外せませんでした', {
              message: '拾った言葉から外しました',
              symbol: 'checkmark.circle',
            }),
        },
      ]
    );
  };


  // 1. 未ログインの場合：マイページ全体をログイン・新規登録画面にする
  if (!user) {
    return <AuthForm />;
  }

  // 2. ログイン済みの場合：通常のマイページを表示
  const displayName = displayNameOf(user);

  // アカウントの削除は元に戻せないので、もう一度確かめてから
  const confirmDeleteAccount = () => {
    Alert.alert(
      'アカウントを削除',
      '残した言葉と、拾った言葉の記録もすべて消えます。元に戻すことはできません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: () => {
            onDeleteAccount?.().catch((err: any) => {
              console.warn(err);
              Alert.alert('削除できませんでした', 'しばらくしてから、もう一度お試しください。');
            });
          },
        },
      ]
    );
  };

  // 右上の設定ボタンのメニュー（使い方・ブロック中の人・ログアウト・アカウントの削除）
  const openSettingsMenu = () => {
    const canSignOut = user != null && onSignOut != null;
    const canDelete = user != null && onDeleteAccount != null;
    const openBlockedList = () => setIsBlockedListVisible(true);
    if (Platform.OS === 'ios') {
      const options = [
        ...(onReplayTour ? ['使い方をもう一度見る'] : []),
        'ブロック中の人',
        ...(canSignOut ? ['ログアウト'] : []),
        ...(canDelete ? ['アカウントを削除'] : []),
        'キャンセル',
      ];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: canDelete ? options.indexOf('アカウントを削除') : undefined,
        },
        (index) => {
          if (options[index] === '使い方をもう一度見る') onReplayTour?.();
          if (options[index] === 'ブロック中の人') openBlockedList();
          if (options[index] === 'ログアウト') onSignOut?.();
          if (options[index] === 'アカウントを削除') confirmDeleteAccount();
        }
      );
      return;
    }
    Alert.alert('設定', undefined, [
      ...(onReplayTour ? [{ text: '使い方をもう一度見る', onPress: onReplayTour }] : []),
      { text: 'ブロック中の人', onPress: openBlockedList },
      ...(canSignOut ? [{ text: 'ログアウト', onPress: onSignOut }] : []),
      ...(canDelete
        ? [{ text: 'アカウントを削除', style: 'destructive' as const, onPress: confirmDeleteAccount }]
        : []),
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
            <View style={[styles.avatarCircle, { backgroundColor: avatarColor, shadowColor: avatarColor }]}>
              <Image source={animalImageOf(avatarAnimal)} style={styles.avatarAnimalImage} resizeMode="contain" />
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
              <Text style={styles.statNumber}>{interestTags.length}</Text>
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
                <ExpandDown
                  key={item.id}
                  open={!leavingIds.has(item.id)}
                  onClosed={() => finishLeaving(item.id, 'placed')}
                >
                <WordCard
                  message={item.message}
                  tags={item.tags}
                  isDeleting={deletingIds.has(item.id)}
                  onDelete={() => handleDeleteMemory(item.id, item.message)}
                  footer={
                    <>
                      <WordCardAvatar name={displayName} icon={avatarHandleFor(avatarColor, avatarAnimal)} />
                      <WordCardDate date={item.placedAt} placeName={item.placeName} action="placed" />
                      {item.readCount > 0 && <WordCardReadCount count={item.readCount} />}
                    </>
                  }
                />
                </ExpandDown>
              ))}

              {placedList.length === 0 && (
                <View style={styles.emptyStateBox}>
                  <Image source={Icons.footprints} style={styles.emptyFootprintsIcon} resizeMode="contain" />
                  <Text style={styles.emptyStateText}>まだ街に残した言葉がありません</Text>
                  <Text style={styles.emptyStateSub}>ホームの「＋」ボタンから、好きな場所に言葉を残そう！</Text>
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
                <ExpandDown
                  key={item.id}
                  open={!leavingIds.has(item.id)}
                  onClosed={() => finishLeaving(item.id, 'collected')}
                >
                <WordCard
                  message={item.message}
                  tags={item.tags}
                  isDeleting={deletingIds.has(item.id)}
                  onDelete={() => handleUncollect(item.id, item.author)}
                  footer={
                    <>
                      <WordCardAvatar name={item.author} icon={item.stampIcon || item.handle} />
                      <WordCardMeta>{item.author}さん</WordCardMeta>
                      <WordCardDate date={item.collectedAt} placeName={item.placeName} action="collected" />
                    </>
                  }
                />
                </ExpandDown>
              ))}

              {collectedList.length === 0 && (
                <View style={styles.emptyStateBox}>
                  <Image source={Icons.herb} style={styles.emptyFootprintsIcon} resizeMode="contain" />
                  <Text style={styles.emptyStateText}>まだ街で拾った言葉がありません</Text>
                  <Text style={styles.emptyStateSub}>気に入った言葉を拾おう！</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════
            3. 関心タグの設定（空間のフィルタリング設定）
        ═══════════════════════════════════════════════════════ */}
        {activeTab === 'tags' && <InterestSettingsTab />}
      </ScrollView>

      <BlockedUsersModal
        visible={isBlockedListVisible}
        onClose={() => setIsBlockedListVisible(false)}
        blockedUserIds={blockedUserIds}
        onUnblock={async (userId) => {
          await onUnblock?.(userId);
        }}
      />
      <AvatarPickerModal
        visible={isAvatarModalVisible}
        onClose={() => setIsAvatarModalVisible(false)}
        avatarAnimal={avatarAnimal}
        avatarColor={avatarColor}
        onSelect={handleSelectAvatar}
      />
    </View>
  );
}
