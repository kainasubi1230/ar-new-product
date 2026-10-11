import React, { useState } from 'react';
import {
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (tags: string[]) => void;
  initialTags?: string[];
};

const SUGGESTED_TAGS = ['#カフェ', '#グルメ', '#自然', '#思い出', '#日常', '#アート', '#写真', '#散歩'];

export function TagManageModal({ visible, onClose, onSave, initialTags = ['#カフェ', '#グルメ', '#日常'] }: Props): React.JSX.Element {
  const [myTags, setMyTags] = useState<string[]>(initialTags);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const toggleSuggested = (tag: string) => {
    if (myTags.includes(tag)) {
      setMyTags(myTags.filter((t) => t !== tag));
    } else {
      if (myTags.length >= 5) return;
      setMyTags([...myTags, tag]);
    }
  };

  const removeTag = (tag: string) => {
    setMyTags(myTags.filter((t) => t !== tag));
  };

  const handleSave = () => {
    onSave(myTags);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>タグ管理</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Search Box */}
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="タグを検索..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Suggested Tags Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>おすすめタグ</Text>
            <View style={styles.tagsGrid}>
              {SUGGESTED_TAGS.map((tag) => {
                const isSelected = myTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.suggestedChip, isSelected && styles.suggestedChipSelected]}
                    onPress={() => toggleSuggested(tag)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.suggestedText, isSelected && styles.suggestedTextSelected]}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* My Tags Section */}
          <View style={styles.section}>
            <View style={styles.myTagsHeaderRow}>
              <Text style={styles.sectionTitle}>マイタグ</Text>
              <Text style={styles.counterText}>(選択中 {myTags.length}/5)</Text>
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

              {myTags.length < 5 && (
                <TouchableOpacity style={styles.addTagDashedBtn} activeOpacity={0.7}>
                  <Text style={styles.addTagDashedText}>＋ タグを追加</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>

        {/* Footer CTA */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.saveBtn} activeOpacity={0.85} onPress={handleSave}>
            <Text style={styles.saveBtnText}>保存する</Text>
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
  section: {
    marginBottom: 28,
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
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    fontSize: 14,
    fontWeight: '600',
  },
  suggestedTextSelected: {
    color: '#059669',
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
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
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
