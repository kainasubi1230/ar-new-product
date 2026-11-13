import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  generateTagsLocally,
  SentimentResult,
  suggestTagsAndSentiment,
} from '../services/tagSuggestionService';
import { normalizeTag } from '../services/interestTagService';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: {
    message: string;
    tags: string[];
    category: string;
    sentiment?: SentimentResult;
  }) => void;
  preferredTags?: string[];
};

const DEFAULT_INITIAL_MESSAGE = '今日はいい日になりそう ☀️';

export function PostModal({
  visible,
  onClose,
  onSubmit,
  preferredTags = [],
}: Props): React.JSX.Element {
  const [message, setMessage] = useState<string>(DEFAULT_INITIAL_MESSAGE);
  const [suggestedTags, setSuggestedTags] = useState<string[]>(['#いい天気', '#日常', '#カフェ', '#散歩']);
  const [selectedTags, setSelectedTags] = useState<string[]>(['#いい天気', '#日常']);
  const [manualTag, setManualTag] = useState<string>('');
  const [isLoadingTags, setIsLoadingTags] = useState<boolean>(false);
  const [sentiment, setSentiment] = useState<SentimentResult | null>(null);
  const [autoSelectEnabled, setAutoSelectEnabled] = useState<boolean>(true);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualAddedTagsRef = useRef<Set<string>>(new Set());

  // モーダルを開いたときに状態を初期化
  useEffect(() => {
    if (visible) {
      manualAddedTagsRef.current.clear();
      setAutoSelectEnabled(true);
      const initialLocal = generateTagsLocally(message, preferredTags);
      setSuggestedTags(initialLocal);
      setSelectedTags(initialLocal.slice(0, 2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const runTagGeneration = useCallback(
    async (targetMessage: string, forceAutoSelect = false) => {
      setIsLoadingTags(true);
      try {
        const { tags, sentiment: analyzedSentiment } = await suggestTagsAndSentiment(
          targetMessage,
          preferredTags
        );
        // 手動で追加したタグがあれば候補リストにも残す
        const manualList = Array.from(manualAddedTagsRef.current);
        const mergedSuggestions = Array.from(new Set([...tags, ...manualList])).slice(0, 7);

        setSuggestedTags(mergedSuggestions);
        setSentiment(analyzedSentiment);

        if (autoSelectEnabled || forceAutoSelect) {
          const autoPicked = tags.slice(0, 2);
          const combined = Array.from(new Set([...autoPicked, ...manualList]));
          setSelectedTags(combined.length > 0 ? combined : tags.slice(0, 1));
        }
      } catch (err) {
        console.error('タグ生成エラー:', err);
      } finally {
        setIsLoadingTags(false);
      }
    },
    [autoSelectEnabled, preferredTags]
  );

  // メッセージ入力に伴うタグ自動生成＆センチメント（ポジ/ネガ度）分析
  useEffect(() => {
    if (!visible) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // 即座にローカル推論で候補をプレビュー反映し、デバウンス後にバックエンド(Edge Function/LLM)も呼ぶ
    const instantTags = generateTagsLocally(message, preferredTags);
    const manualList = Array.from(manualAddedTagsRef.current);
    setSuggestedTags(Array.from(new Set([...instantTags, ...manualList])).slice(0, 7));
    if (autoSelectEnabled) {
      setSelectedTags(Array.from(new Set([...instantTags.slice(0, 2), ...manualList])));
    }

    setIsLoadingTags(true);
    debounceTimerRef.current = setTimeout(() => {
      runTagGeneration(message);
    }, 380);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [message, visible, preferredTags, autoSelectEnabled, runTagGeneration]);

  const toggleTag = (tag: string) => {
    setAutoSelectEnabled(false);
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
      manualAddedTagsRef.current.delete(tag);
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleAddManualTag = () => {
    const formatted = normalizeTag(manualTag);
    if (!formatted) return;
    manualAddedTagsRef.current.add(formatted);
    setAutoSelectEnabled(false);

    if (!selectedTags.includes(formatted)) {
      setSelectedTags((prev) => [...prev, formatted]);
    }
    if (!suggestedTags.includes(formatted)) {
      setSuggestedTags((prev) => [...prev, formatted]);
    }
    setManualTag('');
  };

  const handleRegenerateTags = () => {
    setAutoSelectEnabled(true);
    runTagGeneration(message, true);
  };

  const handleSubmit = () => {
    const finalMessage = message.trim().length > 0 ? message.trim() : DEFAULT_INITIAL_MESSAGE;
    const finalTags =
      selectedTags.length > 0
        ? selectedTags
        : suggestedTags.length > 0
          ? suggestedTags.slice(0, 2)
          : ['#日常'];

    onSubmit({
      message: finalMessage,
      tags: finalTags,
      category: finalTags[0] ? finalTags[0].replace('#', '') : '日常',
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
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
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

            {/* Sentiment Filter Notice (when negative expression detected) */}
            {sentiment?.isNegative && (
              <View style={styles.negativeWarningBox}>
                <Text style={styles.negativeWarningText}>
                  🛡️ 強いネガティブ表現が含まれているため、安心フィルター有効時は他のユーザーの空間に表示されません。
                </Text>
              </View>
            )}

            {/* AI Tag Suggestion Section */}
            <View style={styles.sectionGroup}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sparkleIcon}>✨</Text>
                <Text style={styles.sectionTitle}>AI自動タグ候補</Text>
                {isLoadingTags ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#10B981" />
                    <Text style={styles.loadingText}>解析中...</Text>
                  </View>
                ) : (
                  <View style={styles.badgeContainer}>
                    <Text style={styles.badgeText}>
                      {autoSelectEnabled ? '自動選択中・タップで調整' : 'タップで選択'}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.regenerateBtn}
                  onPress={handleRegenerateTags}
                  activeOpacity={0.7}
                >
                  <Text style={styles.regenerateBtnText}>↻ 自動選択に戻す</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.tagsWrap}>
                {suggestedTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[styles.tagChip, isSelected && styles.tagChipActive]}
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

            {/* Quick Interest Tags Selection (if any enabled interest tags are not yet in suggestedTags) */}
            {preferredTags.some((pt) => !suggestedTags.includes(normalizeTag(pt))) && (
              <View style={styles.sectionGroup}>
                <Text style={styles.subSectionTitle}>あなたの関心タグから追加</Text>
                <View style={styles.tagsWrap}>
                  {preferredTags
                    .map(normalizeTag)
                    .filter((pt) => pt && !suggestedTags.includes(pt))
                    .map((tag) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <TouchableOpacity
                          key={tag}
                          style={[styles.tagChip, isSelected && styles.tagChipActive]}
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
              <Text style={styles.sectionTitle}>手動でタグを追加 ({selectedTags.length}個選択中)</Text>
              <View style={styles.manualInputRow}>
                <TextInput
                  style={styles.manualInput}
                  value={manualTag}
                  onChangeText={setManualTag}
                  placeholder="# 追加するタグを入力..."
                  placeholderTextColor="#94A3B8"
                  onSubmitEditing={handleAddManualTag}
                  returnKeyType="done"
                />
                {manualTag.trim().length > 0 && (
                  <TouchableOpacity style={styles.addTagBtn} onPress={handleAddManualTag}>
                    <Text style={styles.addTagBtnText}>追加</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Location Hint */}
            <View style={styles.locationFooter}>
              <Text style={styles.locationPin}>📍</Text>
              <Text style={styles.locationText}>現在地：福岡市中央区天神</Text>
            </View>

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
    ...StyleSheet.absoluteFillObject,
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
    minHeight: 84,
    marginBottom: 14,
  },
  messageTextInput: {
    fontSize: 17,
    color: '#0F172A',
    fontWeight: '600',
    lineHeight: 24,
  },
  negativeWarningBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  negativeWarningText: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  sectionGroup: {
    marginBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  sparkleIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  sectionTitle: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  subSectionTitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
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
  regenerateBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  regenerateBtnText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
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
    marginTop: 6,
  },
  manualInput: {
    flex: 1,
    height: 42,
    fontSize: 14,
    color: '#0F172A',
  },
  addTagBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
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
    fontSize: 13,
    marginRight: 6,
  },
  locationText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
});
