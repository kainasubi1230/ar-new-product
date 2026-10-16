import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { NotificationItem } from '../data/notifications';

type Props = {
  item: NotificationItem;
  onPress?: () => void;
  style?: ViewStyle;
};

export function NotificationCard({ item, onPress, style }: Props): React.JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.notificationCard, style]}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={!onPress}
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
  );
}

const styles = StyleSheet.create({
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
