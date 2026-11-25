import React, { useEffect, useState } from 'react';
import { Image, ImageSourcePropType, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Icons } from '../../assets/icons';
import { ExpandDown } from '../ExpandDown';
import { usePreferences } from '../../services/preferencesStore';
import { DEFAULT_MUTED_TAG_PRESETS, normalizeTag } from '../../services/interestTagService';
import { styles } from './styles';

// 関心タグのジャンル
export /** 安心フィルターの見たくないジャンルと、その絵（DEFAULT_MUTED_TAG_PRESETS と同じ並び） */
const MUTED_GENRE_ICONS: Record<string, ImageSourcePropType> = {
  '#愚痴': Icons.mutedComplaining,
  '#憂鬱': Icons.mutedMelancholy,
  '#騒音': Icons.mutedNoise,
  '#危険': Icons.mutedDanger,
  '#タバコ': Icons.mutedTobacco,
  '#クレーム': Icons.mutedClaim,
  '#トラブル': Icons.mutedTrouble,
  '#迷惑': Icons.mutedBothersome,
};
const MUTED_GENRES = DEFAULT_MUTED_TAG_PRESETS.map((tag) => ({ tag, icon: MUTED_GENRE_ICONS[tag] ?? Icons.herb }));

type InterestTag = {
  id: string;
  name: string;
  icon: ImageSourcePropType;
  enabled: boolean;
  desc: string;
};

export const INITIAL_TAGS: InterestTag[] = [
  { id: 't1', name: '散歩', icon: Icons.walking, enabled: true, desc: '街歩きや小道、おすすめの休憩スポット' },
  { id: 't2', name: 'カフェ', icon: Icons.cafe, enabled: false, desc: '落ち着ける席や美味しい珈琲の記録' },
  { id: 't3', name: '日常', icon: Icons.everyday, enabled: true, desc: '街で見つけた小さな気づきや独り言' },
  { id: 't4', name: '本', icon: Icons.book, enabled: false, desc: '本と読書、心に残る一節のしおり' },
  { id: 't5', name: 'グルメ', icon: Icons.gourmet, enabled: false, desc: '路地裏の隠れ家やおすすめの一皿' },
  { id: 't6', name: '歴史', icon: Icons.history, enabled: false, desc: '街の記憶、昔話、碑の由来' },
  { id: 't7', name: 'アート', icon: Icons.art, enabled: false, desc: 'ストリートアートやギャラリーの発見' },
  { id: 't8', name: '自然', icon: Icons.herb, enabled: false, desc: '公園や木漏れ日、季節の移ろいを感じる場所' },
];

/**
 * マイページの「関心タグ」タブ：ポケット通知・関心タグ・安心フィルターの 3 枚のカードと、
 * オンにすると下に開く引き出し（見たいジャンル・見たくないジャンル）
 */
export function InterestSettingsTab(): React.JSX.Element {
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
  } = usePreferences();

  // 安心フィルターの下の「見たくないジャンルの選択」が出ている間（畳んでいる途中も含む）は、上のカードとつなげて見せる
  const [isMutedDrawerShown, setIsMutedDrawerShown] = useState(hideNegativePosts);
  useEffect(() => {
    if (hideNegativePosts) setIsMutedDrawerShown(true);
  }, [hideNegativePosts]);
  // 「関心タグの言葉だけ表示」の下の「見たいジャンルの選択」も同じ
  const [isInterestDrawerShown, setIsInterestDrawerShown] = useState(onlyInterestTags);
  useEffect(() => {
    if (onlyInterestTags) setIsInterestDrawerShown(true);
  }, [onlyInterestTags]);
  const [customMutedTagInput, setCustomMutedTagInput] = useState('');
  const [customInterestTagInput, setCustomInterestTagInput] = useState('');

  const tags: InterestTag[] = INITIAL_TAGS.map((tag) => ({
    ...tag,
    enabled: interestTags.includes(`#${tag.name}`),
  }));
  const isPocketNoticeOn = pocketNoticeEnabled;
  const setIsPocketNoticeOn = setPocketNoticeEnabled;

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

  // 3. タグ切り替え
  const handleToggleTag = (tagId: string) => {
    const tag = INITIAL_TAGS.find((t) => t.id === tagId);
    if (tag) toggleInterestTag(tag.name);
  };

  return (
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
      <View
        style={[
          styles.filterToggleCard,
          onlyInterestTags && styles.filterToggleCardOn,
          isInterestDrawerShown && styles.filterToggleCardAttached,
        ]}
      >
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
              関心タグ
            </Text>
          </View>
          <Text style={styles.filterToggleDesc}>
            ARカメラと地図に、関心タグの言葉だけを出します。
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

      {/* 関心タグの言葉だけ表示の下から開く：見たいジャンルと、細かいタグの追加 */}
      <ExpandDown open={onlyInterestTags} onClosed={() => setIsInterestDrawerShown(false)}>
        <View style={styles.mutedConfigCard}>
          <View style={styles.mutedConfigDivider} />
          <Text style={[styles.mutedConfigTitle, styles.drawerTitleAlone]}>見たいジャンルの選択</Text>

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
                  <Text
                    style={[styles.tagCardName, tag.enabled && styles.tagCardNameActive]}
                    numberOfLines={1}
                  >
                    #{tag.name}
                  </Text>
                  <View style={[styles.tagCheckCircle, tag.enabled && styles.tagCheckCircleActive]}>
                    <Text style={styles.tagCheckSymbol}>{tag.enabled ? '✓' : '+'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* 登録中の関心タグ（除外中のタグと同じ見せ方。× で外せる） */}
          {interestTags.length > 0 && (
            <View style={{ marginTop: 18 }}>
              <Text style={styles.mutedSelectedLabel}>選択中のタグ</Text>
              <View style={styles.mutedSelectedRow}>
                {interestTags.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={styles.mutedActiveBadge}
                    onPress={() => toggleInterestTag(tag)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.mutedActiveBadgeText}>{tag}</Text>
                    <View style={styles.mutedRemoveBtn}>
                      <View style={[styles.removeBar, styles.removeBarA]} />
                      <View style={[styles.removeBar, styles.removeBarB]} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* 細かいタグの追加 */}
          <View style={styles.customInterestCard}>
            <View style={styles.customMutedRow}>
              <TextInput
                style={styles.customMutedInput}
                placeholder="# タグを入力（例: サウナ, 隠れ家）"
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

          </View>
        </View>
      </ExpandDown>

      {/* 3. 安心フィルター */}
      <View
        style={[
          styles.filterToggleCard,
          hideNegativePosts && styles.filterToggleCardOn,
          isMutedDrawerShown && styles.filterToggleCardAttached,
        ]}
      >
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
            ネガティブな表現や、見たくないジャンルの言葉を表示しないようにします。
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
      <ExpandDown open={hideNegativePosts} onClosed={() => setIsMutedDrawerShown(false)}>
        <View style={styles.mutedConfigCard}>
          <View style={styles.mutedConfigDivider} />
          <Text style={[styles.mutedConfigTitle, styles.drawerTitleAlone]}>見たくないジャンルの選択</Text>

          {/* 見たくないジャンル（関心タグの「見たいジャンルの選択」と同じ、絵の付いたカード） */}
          <View style={styles.tagGrid}>
            {MUTED_GENRES.map((genre) => {
              const isMuted = mutedTags.includes(genre.tag);
              return (
                <TouchableOpacity
                  key={genre.tag}
                  style={[styles.tagToggleCard, isMuted && styles.tagToggleCardActive]}
                  onPress={() => toggleMutedTag(genre.tag)}
                  activeOpacity={0.8}
                >
                  <View style={styles.tagCardTopRow}>
                    <View style={[styles.tagIconWrapper, isMuted && styles.tagIconWrapperActive]}>
                      <Image
                        source={genre.icon}
                        style={[styles.tagCardIconImage, isMuted && styles.tagCardIconImageActive]}
                        resizeMode="contain"
                      />
                    </View>
                    <Text style={[styles.tagCardName, isMuted && styles.tagCardNameActive]} numberOfLines={1}>
                      {genre.tag}
                    </Text>
                    <View style={[styles.tagCheckCircle, isMuted && styles.tagCheckCircleActive]}>
                      <Text style={styles.tagCheckSymbol}>{isMuted ? '✓' : '+'}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 選択中の除外タグ一覧 */}
          {mutedTags.length > 0 && (
            <View style={{ marginTop: 18 }}>
              <Text style={styles.mutedSelectedLabel}>選択中のタグ</Text>
              <View style={styles.mutedSelectedRow}>
                {mutedTags.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={styles.mutedActiveBadge}
                    onPress={() => toggleMutedTag(tag)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.mutedActiveBadgeText}>{tag}</Text>
                    <View style={styles.mutedRemoveBtn}>
                      <View style={[styles.removeBar, styles.removeBarA]} />
                      <View style={[styles.removeBar, styles.removeBarB]} />
                    </View>
                  </TouchableOpacity>
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
      </ExpandDown>
    </View>
  );
}
