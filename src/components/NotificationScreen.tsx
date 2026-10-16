import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ScreenHeader } from './ScreenHeader';
import { NotificationCard } from './NotificationCard';
import { Icons } from '../assets/icons';

import { NOTIFICATIONS } from '../data/notifications';

type Props = {
  onOpenARWithTag: (tag: string) => void;
};

export function NotificationScreen({ onOpenARWithTag }: Props): React.JSX.Element {
  const notifications = NOTIFICATIONS;

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <ScreenHeader
        title="通知"
        rightAction={
          <TouchableOpacity style={styles.clearBtn} activeOpacity={0.7}>
            <Text style={styles.clearBtnText}>すべて既読</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.listContent}>
        {/* Calm Background Notice Description */}
        <View style={styles.calmNoticeBox}>
          <Image
            source={Icons.herb}
            style={styles.calmIcon}
            resizeMode="contain"
          />
          <View style={styles.calmTextGroup}>
            <Text style={styles.calmTitle}>ポケット通知がオンになっています</Text>
            <Text style={styles.calmDesc}>
              関心タグに一致する言葉が近くにある時、通知が届きます。
            </Text>
          </View>
        </View>

        {notifications.map((item) => (
          <NotificationCard
            key={item.id}
            item={item}
            onPress={() => onOpenARWithTag(item.tag)}
          />
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
    width: 22,
    height: 24,
    marginRight: 10,
    marginTop: 2,
    tintColor: '#059669',
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
});
