import React, { useState } from 'react';
import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Icons } from '../assets/icons';

const { width } = Dimensions.get('window');

type Props = {
  onOpenARLens: () => void;
  onOpenTagManage: () => void;
};

export function MyPageScreen({ onOpenARLens, onOpenTagManage }: Props): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'posts' | 'saved' | 'settings'>('posts');

  const myPosts = [
    {
      id: 'p1',
      title: 'カフェラテのおすすめ',
      tag: '#カフェ',
      likes: 28,
      bg: '#F0FDF4',
    },
    {
      id: 'p2',
      title: '特等席の光',
      tag: '#日常',
      likes: 42,
      bg: '#ECFDF5',
    },
    {
      id: 'p3',
      title: '天神ビルのベンチ',
      tag: '#グルメ',
      likes: 19,
      bg: '#FFFBEB',
    },
    {
      id: 'p4',
      title: '公園の木漏れ日',
      tag: '#自然',
      likes: 64,
      bg: '#F8FAFC',
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header with settings icon */}
      <View style={styles.header}>
        <View style={{ width: 32 }} />
        <Text style={styles.headerTitle}>マイページ</Text>
        <TouchableOpacity style={styles.settingsBtn} onPress={onOpenTagManage} activeOpacity={0.7}>
          <Image source={Icons.setting} style={styles.settingsIcon} resizeMode="contain" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileSection}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>👩</Text>
          </View>
          <Text style={styles.userName}>sora</Text>
          <Text style={styles.userBio}>日常に、ちょっとした発見を。</Text>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>23</Text>
              <Text style={styles.statLabel}>投稿</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>120</Text>
              <Text style={styles.statLabel}>フォロー</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>98</Text>
              <Text style={styles.statLabel}>フォロワー</Text>
            </View>
          </View>

          {/* Edit Profile Button */}
          <TouchableOpacity style={styles.editProfileBtn} activeOpacity={0.8}>
            <Text style={styles.editProfileText}>プロフィールを編集</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Row */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'posts' && styles.tabBtnActive]}
            onPress={() => setActiveTab('posts')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'posts' && styles.tabBtnTextActive]}>
              投稿
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'saved' && styles.tabBtnActive]}
            onPress={() => setActiveTab('saved')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'saved' && styles.tabBtnTextActive]}>
              保存した場所
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'settings' && styles.tabBtnActive]}
            onPress={onOpenTagManage}
          >
            <Text style={[styles.tabBtnText, activeTab === 'settings' && styles.tabBtnTextActive]}>
              タグ管理
            </Text>
          </TouchableOpacity>
        </View>

        {/* Grid List */}
        <View style={styles.gridContainer}>
          {myPosts.map((post) => (
            <TouchableOpacity
              key={post.id}
              style={[styles.gridCard, { backgroundColor: post.bg }]}
              activeOpacity={0.9}
              onPress={onOpenARLens}
            >
              <View style={styles.gridCardTagPill}>
                <Text style={styles.gridCardTagText}>{post.tag}</Text>
              </View>
              <Text style={styles.gridCardTitle} numberOfLines={2}>
                {post.title}
              </Text>
              <View style={styles.gridCardLikesRow}>
                <Text style={styles.gridHeart}>♡</Text>
                <Text style={styles.gridLikesCount}>{post.likes}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
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
  headerTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '700',
  },
  settingsBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsIcon: {
    width: 20,
    height: 20,
    tintColor: '#475569',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  profileSection: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 24,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2.5,
    borderColor: '#10B981',
  },
  avatarText: {
    fontSize: 40,
  },
  userName: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  userBio: {
    color: '#64748B',
    fontSize: 13,
    marginBottom: 18,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  statNumber: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  editProfileBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  editProfileText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  tabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  tabBtnActive: {
    borderBottomWidth: 2,
    borderColor: '#10B981',
  },
  tabBtnText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridCard: {
    width: (width - 40 - 12) / 2,
    height: 140,
    borderRadius: 18,
    padding: 12,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  gridCardTagPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  gridCardTagText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },
  gridCardTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  gridCardLikesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gridHeart: {
    color: '#EF4444',
    fontSize: 13,
  },
  gridLikesCount: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
});
