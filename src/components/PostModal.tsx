import React, { useEffect, useRef, useState } from 'react';
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
import { suggestTagsAndSentiment, SentimentResult } from '../services/tagSuggestionService';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: {
    message: string;
    tags: string[];
    category: string;
    sentiment?: SentimentResult;
  }) => void;
};

const DEFAULT_INITIAL_MESSAGE = '今日はいい日になりそう ☀️';

export function PostModal({ visible, onClose, onSubmit }: Props): React.JSX.Element {
  const [message, setMessage] = useState<string>(DEFAULT_INITIAL_MESSAGE);
  // タグは本文から提案されたものを選ぶ。最初から何かを選んでおくと、どの投稿にも同じタグが付いてしまう
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [manualTag, setManualTag] = useState<string>('');
  const [isLoadingTags, setIsLoadingTags] = useState<boolean>(false);
  const [sentiment, setSentiment] = useState<SentimentResult | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ユーザーが自分でタグを選んだ・外したか。触るまでは、本文に合わせて自動の選択を選び直す
  // （初期の本文「今日はいい日になりそう ☀️」で選ばれた #いい天気 が、書き換えたあとも残らないように）
  const hasEditedTagsRef = useRef(false);

  // 開くたびに、前の投稿のタグを持ち越さず空から始める（本文に合うタグが自動で選ばれる）
  useEffect(() => {
    if (visible) {
      setSelectedTags([]);
      hasEditedTagsRef.current = false;
    }
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
        const { tags, sentiment: analyzedSentiment } = await suggestTagsAndSentiment(message);
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
  }, [message, visible]);

  const toggleTag = (tag: string) => {
    hasEditedTagsRef.current = true;
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleAddManualTag = () => {
    const trimmed = manualTag.trim();
    if (!trimmed) return;
    const formatted = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    hasEditedTagsRef.current = true;
    if (!selectedTags.includes(formatted)) {
      setSelectedTags([...selectedTags, formatted]);
    }
    // 候補リストにもなければ追加
    if (!suggestedTags.includes(formatted)) {
      setSuggestedTags((prev) => [...prev, formatted]);
    }
    setManualTag('');
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

            {/* AI Tag Suggestion Section */}
            <View style={styles.sectionGroup}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sparkleIcon}>✨</Text>
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

            {/* Manual Tag Input */}
            <View style={styles.sectionGroup}>
              <Text style={styles.sectionTitle}>手動でタグを追加</Text>
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
  sectionGroup: {
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
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
    fontSize: 13,
    marginRight: 6,
  },
  locationText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
});
