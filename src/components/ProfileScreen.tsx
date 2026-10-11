import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type Props = {
  onOpenARLens: () => void;
};

export function ProfileScreen({ onOpenARLens }: Props): React.JSX.Element {
  const myWords = [
    { id: '1', text: 'テスト2', category: '室内', date: '2026.10.11', likes: 3 },
    { id: '2', text: '会議室Alphaは静かで作業しやすい', category: 'カフェ・席', date: '2026.10.10', likes: 7 },
  ];

  const interestTags = ['カフェ・席', '公園・ベンチ', '自然・景観', '読書・作業'];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User Header */}
      <View style={styles.profileCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>K</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>Ken</Text>
          <Text style={styles.userHandle}>@ken_loca</Text>
        </View>
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>空間ノマド</Text>
        </View>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>2</Text>
          <Text style={styles.statLabel}>残した言葉</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>10</Text>
          <Text style={styles.statLabel}>届いた共感</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>4</Text>
          <Text style={styles.statLabel}>出会った言葉</Text>
        </View>
      </View>

      {/* Interest Tags Setting (Calm Notification filter) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>通知と関心タグ（Calm設定）</Text>
        <Text style={styles.sectionDesc}>
          ポケットに入れて歩いている時、選択したタグの言葉が近くにある場合のみ通知が届きます。
        </Text>
        <View style={styles.tagWrap}>
          {interestTags.map((tag) => (
            <View key={tag} style={styles.activeTagChip}>
              <Text style={styles.activeTagText}>✓ {tag}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* My Left Words */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>自分が残した言葉</Text>
        {myWords.map((word) => (
          <View key={word.id} style={styles.wordCard}>
            <View style={styles.wordHeader}>
              <View style={styles.wordCategoryPill}>
                <Text style={styles.wordCategoryText}>{word.category}</Text>
              </View>
              <Text style={styles.wordDate}>{word.date}</Text>
            </View>
            <Text style={styles.wordBodyText}>「{word.text}」</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070A12',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 23, 40, 0.9)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 14,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0090EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  userHandle: {
    color: '#8496B2',
    fontSize: 13,
    marginTop: 2,
  },
  levelBadge: {
    backgroundColor: 'rgba(0, 163, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00A3FF',
  },
  levelBadgeText: {
    color: '#00A3FF',
    fontSize: 11,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(16, 23, 40, 0.75)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  statNumber: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: '#7D8DA5',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
  section: {
    marginBottom: 22,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  sectionDesc: {
    color: '#7D8DA5',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  activeTagChip: {
    backgroundColor: '#102744',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#0090EA',
  },
  activeTagText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  wordCard: {
    backgroundColor: 'rgba(16, 23, 40, 0.85)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 10,
  },
  wordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  wordCategoryPill: {
    backgroundColor: 'rgba(0, 144, 234, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  wordCategoryText: {
    color: '#0090EA',
    fontSize: 11,
    fontWeight: '700',
  },
  wordDate: {
    color: '#6E7F9A',
    fontSize: 11,
  },
  wordBodyText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '500',
  },
});
