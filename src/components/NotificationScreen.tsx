import React, { useMemo, useState } from 'react';
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
import {
  DEFAULT_FILTER_SETTINGS,
  FilterSettings,
  filterPostsByCriteria,
  normalizeTag,
} from '../services/interestTagService';

type Props = {
  onOpenARWithTag: (tag: string) => void;
  interestTags?: string[];
  filterSettings?: FilterSettings;
  onOpenTagManage?: () => void;
};

export function NotificationScreen({
  onOpenARWithTag,
  interestTags = ['#散歩', '#カフェ', '#日常', '#本'],
  filterSettings = DEFAULT_FILTER_SETTINGS,
  onOpenTagManage,
}: Props): React.JSX.Element {
  const [selectedFilter, setSelectedFilter] = useState<string>('__INTEREST__');
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const filteredNotifications = useMemo(() => {
    const mapped = NOTIFICATIONS.map((n) => ({
      ...n,
      message: n.body,
      tags: [normalizeTag(n.tag)],
    }));

    return filterPostsByCriteria(mapped, {
      activeFilterTag: selectedFilter,
      interestTags,
      onlyInterestTags: selectedFilter === '__INTEREST__',
      hideNegativePosts: filterSettings.hideNegativePosts,
    });
  }, [selectedFilter, interestTags, filterSettings.hideNegativePosts]);

  const unreadList = useMemo(
    () => filteredNotifications.filter((item) => !readIds.has(item.id)),
    [filteredNotifications, readIds]
  );

  const handleMarkAllRead = () => {
    if (unreadList.length > 0) {
      setReadIds(new Set(NOTIFICATIONS.map((n) => n.id)));
    } else {
      setReadIds(new Set());
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <ScreenHeader
        title="通知"
        rightAction={
          <TouchableOpacity
            style={styles.clearBtn}
            activeOpacity={0.7}
            onPress={handleMarkAllRead}
          >
            <Text style={styles.clearBtnText}>
              {unreadList.length > 0 ? 'すべて既読' : '未読に戻す'}
            </Text>
          </TouchableOpacity>
        }
      />

      {/* Filter Bar */}
      <View style={styles.filterBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <TouchableOpacity
            style={[
              styles.filterChip,
              selectedFilter === '__INTEREST__' && styles.filterChipActive,
            ]}
            onPress={() => setSelectedFilter('__INTEREST__')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedFilter === '__INTEREST__' && styles.filterChipTextActive,
              ]}
            >
              ★ 関心タグ ({interestTags.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, selectedFilter === 'ALL' && styles.filterChipActive]}
            onPress={() => setSelectedFilter('ALL')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedFilter === 'ALL' && styles.filterChipTextActive,
              ]}
            >
              すべて
            </Text>
          </TouchableOpacity>

          {interestTags.map((rawTag) => {
            const tag = normalizeTag(rawTag);
            const isSelected = selectedFilter === tag;
            return (
              <TouchableOpacity
                key={tag}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => setSelectedFilter(isSelected ? '__INTEREST__' : tag)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                  {tag}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {/* Calm Background Notice Description */}
        <TouchableOpacity
          style={[
            styles.calmNoticeBox,
            !filterSettings.isPocketNoticeOn && styles.calmNoticeBoxOff,
          ]}
          activeOpacity={0.8}
          onPress={onOpenTagManage}
        >
          <Image
            source={Icons.herb}
            style={[
              styles.calmIcon,
              !filterSettings.isPocketNoticeOn && styles.calmIconOff,
            ]}
            resizeMode="contain"
          />
          <View style={styles.calmTextGroup}>
            <Text
              style={[
                styles.calmTitle,
                !filterSettings.isPocketNoticeOn && styles.calmTitleOff,
              ]}
            >
              {filterSettings.isPocketNoticeOn
                ? 'ポケット通知がオンになっています'
                : 'ポケット通知はオフになっています'}
            </Text>
            <Text
              style={[
                styles.calmDesc,
                !filterSettings.isPocketNoticeOn && styles.calmDescOff,
              ]}
            >
              {filterSettings.isPocketNoticeOn
                ? `関心タグ（${interestTags.join('・') || '未設定'}）に一致する言葉が近くにある時、通知が届きます。`
                : 'タップして関心タグや通知設定を変更できます。'}
            </Text>
          </View>
        </TouchableOpacity>

        {unreadList.map((item) => (
          <NotificationCard
            key={item.id}
            item={item}
            onPress={() => {
              setReadIds((prev) => new Set([...prev, item.id]));
              onOpenARWithTag(item.tag);
            }}
          />
        ))}

        {unreadList.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>表示できる通知はありません</Text>
            <Text style={styles.emptyDesc}>
              {readIds.size > 0
                ? 'すべての通知を確認済みです。右上の「未読に戻す」から再表示できます。'
                : '別のタグフィルターを選択するか、マイページで関心タグを追加してみてください。'}
            </Text>
          </View>
        )}
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
    minWidth: 72,
    alignItems: 'flex-end',
    paddingVertical: 4,
  },
  clearBtnText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
  filterBarWrapper: {
    backgroundColor: '#F8FAFC',
    paddingTop: 10,
    paddingBottom: 4,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  filterChipText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
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
  calmNoticeBoxOff: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  calmIcon: {
    width: 22,
    height: 24,
    marginRight: 10,
    marginTop: 2,
    tintColor: '#059669',
  },
  calmIconOff: {
    tintColor: '#64748B',
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
  calmTitleOff: {
    color: '#475569',
  },
  calmDesc: {
    color: '#047857',
    fontSize: 11,
    lineHeight: 16,
  },
  calmDescOff: {
    color: '#64748B',
  },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 8,
  },
  emptyTitle: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyDesc: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
