import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { suggestTagsAndSentiment, SentimentResult } from '../services/tagSuggestionService';
import { checkPostSafety } from '../services/safetyFilter';
import { POST_TAG_LIMIT, TAG_MAX_LENGTH, canonicalTagKey, cleanTag } from '../services/interestTagService';
import { getCurrentLocation } from '../services/postService';
import { reverseGeocode } from '../services/geocoder';
import { Icons } from '../assets/icons';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: {
    message: string;
    tags: string[];
    category: string;
    sentiment?: SentimentResult;
  }) => void;
  /** 関心タグ。タグの提案で優先し、候補に無ければ「あなたの関心タグから追加」に出す */
  preferredTags?: string[];
};

const DEFAULT_INITIAL_MESSAGE = '今日はいい日になりそう';

export function PostModal({ visible, onClose, onSubmit, preferredTags = [] }: Props): React.JSX.Element {
  const [message, setMessage] = useState<string>(DEFAULT_INITIAL_MESSAGE);
  // タグは本文から提案されたものを選ぶ。最初から何かを選んでおくと、どの投稿にも同じタグが付いてしまう
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [manualTag, setManualTag] = useState<string>('');
  const [isLoadingTags, setIsLoadingTags] = useState<boolean>(false);
  const [sentiment, setSentiment] = useState<SentimentResult | null>(null);
  // 今いる場所の名前（取れなければ出さない）
  const [placeName, setPlaceName] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ユーザーが自分でタグを選んだ・外したか。触るまでは、本文に合わせて自動の選択を選び直す
  // （初期の本文「今日はいい日になりそう」で選ばれた #いい天気 が、書き換えたあとも残らないように）
  const hasEditedTagsRef = useRef(false);

  // 開くたびに、前の投稿のタグを持ち越さず空から始める（本文に合うタグが自動で選ばれる）
  useEffect(() => {
    if (visible) {
      setSelectedTags([]);
      hasEditedTagsRef.current = false;
    }
  }, [visible]);

  // 開いたときの現在地の名前を出す
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    getCurrentLocation()
      .then(({ latitude, longitude }) => reverseGeocode(latitude, longitude))
      .then((name) => {
        if (!cancelled) setPlaceName(name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // メッセージ入力に伴うタグ自動生成＆センチメント（ポジ/ネガ度）分析
  useEffect(() => {
    if (!visible) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setIsLoadingTags(true);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const { tags, sentiment: analyzedSentiment } = await suggestTagsAndSentiment(message, preferredTags);
        setSuggestedTags(tags);
        setSentiment(analyzedSentiment);

        // 自分でタグを触るまでは、今の本文に合う先頭 2 個を選び直す
        if (!hasEditedTagsRef.current) {
          setSelectedTags(tags.slice(0, 2));
        }
      } catch (err) {
        console.error('タグ生成エラー:', err);
      } finally {
        setIsLoadingTags(false);
      }
    }, 450);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [message, visible, preferredTags]);

  // タグは POST_TAG_LIMIT 個まで。上限のときは、選んでいないタグを押せない（薄く見せる）
  const isTagLimitReached = selectedTags.length >= POST_TAG_LIMIT;

  const toggleTag = (tag: string) => {
    hasEditedTagsRef.current = true;
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else if (!isTagLimitReached) {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleAddManualTag = () => {
    // #・空白・絵文字を取って、TAG_MAX_LENGTH 文字までに整える
    const formatted = cleanTag(manualTag);
    setManualTag('');
    if (!formatted) return;
    hasEditedTagsRef.current = true;
    // 表記揺れが同じタグ（#カフェ と #かふぇ など）がもう候補にあれば、新しく足さずにそれを使う
    const key = canonicalTagKey(formatted);
    const existing = [...selectedTags, ...suggestedTags].find((t) => canonicalTagKey(t) === key);
    const tag = existing ?? formatted;
    if (!selectedTags.includes(tag) && !isTagLimitReached) {
      setSelectedTags([...selectedTags, tag]);
    }
    if (!existing) {
      setSuggestedTags((prev) => [...prev, tag]);
    }
  };

  const handleSubmit = () => {
    onSubmit({
      message: message.trim().length > 0 ? message : DEFAULT_INITIAL_MESSAGE,
      tags: selectedTags,
      category: selectedTags[0] ? selectedTags[0].replace('#', '') : '日常',
      sentiment: sentiment ?? undefined,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          <View style={styles.sheetContainer}>
            {/* Header */}
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.cancelText}>キャンセル</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.submitPill} activeOpacity={0.8} onPress={handleSubmit}>
                <Text style={styles.submitPillText}>投稿する</Text>
              </TouchableOpacity>
            </View>

            {/* Floating Message Preview Box */}
            <View style={styles.messagePreviewCard}>
              <TextInput
                style={styles.messageTextInput}
                value={message}
                onChangeText={setMessage}
                placeholder="ここに言葉を入力してください..."
                placeholderTextColor="#94A3B8"
                multiline
                autoFocus
              />
            </View>

            {/* 安心フィルターに該当する言葉が含まれているとき（リアルタイム検知） */}
            {(checkPostSafety({ message, tags: selectedTags }).blocked || sentiment?.isNegative) && (
              <View style={styles.negativeNoticeBox}>
                <Text style={styles.negativeNoticeText}>
                  安心フィルターに該当する言葉が含まれているため、このままでは投稿できません。
                </Text>
              </View>
            )}

            {/* AI Tag Suggestion Section */}
            <View style={styles.sectionGroup}>
              <View style={styles.sectionTitleRow}>
                <Image source={Icons.herb} style={styles.sectionIcon} resizeMode="contain" />
                <Text style={styles.sectionTitle}>AIタグ候補</Text>
                {isLoadingTags ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#10B981" />
                    <Text style={styles.loadingText}>生成中...</Text>
                  </View>
                ) : (
                  <View style={styles.badgeContainer}>
                    <Text style={styles.badgeText}>タップで選択</Text>
                  </View>
                )}
              </View>

              <View style={styles.tagsWrap}>
                {suggestedTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[styles.tagChip, isSelected && styles.tagChipActive, !isSelected && isTagLimitReached && styles.tagChipDisabled]}
                      onPress={() => toggleTag(tag)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.tagText, isSelected && styles.tagTextActive]}>
                        {isSelected ? `✓ ${tag}` : tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 候補に出ていない関心タグを、ワンタップで足せるように */}
            {preferredTags.some((tag) => !suggestedTags.includes(tag)) && (
              <View style={styles.sectionGroup}>
                <Text style={styles.subSectionTitle}>あなたの関心タグから追加</Text>
                <View style={styles.tagsWrap}>
                  {preferredTags
                    .filter((tag) => !suggestedTags.includes(tag))
                    .map((tag) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <TouchableOpacity
                          key={tag}
                          style={[styles.tagChip, isSelected && styles.tagChipActive, !isSelected && isTagLimitReached && styles.tagChipDisabled]}
                          onPress={() => toggleTag(tag)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.tagText, isSelected && styles.tagTextActive]}>
                            {isSelected ? `✓ ${tag}` : `+ ${tag}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              </View>
            )}

            {/* Manual Tag Input */}
            <View style={styles.sectionGroup}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>手動でタグを追加</Text>
                <Text style={styles.tagCountText}>
                  選択中 {selectedTags.length}/{POST_TAG_LIMIT}
                </Text>
              </View>
              <View style={styles.manualInputRow}>
                <TextInput
                  style={styles.manualInput}
                  value={manualTag}
                  onChangeText={setManualTag}
                  placeholder={isTagLimitReached ? `タグは${POST_TAG_LIMIT}個までです` : `# 追加するタグ（${TAG_MAX_LENGTH}文字まで）`}
                  placeholderTextColor="#94A3B8"
                  onSubmitEditing={handleAddManualTag}
                  returnKeyType="done"
                  editable={!isTagLimitReached}
                  // # の 1 文字ぶん余分に入れられるように
                  maxLength={TAG_MAX_LENGTH + 1}
                />
                {manualTag.trim().length > 0 && (
                  <TouchableOpacity style={styles.addTagBtn} onPress={handleAddManualTag}>
                    <Text style={styles.addTagBtnText}>追加</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Location Hint */}
            {placeName && (
              <View style={styles.locationFooter}>
                <Image source={Icons.pin} style={styles.locationPin} resizeMode="contain" />
                <Text style={styles.locationText}>{placeName}</Text>
              </View>
            )}

            {/* Solid White Extension below sheet to eliminate any gap under keyboard */}
            <View style={styles.bottomWhiteExtension} />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  keyboardContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  bottomWhiteExtension: {
    position: 'absolute',
    bottom: -300,
    left: 0,
    right: 0,
    height: 300,
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cancelText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '600',
  },
  submitPill: {
    backgroundColor: '#10B981',
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 20,
  },
  submitPillText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  messagePreviewCard: {
    backgroundColor: 'rgba(241, 245, 249, 0.85)',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    padding: 14,
    minHeight: 90,
    marginBottom: 18,
  },
  messageTextInput: {
    fontSize: 17,
    color: '#0F172A',
    fontWeight: '600',
    lineHeight: 24,
  },
  negativeNoticeBox: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  negativeNoticeText: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
  },
  subSectionTitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  sectionGroup: {
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionIcon: {
    width: 14,
    height: 15,
    marginRight: 6,
    tintColor: '#10B981',
  },
  sectionTitle: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  loadingText: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
    marginLeft: 4,
  },
  badgeContainer: {
    marginLeft: 8,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  badgeText: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '600',
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tagChipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  tagText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  tagTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  manualInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
  },
  // タグが上限のとき、選んでいないタグは押せないので薄く
  tagChipDisabled: {
    opacity: 0.4,
  },
  tagCountText: {
    marginLeft: 'auto',
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  manualInput: {
    flex: 1,
    height: 44,
    fontSize: 14,
    color: '#0F172A',
  },
  addTagBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  addTagBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  locationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
  },
  locationPin: {
    width: 12,
    height: 12,
    marginRight: 5,
    tintColor: '#94A3B8',
  },
  locationText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
});
