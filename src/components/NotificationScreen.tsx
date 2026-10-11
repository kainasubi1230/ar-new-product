import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type Props = {
  onOpenARWithTag: (tag: string) => void;
};

export function NotificationScreen({ onOpenARWithTag }: Props): React.JSX.Element {
  const notifications = [
    {
      id: 'n1',
      title: '近くに関心タグのメッセージ',
      body: '近くにあなたの関心タグ「#カフェ」のメッセージがあります（約150m先）',
      time: '2分前',
      tag: '#カフェ',
    },
    {
      id: 'n2',
      title: '新しい言葉が届きました',
      body: '「#思い出」の新しい投稿が追加されました',
      time: '12分前',
      tag: '#思い出',
    },
    {
      id: 'n3',
      title: '日常のひとこと',
      body: '「#日常」天神ビルのベンチの近くに新しい言葉があります',
      time: '1時間前',
      tag: '#日常',
    },
  ];

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerSidePlaceholder} />
        <Text style={styles.headerTitle}>通知</Text>
        <TouchableOpacity style={styles.clearBtn} activeOpacity={0.7}>
          <Text style={styles.clearBtnText}>すべて既読</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {/* Calm Background Notice Description */}
        <View style={styles.calmNoticeBox}>
          <Text style={styles.calmIcon}>🌿</Text>
          <View style={styles.calmTextGroup}>
            <Text style={styles.calmTitle}>ポケット通知がオンになっています</Text>
            <Text style={styles.calmDesc}>
              関心タグに一致する言葉が近くにある時だけ、控えめに通知が届きます。
            </Text>
          </View>
        </View>

        {notifications.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.notificationCard}
            activeOpacity={0.85}
            onPress={() => onOpenARWithTag(item.tag)}
          >
            <View style={styles.appIconCircle}>
              <Text style={styles.appIconLetter}>L</Text>
            </View>

            <View style={styles.cardMain}>
              <View style={styles.cardHeader}>
                <Text style={styles.appName}>Loca</Text>
                <Text style={styles.timeText}>{item.time}</Text>
              </View>

              <Text style={styles.cardBodyText}>{item.body}</Text>

              <View style={styles.actionRow}>
                <View style={styles.tagBadge}>
                  <Text style={styles.tagBadgeText}>{item.tag}</Text>
                </View>
                <Text style={styles.checkArText}>ARで確認 ↗</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerSidePlaceholder: {
    width: 60,
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '700',
  },
  clearBtn: {
    width: 60,
    alignItems: 'flex-end',
    paddingVertical: 4,
  },
  clearBtnText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  calmNoticeBox: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 6,
  },
  calmIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  calmTextGroup: {
    flex: 1,
  },
  calmTitle: {
    color: '#059669',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  calmDesc: {
    color: '#047857',
    fontSize: 11,
    lineHeight: 16,
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  appIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  appIconLetter: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  cardMain: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  appName: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  timeText: {
    color: '#94A3B8',
    fontSize: 11,
  },
  cardBodyText: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagBadgeText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },
  checkArText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
});
