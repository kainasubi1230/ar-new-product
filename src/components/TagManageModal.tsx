import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ALL_SUGGESTED_TAGS,
  DEFAULT_FILTER_SETTINGS,
  FilterSettings,
  normalizeTag,
} from '../services/interestTagService';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (tags: string[], settings?: FilterSettings) => void;
  initialTags?: string[];
  initialSettings?: FilterSettings;
};

const MAX_INTEREST_TAGS = 8;

export function TagManageModal({
  visible,
  onClose,
  onSave,
  initialTags = ['#散歩', '#カフェ', '#日常', '#本'],
  initialSettings = DEFAULT_FILTER_SETTINGS,
}: Props): React.JSX.Element {
  const [myTags, setMyTags] = useState<string[]>(initialTags);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customTagInput, setCustomTagInput] = useState<string>('');
  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);
  const [settings, setSettings] = useState<FilterSettings>(initialSettings);

  const customInputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (visible) {
      setMyTags(initialTags.map(normalizeTag).filter(Boolean));
      setSettings(initialSettings);
      setSearchQuery('');
      setCustomTagInput('');
      setIsAddingCustom(false);
    }
  }, [visible, initialTags, initialSettings]);

  const toggleSuggested = (rawTag: string) => {
    const tag = normalizeTag(rawTag);
    if (!tag) return;
    if (myTags.includes(tag)) {
      setMyTags(myTags.filter((t) => t !== tag));
    } else {
      if (myTags.length >= MAX_INTEREST_TAGS) return;
      setMyTags([...myTags, tag]);
    }
  };

  const removeTag = (tag: string) => {
    setMyTags(myTags.filter((t) => t !== tag));
  };

  const handleAddCustomTag = (rawInput?: string) => {
    const target = rawInput !== undefined ? rawInput : customTagInput;
    const formatted = normalizeTag(target);
    if (!formatted) return;
    if (!myTags.includes(formatted) && myTags.length < MAX_INTEREST_TAGS) {
      setMyTags([...myTags, formatted]);
    }
    setCustomTagInput('');
    setIsAddingCustom(false);
  };

  const handleSave = () => {
    onSave(myTags, settings);
    onClose();
  };

  const trimmedQuery = searchQuery.trim().replace(/^#+/, '').toLowerCase();
  const allCandidateTags = Array.from(new Set([...ALL_SUGGESTED_TAGS, ...myTags]));
  const filteredSuggested = trimmedQuery
    ? allCandidateTags.filter((tag) => tag.toLowerCase().includes(trimmedQuery))
    : allCandidateTags;

  const canAddQueryAsNewTag =
    trimmedQuery.length > 0 &&
    !allCandidateTags.some((t) => t.toLowerCase() === `#${trimmedQuery}`) &&
    myTags.length < MAX_INTEREST_TAGS;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>関心タグ・フィルター管理</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Search Box */}
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="タグを検索・新規追加..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (canAddQueryAsNewTag) {
                  handleAddCustomTag(searchQuery);
                  setSearchQuery('');
                }
              }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearQueryBtn}>
                <Text style={styles.clearQueryText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Suggested Tags Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {trimmedQuery ? `「${searchQuery}」の検索結果` : 'おすすめ・定番タグ'}
            </Text>
            <View style={styles.tagsGrid}>
              {filteredSuggested.map((tag) => {
                const isSelected = myTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.suggestedChip, isSelected && styles.suggestedChipSelected]}
                    onPress={() => toggleSuggested(tag)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.suggestedText, isSelected && styles.suggestedTextSelected]}>
                      {isSelected ? `✓ ${tag}` : tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {canAddQueryAsNewTag && (
                <TouchableOpacity
                  style={styles.addSearchTagChip}
                  onPress={() => {
                    handleAddCustomTag(searchQuery);
                    setSearchQuery('');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addSearchTagText}>
                    ＋「#{trimmedQuery}」をマイタグに追加
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* My Tags Section */}
          <View style={styles.section}>
            <View style={styles.myTagsHeaderRow}>
              <Text style={styles.sectionTitle}>選択中の関心タグ（マイタグ）</Text>
              <Text style={styles.counterText}>
                ({myTags.length}/{MAX_INTEREST_TAGS})
              </Text>
            </View>

            <View style={styles.tagsGrid}>
              {myTags.map((tag) => (
                <View key={tag} style={styles.myTagBadge}>
                  <Text style={styles.myTagText}>{tag}</Text>
                  <TouchableOpacity onPress={() => removeTag(tag)} style={styles.removeBtn}>
                    <Text style={styles.removeIcon}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {myTags.length < MAX_INTEREST_TAGS && !isAddingCustom && (
                <TouchableOpacity
                  style={styles.addTagDashedBtn}
                  activeOpacity={0.7}
                  onPress={() => {
                    setIsAddingCustom(true);
                    setTimeout(() => customInputRef.current?.focus(), 80);
                  }}
                >
                  <Text style={styles.addTagDashedText}>＋ タグを追加</Text>
                </TouchableOpacity>
              )}
            </View>

            {isAddingCustom && (
              <View style={styles.customAddRow}>
                <TextInput
                  ref={customInputRef}
                  style={styles.customAddInput}
                  value={customTagInput}
                  onChangeText={setCustomTagInput}
                  placeholder="例: #雑貨屋、#夜景..."
                  placeholderTextColor="#94A3B8"
                  onSubmitEditing={() => handleAddCustomTag()}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={styles.customAddConfirmBtn}
                  onPress={() => handleAddCustomTag()}
                >
                  <Text style={styles.customAddConfirmText}>追加</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.customAddCancelBtn}
                  onPress={() => {
                    setIsAddingCustom(false);
                    setCustomTagInput('');
                  }}
                >
                  <Text style={styles.customAddCancelText}>閉じる</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Filter Settings Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>空間フィルター・通知設定</Text>

            <View style={styles.settingCard}>
              <View style={styles.settingRow}>
                <View style={styles.settingTextGroup}>
                  <Text style={styles.settingLabel}>関心タグのみを空間に表示</Text>
                  <Text style={styles.settingDesc}>
                    オンにすると、ARカメラと探索レーダーで関心タグ（および関連ジャンル）に一致する言葉だけを表示します。
                  </Text>
                </View>
                <Switch
                  value={settings.onlyInterestTags}
                  onValueChange={(val) => setSettings((s) => ({ ...s, onlyInterestTags: val }))}
                  trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                  ios_backgroundColor="#CBD5E1"
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.settingDivider} />

              <View style={styles.settingRow}>
                <View style={styles.settingTextGroup}>
                  <Text style={styles.settingLabel}>安心フィルター（ネガティブ非表示）</Text>
                  <Text style={styles.settingDesc}>
                    AI感情分析により、強いネガティブ表現や攻撃的な言葉を空間・レーダーから自動的に除外します。
                  </Text>
                </View>
                <Switch
                  value={settings.hideNegativePosts}
                  onValueChange={(val) => setSettings((s) => ({ ...s, hideNegativePosts: val }))}
                  trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                  ios_backgroundColor="#CBD5E1"
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.settingDivider} />

              <View style={styles.settingRow}>
                <View style={styles.settingTextGroup}>
                  <Text style={styles.settingLabel}>ポケット通知（Calm通知）</Text>
                  <Text style={styles.settingDesc}>
                    関心タグに一致する言葉が近くにある時だけ、穏やかに通知します。
                  </Text>
                </View>
                <Switch
                  value={settings.isPocketNoticeOn}
                  onValueChange={(val) => setSettings((s) => ({ ...s, isPocketNoticeOn: val }))}
                  trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                  ios_backgroundColor="#CBD5E1"
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Footer CTA */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.saveBtn} activeOpacity={0.85} onPress={handleSave}>
            <Text style={styles.saveBtnText}>設定を保存する</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  backBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backArrow: {
    color: '#0F172A',
    fontSize: 28,
    fontWeight: '300',
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '700',
  },
  content: {
    padding: 20,
    paddingBottom: 30,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 24,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  clearQueryBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  clearQueryText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
  section: {
    marginBottom: 26,
  },
  sectionTitle: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  myTagsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  counterText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  suggestedChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  suggestedChipSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  suggestedText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  suggestedTextSelected: {
    color: '#059669',
    fontWeight: '700',
  },
  addSearchTagChip: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  addSearchTagText: {
    color: '#059669',
    fontSize: 13,
    fontWeight: '700',
  },
  myTagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
    borderWidth: 1,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  myTagText: {
    color: '#059669',
    fontSize: 14,
    fontWeight: '700',
  },
  removeBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeIcon: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  addTagDashedBtn: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addTagDashedText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  customAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  customAddInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#10B981',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
  },
  customAddConfirmBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  customAddConfirmText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  customAddCancelBtn: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  customAddCancelText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  settingCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingTextGroup: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  settingDesc: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
  },
  settingDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 14,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
  },
  saveBtn: {
    backgroundColor: '#10B981',
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
